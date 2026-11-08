/**
 * What a subscription renews at (golive #304).
 *
 * The renewal pass used to copy the expiring term's UnitPrice and DiscountPct forward, so a
 * first-term discount never lapsed and nothing ever raised the price. Finance's rule:
 *
 *   1. A first-term discount lapses. The renewal starts from the prior term's UNDISCOUNTED unit
 *      price with DiscountPct 0. A price typed below list (`PriceOverridden`) lapses the same way,
 *      back to the prior term's list price. A discount agreed to continue is the exception, and is
 *      stated on the subscription (`CarryDiscountOnRenewal`).
 *   2. A product with a successor renews AS the successor, priced from the successor's current list.
 *   3. An annual increase applies on top, from the start of the renewal term, when that term crosses
 *      an anniversary of the subscription's start. Every invoice in a term carries one price, so the
 *      increase belongs to a term, never to part of one.
 *   4. A renewal buys one term. A line that bought several terms at once (24 months sold as one line
 *      on a 12-month type) with a typed price (`PriceOverridden`) has a price covering all of them, so
 *      the prior price is cut to one term's share of it before the rules above apply (golive #338).
 *      An engine-priced line carries one term's price whatever period it states, and is not cut.
 *      See {@link PriorTermShare}.
 *
 * Pure: the caller resolves the prices and the increase levels, and this decides.
 *
 * @module @mj-biz-apps/orders-entities
 */

/** Where the increase percent came from, most specific first. */
export type RenewalIncreaseSource = 'Subscription' | 'Product' | 'Category' | 'Company' | 'None';

/** Where the renewal's base price came from. */
export type RenewalBaseSource = 'PriorPrice' | 'PriorList' | 'SuccessorList';

/** The levels an increase percent can be set at. Null at a level means inherit from the next. */
export interface RenewalIncreaseLevels {
    Subscription: number | null;
    Product: number | null;
    /** The renewal product's category first, then each ancestor up to the root. */
    Categories: ReadonlyArray<number | null>;
    Company: number | null;
}

export interface ResolvedRenewalIncrease {
    Percent: number;
    Source: RenewalIncreaseSource;
}

/**
 * The increase percent that applies: the subscription's own value, else the product's, else the
 * nearest category's up the parent chain, else the company's. Null everywhere means no increase.
 */
export function ResolveRenewalIncrease(levels: RenewalIncreaseLevels): ResolvedRenewalIncrease {
    if (levels.Subscription != null) return { Percent: Number(levels.Subscription), Source: 'Subscription' };
    if (levels.Product != null) return { Percent: Number(levels.Product), Source: 'Product' };
    const category = levels.Categories.find((c) => c != null);
    if (category != null) return { Percent: Number(category), Source: 'Category' };
    if (levels.Company != null) return { Percent: Number(levels.Company), Source: 'Company' };
    return { Percent: 0, Source: 'None' };
}

/**
 * Whether a renewal term starting on `newTermStart` crosses an anniversary of `anchor` (the
 * subscription's start) that the term being renewed, starting on `priorTermStart`, had not.
 *
 * An annual term crosses one on every renewal. A monthly or quarterly term crosses one once a year,
 * so its price rises once a year rather than on every renewal. A short first term into a calendar
 * anchor does not cross one, so the first full term keeps the price the customer bought at.
 *
 * Days are `YYYY-MM-DD` or dates, read as calendar days in UTC.
 */
export function RenewalCrossesAnniversary(
    anchor: Date | string,
    priorTermStart: Date | string,
    newTermStart: Date | string,
): boolean {
    return wholeYears(anchor, newTermStart) > wholeYears(anchor, priorTermStart);
}

function wholeYears(from: Date | string, to: Date | string): number {
    const a = calendarDay(from);
    const b = calendarDay(to);
    const years = b.y - a.y - (b.m < a.m || (b.m === a.m && b.d < a.d) ? 1 : 0);
    return Math.max(0, years);
}

function calendarDay(value: Date | string): { y: number; m: number; d: number } {
    const d = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) throw new Error(`Not a calendar day: ${String(value)}`);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

/**
 * The fraction of a line's price that one renewal term is worth: the type's term length over the
 * months the line covered, capped at 1 (golive #338).
 *
 * A 24-month line on a 12-month type is worth half its price per term, and a 13-month line 12/13. A
 * line no longer than the term is worth its whole price: a 6-month line sold at the full-year price
 * renews at that price, since the short first period was the concession, not the price.
 *
 * 1 when either length is missing or not positive, so a line with no stated period renews as before.
 */
export function PriorTermShare(lineMonths: number | null | undefined, termMonths: number | null | undefined): number {
    const line = Number(lineMonths);
    const term = Number(termMonths);
    if (!Number.isFinite(line) || !Number.isFinite(term) || line <= 0 || term <= 0) return 1;
    return Math.min(1, term / line);
}

export interface RenewalPriceInput {
    /** The unit price on the line that bought the expiring term, before its discount. */
    PriorUnitPrice: number;
    /**
     * The share of `PriorUnitPrice` one renewal term is worth, from {@link PriorTermShare}. Absent
     * means 1: the line bought one term.
     */
    PriorTermShare?: number;
    /** As a fraction, as `OrderLine.DiscountPct` stores it. */
    PriorDiscountPct: number | null;
    /** The prior line's price was typed rather than taken from the engine. */
    PriorPriceOverridden: boolean;
    /** What the engine charged for the prior product on the prior order's date; null when nothing prices it. */
    PriorListPrice: number | null;
    /**
     * The successor's current list price when the subscription moves to a successor product;
     * undefined when it renews on its own product. Null means the successor has no price.
     */
    SuccessorListPrice?: number | null;
    /** The subscription keeps its discount into the renewal (`CarryDiscountOnRenewal`). */
    CarryDiscount: boolean;
    Increase: ResolvedRenewalIncrease;
    /** The renewal term crosses an anniversary; see {@link RenewalCrossesAnniversary}. */
    ApplyIncrease: boolean;
}

export interface RenewalPrice {
    BasePrice: number;
    BaseSource: RenewalBaseSource;
    /** The increase actually applied: 0 when none is set or the term crosses no anniversary. */
    IncreasePercent: number;
    IncreaseSource: RenewalIncreaseSource;
    UnitPrice: number;
    DiscountPct: number;
}

/**
 * The renewal line's UnitPrice and DiscountPct.
 *
 * @throws when the subscription moves to a successor that has no price: renewing it at an old
 *         product's price, or at nothing, would bill an amount nobody set.
 */
export function PriceRenewal(input: RenewalPriceInput): RenewalPrice {
    const discount = input.CarryDiscount ? Number(input.PriorDiscountPct ?? 0) : 0;
    // One term's worth of the prior price, for a price someone typed. The engine prices a product
    // per term whatever period a line states, so an engine-priced multi-term line already carries one
    // term's price and is not scaled; only a typed price can cover the whole period. The list price is
    // not scaled either, for the same reason: comparing it with the scaled typed price is what tells a
    // multi-term line sold below list from one sold at it.
    const share = input.PriorTermShare ?? 1;
    const priorPrice =
        share < 1 && input.PriorPriceOverridden ? cents(Number(input.PriorUnitPrice) * share) : Number(input.PriorUnitPrice);

    let base: number;
    let source: RenewalBaseSource;
    if (input.SuccessorListPrice !== undefined) {
        if (input.SuccessorListPrice == null) {
            throw new Error('the successor product has no price to renew at');
        }
        base = Number(input.SuccessorListPrice);
        source = 'SuccessorList';
    } else if (
        input.PriorPriceOverridden &&
        !input.CarryDiscount &&
        input.PriorListPrice != null &&
        priorPrice < Number(input.PriorListPrice)
    ) {
        // A price typed BELOW list is a discount by another name and lapses like one. One typed
        // above list is what the customer agreed to pay, and carries forward.
        base = Number(input.PriorListPrice);
        source = 'PriorList';
    } else {
        base = priorPrice;
        source = 'PriorPrice';
    }

    const percent = input.ApplyIncrease ? input.Increase.Percent : 0;
    return {
        BasePrice: base,
        BaseSource: source,
        IncreasePercent: percent,
        IncreaseSource: input.ApplyIncrease ? input.Increase.Source : 'None',
        UnitPrice: cents(base * (1 + percent / 100)),
        DiscountPct: discount,
    };
}

function cents(v: number): number {
    return Math.round(v * 100) / 100;
}
