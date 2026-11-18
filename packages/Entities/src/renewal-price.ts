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
 *      an anniversary of the subscription's start that has passed since the price being renewed
 *      began. Every invoice in a term carries one price, so the increase belongs to a term, never to
 *      part of one. A line that bought several terms set its price once, at the first of them, so
 *      the price began there and not at its last term (golive #478). See {@link RenewalPriceStart}.
 *   4. A renewal buys one term. A prior line longer than the renewal term (24 months sold as one
 *      line, or a converted line loaded with a multi-year amount) has a price covering all of it, so
 *      the prior price is cut to the renewal term's share of it before the rules above apply, typed or
 *      engine-priced alike (golive #338, golive #468). A prior line SHORTER than the renewal term is
 *      not scaled up: whether its price was a part-year price or a full-year price sold over a short
 *      first period is not something the line says, so it renews at its price and is flagged for a
 *      person to review. See {@link PriorLineScaling}.
 *
 * Pure: the caller resolves the prices and the increase levels, and this decides.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { TERM_LENGTH_TOLERANCE_MONTHS } from './subscription-term-length.js';

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
 * The day the price being renewed began: the start of the earliest term the expiring term's order
 * line bought (golive #478).
 *
 * One line buys one term in the ordinary case, and this is that term's start. A line booked as
 * several terms (24 months sold as one line, or a 13-month line booked as a year and a remainder)
 * set its price once, at the first of them. Measured from the last term instead, a remainder that
 * starts on the anniversary looks as though it had already taken the increase, and the renewal
 * after it is priced flat.
 *
 * `lineFirstTermStart` absent, or later than the expiring term's start, leaves the term's own start.
 */
export function RenewalPriceStart(expiringTermStart: Date | string, lineFirstTermStart: Date | string | null | undefined): Date | string {
    if (lineFirstTermStart == null || lineFirstTermStart === '') return expiringTermStart;
    return dayNumber(lineFirstTermStart) < dayNumber(expiringTermStart) ? lineFirstTermStart : expiringTermStart;
}

function dayNumber(value: Date | string): number {
    const d = calendarDay(value);
    return Date.UTC(d.y, d.m, d.d);
}

/**
 * Whether a renewal term starting on `newTermStart` crosses an anniversary of `anchor` (the
 * subscription's start) that had not passed on `priorTermStart`, the day the price being renewed
 * began: the expiring term's start, or the start of the first term its line bought when that line
 * bought several ({@link RenewalPriceStart}).
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

/** How a prior line's length compares with the renewal term, and what that does to its price (golive #468). */
export interface PriorLineScale {
    /** The share of the prior price one renewal term is worth: renewal months over line months, never above 1. */
    Share: number;
    /** The months the prior line covered; null when it states no period. */
    LineMonths: number | null;
    /** The months the renewal term covers; null when unknown. */
    TermMonths: number | null;
    /** The prior line is longer than the renewal term, so its price was cut to `Share` of it. */
    ScaledDown: boolean;
    /** The prior line is shorter than the renewal term; it renews at its own price and needs a person to check it. */
    ShorterThanTerm: boolean;
}

/**
 * How much of a prior line's price one renewal term is worth (golive #338, golive #468).
 *
 * A line longer than the renewal term is cut to the term's share of it: a 24-month line renewing for
 * 12 months is worth half its price, an 18-month line 12/18. A line shorter than the term is NOT
 * scaled up: a 3-month line may have been a quarter's price or a full year's price sold over a short
 * first period, and nothing on the line says which, so it keeps its price and is flagged
 * (`ShorterThanTerm`) for a person to review. Lengths within {@link TERM_LENGTH_TOLERANCE_MONTHS}
 * of each other read as equal, so a custom-cadence term a few hours off whole months is neither.
 *
 * Share 1, nothing flagged, when either length is missing or not positive.
 */
export function PriorLineScaling(lineMonths: number | null | undefined, termMonths: number | null | undefined): PriorLineScale {
    const line = lineMonths == null ? NaN : Number(lineMonths);
    const term = termMonths == null ? NaN : Number(termMonths);
    if (!Number.isFinite(line) || !Number.isFinite(term) || line <= 0 || term <= 0) {
        return {
            Share: 1,
            LineMonths: Number.isFinite(line) && line > 0 ? line : null,
            TermMonths: Number.isFinite(term) && term > 0 ? term : null,
            ScaledDown: false,
            ShorterThanTerm: false,
        };
    }
    const longer = line - term > TERM_LENGTH_TOLERANCE_MONTHS;
    const shorter = term - line > TERM_LENGTH_TOLERANCE_MONTHS;
    return { Share: longer ? term / line : 1, LineMonths: line, TermMonths: term, ScaledDown: longer, ShorterThanTerm: shorter };
}

/** The share of a line's price one renewal term is worth: {@link PriorLineScaling}'s `Share`. */
export function PriorTermShare(lineMonths: number | null | undefined, termMonths: number | null | undefined): number {
    return PriorLineScaling(lineMonths, termMonths).Share;
}

export interface RenewalPriceInput {
    /** The unit price on the line that bought the expiring term, before its discount. */
    PriorUnitPrice: number;
    /**
     * The share of `PriorUnitPrice` one renewal term is worth, from {@link PriorLineScaling}. Absent
     * means 1: the line was no longer than the renewal term.
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
    /**
     * The increase that IS set, whether or not this term applied it: the resolved ladder value and its
     * level. Lets a screen say "2% is set, and this renewal crosses no anniversary, so it was not
     * applied" rather than showing no increase as if none existed.
     */
    IncreaseSetPercent: number;
    IncreaseSetSource: RenewalIncreaseSource;
    /** Whether the new term crosses an anniversary, so the set increase was applied. */
    IncreaseApplied: boolean;
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
    // One renewal term's worth of the prior price, typed or engine-priced alike (golive #468): a line
    // longer than the term carries a price for all of it. The list price is not scaled, since the
    // engine quotes one term's price; comparing it with the scaled typed price is what tells a long
    // line sold below list from one sold at it.
    const share = input.PriorTermShare ?? 1;
    const priorPrice = share < 1 ? cents(Number(input.PriorUnitPrice) * share) : Number(input.PriorUnitPrice);

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
        IncreaseSetPercent: Number(input.Increase.Percent),
        IncreaseSetSource: input.Increase.Source,
        IncreaseApplied: input.ApplyIncrease,
        UnitPrice: cents(base * (1 + percent / 100)),
        DiscountPct: discount,
    };
}

function cents(v: number): number {
    return Math.round(v * 100) / 100;
}
