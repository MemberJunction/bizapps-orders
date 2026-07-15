/**
 * OrderLineEntityServer — materializes an order line's stored totals on save (F1.3).
 *
 * `LineTotalNet = Quantity × UnitPrice × (1 − DiscountPct)`, `LineTotalGross = LineTotalNet + LineTax`
 * (tax is 0 in v1 — S4 deferred). Computed via the pure `orderLifecycle` helpers so the browser and
 * the server agree. Recompute is gated to PRICING-input changes (Quantity/UnitPrice/DiscountPct/LineTax)
 * — a fulfillment-only edit (the FulfillmentStatus carve-out on a frozen line) does NOT touch the
 * totals, so it never trips the line-freeze trigger.
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-engine-base (computeLineNet, computeLineGross)
 *   ENTITY: @mj-biz-apps/orders-entities (mjBizAppsOrdersOrderLineEntity)
 */
import { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { computeLineGross, computeLineNet } from '@mj-biz-apps/orders-engine-base';
import { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';

const PRICING_INPUTS = ['Quantity', 'UnitPrice', 'DiscountPct', 'LineTax'] as const;

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Lines')
export class OrderLineEntityServer extends mjBizAppsOrdersOrderLineEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (this.pricingInputsDirty()) {
      this.LineTotalNet = computeLineNet(this.Quantity, this.UnitPrice, this.DiscountPct);
      this.LineTotalGross = computeLineGross(this.LineTotalNet, this.LineTax);
    }
    return super.Save(options);
  }

  /** Recompute only when a pricing input changed (or a new line) — leaves frozen lines untouched. */
  private pricingInputsDirty(): boolean {
    if (!this.IsSaved) return true;
    return PRICING_INPUTS.some(f => this.GetFieldByName(f)?.Dirty ?? false);
  }
}

/** Tree-shaking anchor — imported by the server bootstrap so @RegisterClass fires. */
export function LoadBizAppsOrdersOrderLineServer(): void {
  // No-op: importing this module registers OrderLineEntityServer above.
}
