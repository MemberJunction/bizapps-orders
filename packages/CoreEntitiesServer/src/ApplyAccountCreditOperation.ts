/**
 * Orders.ApplyAccountCredit — spend an order's credit balance on another order (plan D68).
 *
 * WHAT AN ACCOUNT CREDIT IS
 * Not a separate instrument. When a customer pays more than an order is worth, the surplus stays on
 * that order as a NEGATIVE balance, and that negative balance IS the credit. Nothing else holds it —
 * deliberately, because a second record carrying the same balance is a second thing that can
 * disagree with the first. (A gift card is different: `StoredValueAccount` exists because nothing
 * else could hold that money.)
 *
 * WHAT THIS OPERATION WRITES
 * A payment whose `Amount` is ZERO, carrying two offsetting allocations:
 *
 *     Payment PAY-000042   Amount 0.00   type AccountCredit
 *       PaymentDetail.SourceOrderHeaderID = <the credit order>
 *       line 1:  <credit order>   -100.00     the credit is consumed
 *       line 2:  <target order>   +100.00     and lands here
 *                        SUM = 0.00  ==  Amount
 *
 * Zero is not a degenerate case here, it is the truth: no new cash entered the business. The money
 * arrived earlier, on the payment that over-paid the first order; this only re-attributes it. The
 * D68 invariant (`Amount` = sum of lines) therefore holds exactly, with nothing special-cased.
 *
 * WHY NOT JUST EDIT THE ORIGINAL PAYMENT'S LINES
 * Because a credit is not always traceable to one payment — it can accumulate from several, or
 * survive a partial refund — and because a captured payment is frozen (51005/51010/51011). Rewriting
 * history to express a new event would destroy the audit trail of money that genuinely moved.
 *
 * THE LEDGER FALLS OUT OF THE EXISTING MACHINERY
 * `PaymentLineEntityServer` already books each allocation and already treats a negative amount as a
 * reversal, so the two lines produce a mirrored pair and an ordinary pair:
 *
 *     credit order:   Dr A/R 100        Cr Cash 100     (mirrored — the reversal)
 *     target order:   Dr Cash 100       Cr A/R 100
 *
 * Cash nets to zero across them; A/R moves from one order to the other. No new booking code exists
 * for this operation, and none should — if it needed its own entries, that would mean the allocation
 * path did not really understand negative applications.
 *
 * CROSS-COMPANY IS NOT A SPECIAL CASE EITHER. When the two orders belong to different companies the
 * same path raises the intercompany legs, because the allocation factory splits per owning company.
 * Note this is not merely convenient: a single `Dr A/R / Cr A/R` entry spanning two companies could
 * not be booked at all (accounting refuses cross-company entries, D6), so the per-company shape is
 * the only bookable form rather than an implementation preference.
 *
 * FAILURE MODEL: logical refusals come back INSIDE the output as `Success: false` with a reason —
 * the same contract `Orders.RefundPayment` and `Orders.CancelSubscription` use. Only genuine faults
 * throw.
 *
 * CONNECTS TO:
 *   BOOKING: PaymentLineEntityServer.Save — both legs book through the ordinary allocation path
 *   TABLES:  __mj_BizAppsOrders.{PaymentHeader,PaymentLine,PaymentDetail,OrderHeader}
 *   DOC:     plans/archive/bizapps-orders-master.md D68
 */
import {
    BaseEntity,
    BaseRemotableOperation,
    DatabaseProviderBase,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    mjBizAppsOrdersPaymentDetailEntity,
    mjBizAppsOrdersPaymentLineEntity,
} from '@mj-biz-apps/orders-entities';
import type { PaymentHeaderEntityServer } from './PaymentHeaderEntityServer.js';
import { RequireUUID } from './sql-guards.js';
import { LoadOrdersEngine, OrdersEngine } from '@mj-biz-apps/orders-entities';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
const PAYMENT_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Types';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

/** The payment type this operation writes. Seeded in metadata/payment-types. */
const ACCOUNT_CREDIT_TYPE_CODE = 'AccountCredit';

/** Half a cent — the same tolerance the allocation guard uses. */
const TOLERANCE = 0.005;

export interface ApplyAccountCreditInput {
    /** The order carrying the credit (its Balance is negative). */
    SourceOrderHeaderID: string;
    /** The order to spend it on. */
    TargetOrderHeaderID: string;
    /** Omit to apply as much as both sides allow. */
    Amount?: number;
    Reason?: string;
    /** Compute and validate without writing — for a confirmation screen. */
    Preview?: boolean;
}

export interface ApplyAccountCreditOutput {
    Success: boolean;
    Message?: string;
    /** What was (or would be) applied. */
    AppliedAmount?: number;
    /** The source order's credit still available AFTER this application. */
    RemainingCredit?: number;
    /** The target order's balance AFTER this application. */
    TargetBalanceAfter?: number;
    PaymentHeaderID?: string;
    PaymentNumber?: string;
}

interface OrderShape {
    ID: string;
    OrderNumber: string;
    Status: string;
    Balance: number;
    TotalGross: number;
    CompanyID: string;
}

const money = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

@RegisterClass(BaseRemotableOperation, 'Orders.ApplyAccountCredit')
export class ApplyAccountCreditOperation extends BaseRemotableOperation<ApplyAccountCreditInput, ApplyAccountCreditOutput> {
    public OperationKey = 'Orders.ApplyAccountCredit';

    protected async InternalExecute(
        input: ApplyAccountCreditInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ApplyAccountCreditOutput> {
        if (!input?.SourceOrderHeaderID || !input?.TargetOrderHeaderID) {
            return { Success: false, Message: 'Both SourceOrderHeaderID and TargetOrderHeaderID are required.' };
        }
        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireUUID(input.SourceOrderHeaderID, 'SourceOrderHeaderID');
        RequireUUID(input.TargetOrderHeaderID, 'TargetOrderHeaderID');

        if (input.SourceOrderHeaderID.toLowerCase() === input.TargetOrderHeaderID.toLowerCase()) {
            return {
                Success: false,
                Message: 'The source and target orders are the same. Moving a credit onto the order that already holds it would change nothing.',
            };
        }

        const source = await this.loadOrder(provider, user, input.SourceOrderHeaderID);
        if (!source) return { Success: false, Message: `Order ${input.SourceOrderHeaderID} was not found.` };
        const target = await this.loadOrder(provider, user, input.TargetOrderHeaderID);
        if (!target) return { Success: false, Message: `Order ${input.TargetOrderHeaderID} was not found.` };

        // The credit is the source order's negative balance, expressed positive.
        const available = money(-Number(source.Balance ?? 0));
        if (available <= TOLERANCE) {
            return {
                Success: false,
                Message:
                    `Order ${source.OrderNumber} has no credit to spend — its balance is ${money(Number(source.Balance ?? 0))}. ` +
                    `A credit exists only when an order has been paid MORE than it is worth, which shows as a negative balance.`,
            };
        }

        // Nothing to pay toward is a refusal rather than a no-op: the caller believes it is settling
        // something, and silently writing a zero-value payment would hide that it did not.
        const owing = money(Number(target.Balance ?? 0));
        if (owing <= TOLERANCE) {
            return {
                Success: false,
                Message: `Order ${target.OrderNumber} has nothing outstanding (balance ${owing}), so there is nothing to apply the credit to.`,
            };
        }

        // Default to as much as both sides allow; an explicit amount is checked against both.
        const requested = input.Amount === undefined ? Math.min(available, owing) : money(Number(input.Amount));
        if (!(requested > TOLERANCE)) {
            return { Success: false, Message: `Amount must be greater than zero (received ${input.Amount}).` };
        }
        if (requested > available + TOLERANCE) {
            return {
                Success: false,
                Message: `Order ${source.OrderNumber} only has ${available} of credit; ${requested} was requested.`,
            };
        }
        if (requested > owing + TOLERANCE) {
            return {
                Success: false,
                Message:
                    `Order ${target.OrderNumber} only owes ${owing}; applying ${requested} would over-pay it. ` +
                    `Apply ${owing} instead, or spend the rest of the credit on another order.`,
            };
        }

        const remainingCredit = money(available - requested);
        const targetBalanceAfter = money(owing - requested);

        if (input.Preview) {
            return {
                Success: true,
                Message:
                    `${requested} of order ${source.OrderNumber}'s credit would settle order ${target.OrderNumber}, ` +
                    `leaving ${remainingCredit} of credit and a balance of ${targetBalanceAfter}.`,
                AppliedAmount: requested,
                RemainingCredit: remainingCredit,
                TargetBalanceAfter: targetBalanceAfter,
            };
        }

        const typeID = await this.accountCreditTypeID(provider, user);
        if (!typeID) {
            return {
                Success: false,
                Message:
                    `The '${ACCOUNT_CREDIT_TYPE_CODE}' payment type is not present. Push metadata/payment-types before applying credits.`,
            };
        }

        const db = provider as unknown as DatabaseProviderBase;
        await db.BeginTransaction();
        try {
            const detail = await provider.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(PAYMENT_DETAIL_ENTITY, user);
            detail.NewRecord();
            detail.CompanyID = target.CompanyID;
            detail.PaymentTypeID = typeID;
            detail.SourceOrderHeaderID = source.ID;
            detail.Notes = input.Reason ?? `Credit from order ${source.OrderNumber}`;
            if (!(await detail.Save())) {
                throw new Error(`Could not record the credit tender: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            const payment = await provider.GetEntityObject<PaymentHeaderEntityServer>(PAYMENT_HEADER_ENTITY, user);
            payment.NewRecord();
            const paymentNumber = await this.nextPaymentNumber(db);
            payment.PaymentNumber = paymentNumber;
            payment.ReceivingCompanyID = target.CompanyID;
            payment.PaymentTypeID = typeID;
            payment.PaymentDetailID = detail.ID;
            // ZERO on purpose — no new cash entered the business, this re-attributes money already
            // received. The D68 invariant holds exactly: 0 == (-requested) + (+requested).
            payment.Amount = 0;
            payment.ProcessingFeeAmount = 0;
            payment.PaymentDate = new Date();
            payment.Status = 'Captured';
            payment.Notes = input.Reason ?? `Applied ${requested} of order ${source.OrderNumber}'s credit`;

            // Both legs ride the header's Lines collection so they land inside this transaction and
            // the invariant is checked against the pair, never against a half-written payment.
            const consume = await provider.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
            consume.NewRecord();
            consume.OrderHeaderID = source.ID;
            consume.Amount = -requested;
            consume.AllocatedByUserID = user?.ID ?? null;

            const apply = await provider.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
            apply.NewRecord();
            apply.OrderHeaderID = target.ID;
            apply.Amount = requested;
            apply.AllocatedByUserID = user?.ID ?? null;

            // Attached, not assigned: `Lines` is a RelatedRecordCollection and `Add()` stamps
            // PaymentHeaderID for us — correct even though the header has not been saved yet.
            payment.Lines.Add(consume);
            payment.Lines.Add(apply);

            if (!(await payment.Save())) {
                throw new Error(`Could not save the credit application: ${payment.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            await db.CommitTransaction();
            return {
                Success: true,
                Message:
                    `Applied ${requested} of order ${source.OrderNumber}'s credit to order ${target.OrderNumber} as ${paymentNumber}.`,
                AppliedAmount: requested,
                RemainingCredit: remainingCredit,
                TargetBalanceAfter: targetBalanceAfter,
                PaymentHeaderID: payment.ID,
                PaymentNumber: paymentNumber,
            };
        } catch (err) {
            await db.RollbackTransaction();
            LogError(err as Error);
            throw err;
        }
    }

    private async loadOrder(provider: IMetadataProvider, user: UserInfo, id: string): Promise<OrderShape | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<OrderShape>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID='${id}'`,
                Fields: ['ID', 'OrderNumber', 'Status', 'Balance', 'TotalGross', 'CompanyID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return res?.Results?.[0] ?? null;
    }

    /**
     * The `AccountCredit` tender's ID.
     *
     * Cache first, then the query it always did. The row is seeded metadata and the cache answers it
     * without a round trip; the fallback stays because a deployment that has not seeded this tender
     * yet, or one that added it in the transaction now running, must still resolve it — and the
     * caller's whole operation depends on finding it.
     */
    private async accountCreditTypeID(provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
        await LoadOrdersEngine(provider, user);
        const cached = OrdersEngine.Instance.PaymentTypeByCode(ACCOUNT_CREDIT_TYPE_CODE);
        if (cached?.ID) return cached.ID;

        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ ID: string }>(
            {
                EntityName: PAYMENT_TYPE_ENTITY,
                ExtraFilter: `Code='${ACCOUNT_CREDIT_TYPE_CODE}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return res?.Results?.[0]?.ID ?? null;
    }

    /** Gap-free payment numbering, same sequence the capture path uses. */
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
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadApplyAccountCreditOperation(): void {
    // intentionally empty
}
