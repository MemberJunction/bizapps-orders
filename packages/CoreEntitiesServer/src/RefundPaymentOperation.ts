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
    BaseRemotableOperation,
    DatabaseProviderBase,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { RequireUUID } from './sql-guards.js';
import {
    BuildUnapplyLines,
    CreateReversingPayment,
    LoadAppliedAllocations,
    type AppliedAllocation,
} from './PaymentReversalFactory.js';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';

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

const money = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

@RegisterClass(BaseRemotableOperation, 'Orders.RefundPayment')
export class RefundPaymentOperation extends BaseRemotableOperation<RefundPaymentInput, RefundPaymentOutput> {
    public OperationKey = 'Orders.RefundPayment';

    protected async InternalExecute(
        input: RefundPaymentInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<RefundPaymentOutput> {
        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireUUID(input.PaymentHeaderID, 'PaymentHeaderID');

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

        const applications = await LoadAppliedAllocations(provider, user, payment.ID);
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
            const lines = await BuildUnapplyLines(provider, user, applications, requested);
            const refund = await CreateReversingPayment(
                provider,
                user,
                payment,
                {
                    Amount: requested,
                    Reason: input.Reason ?? null,
                    ProviderRefundID: input.ProviderRefundID ?? null,
                },
                lines,
            );

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
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadRefundPaymentOperation(): void {
    // intentionally empty
}
