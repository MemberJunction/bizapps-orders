/**
 * `Orders.PollExternalPayments` — money that arrived on the rail, captured here once (golive #148).
 *
 * POLL-AUTHORITATIVE, BY NECESSITY. Bill.com's v3 webhooks cover invoices (created/updated/archived/
 * restored) and carry no payment id; there is no payment-received event. So the poll is the source of
 * truth and a webhook can only ever be a nudge to run it sooner (design §5.3, and the webhook note in
 * the plan).
 *
 * WHAT ONE PASS DOES, per active rail provider row:
 *   1. read every receivable payment changed since (watermark − 1 day) — the overlap is free because
 *      dedupe is by payment id;
 *   2. upsert an `ExternalPayment` row per payment (the audit trail and the exceptions worklist);
 *   3. decide (`DecideExternalPayment`): Capture / Hold / Ignore / ReversalNeeded;
 *   4. for Capture, match `invoicePayments[]` to `ExternalInvoice` rows by the rail's invoice id — ALL
 *      of them, or the payment is Unmatched and nothing is captured;
 *   5. call `Orders.CapturePayment` with `IdempotencyKey = 'billcom:<0rp id>'`, so the unique index on
 *      `PaymentHeader.IdempotencyKey` is the guarantee even if this table is wrong;
 *   6. advance the watermark only when the pass completed without a fault.
 *
 * THE LEDGER IS NOT TOUCHED HERE. `Orders.CapturePayment` writes the header and lines, and
 * `PaymentHeaderEntityServer` books the cash leg — the same path a keyed check takes (A-US2).
 *
 * WHAT NEEDS A PERSON. `Unmatched` (an invoice we did not issue — pre-cutover AR, or created directly
 * in Bill.com) and `ReversalNeeded` (captured, then voided on the rail) are reported as `ATTENTION`
 * with Success false so a job that notifies on failure tells somebody; the rows stay in
 * `ExternalPayment` until dealt with.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseEntity, BaseRemotableOperation, CompositeKey, LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    AllocateInvoicePayments,
    DecideExternalPayment,
    ExternalPaymentIdempotencyKey,
    TenderFor,
    OrdersCapturePaymentOperation,
    OrdersPollExternalPaymentsOperation as OrdersPollExternalPaymentsOperationBase,
    type ExternalPaymentDisposition,
    type ExternalPaymentOutcome,
    type OrdersPollExternalPaymentsInput,
    type OrdersPollExternalPaymentsOutput,
    type UnitRef,
    Today,
} from '@mj-biz-apps/orders-entities';

import type { BaseInvoiceRail, RailPaymentRecord } from './BaseInvoiceRail.js';
import { EXTERNAL_PAYMENT_ENTITY, ORDER_HEADER_ENTITY, PAYMENT_PROVIDER_SYNC_STATE_ENTITY } from './entity-names.js';
import { ListInvoiceRailProviderIDs, ResolveInvoiceRail } from './InvoiceRailResolver.js';
import { LoadExternalInvoicesByRef, updateExternalInvoice } from './IssueExternalInvoiceOperation.js';
import { EscapeText, RequireUUID } from './sql-guards.js';

const RAIL_OBJECT = 'receivable-payments';
const OVERLAP_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX = 100;

interface ExternalPaymentRow extends Record<string, unknown> {
    ID: string;
    ExternalPaymentRef: string;
    Disposition: ExternalPaymentDisposition;
    DispositionReason: string | null;
    PaymentHeaderID: string | null;
    ExternalUpdatedAt: string | Date | null;
}

/** Canonical ISO-Z, or null when the value cannot be read — an unreadable watermark must never throw. */
const instant = (v: unknown): string | null => {
    if (v == null || v === '') return null;
    const ms = v instanceof Date ? v.getTime() : Date.parse(String(v));
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

interface SyncStateRow extends Record<string, unknown> {
    ID: string;
    Watermark: string | null;
}

const money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

@RegisterClass(BaseRemotableOperation, 'Orders.PollExternalPayments')
export class PollExternalPaymentsOperation extends OrdersPollExternalPaymentsOperationBase {
    protected async InternalExecute(
        input: OrdersPollExternalPaymentsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersPollExternalPaymentsOutput> {
        const preview = !!input?.Preview;
        const maxCount = Math.max(1, Math.floor(Number(input?.MaxCount ?? DEFAULT_MAX)));
        const out: OrdersPollExternalPaymentsOutput = {
            Success: true,
            ResultCode: preview ? 'PREVIEWED' : 'COMPLETED',
            Captured: 0,
            Held: 0,
            Unmatched: 0,
            Refused: 0,
            ReversalNeeded: 0,
            Ignored: 0,
            Outcomes: [],
            NewWatermarks: [],
            PreviewedOnly: preview,
        };
        try {
            const providers = input?.PaymentProviderID
                ? [{ ID: RequireUUID(input.PaymentProviderID, 'PaymentProviderID'), CompanyID: '' }]
                : await ListInvoiceRailProviderIDs(provider, user);
            if (!providers.length) {
                return { ...out, ResultCode: 'NO_PROVIDERS', Message: 'No active external invoice rail is configured for any company; nothing to poll.' };
            }
            const faults: string[] = [];
            for (const p of providers) {
                const result = await this.pollProvider(p.ID, { preview, maxCount, since: input?.SinceWatermark ?? null }, provider, user);
                out.Outcomes.push(...result.Outcomes);
                out.NewWatermarks.push({ PaymentProviderID: p.ID, Watermark: result.NewWatermark });
                if (result.Fault) faults.push(result.Fault);
            }
            for (const o of out.Outcomes) {
                if (o.Disposition === 'Captured') out.Captured++;
                else if (o.Disposition === 'Held') out.Held++;
                else if (o.Disposition === 'Unmatched') out.Unmatched++;
                else if (o.Disposition === 'Refused') out.Refused++;
                else if (o.Disposition === 'ReversalNeeded') out.ReversalNeeded++;
                else out.Ignored++;
            }
            if (faults.length) {
                return { ...out, Success: false, ResultCode: 'ERROR', Message: `The poll hit a fault on ${faults.length} provider(s): ${faults.join(' | ')}` };
            }
            if (!preview && out.Unmatched + out.Refused + out.ReversalNeeded > 0) {
                return {
                    ...out,
                    Success: false,
                    ResultCode: 'ATTENTION',
                    Message: `${out.Captured} payment(s) captured; ${out.Unmatched} unmatched, ${out.Refused} refused and ${out.ReversalNeeded} needing reversal are waiting for a person (see External Payments).`,
                };
            }
            out.Message = preview
                ? `Would capture ${out.Outcomes.filter((o) => o.Disposition === 'Captured').length} payment(s); ${out.Held} held, ${out.Unmatched} unmatched.`
                : `${out.Captured} payment(s) captured, ${out.Held} held, ${out.Ignored} already known.`;
            return out;
        } catch (err) {
            LogError(`Orders.PollExternalPayments failed: ${err}`);
            return { ...out, Success: false, ResultCode: 'ERROR', Message: err instanceof Error ? err.message : String(err) };
        }
    }

    private async pollProvider(
        paymentProviderID: string,
        opts: { preview: boolean; maxCount: number; since: string | null },
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<{ Outcomes: ExternalPaymentOutcome[]; NewWatermark: string | null; Fault: string | null }> {
        const outcomes: ExternalPaymentOutcome[] = [];
        const rail = await ResolveInvoiceRail(paymentProviderID, provider, user);
        // A configuration fault (no Company Integration, live/sandbox mismatch, connector not loaded)
        // is the provider's problem, not any payment's: report it as a fault, write nothing.
        const ready = await rail.CheckConfiguration();
        if (ready.Success === false) return { Outcomes: [], NewWatermark: null, Fault: `${rail.Config.Name}: ${ready.Reason}` };

        let state = await loadSyncState(paymentProviderID, provider, user);
        // An unreadable stored watermark reads as "none" rather than faulting every pass forever.
        const storedWatermark = instant(state?.Watermark);
        if (state?.Watermark && !storedWatermark) LogError(`PaymentProviderSyncState for ${paymentProviderID} holds an unreadable watermark '${state.Watermark}'; reading from the start.`);
        if (!opts.preview) state = await touchSyncState(provider, user, paymentProviderID, state, { LastPolledAt: new Date() });

        const since = instant(opts.since) ?? (storedWatermark ? new Date(Date.parse(storedWatermark) - OVERLAP_MS).toISOString() : null);
        const fetched = await rail.FetchPaymentsSince(since);
        if (fetched.Success === false) {
            if (!opts.preview) await touchSyncState(provider, user, paymentProviderID, state, { LastError: fetched.Reason });
            return { Outcomes: [], NewWatermark: storedWatermark, Fault: `${rail.Config.Name}: ${fetched.Reason}` };
        }

        // OLDEST FIRST, and payments this table already holds an unchanged, final answer for are not
        // counted against the cap — otherwise a first run against an org with more history than
        // MaxCount re-reads the same first hundred every pass and the watermark never moves. A record
        // with no readable time sorts first so it is always considered.
        const all = [...fetched.Value.Payments].sort((a, b) => (a.UpdatedAt ?? '').localeCompare(b.UpdatedAt ?? ''));
        const seen = await loadSeen(paymentProviderID, all.map((p) => p.ExternalPaymentRef), provider, user);
        const FINAL: ReadonlySet<ExternalPaymentDisposition> = new Set(['Captured', 'Ignored']);
        const isUnchanged = (p: RailPaymentRecord): boolean => {
            const prior = seen.get(p.ExternalPaymentRef);
            return !!prior && instant(prior.ExternalUpdatedAt) === p.UpdatedAt;
        };
        // Three kinds of record. FINAL and unchanged: done, dropped. Non-final and unchanged (Held,
        // Unmatched, Refused): re-decided every pass because OUR side may have changed (an invoice
        // mapped, a configuration fixed), but they never count against the cap — otherwise a backlog
        // of pre-cutover AR wider than MaxCount would pin the watermark for ever. New or changed:
        // the work the cap is for, oldest first.
        const pending = all.filter((p) => !(isUnchanged(p) && FINAL.has(seen.get(p.ExternalPaymentRef)!.Disposition)));
        const stale = pending.filter((p) => isUnchanged(p));
        const fresh = pending.filter((p) => !isUnchanged(p));
        const freshBatch = fresh.slice(0, opts.maxCount);
        const payments = [...stale, ...freshBatch];
        let fault: string | null = null;

        for (const p of payments) {
            try {
                const prior = seen.get(p.ExternalPaymentRef) ?? null;
                const outcome = await this.handlePayment(rail, p, prior, opts.preview, provider, user);
                outcomes.push(outcome);
            } catch (err) {
                // One bad payment must not stop the pass — but it must stop the watermark.
                fault = `${p.ExternalPaymentRef}: ${err instanceof Error ? err.message : String(err)}`;
                LogError(`Orders.PollExternalPayments: ${fault}`);
                outcomes.push({ PaymentProviderID: paymentProviderID, ExternalPaymentRef: p.ExternalPaymentRef, Amount: p.Amount, ExternalStatus: p.Status, Disposition: 'Held', Reason: `Fault while processing: ${fault}`, });
            }
        }

        // THE WATERMARK: on a clean, uncapped pass, the newest instant the rail returned. On a capped
        // pass, the newest instant among the payments actually processed — everything older is done
        // (the list is sorted), and the one-day overlap re-reads the boundary next time. A fault keeps
        // the old watermark so nothing is skipped.
        const capped = freshBatch.length < fresh.length;
        const processedMax = freshBatch.reduce<string | null>((m, p) => (p.UpdatedAt && (!m || p.UpdatedAt > m) ? p.UpdatedAt : m), null);
        let newWatermark = storedWatermark;
        if (!fault) newWatermark = capped ? (processedMax ?? storedWatermark) : (fetched.Value.NewWatermark ?? processedMax ?? storedWatermark);
        if (!opts.preview) {
            await touchSyncState(
                provider,
                user,
                paymentProviderID,
                state,
                fault
                    ? { LastError: fault }
                    : { Watermark: newWatermark, LastSucceededAt: new Date(), LastError: capped ? `Capped at ${opts.maxCount}; ${fresh.length - freshBatch.length} more next pass.` : null },
            );
        }
        return { Outcomes: outcomes, NewWatermark: newWatermark, Fault: fault ? `${rail.Config.Name}: ${fault}` : null };
    }

    private async handlePayment(
        rail: BaseInvoiceRail,
        p: RailPaymentRecord,
        prior: ExternalPaymentRow | null,
        preview: boolean,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ExternalPaymentOutcome> {
        const providerID = rail.Config.PaymentProviderID;
        const base = { PaymentProviderID: providerID, ExternalPaymentRef: p.ExternalPaymentRef, Amount: money(p.Amount), ExternalStatus: p.Status };
        const decision = DecideExternalPayment({ ExternalPaymentRef: p.ExternalPaymentRef, Status: p.Status, PriorDisposition: prior?.Disposition ?? null });

        const record = async (disposition: ExternalPaymentDisposition, reason: string, paymentHeaderID: string | null = prior?.PaymentHeaderID ?? null) => {
            if (!preview) await upsertExternalPayment(provider, user, providerID, p, prior, disposition, reason, paymentHeaderID);
        };

        if (decision.Action === 'Ignore') {
            // A person's reason for setting a row aside outlives our automatic one.
            const reason = prior?.Disposition === 'Ignored' && prior.DispositionReason ? prior.DispositionReason : decision.Reason;
            await record(prior?.Disposition ?? 'Ignored', reason);
            return { ...base, Disposition: 'Ignored', Reason: reason, PaymentHeaderID: prior?.PaymentHeaderID ?? null };
        }
        if (decision.Action === 'Hold') {
            await record('Held', decision.Reason);
            return { ...base, Disposition: 'Held', Reason: decision.Reason };
        }
        if (decision.Action === 'ReversalNeeded') {
            await record('ReversalNeeded', decision.Reason);
            return { ...base, Disposition: 'ReversalNeeded', Reason: decision.Reason, PaymentHeaderID: prior?.PaymentHeaderID ?? null };
        }

        // Capture: every invoice on the payment must be one we issued.
        const refs = p.InvoicePayments.map((ip) => ip.ExternalInvoiceRef).filter(Boolean);
        const invoices = await LoadExternalInvoicesByRef(providerID, refs, provider, user);
        const orderIDs = [...new Set(invoices.map((i) => String(i.OrderHeaderID)))];
        const orders = await loadOrders(orderIDs, provider, user);
        const units = new Map<string, UnitRef>();
        for (const inv of invoices) {
            const order = orders.get(String(inv.OrderHeaderID).toLowerCase());
            if (!order || !inv.ExternalInvoiceRef) continue;
            units.set(inv.ExternalInvoiceRef, {
                OrderHeaderID: String(inv.OrderHeaderID),
                CompanyID: String(inv.CompanyID),
                OrderHeaderPaymentScheduleID: inv.OrderHeaderPaymentScheduleID ? String(inv.OrderHeaderPaymentScheduleID) : null,
                BillToOrganizationID: order.BillToOrganizationID,
                // Exactly one payer: the organisation when there is one (D65).
                BillToPersonID: order.BillToOrganizationID ? null : order.BillToPersonID,
            });
        }
        const allocation = AllocateInvoicePayments(p.InvoicePayments, (ref) => units.get(ref));
        if (allocation.OK === false) {
            const reason = p.UnappliedAmount > 0 && !p.InvoicePayments.length
                ? `${allocation.Reason} The full ${money(p.UnappliedAmount).toFixed(2)} is unapplied on the rail — the customer's credit lives there until Finance applies it.`
                : allocation.Reason;
            await record('Unmatched', reason);
            return { ...base, Disposition: 'Unmatched', Reason: reason };
        }

        const notes = [`Bill.com receivable payment ${p.ExternalPaymentRef}`];
        if (p.UnappliedAmount > 0) notes.push(`${money(p.UnappliedAmount).toFixed(2)} left unapplied on the rail (customer credit there, not here).`);

        const capture = await new OrdersCapturePaymentOperation().Execute(
            {
                Amount: allocation.Total,
                ReceivingCompanyID: rail.Config.CompanyID,
                BillToOrganizationID: allocation.Payer.BillToOrganizationID,
                BillToPersonID: allocation.Payer.BillToPersonID,
                TenderCode: TenderFor(p),
                PaymentDate: p.PaymentDate?.slice(0, 10) ?? Today(),
                Reference: p.ExternalPaymentRef,
                Notes: notes.join(' '),
                Allocations: allocation.Allocations.map((a) => ({ OrderHeaderID: a.OrderHeaderID, Amount: a.Amount, OrderHeaderPaymentScheduleID: a.OrderHeaderPaymentScheduleID })),
                PaymentDetail: { PaymentProviderID: providerID, ReferenceNumber: (p.Raw.referenceNumber as string | undefined) ?? p.ExternalPaymentRef },
                IdempotencyKey: ExternalPaymentIdempotencyKey(rail.Config.TypeCode, p.ExternalPaymentRef),
                Preview: preview,
            },
            { provider, user },
        );
        const cap = capture.Output;
        if (!capture.Success || !cap?.Success) {
            // A refusal from the capture path is a fact about OUR data (a split-company order, an
            // ambiguous payer) or our configuration — a person has to look, so it counts as attention.
            const reason = `Orders.CapturePayment refused: ${cap?.Message ?? capture.ErrorMessage ?? 'no reason'}${cap?.Blockers?.length ? ` (${cap.Blockers.map((b) => b.Code ?? b.Message).join(', ')})` : ''}`;
            await record('Refused', reason);
            return { ...base, Disposition: 'Refused', Reason: reason };
        }
        if (cap.WasRetry) {
            // The unique key found an earlier capture this table did not know about.
            await record('Captured', 'Already captured under the idempotency key; row adopted.', cap.PaymentHeaderID ?? null);
            return { ...base, Disposition: 'Ignored', Reason: 'Already captured under the idempotency key.', PaymentNumber: cap.PaymentNumber, PaymentHeaderID: cap.PaymentHeaderID };
        }
        const reason = `Captured as ${cap.PaymentNumber ?? '(preview)'} for ${allocation.Total.toFixed(2)} across ${allocation.Allocations.length} order(s).`;
        await record('Captured', reason, cap.PaymentHeaderID ?? null);
        if (!preview) await refreshInvoices(rail, invoices.map((i) => i.ID), refs, provider, user);
        return { ...base, Disposition: 'Captured', Reason: reason, PaymentNumber: cap.PaymentNumber ?? null, PaymentHeaderID: cap.PaymentHeaderID ?? null };
    }
}

/** Registers {@link PollExternalPaymentsOperation}. Called from the server bootstrap. */
export function LoadPollExternalPaymentsOperation(): void {
    void PollExternalPaymentsOperation;
}

// ── Persistence helpers ──────────────────────────────────────────────────────────────────────────

async function loadSyncState(paymentProviderID: string, provider: IMetadataProvider, user: UserInfo): Promise<SyncStateRow | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<SyncStateRow>(
        { EntityName: PAYMENT_PROVIDER_SYNC_STATE_ENTITY, ExtraFilter: `PaymentProviderID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}' AND ObjectName = '${RAIL_OBJECT}'`, ResultType: 'simple' },
        user,
    );
    return r.Results?.[0] ?? null;
}

/** Create or update the watermark row. Returns the row so a first pass does not insert it twice. */
async function touchSyncState(provider: IMetadataProvider, user: UserInfo, paymentProviderID: string, state: SyncStateRow | null, fields: Record<string, unknown>): Promise<SyncStateRow | null> {
    const entity = await provider.GetEntityObject<BaseEntity>(PAYMENT_PROVIDER_SYNC_STATE_ENTITY, user);
    if (state) {
        if (!(await entity.InnerLoad(CompositeKey.FromID(state.ID)))) return state;
    } else {
        entity.NewRecord();
        entity.SetMany({ PaymentProviderID: paymentProviderID, ObjectName: RAIL_OBJECT }, true);
    }
    entity.SetMany(fields, true);
    if (!(await entity.Save())) {
        LogError(`PaymentProviderSyncState for ${paymentProviderID} could not be saved: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
        return state;
    }
    return { ID: String(entity.Get('ID')), Watermark: (fields.Watermark as string | null | undefined) ?? state?.Watermark ?? null };
}

async function loadSeen(paymentProviderID: string, refs: readonly string[], provider: IMetadataProvider, user: UserInfo): Promise<Map<string, ExternalPaymentRow>> {
    const map = new Map<string, ExternalPaymentRow>();
    if (!refs.length) return map;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<ExternalPaymentRow>(
        {
            EntityName: EXTERNAL_PAYMENT_ENTITY,
            ExtraFilter: `PaymentProviderID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}' AND ExternalPaymentRef IN (${refs.map((x) => `'${EscapeText(x)}'`).join(',')})`,
            ResultType: 'simple',
        },
        user,
    );
    for (const row of r.Results ?? []) map.set(row.ExternalPaymentRef, row);
    return map;
}

async function upsertExternalPayment(
    provider: IMetadataProvider,
    user: UserInfo,
    paymentProviderID: string,
    p: RailPaymentRecord,
    prior: ExternalPaymentRow | null,
    disposition: ExternalPaymentDisposition,
    reason: string,
    paymentHeaderID: string | null,
): Promise<void> {
    const entity = await provider.GetEntityObject<BaseEntity>(EXTERNAL_PAYMENT_ENTITY, user);
    if (prior) {
        if (!(await entity.InnerLoad(CompositeKey.FromID(prior.ID)))) throw new Error(`External payment ${prior.ID} could not be loaded.`);
    } else {
        entity.NewRecord();
        entity.SetMany({ PaymentProviderID: paymentProviderID, ExternalPaymentRef: p.ExternalPaymentRef, FirstSeenAt: new Date() }, true);
    }
    entity.SetMany(
        {
            ExternalCustomerRef: p.ExternalCustomerRef,
            Amount: money(p.Amount),
            UnappliedAmount: money(p.UnappliedAmount),
            PaymentDate: p.PaymentDate && Number.isFinite(Date.parse(p.PaymentDate)) ? new Date(p.PaymentDate) : null,
            ExternalStatus: p.Status,
            ExternalUpdatedAt: p.UpdatedAt ? new Date(p.UpdatedAt) : null,
            Disposition: disposition,
            DispositionReason: reason.slice(0, 500),
            PaymentHeaderID: paymentHeaderID,
            Payload: JSON.stringify(p.Raw),
            LastSeenAt: new Date(),
        },
        true,
    );
    if (!(await entity.Save())) throw new Error(entity.LatestResult?.CompleteMessage ?? `External payment ${p.ExternalPaymentRef} could not be saved.`);
}

async function loadOrders(orderIDs: readonly string[], provider: IMetadataProvider, user: UserInfo): Promise<Map<string, { BillToOrganizationID: string | null; BillToPersonID: string | null }>> {
    const map = new Map<string, { BillToOrganizationID: string | null; BillToPersonID: string | null }>();
    if (!orderIDs.length) return map;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ ID: string; BillToOrganizationID: string | null; BillToPersonID: string | null }>(
        { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID IN (${orderIDs.map((id) => `'${RequireUUID(id, 'OrderHeaderID')}'`).join(',')})`, Fields: ['ID', 'BillToOrganizationID', 'BillToPersonID'], ResultType: 'simple' },
        user,
    );
    for (const o of r.Results ?? []) map.set(String(o.ID).toLowerCase(), { BillToOrganizationID: o.BillToOrganizationID, BillToPersonID: o.BillToPersonID });
    return map;
}

/** Best effort: refresh the rail's view of the invoices a payment touched. A failure here is logged, never fatal. */
async function refreshInvoices(rail: BaseInvoiceRail, ids: readonly string[], refs: readonly string[], provider: IMetadataProvider, user: UserInfo): Promise<void> {
    for (let i = 0; i < ids.length && i < refs.length; i++) {
        try {
            const snap = await rail.GetInvoice(refs[i]);
            if (snap.Success && snap.Value) {
                await updateExternalInvoice(provider, user, ids[i], { ExternalDueAmount: money(snap.Value.DueAmount), ExternalStatus: snap.Value.Status, LastSyncedAt: new Date() });
            }
        } catch (err) {
            LogError(`External invoice ${refs[i]} could not be refreshed after capture: ${err}`);
        }
    }
}
