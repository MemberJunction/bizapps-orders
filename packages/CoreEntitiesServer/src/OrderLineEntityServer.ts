/**
 * OrderLineEntityServer — line-level invariants and engine-materialized totals.
 *
 * Two jobs, both of which must happen server-side because the journal entry is derived from them:
 *
 *   1. STAMP THE COMPANY (plan D6). `OrderLine.CompanyID` is a denormalized copy of the
 *      product's company, captured at save time so the line records who owned the product at
 *      transaction time even if product ownership later moves. It is derived, never authored —
 *      whatever a caller passes is overwritten.
 *
 *   2. COMPUTE THE TOTALS. `LineTotalNet` / `LineTotalGross` are engine-materialized and never
 *      user-entered:
 *          LineTotalNet   = (Quantity × UnitPrice × (1 − DiscountPct)) − DiscountAmount
 *          LineTotalGross = LineTotalNet + LineTax + ChargeAmount
 *
 *      DiscountPct and DiscountAmount are both applied, in that order, because they mean different
 *      things: a percentage is a negotiated concession on the line, an amount is an allocated share
 *      of a promotion (D70). The net is clamped TOWARD ZERO, in whichever direction the line runs —
 *      a discount larger than the line is a configuration mistake and must not turn a sale into a
 *      credit, but a reversal line (D16) is legitimately negative and must not be flattened to zero.
 *      The rule lives in `PricingBehavior.NetAfterDiscount`, shared with the charge/tax base, because
 *      it was written twice and both copies had the same bug.
 *      The journal entry is built from the same arithmetic, so a client-supplied total can never
 *      disagree with what was booked.
 *
 * The DB trigger (51003) freezes these columns once the parent order is Confirmed, so this runs
 * meaningfully only while the order is still open.
 *
 * CONNECTS TO:
 *   FACTORY: OrderJournalEntryFactory (./OrderJournalEntryFactory.ts) — mirrors this arithmetic
 */
import {
    BaseEntity,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { NetAfterDiscount } from './PricingBehavior.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

@RegisterClass(BaseEntity, ORDER_LINE_ENTITY)
export class OrderLineEntityServer extends mjBizAppsOrdersOrderLineEntity {
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        // Quantity <> 0 is a DB CHECK; negative quantities are legal only as reversal slices
        // (plan D16), which is a cross-field rule the database cannot express.
        if (this.Quantity < 0 && !this.ReversesOrderLineID) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'Quantity',
                    `A negative quantity is only valid on a reversal line. Set ReversesOrderLineID to the ` +
                        `line being reversed, or use a positive quantity.`,
                    this.Quantity,
                    ValidationErrorType.Failure,
                ),
            );
        }

        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        await this.stampCompanyFromProduct();
        this.computeTotals();
        return super.Save(options);
    }

    /** Derived from the product, always — plan D6. */
    private async stampCompanyFromProduct(): Promise<void> {
        if (!this.ProductID) return;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView<{ ID: string; CompanyID: string }>(
            {
                EntityName: PRODUCT_ENTITY,
                ExtraFilter: `ID='${this.ProductID}'`,
                Fields: ['ID', 'CompanyID'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );

        const product = result?.Results?.[0];
        if (product?.CompanyID) {
            this.CompanyID = product.CompanyID;
        }
    }

    private computeTotals(): void {
        // ROUND THE DISCOUNT TO ITS COLUMN'S SCALE FIRST, and store the rounded value.
        //
        // `DiscountPct` is `DECIMAL(7,4)`. Computing with an unrounded rate and storing a rounded one
        // makes the application and the database disagree about the same line: a third off 900 is
        // 600.00 by full precision and 600.03 by the stored 0.3333.
        //
        // That disagreement does not surface until the line is UPDATED — which happens when
        // `JournalEntryID` is stamped after booking. `computeTotals` runs again, now reading 0.3333
        // back from the row, produces 600.03, and the immutability trigger correctly refuses to let
        // booked money change. The confirm then fails with 'Failed to stamp JournalEntryID', which
        // names neither the discount nor the rounding, and any DiscountPct with more than four
        // decimal places is simply un-bookable.
        //
        // `savePendingLines` already does exactly this for `Quantity` and for exactly this reason;
        // the discount never got the same treatment. Assigning the rounded value here means the two
        // can never diverge again, whichever path set it.
        const pct = Math.round((this.DiscountPct ?? 0) * 1e4) / 1e4;
        if (pct !== (this.DiscountPct ?? 0)) this.DiscountPct = pct;

        // A ROLLUP PARENT CONTRIBUTES NOTHING (D45).
        //
        // An expanded bundle's parent line is customer-facing: it keeps its UnitPrice so an invoice
        // can print "Gold Package — 100", but the money lives on the children, which carry the
        // allocated shares. Letting the parent compute a line total as well would DOUBLE the order —
        // and do it invisibly, because the parent's own arithmetic is perfectly correct and every
        // child's is too. The header rollup trigger sums LineTotalGross across all lines, so zero
        // here is what keeps it honest without the trigger needing to know bundles exist.
        //
        // Deliberately after the DiscountPct rounding above, so the stored rate stays consistent
        // whether or not the line happens to be a parent.
        if ((this as unknown as { IsRollupParent?: boolean }).IsRollupParent) {
            this.LineTotalNet = 0;
            this.LineTotalGross = 0;
            return;
        }

        // `NetAfterDiscount` is shared with the charge/tax base in OrderEntityServer. It used to be
        // computed independently in both places, and both clamped a reversal line to zero — see
        // PricingBehavior for what that cost.
        const net = NetAfterDiscount(
            this.Quantity * this.UnitPrice,
            pct,
            this.DiscountAmount ?? 0,
        );
        this.LineTotalNet = net;
        this.LineTotalGross = money(net + (this.LineTax ?? 0) + (this.ChargeAmount ?? 0));
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderLineEntityServer(): void {
    // intentionally empty
}
