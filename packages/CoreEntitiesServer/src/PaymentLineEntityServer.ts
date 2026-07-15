/**
 * PaymentLineEntityServer — cash application (F3.3). A PaymentLine applies part of a payment to a
 * specific order; on save/delete it maintains that order's AmountPaid / Balance / PaymentStatus
 * transactionally (Jeremy's ask: "mark the specific order settled, not just net the customer balance").
 *
 * Validation (ValidateAsync-style, in Save): the sum of a payment's applications may not exceed the
 * payment's magnitude; a NEGATIVE application (a refund/credit allocation) is allowed only against a
 * credit-type order (CreditMemoOrder / Return / Amendment).
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-engine-base (computeBalance, derivePaymentStatus)
 *   ENTITY: @mj-biz-apps/orders-entities (PaymentLine / Payment / Order)
 */
import { BaseEntity, EntityDeleteOptions, EntitySaveOptions, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { computeBalance, derivePaymentStatus } from '@mj-biz-apps/orders-engine-base';
import {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersPaymentLineEntity,
} from '@mj-biz-apps/orders-entities';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const CREDIT_ORDER_TYPES = new Set(['CreditMemoOrder', 'Return', 'Amendment']);

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Lines')
export class PaymentLineEntityServer extends mjBizAppsOrdersPaymentLineEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    // Auto-stamp the allocation metadata on a new application (AllocatedAt is NOT NULL).
    if (!this.IsSaved) {
      if (!this.AllocatedAt) this.AllocatedAt = new Date();
      if (!this.AllocatedByUserID) this.AllocatedByUserID = this.ContextCurrentUser?.ID ?? null;
    }
    const reason = await this.validateApplication();
    if (reason) {
      LogError(`PaymentLineEntityServer: ${reason}`);
      return false;
    }
    const ok = await super.Save(options);
    if (ok) await recomputeOrderPaid(this.OrderID, this.ContextCurrentUser);
    return ok;
  }

  public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
    const orderID = this.OrderID;
    const user = this.ContextCurrentUser;
    const ok = await super.Delete(options);
    if (ok) await recomputeOrderPaid(orderID, user);
    return ok;
  }

  /** Returns a rejection reason, or '' when the application is valid. */
  private async validateApplication(): Promise<string> {
    const user = this.ContextCurrentUser;
    const payment = await new RunView().RunView<{ Amount: number }>(
      { EntityName: PAYMENT_ENTITY, ExtraFilter: `ID='${this.PaymentID}'`, Fields: ['Amount'], ResultType: 'simple', BypassCache: true },
      user,
    );
    if (!payment.Success || !payment.Results?.length) return `payment ${this.PaymentID} not found for application.`;
    const paymentAmount = Number(payment.Results[0].Amount);
    const priorForPayment = await this.sumApplications(`PaymentID='${this.PaymentID}' AND ID<>'${this.ID}'`, user);
    if (Math.abs(priorForPayment + this.Amount) > Math.abs(paymentAmount) + 1e-9) {
      return `applications for payment total ${priorForPayment + this.Amount} which exceeds the payment amount ${paymentAmount}.`;
    }
    if (this.Amount < 0) {
      const order = await new RunView().RunView<{ OrderType: string }>(
        { EntityName: ORDER_ENTITY, ExtraFilter: `ID='${this.OrderID}'`, Fields: ['OrderType'], ResultType: 'simple', BypassCache: true },
        user,
      );
      const orderType = order.Results?.[0]?.OrderType;
      if (!orderType || !CREDIT_ORDER_TYPES.has(orderType)) {
        return `a negative application is only allowed against a credit-type order (got ${orderType ?? 'unknown'}).`;
      }
    }
    return '';
  }

  private async sumApplications(filter: string, user: UserInfo | undefined): Promise<number> {
    const res = await new RunView().RunView<{ Amount: number }>(
      { EntityName: PAYMENT_LINE_ENTITY, ExtraFilter: filter, Fields: ['Amount'], ResultType: 'simple', BypassCache: true },
      user,
    );
    return res.Success ? (res.Results ?? []).reduce((sum, r) => sum + Number(r.Amount), 0) : 0;
  }
}

/** Recompute an order's AmountPaid (Σ its applications) → Balance + PaymentStatus, and persist. */
export async function recomputeOrderPaid(orderID: string, user: UserInfo | undefined): Promise<void> {
  const lines = await new RunView().RunView<{ Amount: number }>(
    { EntityName: PAYMENT_LINE_ENTITY, ExtraFilter: `OrderID='${orderID}'`, Fields: ['Amount'], ResultType: 'simple', BypassCache: true },
    user,
  );
  const amountPaid = lines.Success ? (lines.Results ?? []).reduce((sum, r) => sum + Number(r.Amount), 0) : 0;
  const order = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  if (!(await order.Load(orderID))) {
    LogError(`recomputeOrderPaid: order ${orderID} not found.`);
    return;
  }
  order.AmountPaid = amountPaid;
  order.Balance = computeBalance(order.TotalGross, amountPaid);
  order.PaymentStatus = derivePaymentStatus(order.TotalGross, amountPaid, order.PaymentStatus);
  if (!(await order.Save())) {
    LogError(`recomputeOrderPaid: failed to persist order ${orderID}: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
  }
}

/** Tree-shaking anchor — imported by the server bootstrap so @RegisterClass fires. */
export function LoadBizAppsOrdersPaymentLineServer(): void {
  // No-op: importing this module registers PaymentLineEntityServer above.
}
