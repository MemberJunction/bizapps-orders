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
 *   3. decide (`DecideExternalPayment`): Capture / Hold / Ignore / ReversalNeeded / Reverse — a Bill.com
 *      payment captured and then voided or cancelled is reversed here as a bank return (golive #386);
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
 * in Bill.com) and `ReversalNeeded` (captured, then refunded or disputed on the rail, or a reversal
 * that failed) are reported as `ATTENTION`
 * with Success false so a job that notifies on failure tells somebody; the rows stay in
 * `ExternalPayment` until dealt with. A payment the rail itself records Unmatched (HubSpot, which
 * cannot name a payment's deal yet) is counted but does not fail the run on its own.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseEntity, BaseRemotableOperation, CompositeKey, LogError, RunView, type DatabaseProviderBase, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    AllocateInvoicePayments,
    DecideExternalPayment,
    ExternalPaymentIdempotencyKey,
    PaymentStatusVocabularyFor,
    TenderFor,
    OrdersCapturePaymentOperation,
    OrdersPollExternalPaymentsOperation as OrdersPollExternalPaymentsOperationBase,
    type ExternalPaymentDisposition,
    type ExternalPaymentOutcome,
    type OrdersPollExternalPaymentsInput,
    type OrdersPollExternalPaymentsOutput,
    type UnitRef,
    Today,
    ClassifyPollJobsFor,
    LoadPollJobs,
} from '@mj-biz-apps/orders-entities';

import type { BaseInvoiceRail, RailPaymentRecord } from './BaseInvoiceRail.js';
import {
    EXTERNAL_PAYMENT_ENTITY,
    ORDER_HEADER_ENTITY,
    PAYMENT_HEADER_ENTITY,
    PAYMENT_LINE_ENTITY,
    PAYMENT_PROVIDER_SYNC_STATE_ENTITY,
} from './entity-names.js';
import { ListPaymentSourceProviderIDs, ResolveInvoiceRail } from './InvoiceRailResolver.js';
import { LoadExternalInvoicesByRef, updateExternalInvoice, type ExternalInvoiceRow } from './IssueExternalInvoiceOperation.js';
import { BuildUnapplyLines, CreateReversingPayment, LoadAppliedAllocations, type ReversiblePayment } from './PaymentReversalFactory.js';
import { EscapeText, RequireUUID } from './sql-guards.js';

const RAIL_OBJECT = 'receivable-payments';
/**
 * The currency the receiving company books in. Mirrors `PaymentHeaderEntityServer.functionalCurrency`,
 * including its USD fallback when no accounting profile exists.
 */
async function functionalCurrencyFor(companyID: string, provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ FunctionalCurrencyCode: string | null }>(
        { EntityName: 'MJ_BizApps_Accounting: Accounting Company Profiles', ExtraFilter: `ID = '${RequireUUID(companyID, 'ReceivingCompanyID')}'`, ResultType: 'simple' },
        user,
    );
    return (r?.Results?.[0]?.FunctionalCurrencyCode ?? 'USD').trim().toUpperCase();
}

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
        let preview = !!input?.Preview;
        const maxCount = Math.max(1, Math.floor(Number(input?.MaxCount ?? DEFAULT_MAX)));
        const out: OrdersPollExternalPaymentsOutput = {
            Success: true,
            ResultCode: preview ? 'PREVIEWED' : 'COMPLETED',
            Captured: 0,
            Held: 0,
            Unmatched: 0,
            Refused: 0,
            Reapplied: 0,
            ReversalNeeded: 0,
            Ignored: 0,
            Outcomes: [],
            NewWatermarks: [],
            PreviewedOnly: preview,
        };
        // EACH PROVIDER FOLLOWS ITS OWN POLL JOB (#583, #608). A run that would write follows the
        // scheduled job's state whoever calls it — the scheduler, the webhook, the queue page's button —
        // and it does so per provider (`ClassifyPollJobsFor`): a provider whose job is Disabled or not
        // installed is skipped, one whose job is in Preview runs as a preview, and only a provider
        // whose job is live records cash. The run fails only when every provider was skipped. A run
        // that asked for a preview writes nothing and needs no permission.
        try {
            const jobs = preview ? null : await LoadPollJobs(user, provider as unknown as IRunViewProvider);
            const providers = input?.PaymentProviderID
                ? [{ ID: RequireUUID(input.PaymentProviderID, 'PaymentProviderID'), CompanyID: '' }]
                : await ListPaymentSourceProviderIDs(provider, user);
            if (!providers.length) {
                return { ...out, ResultCode: 'NO_PROVIDERS', Message: 'No active external payment source (invoice rail or HubSpot portal) is configured for any company; nothing to poll.' };
            }
            const faults: string[] = [];
            const skipped: string[] = [];
            const previewed: string[] = [];
            const passes: Array<{ Preview: boolean; Outcomes: ExternalPaymentOutcome[]; RailUnmatched: number }> = [];
            for (const p of providers) {
                let providerPreview = preview;
                if (jobs) {
                    const job = ClassifyPollJobsFor(jobs, p.ID);
                    if (job.State === 'NotInstalled' || job.State === 'Inactive') {
                        skipped.push(`provider ${p.ID}: ${job.Why}`);
                        continue;
                    }
                    if (job.State === 'Preview') {
                        providerPreview = true;
                        previewed.push(`provider ${p.ID}: ${job.Why}`);
                    }
                }
                const result = await this.pollProvider(p.ID, { preview: providerPreview, maxCount, since: input?.SinceWatermark ?? null }, provider, user);
                passes.push({ Preview: providerPreview, Outcomes: result.Outcomes, RailUnmatched: result.RailUnmatched ?? 0 });
                out.Outcomes.push(...result.Outcomes);
                out.NewWatermarks.push({ PaymentProviderID: p.ID, Watermark: result.NewWatermark });
                if (result.Fault) faults.push(result.Fault);
            }
            if (!passes.length) {
                return {
                    ...out,
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: `Nothing was polled or recorded: ${skipped.join('; ')}. Payments are recorded only while the scheduled poll job is Active and out of Preview.`,
                };
            }
            // Nothing recorded unless some provider ran live; then the counts cover only the live ones.
            const recorded = passes.some((x) => !x.Preview);
            preview = !recorded;
            out.ResultCode = preview ? 'PREVIEWED' : 'COMPLETED';
            out.PreviewedOnly = preview;
            const notes = [
                ...(skipped.length ? [`Skipped ${skipped.join('; ')}.`] : []),
                ...(previewed.length ? [`Ran as a preview because ${previewed.join('; ')}; nothing was recorded${recorded ? ' for those' : ''}.`] : []),
            ];
            const previewNote = notes.length ? `${notes.join(' ')} ` : '';
            for (const o of passes.filter((x) => x.Preview === preview).flatMap((x) => x.Outcomes)) {
                if (o.Disposition === 'Captured') out.Captured++;
                else if (o.Disposition === 'Held') out.Held++;
                else if (o.Disposition === 'Unmatched') out.Unmatched++;
                else if (o.Disposition === 'Refused') out.Refused++;
                else if (o.Disposition === 'Reapplied') out.Reapplied++;
                else if (o.Disposition === 'ReversalNeeded') out.ReversalNeeded++;
                else out.Ignored++;
            }
            if (faults.length) {
                return { ...out, Success: false, ResultCode: 'ERROR', Message: `${previewNote}The poll hit a fault on ${faults.length} provider(s): ${faults.join(' | ')}` };
            }
            // A payment the rail itself records Unmatched (every HubSpot payment, until its deal can be read) is the
            // expected state, not something this run found wrong: it is counted and listed, but on its own it does
            // not fail the run, or every hourly run would fail for as long as such payments exist.
            const railUnmatched = passes.filter((x) => x.Preview === preview).reduce((n, x) => n + x.RailUnmatched, 0);
            const awaitingNote = railUnmatched > 0 ? ` ${railUnmatched} recorded Unmatched by a rail that cannot match payments to orders yet (see External Payments).` : '';
            const needsPerson = out.Unmatched - railUnmatched + out.Refused + out.Reapplied + out.ReversalNeeded;
            if (!preview && needsPerson > 0) {
                return {
                    ...out,
                    Success: false,
                    ResultCode: 'ATTENTION',
                    Message: `${previewNote}${out.Captured} payment(s) captured; ${out.Unmatched - railUnmatched} unmatched, ${out.Refused} refused, ${out.Reapplied} re-applied on the rail and ${out.ReversalNeeded} needing reversal are waiting for a person (see External Payments).${awaitingNote}`,
                };
            }
            out.Message = preview
                ? `${previewNote}Would capture ${out.Outcomes.filter((o) => o.Disposition === 'Captured').length} payment(s); ${out.Held} held, ${out.Unmatched} unmatched.`
                : `${previewNote}${out.Captured} payment(s) captured, ${out.Held} held, ${out.Ignored} already known.${awaitingNote}`;
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
    ): Promise<{ Outcomes: ExternalPaymentOutcome[]; NewWatermark: string | null; Fault: string | null; RailUnmatched?: number }> {
        const outcomes: ExternalPaymentOutcome[] = [];
        let railUnmatched = 0;
        const rail = await ResolveInvoiceRail(paymentProviderID, provider, user);
        // A configuration fault (no Company Integration, live/sandbox mismatch, connector not loaded)
        // is the provider's problem, not any payment's: report it as a fault, write nothing.
        const ready = await rail.CheckConfiguration();
        if (ready.Success === false) return { Outcomes: [], NewWatermark: null, Fault: `${rail.Config.Name}: ${ready.Reason}` };

        // Resolved once per provider: every payment it captures books in this company's currency.
        const bookingCurrency = await functionalCurrencyFor(rail.Config.CompanyID, provider, user);

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
                const outcome = await this.handlePayment(rail, p, prior, opts.preview, bookingCurrency, provider, user);
                outcomes.push(outcome);
                if (outcome.Disposition === 'Unmatched' && p.UnmatchedReason) railUnmatched++;
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
        return { Outcomes: outcomes, NewWatermark: newWatermark, Fault: fault ? `${rail.Config.Name}: ${fault}` : null, RailUnmatched: railUnmatched };
    }

    private async handlePayment(
        rail: BaseInvoiceRail,
        p: RailPaymentRecord,
        prior: ExternalPaymentRow | null,
        preview: boolean,
        bookingCurrency: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ExternalPaymentOutcome> {
        const providerID = rail.Config.PaymentProviderID;
        const base = { PaymentProviderID: providerID, ExternalPaymentRef: p.ExternalPaymentRef, Amount: money(p.Amount), ExternalStatus: p.Status };
        // Only a payment with cash recorded against it can have been re-applied, so the ledger read is
        // skipped otherwise. `Reapplied` is included as well as `Captured`: the comparison is what
        // lets a raised exception CLEAR itself once a person has corrected the allocation, and
        // without it the row would report a difference that no longer exists for ever.
        const vocabulary = PaymentStatusVocabularyFor(rail.Config.TypeCode);
        // A rail that reports no invoice applications (HubSpot) cannot have re-applied anything, and
        // comparing its empty list against our payment lines would flag every captured payment.
        const applicationsChanged =
            vocabulary.ReportsInvoiceApplications && (prior?.Disposition === 'Captured' || prior?.Disposition === 'Reapplied') && prior.PaymentHeaderID
                ? await applicationsDiffer(String(prior.PaymentHeaderID), p, providerID, provider, user)
                : undefined;

        const record = async (disposition: ExternalPaymentDisposition, reason: string, paymentHeaderID: string | null = prior?.PaymentHeaderID ?? null) => {
            if (!preview) await upsertExternalPayment(provider, user, providerID, p, prior, disposition, reason, paymentHeaderID);
        };

        // Money this rail only records, collected and booked through another path. Never captured
        // here; a payment already captured keeps its row and its header.
        if (p.SetAsideReason && !prior?.PaymentHeaderID) {
            await record('Ignored', p.SetAsideReason, null);
            return { ...base, Disposition: 'Ignored', Reason: p.SetAsideReason };
        }

        const decision = DecideExternalPayment({
            ExternalPaymentRef: p.ExternalPaymentRef,
            Status: p.Status,
            PriorDisposition: prior?.Disposition ?? null,
            ApplicationsChanged: applicationsChanged,
            Vocabulary: vocabulary,
        });

        if (decision.Action === 'Ignore') {
            // A person's reason for setting a row aside outlives our automatic one.
            const reason = prior?.Disposition === 'Ignored' && prior.DispositionReason ? prior.DispositionReason : decision.Reason;
            // WHAT THE ROW SHOULD READ AS, which is not always what it already says. Keeping the prior
            // disposition is right for a row a person set aside and for one that is simply still
            // captured — but a `Reapplied` row whose allocation has been corrected has to stop reading
            // as an exception, or it sits on the queue page for ever saying nothing is wrong.
            // `Captured` is only honoured with a header to point at, because the CHECK constraint
            // requires one and a disagreement here would fail the write rather than the row.
            const resolved = decision.Disposition && (decision.Disposition !== 'Captured' || prior?.PaymentHeaderID) ? decision.Disposition : undefined;
            await record(resolved ?? prior?.Disposition ?? 'Ignored', reason);
            return { ...base, Disposition: 'Ignored', Reason: reason, PaymentHeaderID: prior?.PaymentHeaderID ?? null };
        }
        if (decision.Action === 'Hold') {
            await record('Held', decision.Reason);
            return { ...base, Disposition: 'Held', Reason: decision.Reason };
        }
        if (decision.Action === 'Reapplied') {
            // When the answer rests on a comparison that could not be made, the words already on the
            // row describe a real difference; this pass has nothing better to say than that.
            const reason = decision.KeepPriorReason && prior?.DispositionReason ? prior.DispositionReason : decision.Reason;
            await record('Reapplied', reason);
            return { ...base, Disposition: 'Reapplied', Reason: reason, PaymentHeaderID: prior?.PaymentHeaderID ?? null };
        }
        if (decision.Action === 'Reverse') {
            const r = await reverseCancelledPayment(p, prior?.PaymentHeaderID ?? null, decision.Reason, vocabulary.RailName, preview, provider, user);
            await record(r.Disposition, r.Reason);
            return { ...base, Disposition: r.Disposition, Reason: r.Reason, PaymentNumber: r.PaymentNumber ?? null, PaymentHeaderID: prior?.PaymentHeaderID ?? null };
        }
        if (decision.Action === 'ReversalNeeded') {
            await record('ReversalNeeded', decision.Reason);
            return { ...base, Disposition: 'ReversalNeeded', Reason: decision.Reason, PaymentHeaderID: prior?.PaymentHeaderID ?? null };
        }

        // The rail already knows nothing here matches it (HubSpot: no deal link to read yet).
        if (p.UnmatchedReason) {
            await record('Unmatched', p.UnmatchedReason);
            return { ...base, Disposition: 'Unmatched', Reason: p.UnmatchedReason };
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

        // ORDERS BOOKS AT PAR AND APPLIES NO RATE. `Orders.CapturePayment` takes no currency; the cash
        // leg is booked in the receiving company's functional currency. So a payment the rail reports in
        // anything else cannot be captured here — doing so booked 1,000 CAD as 1,000 USD, silently.
        if (p.CurrencyCode && p.CurrencyCode !== bookingCurrency) {
            const reason =
                `${p.ExternalPaymentRef} is ${money(p.Amount).toFixed(2)} ${p.CurrencyCode}, but ${rail.Config.Name} books in ${bookingCurrency}. ` +
                `Orders applies no exchange rate on capture, so recording it here would misstate the cash. Record it by hand at the rate you used.`;
            await record('Refused', reason, null);
            return { ...base, Disposition: 'Refused', Reason: reason };
        }

        const notes = [vocabulary.ReportsInvoiceApplications ? `${vocabulary.RailName} receivable payment ${p.ExternalPaymentRef}` : `${vocabulary.RailName} payment ${p.ExternalPaymentRef}`];
        if (p.UnappliedAmount > 0) notes.push(`${money(p.UnappliedAmount).toFixed(2)} left unapplied on the rail (customer credit there, not here).`);

        const capture = await new OrdersCapturePaymentOperation().Execute(
            {
                Amount: allocation.Total,
                ReceivingCompanyID: rail.Config.CompanyID,
                BillToOrganizationID: allocation.Payer.BillToOrganizationID,
                BillToPersonID: allocation.Payer.BillToPersonID,
                TenderCode: p.TenderCode ?? TenderFor(p),
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
        if (!preview) await refreshInvoices(rail, invoices, provider, user);
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

interface PaymentToReverse extends ReversiblePayment {
    Amount: number;
    ReversesPaymentHeaderID: string | null;
    ReversalSource: string | null;
    Status: string;
}

/**
 * A captured payment the rail now reports void or cancelled, reversed as a bank return (golive #386).
 *
 * The answer is what the `ExternalPayment` row should read: `Ignored`, naming the reversal, once the
 * cash is off the books; `ReversalNeeded` when a person still has to act (a preview, a failure).
 *
 * IDEMPOTENT ON THE LEDGER, not on the row. A bank-return reversal already pointing at the payment is
 * the answer, so a crash between the reversal's commit and the row's update cannot reverse twice.
 * What earlier refunds already gave back is not reversed again; only the remainder is.
 *
 * Dated today, the business day the poll saw it: Bill.com's payment carries no cancellation date,
 * and its `updatedTime` moves for other edits too.
 */
async function reverseCancelledPayment(
    p: RailPaymentRecord,
    paymentHeaderID: string | null,
    why: string,
    railName: string,
    preview: boolean,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Disposition: ExternalPaymentDisposition; Reason: string; PaymentNumber?: string }> {
    if (!paymentHeaderID) return { Disposition: 'ReversalNeeded', Reason: `${why} No payment is linked to this row, so it has to be reversed by hand.` };
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const id = RequireUUID(paymentHeaderID, 'PaymentHeaderID');
    const r = await rv.RunView<PaymentToReverse>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter: `ID = '${id}' OR (ReversesPaymentHeaderID = '${id}' AND Status = 'Refunded')`,
            Fields: ['ID', 'PaymentNumber', 'ReceivingCompanyID', 'BillToOrganizationID', 'BillToPersonID', 'PaymentTypeID', 'PaymentDetailID', 'Amount', 'ReversesPaymentHeaderID', 'ReversalSource', 'Status'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (r?.Success === false) throw new Error(`Payment ${paymentHeaderID} could not be read: ${r.ErrorMessage}`);
    const rows = r?.Results ?? [];
    const original = rows.find((x) => String(x.ID).toLowerCase() === id.toLowerCase());
    if (!original) return { Disposition: 'ReversalNeeded', Reason: `${why} Payment ${paymentHeaderID} was not found, so it has to be reversed by hand.` };
    const reversals = rows.filter((x) => x !== original);
    const onRail = `${railName} reports ${p.ExternalPaymentRef} '${p.Status}'.`;

    const done = reversals.find((x) => x.ReversalSource === 'BankReturn');
    if (done) return { Disposition: 'Ignored', Reason: `Reversed as ${done.PaymentNumber}: ${onRail}`, PaymentNumber: done.PaymentNumber };
    const remaining = money(Number(original.Amount) - reversals.reduce((n, x) => n + Number(x.Amount), 0));
    if (remaining <= 0) return { Disposition: 'Ignored', Reason: `${original.PaymentNumber} was already refunded in full; nothing is left to reverse. ${onRail}` };
    if (preview) return { Disposition: 'ReversalNeeded', Reason: `Would reverse ${remaining.toFixed(2)} of ${original.PaymentNumber} as a bank return. ${onRail}` };

    try {
        const number = await writeBankReturn(original, remaining, `${onRail} The cash never arrived.`, provider, user);
        return { Disposition: 'Ignored', Reason: `Reversed as ${number} on ${Today()}: ${onRail}`, PaymentNumber: number };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        LogError(`Orders.PollExternalPayments: reversing ${original.PaymentNumber} for ${p.ExternalPaymentRef} failed: ${message}`);
        return { Disposition: 'ReversalNeeded', Reason: `${why} The automatic reversal failed: ${message}` };
    }
}

/** The reversal and its un-apply lines in one transaction, as `PaymentSettlement.reverse()` writes a bank return. */
async function writeBankReturn(original: PaymentToReverse, amount: number, reason: string, provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const applications = await LoadAppliedAllocations(provider, user, original.ID);
    if (!applications.length) throw new Error(`${original.PaymentNumber} is not applied to any order, so there is nothing to un-apply.`);
    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    try {
        const lines = await BuildUnapplyLines(provider, user, applications, amount);
        const reversal = await CreateReversingPayment(
            provider,
            user,
            original,
            { Source: 'BankReturn', Amount: amount, Reason: reason, Description: `Return of ${original.PaymentNumber}` },
            lines,
        );
        await db.CommitTransaction();
        return reversal.Number;
    } catch (err) {
        try {
            await db.RollbackTransaction();
        } catch (rollbackErr) {
            LogError(`Rollback failed after a cancelled-payment reversal error: ${rollbackErr}`);
        }
        throw err;
    }
}

/**
 * Whether the rail's current application of a payment still matches the payment lines we hold.
 *
 * Bill.com lets Finance re-apply a receipt after the fact: 700.00 recorded against invoice A becomes
 * 300.00 on A and 400.00 on B, or moves to invoice C entirely. The payment's own total never changes,
 * so every later poll saw "already captured" and did nothing, while Orders showed the wrong invoices
 * settled and nothing anywhere said so.
 *
 * Compared as a set of (order, instalment, amount) triples rather than by invoice: our PaymentLines
 * record the ORDER and, where the order is billed on a schedule, the INSTALMENT an amount landed on —
 * which is what a person would have to re-allocate. A rail invoice we cannot map to a unit is treated
 * as a difference: it means the money now points somewhere we did not send.
 *
 * THE INSTALMENT IS PART OF THE KEY, not decoration. Under #220/#242 the instalment is the billing
 * unit, so money moved from instalment 1 to instalment 2 of the same order is a real re-application —
 * one instalment reads settled here and open on the rail, and the other the reverse. Keyed on the
 * order alone the two sides compared equal and the move was invisible.
 */
async function applicationsDiffer(
    paymentHeaderID: string,
    p: RailPaymentRecord,
    providerID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<boolean | undefined> {
    try {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const lines = await rv.RunView<{ OrderHeaderID: string; OrderHeaderPaymentScheduleID: string | null; Amount: number }>(
            {
                EntityName: PAYMENT_LINE_ENTITY,
                ExtraFilter: `PaymentHeaderID = '${RequireUUID(paymentHeaderID, 'PaymentHeaderID')}'`,
                Fields: ['OrderHeaderID', 'OrderHeaderPaymentScheduleID', 'Amount'],
                ResultType: 'simple',
            },
            user,
        );
        const refs = p.InvoicePayments.map((ip) => ip.ExternalInvoiceRef).filter(Boolean);
        const invoices = await LoadExternalInvoicesByRef(providerID, refs, provider, user);
        const unitByRef = new Map(
            invoices.map((i) => [
                String(i.ExternalInvoiceRef).toLowerCase(),
                `${String(i.OrderHeaderID).toLowerCase()}/${i.OrderHeaderPaymentScheduleID ? String(i.OrderHeaderPaymentScheduleID).toLowerCase() : '-'}`,
            ]),
        );

        const key = (triples: Array<[string, number]>) =>
            triples
                .map(([unit, amount]) => `${unit}:${money(amount).toFixed(2)}`)
                .sort()
                .join('|');

        const ours = key(
            (lines.Results ?? []).map((l) => [
                `${String(l.OrderHeaderID).toLowerCase()}/${l.OrderHeaderPaymentScheduleID ? String(l.OrderHeaderPaymentScheduleID).toLowerCase() : '-'}`,
                Number(l.Amount),
            ]),
        );
        const theirs = key(
            p.InvoicePayments.map((ip) => [unitByRef.get(String(ip.ExternalInvoiceRef).toLowerCase()) ?? `unmapped:${ip.ExternalInvoiceRef}`, ip.Amount]),
        );
        return ours !== theirs;
    } catch (err) {
        // COULD NOT TELL — not "no difference". Answering false would invent a clean bill of health:
        // for a payment already flagged `Reapplied` it would retire a live exception on one bad read,
        // with the wrong allocation still in place and nothing left saying so. `undefined` holds
        // whatever the row already says, and a payment merely `Captured` is unaffected either way.
        LogError(`Could not compare Bill.com applications for payment ${p.ExternalPaymentRef}: ${err}`);
        return undefined;
    }
}

/**
 * Best effort: refresh the rail's view of the invoices a payment touched. A failure here is logged, never fatal.
 *
 * Each row is fetched by its own `ExternalInvoiceRef`. The rows come from an unordered query that also
 * leaves out invoices no longer `Sent`, so they cannot be paired with the payment's refs by position:
 * doing so wrote one invoice's status and due amount onto another's row (#580).
 */
export async function refreshInvoices(rail: BaseInvoiceRail, rows: readonly ExternalInvoiceRow[], provider: IMetadataProvider, user: UserInfo): Promise<void> {
    for (const row of rows) {
        if (!row.ExternalInvoiceRef) continue;
        try {
            const snap = await rail.GetInvoice(row.ExternalInvoiceRef);
            if (snap.Success && snap.Value) {
                await updateExternalInvoice(provider, user, row.ID, { ExternalDueAmount: money(snap.Value.DueAmount), ExternalStatus: snap.Value.Status, LastSyncedAt: new Date() });
            }
        } catch (err) {
            LogError(`External invoice ${row.ExternalInvoiceRef} could not be refreshed after capture: ${err}`);
        }
    }
}
