/**
 * @fileoverview `Orders.CapturePayment` — take a payment and allocate it, in one transaction.
 *
 * WHY THIS EXISTS AT ALL. A payment is a HEADER plus its ALLOCATION LINES, and
 * `PaymentHeaderEntityServer.Lines` is a TRANSIENT collection rather than a column. CodeGen cannot
 * emit it on the client entity, so a browser `entity.Save()` has nowhere to put the allocations.
 * That is precisely the situation `Orders.SaveOrder` was built for, and it needs the same answer.
 *
 * A two-step create-then-allocate flow was rejected: between the steps there would be a captured
 * payment with no allocations in the database — cash recorded against nothing — and any failure in
 * the second step would leave it there permanently.
 *
 * READ WHAT THE ENGINE COMPUTED; DO NOT RECOMPUTE. The fee, the net, and every order rollup are
 * read back from the saved rows. Recomputing them here would eventually disagree with the ledger,
 * and the disagreement surfaces as a balanced journal entry for the wrong amount — which nothing
 * downstream can catch.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import {
    BaseEntity,
    BaseRemotableOperation,
    RunView,
    type DatabaseProviderBase,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersCapturePaymentOperation as OrdersCapturePaymentOperationBase,
    type BlockerResult,
    type CapturePaymentOrderEffect,
    type JournalEntryPreview,
    type OrdersCapturePaymentInput,
    type OrdersCapturePaymentOutput,
} from '@mj-biz-apps/orders-entities';

import { RequireOptionalUUID, RequireUUID } from './sql-guards.js';
import { ResolvePaymentProvider } from './PaymentProviderResolver.js';
import { LoadOrdersEngine, OrdersEngine } from './OrdersEngine.js';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
const PAYMENT_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Types';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

const money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${i}'`))].join(',');

@RegisterClass(BaseRemotableOperation, 'Orders.CapturePayment')
export class CapturePaymentOperation extends OrdersCapturePaymentOperationBase {
    protected async InternalExecute(
        input: OrdersCapturePaymentInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersCapturePaymentOutput> {
        const blockers: BlockerResult[] = [];
        const rv = new RunView(provider as unknown as IRunViewProvider);

        // ── 1. VALIDATE AT THE BOUNDARY ──
        // The page checks these before emitting, but this is the trust boundary and must not rely on
        // that. Ids are validated because they reach SQL filter text: `GetOverdueWorklist`
        // interpolated a caller-supplied id straight into ExtraFilter, and `' OR 1=1 --` widened the
        // result set rather than erroring.
        let receivingCompanyID: string;
        try {
            receivingCompanyID = RequireUUID(input?.ReceivingCompanyID, 'ReceivingCompanyID');
        } catch (e) {
            return this.refuse([this.blocker('BadCompanyID', String((e as Error).message))]);
        }

        // Validated at the boundary like every other caller-supplied id, even though this one reaches
        // an entity Set() rather than a filter: the FilterInjection guard is a floor, not a ceiling,
        // and an id that is not an id should be refused where the caller can still read the reason.
        try {
            RequireOptionalUUID(input?.PaymentIntentID, 'PaymentIntentID');
        } catch (e) {
            return this.refuse([this.blocker('BadPaymentIntentID', String((e as Error).message))]);
        }

        const allocations = input?.Allocations ?? [];
        if (!allocations.length) {
            blockers.push(
                this.blocker(
                    'NoAllocations',
                    'A payment must say where the money lands. Send at least one allocation.',
                    'Allocate the payment to one or more orders before capturing.',
                ),
            );
        }

        // Validated even though these are Set() onto an entity rather than interpolated into a
        // filter. The guard test enforces "every caller-supplied id is checked" with no exceptions,
        // which is the right rule: an id that is safe because of where it happens to be used today
        // stops being safe the moment somebody reads it back in a query.
        let orgID: string | null = null;
        let personID: string | null = null;
        try {
            orgID = input?.BillToOrganizationID ? RequireUUID(input.BillToOrganizationID, 'BillToOrganizationID') : null;
            personID = input?.BillToPersonID ? RequireUUID(input.BillToPersonID, 'BillToPersonID') : null;
        } catch (e) {
            return this.refuse([this.blocker('BadPayerID', String((e as Error).message))]);
        }
        if (!!orgID === !!personID) {
            blockers.push(
                this.blocker(
                    'PayerAmbiguous',
                    orgID
                        ? 'A payment names ONE payer. Both an organization and a person were given.'
                        : 'A payment names one payer. Neither an organization nor a person was given.',
                    'Set exactly one of BillToOrganizationID or BillToPersonID.',
                ),
            );
        }

        for (const [i, a] of allocations.entries()) {
            try {
                RequireUUID(a?.OrderHeaderID, `Allocations[${i}].OrderHeaderID`);
                if (a?.OrderLineID) RequireUUID(a.OrderLineID, `Allocations[${i}].OrderLineID`);
            } catch (e) {
                blockers.push(this.blocker('BadOrderID', String((e as Error).message)));
                continue;
            }
            if (!(Number(a?.Amount ?? 0) > 0)) {
                blockers.push(
                    this.blocker(
                        'NonPositiveAllocation',
                        `Allocation ${i + 1} is for ${a?.Amount ?? 0}. Every allocation must be a positive amount — ` +
                            `un-applying money is a different operation.`,
                    ),
                );
            }
        }

        // D68: the amount received must equal what was allocated. A mismatch means either cash
        // recorded against nothing, or an order credited with money that never arrived. Refused
        // rather than silently adjusted, because both directions are wrong in ways that reconcile.
        const amount = money(Number(input?.Amount ?? 0));
        const allocated = money(allocations.reduce((s, a) => s + Number(a?.Amount ?? 0), 0));
        if (!(amount > 0)) {
            blockers.push(this.blocker('NonPositiveAmount', `A payment must be for a positive amount, got ${amount}.`));
        } else if (amount !== allocated) {
            blockers.push(
                this.blocker(
                    'AllocationMismatch',
                    `The payment is for ${amount} but its allocations total ${allocated}, leaving ` +
                        `${money(amount - allocated)} unaccounted for. Every part of a payment must land on an order (D68).`,
                    'Adjust the allocations so they sum to the amount received.',
                ),
            );
        }

        if (blockers.length) return this.refuse(blockers);

        // ── 2. IDEMPOTENCY ──
        // Checked BEFORE any write. A repeat call returns the ORIGINAL payment rather than taking
        // money again or reporting a spurious failure.
        //
        // THIS LOOKUP IS AN OPTIMISATION, NOT THE GUARANTEE — and mutation testing proved it.
        // Disabling this block alone leaves CP9 passing, because the insert then hits
        // UX_PaymentHeader_IdempotencyKey and the duplicate-key handler below returns the original
        // payment anyway. CP9 only fails when BOTH are disabled. The two are deliberately redundant:
        // the INDEX is what makes a genuine race safe (two concurrent requests, neither having seen
        // the other's row), while this lookup makes the common case — a user double-clicking a
        // second later — cheap and legible rather than a caught exception.
        const idempotencyKey = (input?.IdempotencyKey ?? '').trim() || null;
        if (idempotencyKey && !input?.Preview) {
            const existing = await rv.RunView<{ ID: string }>(
                {
                    EntityName: PAYMENT_HEADER_ENTITY,
                    ExtraFilter: `IdempotencyKey = '${idempotencyKey.replace(/'/g, "''")}'`,
                    ResultType: 'simple',
                },
                user,
            );
            const found = existing.Results?.[0];
            if (found) {
                const out = await this.project(found.ID, provider, user, rv);
                return { ...out, WasRetry: true, IdempotencyKey: idempotencyKey };
            }
        }

        // ── 3. RESOLVE THE TENDER ──
        // By code, so the client does not have to resolve a lookup to take money. An unknown code is
        // refused by NAME rather than falling back to a default: a payment silently recorded as the
        // wrong kind is invisible until somebody reconciles.
        //
        // Read from the lookup cache rather than queried per capture: payment types are eleven rows
        // of seeded metadata read on every payment, and `Code` is unique, so the `IsActive` filter
        // that used to live in the SQL is the same test applied here.
        const code = (input?.TenderCode ?? '').trim();
        await LoadOrdersEngine(provider, user);
        const cachedTender = OrdersEngine.Instance.PaymentTypeByCode(code);
        const tenderRow = cachedTender?.IsActive ? cachedTender : undefined;
        if (!tenderRow) {
            return this.refuse([
                this.blocker(
                    'UnknownTender',
                    `There is no active payment type with code '${code}'.`,
                    'Payment types are seeded metadata — check the code, or add the type.',
                ),
            ]);
        }
        if (tenderRow.IsReversal) {
            return this.refuse([
                this.blocker(
                    'ReversalTender',
                    `'${code}' is a REVERSAL payment type and cannot be used to take money. Use Orders.RefundPayment.`,
                ),
            ]);
        }

        // ── 4. THE ORDERS MUST EXIST AND BELONG TO THE RECEIVING COMPANY ──
        const orderIDs = [...new Set(allocations.map((a) => a.OrderHeaderID))];
        const orders = await rv.RunView<{ ID: string; OrderNumber: string; CompanyID: string; Status: string }>(
            { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID IN (${quote(orderIDs)})`, ResultType: 'simple' },
            user,
        );
        const orderByID = new Map((orders.Results ?? []).map((o) => [key(o.ID), o]));
        for (const id of orderIDs) {
            const order = orderByID.get(key(id));
            if (!order) {
                blockers.push(this.blocker('OrderNotFound', `Order ${id} does not exist.`));
            } else if (key(order.CompanyID) !== key(receivingCompanyID)) {
                // Cash collected by one company against another's order is the intercompany case,
                // and it is handled by ALLOCATION, not by mis-stating who received the money.
                blockers.push(
                    this.blocker(
                        'OrderCompanyMismatch',
                        `Order ${order.OrderNumber} belongs to a different company than the one receiving this payment.`,
                        'Capture against the company that owns the order, or allocate across companies from that side.',
                    ),
                );
            }
        }
        if (blockers.length) return this.refuse(blockers);

        // ── 5. WRITE ──
        // Preview runs the REAL capture and rolls back. Not a second model of the arithmetic: a
        // preview that reimplements the calculation eventually disagrees with the capture.
        const dbProvider = provider as unknown as DatabaseProviderBase;
        const preview = !!input?.Preview;
        await dbProvider.BeginTransaction();
        try {
            const paymentID = await this.writePayment(
                input,
                { receivingCompanyID, paymentTypeID: tenderRow.ID, amount, idempotencyKey },
                provider,
                user,
            );
            const out = await this.project(paymentID, provider, user, rv);

            if (preview) {
                await dbProvider.RollbackTransaction();
                return { ...out, WasPreview: true, IdempotencyKey: idempotencyKey };
            }
            await dbProvider.CommitTransaction();
            return { ...out, WasPreview: false, WasRetry: false, IdempotencyKey: idempotencyKey };
        } catch (e) {
            await dbProvider.RollbackTransaction();
            const message = String((e as Error)?.message ?? e);
            // A UNIQUE violation on the token means a concurrent request won the race — which is the
            // index doing its job. Report it as a retry rather than a failure.
            if (idempotencyKey && /UX_PaymentHeader_IdempotencyKey|duplicate key/i.test(message)) {
                const again = await rv.RunView<{ ID: string }>(
                    {
                        EntityName: PAYMENT_HEADER_ENTITY,
                        ExtraFilter: `IdempotencyKey = '${idempotencyKey.replace(/'/g, "''")}'`,
                        ResultType: 'simple',
                    },
                    user,
                );
                const found = again.Results?.[0];
                if (found) {
                    const out = await this.project(found.ID, provider, user, rv);
                    return { ...out, WasRetry: true, IdempotencyKey: idempotencyKey };
                }
            }
            return this.refuse([this.blocker('CaptureFailed', message)]);
        }
    }

    /**
     * Header + detail + allocation lines, saved ONCE.
     *
     * The allocations go onto the transient `Lines` collection and are written inside the header's
     * own transaction — the whole reason this operation exists. Status is set to Captured BEFORE the
     * save, because `savePendingLines` books from that collection and a header saved Pending would
     * persist its lines without booking anything.
     */
    private async writePayment(
        input: OrdersCapturePaymentInput,
        ctx: { receivingCompanyID: string; paymentTypeID: string; amount: number; idempotencyKey: string | null },
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<string> {
        const header = await provider.GetEntityObject<BaseEntity>(PAYMENT_HEADER_ENTITY, user);
        header.NewRecord();
        // A payment number is a cash-receipt document number, minted gap-consciously from the same
        // PaymentSequence the confirm path and the account-credit path use — one sequence, so the
        // numbers a customer sees never collide or skip regardless of which door the payment came in.
        header.Set('PaymentNumber', await this.nextPaymentNumber(provider as unknown as DatabaseProviderBase));
        header.Set('ReceivingCompanyID', ctx.receivingCompanyID);
        header.Set('PaymentTypeID', ctx.paymentTypeID);
        header.Set('Amount', ctx.amount);
        header.Set('PaymentDate', input?.PaymentDate ? new Date(input.PaymentDate) : new Date());
        if (input?.BillToOrganizationID) header.Set('BillToOrganizationID', input.BillToOrganizationID);
        if (input?.BillToPersonID) header.Set('BillToPersonID', input.BillToPersonID);
        if (input?.Reference) header.Set('Description', input.Reference);
        if (input?.Notes) header.Set('Notes', input.Notes);
        if (ctx.idempotencyKey) header.Set('IdempotencyKey', ctx.idempotencyKey);

        // The instrument, when the tender needs one. Its own row (D38/D39): a payment gets its OWN
        // copy rather than pointing at a wallet entry that can later change.
        if (input?.PaymentDetail) {
            const detail = await provider.GetEntityObject<BaseEntity>(PAYMENT_DETAIL_ENTITY, user);
            detail.NewRecord();
            detail.Set('CompanyID', ctx.receivingCompanyID);
            detail.Set('PaymentTypeID', ctx.paymentTypeID);
            if (input.PaymentDetail.ReferenceNumber) detail.Set('ReferenceNumber', input.PaymentDetail.ReferenceNumber);
            if (input.PaymentDetail.ProviderInstrumentRef) {
                detail.Set('ProviderInstrumentRef', input.PaymentDetail.ProviderInstrumentRef);
            }
            if (input.PaymentDetail.SourceCustomerPaymentMethodID) {
                detail.Set('SourceCustomerPaymentMethodID', input.PaymentDetail.SourceCustomerPaymentMethodID);
            }
            if (input.PaymentDetail.InstrumentDate) detail.Set('InstrumentDate', input.PaymentDetail.InstrumentDate);
            if (!(await detail.Save())) {
                throw new Error(
                    `Could not record the payment instrument: ${detail.LatestResult?.CompleteMessage ?? 'no reason given'}`,
                );
            }
            header.Set('PaymentDetailID', detail.Get('ID'));
            if (input.PaymentDetail.PaymentProviderID) {
                header.Set('PaymentProviderID', input.PaymentDetail.PaymentProviderID);
            }
        }

        // THE LINK THAT MAKES A GATEWAY CAPTURE POSSIBLE. `settleWithProvider` reads the gateway's own
        // intent string through this row; without it a provider-backed payment is refused with
        // "there is nothing for the gateway to capture", which is precisely the state this whole path
        // sat in before `Orders.OpenPaymentIntent` existed.
        if (input?.PaymentIntentID) {
            header.Set('PaymentIntentID', input.PaymentIntentID);
        }

        const lines: BaseEntity[] = [];
        for (const a of input?.Allocations ?? []) {
            const line = await provider.GetEntityObject<BaseEntity>(PAYMENT_LINE_ENTITY, user);
            line.NewRecord();
            line.Set('OrderHeaderID', a.OrderHeaderID);
            line.Set('Amount', money(Number(a.Amount)));
            if (a.OrderLineID) line.Set('OrderLineID', a.OrderLineID);
            line.Set('AllocatedAt', new Date());
            if (user?.ID) line.Set('AllocatedByUserID', user.ID);
            lines.push(line);
        }
        (header as unknown as { Lines: BaseEntity[] }).Lines = lines;

        // CAPTURED FOR EVERY RAIL THAT ANSWERS IMMEDIATELY. `savePendingLines` books each allocation
        // from this collection, and a header saved Pending would persist the lines with nothing
        // booked — a captured payment with no cash leg, which balances and is wrong.
        //
        // PENDING FOR A RAIL THAT DOES NOT (D77). A bank debit has moved no money when this runs: the
        // bank answers days later. Writing `Captured` would send `settleWithProvider` to a driver whose
        // Capture is a READ, which correctly refuses an intent that is still processing — so the whole
        // capture would fail and there would be no way to record the debit at all. `Pending` records
        // exactly what is true (submitted, waiting), the allocations persist unbooked, and the webhook
        // promotes it when the bank confirms — at which point `bookPersistedLines` settles the cash
        // leg. The debt is deliberate and is discharged in exactly one place.
        const settlesLate = await this.settlesAsynchronously(header, provider, user);
        header.Set('Status', settlesLate ? 'Pending' : 'Captured');

        if (!(await header.Save())) {
            throw new Error(
                `Could not capture the payment: ${header.LatestResult?.CompleteMessage ?? 'no reason given'}`,
            );
        }
        return header.Get('ID') as string;
    }

    /**
     * Whether this payment's gateway settles on someone else's schedule.
     *
     * Asked of the DRIVER, not of configuration — see `BasePaymentProvider.SettlesAsynchronously` for
     * why an operator must not be able to declare that ACH settles instantly.
     *
     * FALSE WHEN ANYTHING GOES WRONG, deliberately. A payment with no provider is a recorded one
     * (cheque, cash) and captures immediately; a provider that cannot be resolved is a configuration
     * fault that the save path is about to report far more clearly than a status guess here would.
     * Defaulting to the existing behaviour keeps every rail that worked before working unchanged.
     */
    private async settlesAsynchronously(
        header: BaseEntity,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<boolean> {
        const providerID = header.Get('PaymentProviderID') as string | null;
        if (!providerID) return false;
        try {
            const driver = await ResolvePaymentProvider(providerID, provider, user);
            return driver.SettlesAsynchronously === true;
        } catch {
            return false;
        }
    }

    /**
     * Read back what the engine computed.
     *
     * Every number here comes from the saved rows — the fee the driver decided, the rollups the
     * triggers moved. Nothing is recalculated, because a second calculation is a second opinion, and
     * the one that reaches the screen would not be the one in the ledger.
     */
    private async project(
        paymentID: string,
        provider: IMetadataProvider,
        user: UserInfo,
        rv: RunView,
    ): Promise<OrdersCapturePaymentOutput> {
        const header = await rv.RunView<{
            ID: string;
            PaymentNumber: string;
            Status: string;
            Amount: number;
            ProcessingFeeAmount: number;
            NetAmount: number;
        }>({ EntityName: PAYMENT_HEADER_ENTITY, ExtraFilter: `ID = '${paymentID}'`, ResultType: 'simple' }, user);
        const row = header.Results?.[0];
        if (!row) {
            return this.refuse([this.blocker('PaymentNotFound', `Payment ${paymentID} could not be read back.`)]);
        }

        const lines = await rv.RunView<{ OrderHeaderID: string }>(
            { EntityName: PAYMENT_LINE_ENTITY, ExtraFilter: `PaymentHeaderID = '${paymentID}'`, ResultType: 'simple' },
            user,
        );
        const orderIDs = [...new Set((lines.Results ?? []).map((l) => l.OrderHeaderID))];

        const effects: CapturePaymentOrderEffect[] = [];
        if (orderIDs.length) {
            const orders = await rv.RunView<{
                ID: string;
                OrderNumber: string;
                AmountPaid: number;
                Balance: number;
                PaymentStatus: string;
            }>(
                { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID IN (${quote(orderIDs)})`, ResultType: 'simple' },
                user,
            );
            for (const o of orders.Results ?? []) {
                effects.push({
                    OrderHeaderID: o.ID,
                    OrderNumber: o.OrderNumber,
                    AmountPaid: money(Number(o.AmountPaid ?? 0)),
                    Balance: money(Number(o.Balance ?? 0)),
                    PaymentStatus: o.PaymentStatus,
                    // Over-payment is ACCEPTED (D68). The surplus is a negative balance and becomes
                    // spendable credit — the account-credit screen depends on these existing.
                    HasCredit: Number(o.Balance ?? 0) < 0,
                });
            }
        }

        const entries = await this.readEntries(paymentID, provider, user, rv);

        return {
            Success: true,
            PaymentHeaderID: row.ID,
            PaymentNumber: row.PaymentNumber,
            Status: row.Status,
            Amount: money(Number(row.Amount ?? 0)),
            ProcessingFeeAmount: money(Number(row.ProcessingFeeAmount ?? 0)),
            NetAmount: money(Number(row.NetAmount ?? row.Amount ?? 0)),
            OrderEffects: effects,
            JournalEntries: entries,
            EntryCount: entries.length,
            AllBalanced: entries.every((e) => e.Balanced),
            Blockers: [],
        };
    }

    /** The entries this payment's allocations produced, found through accounting's D25 provenance pair. */
    private async readEntries(
        paymentID: string,
        provider: IMetadataProvider,
        user: UserInfo,
        rv: RunView,
    ): Promise<JournalEntryPreview[]> {
        const rows = await rv.RunView<{
            EntryID: string;
            EntryType: string;
            CompanyID: string;
            Company: string | null;
            Code: string;
            AccountName: string;
            DebitAmount: number;
            CreditAmount: number;
        }>(
            {
                EntityName: 'MJ_BizApps_Accounting: Journal Entry Lines',
                ExtraFilter:
                    `JournalEntryID IN (SELECT je.ID FROM __mj_BizAppsAccounting.JournalEntry je ` +
                    `WHERE LOWER(je.LinkedRecordID) IN (SELECT LOWER(CAST(pl.ID AS NVARCHAR(400))) ` +
                    `FROM __mj_BizAppsOrders.PaymentLine pl WHERE pl.PaymentHeaderID = '${paymentID}') ` +
                    `OR LOWER(je.LinkedRecordID) = LOWER('${paymentID}'))`,
                ResultType: 'simple',
            },
            user,
        ).catch(() => ({ Results: [] as never[] }));

        const byEntry = new Map<string, JournalEntryPreview>();
        for (const r of (rows.Results ?? []) as Array<Record<string, unknown>>) {
            const id = String(r.JournalEntryID ?? r.EntryID ?? '');
            if (!id) continue;
            let entry = byEntry.get(key(id));
            if (!entry) {
                entry = {
                    CompanyID: String(r.CompanyID ?? ''),
                    CompanyName: String(r.Company ?? ''),
                    JournalEntryID: id,
                    EntryType: String(r.EntryType ?? 'PaymentCapture'),
                    Balanced: true,
                    Lines: [],
                };
                byEntry.set(key(id), entry);
            }
            const debit = Number(r.DebitAmount ?? 0);
            const credit = Number(r.CreditAmount ?? 0);
            entry.Lines.push({
                Side: debit > 0 ? 'Dr' : 'Cr',
                AccountRole: String(r.Code ?? ''),
                AccountName: String(r.GLAccount ?? r.AccountName ?? ''),
                Amount: money(debit > 0 ? debit : credit),
            });
        }

        for (const entry of byEntry.values()) {
            const dr = entry.Lines.filter((l) => l.Side === 'Dr').reduce((s, l) => s + l.Amount, 0);
            const cr = entry.Lines.filter((l) => l.Side === 'Cr').reduce((s, l) => s + l.Amount, 0);
            entry.Balanced = Math.abs(money(dr - cr)) < 0.005;
        }
        return [...byEntry.values()];
    }

    /** Gap-conscious payment numbering — the same sequence every other capture path uses. */
    private async nextPaymentNumber(db: DatabaseProviderBase): Promise<string> {
        const rows = (await db.ExecuteSQL(`
            DECLARE @seq TABLE (Seq INT);
            UPDATE __mj_BizAppsOrders.PaymentSequence WITH (UPDLOCK, HOLDLOCK)
            SET NextSequenceNumber = NextSequenceNumber + 1
            OUTPUT deleted.NextSequenceNumber INTO @seq(Seq)
            WHERE ID = 1;
            SELECT Seq FROM @seq;`)) as Array<{ Seq: number }>;

        const seq = rows?.[0]?.Seq;
        if (!seq) {
            throw new Error('Could not obtain the next payment number — PaymentSequence (ID=1) is missing.');
        }
        return `PAY-${String(seq).padStart(6, '0')}`;
    }

    private blocker(code: string, message: string, hint?: string): BlockerResult {
        return { Code: code, Message: message, ResolutionHint: hint ?? null, LineNumber: null };
    }

    private refuse(blockers: BlockerResult[]): OrdersCapturePaymentOutput {
        return {
            Success: false,
            Message: blockers.map((b) => b.Message).join(' '),
            Blockers: blockers,
            OrderEffects: [],
            JournalEntries: [],
            EntryCount: 0,
            AllBalanced: true,
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadCapturePaymentOperation(): void {
    // intentionally empty
}
