/**
 * Input for `Orders.PriceOrder`.
 *
 * Answers "what does THIS ORDER come to" — the whole order, priced through the real pipeline, with
 * nothing persisted. The wide sibling of `Orders.PreviewPrice`, which answers for one product.
 *
 * WHY IT TAKES AN ORDER RATHER THAN A LIST OF LINES. A per-line answer cannot be right: promotions
 * stack against ORDER totals and can be limited per order, charges apportion ACROSS lines, and tax
 * computes on the DISCOUNTED amount rather than on list price. `PreviewPrice` says so itself — its
 * result is explicitly advisory. This one is not.
 *
 * WHY THE SHAPE MIRRORS THE ENTITY AND IS NOT A DTO. This is deliberately the same information
 * `BaseEntity.SerializeCompanions()` produces for `MJ.SaveEntityGraph`: the header fields that steer
 * pricing, plus the lines. The client builds an `OrderEntity`, prices it, edits it, prices it again,
 * and finally saves THE SAME OBJECT — no translation layer in between.
 *
 * This repository previously had that translation layer (`OrderDraft` plus a hydrator) and it was a
 * parallel universe: a hand-maintained mirror of the entity that drifted from it silently, in both
 * directions. Reintroducing a bespoke pricing DTO would rebuild it under a new name.
 *
 * NOTHING HERE NEEDS TO EXIST YET. `OrderHeaderID` is optional and the lines carry no keys, because
 * the common case is an order being composed on screen that has never been saved.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface PriceOrderInput {
    /** The order being priced, when it is already saved. Omit while composing a new one. */
    OrderHeaderID?: string | null;

    /** The selling company. Owns the price lists, the promotion policy and the stacking mode. */
    CompanyID: string;

    /** Who is buying — either may be omitted; both omitted prices at base rates. */
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;

    /** The date prices and tax rates are read AS OF. Defaults to today. */
    OrderDate?: string | null;

    /** Decides tax jurisdiction. Without it the order is priced untaxed. */
    ShipToAddressID?: string | null;

    /** The lines to price, in order. */
    Lines: Array<{
        ProductID: string;
        Quantity: number;
        /** Omit to have the engine resolve it. Supplying it PINS the price, exactly as on a real line. */
        UnitPrice?: number | null;
        DiscountPct?: number | null;
        ServicePeriodStart?: string | null;
        ServicePeriodEnd?: string | null;
    }>;

    /** Promotion codes the customer presented. */
    PromotionCodes?: string[];

    /** Ad-hoc discounts with a stated reason, each gated by the applying user's SalesAuthority. */
    ManualDiscounts?: Array<{
        LineIndex: number;
        Amount?: number | null;
        Percent?: number | null;
        Reason: string;
    }>;

    /** Charges to apply — shipping, handling. Tax layers are resolved, not requested. */
    Charges?: Array<{
        Code: string;
        Amount?: number | null;
        Rate?: number | null;
        TargetLineIndex?: number | null;
    }>;
}
