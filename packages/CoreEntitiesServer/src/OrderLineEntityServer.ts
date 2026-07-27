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
 *          LineTotalGross = LineTotalNet + LineTax
 *
 *      DiscountPct and DiscountAmount are both applied, in that order, because they mean different
 *      things: a percentage is a negotiated concession on the line, an amount is an allocated share
 *      of a promotion (D70). The net is floored at zero — a discount larger than the line is a
 *      configuration mistake, and a NEGATIVE line would silently become revenue when booked.
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
        const gross = money(this.Quantity * this.UnitPrice);
        const afterPct = money(gross * (1 - (this.DiscountPct ?? 0)));
        // Floored at zero: over-discounting is a configuration mistake, and a negative line would
        // flip sign in the journal entry and read as revenue.
        const net = money(Math.max(0, afterPct - (this.DiscountAmount ?? 0)));
        this.LineTotalNet = net;
        this.LineTotalGross = money(net + (this.LineTax ?? 0));
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderLineEntityServer(): void {
    // intentionally empty
}
