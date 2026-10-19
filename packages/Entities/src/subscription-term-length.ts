/**
 * @fileoverview How long a subscription term runs, and how long a line's stated period is
 * (golive #338).
 *
 * Confirm honors a subscription line's stated end: the coverage runs to it, as one term or as one
 * term per type term length, and a length other than the type's term is raised as a finance exception
 * where accounting has seeded its type (`SubscriptionBehavior.Decide`, `TermLengthExceptions` in the
 * server package). The order screen shows the same facts before confirm: the end the type would
 * compute, the end an extension keeps, and whether the line's length differs from the type's term. Both tiers read the date arithmetic here, so the
 * screen cannot disagree with the confirm about a month.
 *
 * Pure: no database, no engine. Every date is a calendar day held as UTC midnight.
 *
 * @module @mj-biz-apps/orders-entities
 */

/** The subscription-type columns that decide a term's dates. */
export interface TermLengthRules {
    StartMode: 'Immediate' | 'Deferred' | 'CalendarAnchored';
    DeferredStartDays?: number | null;
    AnchorMonth?: number | null;
    AnchorDay?: number | null;
    PartialPeriodMode?: 'Prorate' | 'ChargeFull' | 'ExtendToNextAnchor' | null;
    DefaultTermMonths?: number | null;
    BillingCadence: 'Monthly' | 'Quarterly' | 'Annual' | 'Custom';
    CustomCycleDays?: number | null;
}

/**
 * Lengths closer than this to the type's term count as the term. Months are compared after rounding
 * to two places, so this only absorbs that rounding.
 */
export const TERM_LENGTH_TOLERANCE_MONTHS = 0.005;

/** Snap to UTC midnight, the only safe basis for calendar arithmetic across time zones. */
function utcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `n` calendar months later, clamped: Jan 31 + 1 month is Feb 28/29, not Mar 2/3. */
function addMonths(d: Date, n: number): Date {
    const day = d.getUTCDate();
    const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, day));
    if (shifted.getUTCDate() < day) shifted.setUTCDate(0);
    return shifted;
}

function addDays(d: Date, n: number): Date {
    return new Date(d.getTime() + n * 86400000);
}

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * The number of whole months from `start` through `end` inclusive, or null when the span is not a
 * whole number of months (2026-11-01 through 2027-04-30 is 6; through 2027-04-29 is null).
 */
export function WholeMonthsBetween(start: Date, end: Date): number | null {
    const s = utcDay(start);
    const after = addDays(utcDay(end), 1);
    const months = (after.getUTCFullYear() - s.getUTCFullYear()) * 12 + (after.getUTCMonth() - s.getUTCMonth());
    if (months <= 0) return null;
    return addMonths(s, months).getTime() === after.getTime() ? months : null;
}

/**
 * The length of `start` through `end` inclusive in months: whole months counted from `start`, plus
 * the remaining days as a fraction of the month they fall in. 2026-11-01 through 2027-11-30 is 13.
 */
export function MonthsCovered(start: Date, end: Date): number {
    const s = utcDay(start);
    const after = addDays(utcDay(end), 1);
    let whole = 0;
    while (addMonths(s, whole + 1).getTime() <= after.getTime()) whole++;
    const from = addMonths(s, whole);
    const rest = daysBetween(from, after);
    if (rest <= 0) return whole;
    return whole + rest / daysBetween(from, addMonths(s, whole + 1));
}

/** {@link MonthsCovered} to two places: the length a finance review states. */
export function StatedMonths(start: Date, end: Date): number {
    return Math.round(MonthsCovered(start, end) * 100) / 100;
}

/** True when `months` is a length other than the type's term. */
export function LengthDiffersFromTerm(months: number, typeMonths: number): boolean {
    return Math.abs(months - typeMonths) > TERM_LENGTH_TOLERANCE_MONTHS;
}

/** Months in one billing cycle. A custom cycle counts 30 days a month, at least one. */
export function CadenceMonths(cadence: TermLengthRules['BillingCadence'], customDays?: number | null): number {
    switch (cadence) {
        case 'Monthly': return 1;
        case 'Quarterly': return 3;
        case 'Annual': return 12;
        case 'Custom': return Math.max(1, Math.round((customDays ?? 30) / 30));
    }
}

/** The type's term length in months: `DefaultTermMonths`, or the billing cadence's. */
export function TypeTermMonths(rules: TermLengthRules): number {
    return rules.DefaultTermMonths ?? CadenceMonths(rules.BillingCadence, rules.CustomCycleDays);
}

/** The next occurrence of the type's AnchorMonth/AnchorDay strictly after `from`. */
export function NextAnchorAfter(rules: Pick<TermLengthRules, 'AnchorMonth' | 'AnchorDay'>, from: Date): Date {
    const month = (rules.AnchorMonth ?? 1) - 1;
    const day = rules.AnchorDay ?? 1;
    const base = utcDay(from);
    let anchor = new Date(Date.UTC(base.getUTCFullYear(), month, day));
    // Strictly after: buying ON the anchor date starts a FULL term at that anchor rather than a
    // zero-length stub ending the day before itself.
    if (anchor.getTime() <= base.getTime()) {
        anchor = new Date(Date.UTC(base.getUTCFullYear() + 1, month, day));
    }
    return anchor;
}

/**
 * Where a term starts when the line states no start: the purchase day, moved by the type's
 * `StartMode`.
 *
 * @param nextAnchor the anchor after a day; a subscription behavior that overrides its anchor passes
 *   its own.
 */
export function DefaultTermStart(
    rules: TermLengthRules,
    purchase: Date,
    nextAnchor: (from: Date) => Date = (from) => NextAnchorAfter(rules, from),
): Date {
    switch (rules.StartMode) {
        case 'Immediate':
            return purchase;
        case 'Deferred':
            return addDays(purchase, rules.DeferredStartDays ?? 0);
        case 'CalendarAnchored':
            // ExtendToNextAnchor waits for the anchor; Prorate/ChargeFull start NOW and run to the
            // anchor, which is what makes the first term partial.
            return rules.PartialPeriodMode === 'ExtendToNextAnchor' ? nextAnchor(purchase) : purchase;
    }
}

/**
 * The end the type's rules give a term starting on `start`: one term length later, or on a
 * calendar-anchored type's first term, the day before the next anchor.
 *
 * @param extending the term continues existing coverage, so it is a whole term
 * @param months the term length; a subscription behavior that overrides it passes its own
 * @param nextAnchor as for {@link DefaultTermStart}
 */
export function DefaultTermEnd(
    rules: TermLengthRules,
    start: Date,
    extending: boolean,
    months: number = TypeTermMonths(rules),
    nextAnchor: (from: Date) => Date = (from) => NextAnchorAfter(rules, from),
): Date {
    if (rules.StartMode === 'CalendarAnchored' && !extending) {
        // A partial first term runs from the purchase to the day before the next anchor.
        const anchor = nextAnchor(start);
        if (rules.PartialPeriodMode !== 'ExtendToNextAnchor' && anchor.getTime() > start.getTime()) {
            return addDays(anchor, -1);
        }
    }
    return addDays(addMonths(start, months), -1);
}

/**
 * The end a stated period keeps when existing coverage moves its start to `start`: the stated
 * LENGTH, measured from the new start. Whole months stay whole months (a 6-month line stays 6
 * months); anything else keeps its day count. Null when the stated end is before the intended start,
 * which has no length to keep.
 */
export function KeptStatedEnd(intendedStart: Date, statedEnd: Date, start: Date): Date | null {
    const from = utcDay(intendedStart);
    const end = utcDay(statedEnd);
    const to = utcDay(start);
    if (end.getTime() < from.getTime()) return null;
    if (to.getTime() === from.getTime()) return end;
    const months = WholeMonthsBetween(from, end);
    return months !== null ? addDays(addMonths(to, months), -1) : addDays(to, daysBetween(from, end));
}

/** A stated period whose length is not the type's term. */
export interface StatedTermLength {
    Start: Date;
    End: Date;
    /** The period's length in months, to two places. */
    Months: number;
    /** The subscription type's term length in months. */
    TypeMonths: number;
}

/**
 * The length a line's stated end gives its subscription, when it is not the type's term; null when
 * the line states no end, states the end the type would compute anyway, states one before its start,
 * or states one exactly a term long.
 *
 * This is the question confirm asks before raising `SUBSCRIPTION_TERM_LENGTH`, asked before confirm.
 * It does not know about existing coverage: an extension keeps the stated length from a later start,
 * so the length, and the answer, are the same.
 *
 * @param statedStart the line's stated start, or null to follow the purchase day
 * @param purchase    the order date
 */
export function StatedTermLengthOf(
    rules: TermLengthRules,
    statedStart: Date | null,
    statedEnd: Date | null,
    purchase: Date,
): StatedTermLength | null {
    if (!statedEnd) return null;
    const start = statedStart ? utcDay(statedStart) : utcDay(DefaultTermStart(rules, utcDay(purchase)));
    const end = utcDay(statedEnd);
    if (end.getTime() < start.getTime()) return null;
    if (end.getTime() === DefaultTermEnd(rules, start, false).getTime()) return null;
    const months = StatedMonths(start, end);
    const typeMonths = TypeTermMonths(rules);
    if (!LengthDiffersFromTerm(months, typeMonths)) return null;
    return { Start: start, End: end, Months: months, TypeMonths: typeMonths };
}

/** `13 months`, `1 month`, `6.50 months`. */
export function FormatMonths(n: number): string {
    return `${Number.isInteger(n) ? n : n.toFixed(2)} month${n === 1 ? '' : 's'}`;
}

/**
 * One sentence for the confirm checklist: the line covers a length other than its type's term, and
 * confirm keeps it. Does not block confirm.
 */
export function DescribeStatedTermLength(
    line: { LineNumber: number | null; Product?: string | null },
    length: Pick<StatedTermLength, 'Months' | 'TypeMonths'>,
): string {
    const which = line.LineNumber != null ? `Line ${line.LineNumber}` : 'A line';
    const product = line.Product ? ` (${line.Product})` : '';
    return (
        `${which}${product} covers ${FormatMonths(length.Months)}; its subscription type's term is ` +
        `${FormatMonths(length.TypeMonths)}. Confirm keeps the stated length.`
    );
}
