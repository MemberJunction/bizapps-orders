/**
 * PaymentLine server subclass — the cash-application guard (plan D18/D41).
 *
 * `PaymentLine` is the junction that says "this much of that payment settles this order". The only
 * protection it had was `CHECK (Amount <> 0)`, so nothing stopped applying $500 against a $100
 * order. The rollup triggers would dutifully compute `Balance = -400` and `PaymentStatus = 'Paid'`,
 * and the customer would appear to be owed money the ledger has no record of.
 *
 * TWO RULES
 *   1. A positive application may not push the order's applied total ABOVE its gross. Over-payment
 *      is a real business event, but it is a credit balance to be handled deliberately (a credit
 *      memo, a refund), not something a data-entry slip should create silently.
 *   2. A negative application (unapply / credit memo — legal per D18) may not push the applied total
 *      BELOW zero. Un-applying more than was ever applied is always a mistake.
 *
 * WHAT IS DELIBERATELY NOT GUARDED HERE: whether the PAYMENT has enough left to allocate. One
 * payment can settle many orders, so that is a payment-side sum, and enforcing it from the line
 * would need a lock over every sibling line of the same payment. It is a separate check (PL-side)
 * rather than a half-measure bolted on here.
 *
 * CONNECTS TO:
 *   TRIGGERS: trg_PaymentLine_RollupTotals → spRecalcOrderHeaderTotals (D41)
 *   TABLE:    __mj_BizAppsOrders.PaymentLine
 */
import {
    BaseEntity,
    BaseEntityResult,
    EntitySaveOptions,
    IRunViewProvider,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersPaymentLineEntity } from '@mj-biz-apps/orders-entities';

const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

/** Cents of slack, so decimal rounding never trips the guard on an exact-payment case. */
const TOLERANCE = 0.005;

@RegisterClass(BaseEntity, PAYMENT_LINE_ENTITY)
export class PaymentLineEntityServer extends mjBizAppsOrdersPaymentLineEntity {
    /**
     * The applied-total check runs in `Save`, not `Validate`, because it needs to read sibling rows
     * — `Validate()` is synchronous by contract, and a guard that cannot see the other applications
     * is not a guard.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const problem = await this.checkApplicationTotal();
        if (problem) {
            // Registered rather than thrown: a rejected application is a business outcome the
            // caller inspects on LatestResult, the same contract every other save failure uses.
            this.RegisterResultHistoryEntry(this.buildRejection(problem));
            return false;
        }
        return super.Save(options);
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (!this.OrderHeaderID) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'OrderHeaderID',
                    'A payment line must name the order it settles.',
                    this.OrderHeaderID,
                    ValidationErrorType.Failure,
                ),
            );
        }
        return result;
    }

    /** Returns a message when this application would take the order out of range, else null. */
    private async checkApplicationTotal(): Promise<string | null> {
        if (!this.OrderHeaderID || !this.Amount) return null;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);

        const orders = await rv.RunView<{ TotalGross: number; OrderNumber: string }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID='${this.OrderHeaderID}'`,
                Fields: ['TotalGross', 'OrderNumber'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const order = orders?.Results?.[0];
        // An order we cannot read is not this guard's problem to report — the FK will reject it.
        if (!order) return null;

        const siblings = await rv.RunView<{ ID: string; Amount: number }>(
            {
                EntityName: PAYMENT_LINE_ENTITY,
                ExtraFilter: `OrderHeaderID='${this.OrderHeaderID}'`,
                Fields: ['ID', 'Amount'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );

        // Exclude this row when it is an UPDATE, so an edit is measured against its new value only.
        const existing = (siblings?.Results ?? [])
            .filter((l) => !this.ID || l.ID.toLowerCase() !== String(this.ID).toLowerCase())
            .reduce((sum, l) => sum + Number(l.Amount ?? 0), 0);

        const gross = Number(order.TotalGross ?? 0);
        const proposed = Math.round((existing + Number(this.Amount)) * 100) / 100;

        if (proposed > gross + TOLERANCE) {
            return (
                `Applying ${this.Amount} would take the total applied against order ${order.OrderNumber} ` +
                `to ${proposed}, which is more than the order's ${gross}. ${existing} is already applied. ` +
                `Record an over-payment as a credit memo or a refund rather than over-applying cash.`
            );
        }

        if (proposed < -TOLERANCE) {
            return (
                `Applying ${this.Amount} would take the total applied against order ${order.OrderNumber} ` +
                `to ${proposed}. Only ${existing} has ever been applied, so there is nothing more to ` +
                `un-apply.`
            );
        }

        return null;
    }

    private buildRejection(message: string): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = message;
        result.OriginalValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }
}

/** Tree-shaking anchor — the guard lives in Save, reachable only via the registration. */
export function LoadPaymentLineEntityServer(): void {
    // intentionally empty
}
