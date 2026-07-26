/**
 * Orders.RefundPayment — refund a captured payment, atomically (plan D17).
 *
 * WHAT A REFUND IS HERE
 * A NEW `PaymentHeader` that reverses an existing one, not an edit of the original. The original
 * capture is history: it happened, it has a journal entry, and rewriting it would destroy the audit
 * trail of money that genuinely moved. `ReversesPaymentHeaderID` links the two.
 *
 * The reversal carries `Status='Refunded'`, which is what makes `PaymentHeaderEntityServer` book the
 * MIRROR of the capture entry (D53): `Dr AR / Cr Cash`, positive amounts. The receivable comes back,
 * the bank goes down. The reversal's `PaymentLine` then un-applies the cash from the order, and the
 * rollup triggers move `Balance` / `PaymentStatus` back on their own (D41).
 *
 * THE GUARDS, all of which are the reason this is an operation and not a form:
 *   - the payment must exist and be `Captured` — a Pending or Failed payment never took money
 *   - never more than was captured, counting refunds already issued (partial refunds accumulate)
 *   - never a second full refund of the same payment
 *   - the refund's applications mirror the original's, so a payment split across three orders
 *     refunds proportionally rather than dumping the whole reversal on the first one
 *
 * FAILURE MODEL: logical refusals come back INSIDE the output as `Success: false` with a reason —
 * the same contract accounting's operations and `Orders.CancelSubscription` use. Only genuine faults
 * throw.
 *
 * CONNECTS TO:
 *   BOOKING: PaymentHeaderEntityServer.Save — the reversal books through the ordinary path
 *   TABLES:  __mj_BizAppsOrders.{PaymentHeader,PaymentLine,PaymentDetail}
 */
import {
    BaseEntity,
    BaseRemotableOperation,
    CompositeKey,
    DatabaseProviderBase,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';

export interface RefundPaymentInput {
    PaymentHeaderID: string;
    /** Omit for a full refund of whatever remains refundable. */
    Amount?: number;
    Reason?: string;
    /** Provider's refund id, when the money moved through one. */
    ProviderRefundID?: string;
    /** Compute and validate without writing — for a confirmation screen. */
    Preview?: boolean;
}

export interface RefundPaymentOutput {
    Success: boolean;
    Message?: string;
    /** What was (or would be) refunded. */
    RefundAmount?: number;
    /** Still refundable AFTER this refund. */
    RemainingRefundable?: number;
    RefundPaymentHeaderID?: string;
    RefundPaymentNumber?: string;
    /** The reversing journal entry, when one was booked. */
    JournalEntryID?: string;
}

interface PaymentRow {
    ID: string;
    PaymentNumber: string;
    ReceivingCompanyID: string;
    BillToOrganizationID: string | null;
    BillToPersonID: string | null;
    PaymentTypeID: string;
    PaymentDetailID: string | null;
    Amount: number;
    ProcessingFeeAmount: number;
    Status: string;
}

interface AppliedRow {
    OrderHeaderID: string;
    Amount: number;
}

const money = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

@RegisterClass(BaseRemotableOperation, 'Orders.RefundPayment')
export class RefundPaymentOperation extends BaseRemotableOperation<RefundPaymentInput, RefundPaymentOutput> {
    public OperationKey = 'Orders.RefundPayment';

    protected async InternalExecute(
        input: RefundPaymentInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<RefundPaymentOutput> {
        const payment = await this.loadPayment(provider, user, input.PaymentHeaderID);
        if (!payment) {
            return { Success: false, Message: `No payment found with ID '${input.PaymentHeaderID}'.` };
        }
        if (payment.Status !== 'Captured') {
            return {
                Success: false,
                Message:
                    `Payment ${payment.PaymentNumber} is ${payment.Status}, not Captured. ` +
                    `Only a captured payment has money to refund.`,
            };
        }

        const alreadyRefunded = await this.refundedSoFar(provider, user, payment.ID);
        const refundable = money(payment.Amount - alreadyRefunded);
        if (refundable <= 0) {
            return {
                Success: false,
                Message:
                    `Payment ${payment.PaymentNumber} has already been fully refunded ` +
                    `(${alreadyRefunded} of ${payment.Amount}).`,
                RemainingRefundable: 0,
            };
        }

        const requested = money(input.Amount ?? refundable);
        if (requested <= 0) {
            return { Success: false, Message: `A refund must be greater than zero, got ${requested}.` };
        }
        if (requested > refundable) {
            return {
                Success: false,
                Message:
                    `Cannot refund ${requested} of payment ${payment.PaymentNumber}: only ${refundable} ` +
                    `remains refundable (${payment.Amount} captured, ${alreadyRefunded} already refunded).`,
                RemainingRefundable: refundable,
            };
        }

        const applications = await this.applicationsOf(provider, user, payment.ID);
        if (applications.length === 0) {
            return {
                Success: false,
                Message:
                    `Payment ${payment.PaymentNumber} is not applied to any order, so there is nothing ` +
                    `to un-apply. Refund it at the provider instead.`,
            };
        }

        if (input.Preview) {
            return {
                Success: true,
                Message: `${requested} of ${payment.PaymentNumber} is refundable.`,
                RefundAmount: requested,
                RemainingRefundable: money(refundable - requested),
            };
        }

        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            // The un-apply lines are built BEFORE the header is saved and ride its Lines collection,
            // because the header's save is what checks the D68 invariant — saving it first with no
            // allocations would fail on a payment that is about to be perfectly consistent.
            const lines = await this.buildUnapplyLines(provider, user, payment, applications, requested);
            const refund = await this.createReversal(provider, user, payment, requested, input, lines);

            await dbProvider.CommitTransaction();
            return {
                Success: true,
                Message: `Refunded ${requested} of payment ${payment.PaymentNumber} as ${refund.Number}.`,
                RefundAmount: requested,
                RemainingRefundable: money(refundable - requested),
                RefundPaymentHeaderID: refund.ID,
                RefundPaymentNumber: refund.Number,
                JournalEntryID: refund.JournalEntryID,
            };
        } catch (err) {
            LogError(`Orders.RefundPayment failed for ${input.PaymentHeaderID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after refund error: ${rollbackErr}`);
            }
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── Reads ─────────────────────────────────────────────────────────────────

    private async loadPayment(
        provider: IMetadataProvider,
        user: UserInfo,
        id: string,
    ): Promise<PaymentRow | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<PaymentRow>(
            {
                EntityName: PAYMENT_HEADER_ENTITY,
                ExtraFilter: `ID='${id}'`,
                Fields: [
                    'ID',
                    'PaymentNumber',
                    'ReceivingCompanyID',
                    'BillToOrganizationID',
                    'BillToPersonID',
                    'PaymentTypeID',
                    'PaymentDetailID',
                    'Amount',
                    'ProcessingFeeAmount',
                    'Status',
                ],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    /** Total already refunded against this payment — partial refunds accumulate. */
    private async refundedSoFar(provider: IMetadataProvider, user: UserInfo, paymentID: string): Promise<number> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{ Amount: number }>(
            {
                EntityName: PAYMENT_HEADER_ENTITY,
                ExtraFilter: `ReversesPaymentHeaderID='${paymentID}' AND Status='Refunded'`,
                Fields: ['Amount'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return money((result?.Results ?? []).reduce((sum, r) => sum + Math.abs(Number(r.Amount ?? 0)), 0));
    }

    private async applicationsOf(
        provider: IMetadataProvider,
        user: UserInfo,
        paymentID: string,
    ): Promise<AppliedRow[]> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<AppliedRow>(
            {
                EntityName: PAYMENT_LINE_ENTITY,
                ExtraFilter: `PaymentHeaderID='${paymentID}'`,
                Fields: ['OrderHeaderID', 'Amount'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return (result?.Results ?? []).filter((r) => Number(r.Amount) > 0);
    }

    // ─── Writes ────────────────────────────────────────────────────────────────

    /**
     * The reversing PaymentHeader.
     *
     * `Status='Refunded'` is what makes `PaymentHeaderEntityServer` book the mirrored entry, so the
     * ledger side needs no special handling here — it rides the ordinary save path.
     */
    private async createReversal(
        provider: IMetadataProvider,
        user: UserInfo,
        original: PaymentRow,
        amount: number,
        input: RefundPaymentInput,
        lines: BaseEntity[],
    ): Promise<{ ID: string; Number: string; JournalEntryID?: string }> {
        const refund = await provider.GetEntityObject<BaseEntity>(PAYMENT_HEADER_ENTITY, user);
        refund.NewRecord();
        refund.Set('PaymentNumber', await this.nextPaymentNumber(provider));
        refund.Set('ReceivingCompanyID', original.ReceivingCompanyID);
        refund.Set('BillToOrganizationID', original.BillToOrganizationID);
        refund.Set('BillToPersonID', original.BillToPersonID);
        refund.Set('PaymentDate', new Date());
        refund.Set('PaymentTypeID', original.PaymentTypeID);
        refund.Set('Amount', amount);
        // The provider's fee is NOT returned on a refund, so the reversal carries none. Mirroring the
        // fee would credit back money the processor kept.
        refund.Set('ProcessingFeeAmount', 0);
        refund.Set('ReversesPaymentHeaderID', original.ID);
        refund.Set('ReversalReason', input.Reason ?? null);
        refund.Set('ProviderRefundID', input.ProviderRefundID ?? null);
        refund.Set('Status', 'Refunded');
        refund.Set('Description', `Refund of ${original.PaymentNumber}`);

        // A fresh instrument snapshot, never the original's row (D39).
        if (original.PaymentDetailID) {
            refund.Set('PaymentDetailID', await this.copyDetail(provider, user, original.PaymentDetailID));
        }

        // Header + un-apply lines in ONE save (D68): the invariant is checked across the pair, and
        // the mirrored entries book as the lines go down.
        (refund as unknown as { Lines: BaseEntity[] }).Lines = lines;

        if (!(await refund.Save())) {
            throw new Error(
                `Failed to create the refund for ${original.PaymentNumber}: ` +
                    `${refund.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        return {
            ID: refund.Get('ID') as string,
            Number: refund.Get('PaymentNumber') as string,
            JournalEntryID: (refund.Get('JournalEntryID') as string) ?? undefined,
        };
    }

    /**
     * Un-apply the refunded cash from the orders the original settled.
     *
     * Proportional to how the original was applied, so a payment split across three orders refunds
     * across the same three rather than dumping the whole reversal on whichever happened to be
     * first. The final line absorbs the rounding remainder so the un-applied total is exact.
     */
    private async buildUnapplyLines(
        provider: IMetadataProvider,
        user: UserInfo,
        original: PaymentRow,
        applications: AppliedRow[],
        refundAmount: number,
    ): Promise<BaseEntity[]> {
        const built: BaseEntity[] = [];
        const appliedTotal = applications.reduce((s, a) => s + Number(a.Amount), 0);
        let allocated = 0;

        for (let i = 0; i < applications.length; i++) {
            const app = applications[i];
            const isLast = i === applications.length - 1;
            const share = isLast
                ? money(refundAmount - allocated)
                : money((Number(app.Amount) / appliedTotal) * refundAmount);
            allocated = money(allocated + share);
            if (share <= 0) continue;

            const line = await provider.GetEntityObject<BaseEntity>(PAYMENT_LINE_ENTITY, user);
            line.NewRecord();
            line.Set('OrderHeaderID', app.OrderHeaderID);
            // NEGATIVE: this removes cash from the order, which is what moves Balance back up.
            line.Set('Amount', -share);
            line.Set('AllocatedAt', new Date());
            line.Set('AllocatedByUserID', user?.ID ?? null);
            built.push(line);
        }
        void original;
        return built;
    }

    private async copyDetail(provider: IMetadataProvider, user: UserInfo, sourceID: string): Promise<string> {
        const source = await provider.GetEntityObject<BaseEntity>(
            PAYMENT_DETAIL_ENTITY,
            CompositeKey.FromID(sourceID),
            user,
        );
        const copy = await provider.GetEntityObject<BaseEntity>(PAYMENT_DETAIL_ENTITY, user);
        copy.NewRecord();
        for (const field of source.Fields) {
            if (field.Name === 'ID' || field.Name.startsWith('__mj_')) continue;
            copy.Set(field.Name, field.Value);
        }
        if (!(await copy.Save())) {
            throw new Error(
                `Failed to copy the payment instrument: ${copy.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return copy.Get('ID') as string;
    }

    /** Same singleton counter the order path uses, so refunds sit in the same number series. */
    private async nextPaymentNumber(provider: IMetadataProvider): Promise<string> {
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
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
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadRefundPaymentOperation(): void {
    // intentionally empty
}
