/**
 * PricingBehavior — the PURE pricing rules engine (plan D69).
 *
 * No database, no entities, no MJ types. Everything here is a function from plain data to plain
 * data, which is what makes the interesting parts unit-testable without a live schema — the same
 * shape `SubscriptionBehavior` uses, and for the same reason: the arithmetic is where the money is,
 * and arithmetic should not need a database to verify.
 *
 * WHAT LIVES HERE
 *   - `IsRuleApplicable` — does this rule apply to this quantity, at this moment?
 *   - `PickPriceRule`    — of the applicable rules, which one WINS (and is the answer ambiguous?)
 *   - `ComputeAmount`    — what does `quantity` cost under the winning rule?
 *
 * WHAT DOES NOT
 *   The resolver WALK (product → category → ancestors → company → global) is `PriceResolver`, which
 *   needs the engine cache. This module answers questions about rules it is handed.
 *
 * CONNECTS TO:
 *   SERVER: PriceResolver (the walk) · OrderLineEntityServer (stamps UnitPrice)
 *   DOC:    plans/pricing-charges-and-promotions.md, plans/pricing-schema.md
 */

/** Pricing models. `Usage` is declared but refused — metered billing has no usage pipeline yet. */
export type PricingModel = 'Flat' | 'PerUnit' | 'Tiered' | 'Volume' | 'Package' | 'Usage';

/** One quantity break under a Tiered or Volume rule. */
export interface PriceTierRule {
    MinQuantity: number;
    /** null = unbounded top tier. */
    MaxQuantity: number | null;
    Amount: number;
    SortOrder: number;
}

/**
 * The subset of a `ProductPrice` row this engine reasons about.
 *
 * Deliberately a plain shape rather than the generated entity: a unit test can construct one in a
 * line, and the engine cannot accidentally depend on entity behaviour.
 */
export interface PriceRule {
    ID: string;
    PricingModel: PricingModel;
    Amount: number;
    PackageQuantity: number | null;

    MinQuantity: number | null;
    MaxQuantity: number | null;

    EffectiveFrom: Date;
    EffectiveTo: Date | null;

    /** Comma-separated month numbers, 1–12. Null/empty = every month. */
    RecurrenceMonths: string | null;
    /** Comma-separated ISO weekday numbers, Monday = 1. Null/empty = every day. */
    RecurrenceDaysOfWeek: string | null;
    RecurrenceDayOfMonthMin: number | null;
    RecurrenceDayOfMonthMax: number | null;
    /** 'HH:MM' or 'HH:MM:SS', in the OWNING COMPANY's timezone. */
    TimeOfDayStart: string | null;
    TimeOfDayEnd: string | null;

    Priority: number;
    Status: string;

    Tiers?: PriceTierRule[];
}

/** When and how much we are pricing. */
export interface PriceContext {
    Quantity: number;
    /** The moment to price at, ALREADY converted to the owning company's local time. */
    AsOf: Date;
}

/** Why a rule did not apply — useful in the preview, and in the refusal message. */
export type InapplicableReason =
    | 'Inactive'
    | 'QuantityBelowMin'
    | 'QuantityAboveMax'
    | 'NotYetEffective'
    | 'Expired'
    | 'MonthExcluded'
    | 'DayOfWeekExcluded'
    | 'DayOfMonthExcluded'
    | 'TimeOfDayExcluded';

const EPSILON = 1e-9;

/** Parse '1,2,3' into a Set of numbers. Empty/blank means "no restriction", signalled by null. */
function parseNumberList(raw: string | null | undefined): Set<number> | null {
    if (raw == null) return null;
    const parts = raw
        .split(',')
        .map((p) => Number(p.trim()))
        .filter((n) => Number.isFinite(n));
    return parts.length ? new Set(parts) : null;
}

/** 'HH:MM[:SS]' → minutes since midnight. Returns null when unparseable, meaning "no bound". */
function parseTimeOfDay(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/** Minutes since midnight for a Date, read in LOCAL terms (the caller has already shifted it). */
function minutesOfDay(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
}

/** ISO weekday: Monday = 1 … Sunday = 7. JS gives Sunday = 0, which is a classic off-by-one. */
function isoDayOfWeek(d: Date): number {
    const js = d.getDay();
    return js === 0 ? 7 : js;
}

/** The LOCAL calendar day of a moment, as a comparable number (yyyymmdd). */
function localDayNumber(d: Date): number {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * The calendar day of an EffectiveFrom/EffectiveTo bound, as a comparable number.
 *
 * These come from SQL `DATE` columns, which arrive as midnight UTC — and JS parses a bare
 * '2026-07-15' as UTC while parsing '2026-07-15T12:00' as LOCAL. Reading a bound with local getters
 * therefore shifts it a day backwards for anyone west of UTC, which silently expires rules a day
 * early. A DATE means a calendar day with no timezone, so its UTC parts are the honest reading.
 */
function boundDayNumber(d: Date): number {
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/**
 * Does this rule apply? Returns null when it does, or the FIRST reason it does not.
 *
 * Reasons are returned rather than a bare boolean because "no price resolved" is a refusal the user
 * has to act on, and "there is a winter rate but it starts in November" is a far more useful thing
 * to be told than "no price found".
 */
export function IsRuleApplicable(rule: PriceRule, ctx: PriceContext): InapplicableReason | null {
    if (rule.Status !== 'Active') return 'Inactive';

    if (rule.MinQuantity != null && ctx.Quantity < rule.MinQuantity - EPSILON) return 'QuantityBelowMin';
    if (rule.MaxQuantity != null && ctx.Quantity > rule.MaxQuantity + EPSILON) return 'QuantityAboveMax';

    // Absolute window is DATE-grained: a rule effective from the 1st applies for all of the 1st.
    const day = localDayNumber(ctx.AsOf);
    if (day < boundDayNumber(new Date(rule.EffectiveFrom))) return 'NotYetEffective';
    if (rule.EffectiveTo != null && day > boundDayNumber(new Date(rule.EffectiveTo))) return 'Expired';

    const months = parseNumberList(rule.RecurrenceMonths);
    if (months && !months.has(ctx.AsOf.getMonth() + 1)) return 'MonthExcluded';

    const days = parseNumberList(rule.RecurrenceDaysOfWeek);
    if (days && !days.has(isoDayOfWeek(ctx.AsOf))) return 'DayOfWeekExcluded';

    const dom = ctx.AsOf.getDate();
    if (rule.RecurrenceDayOfMonthMin != null && dom < rule.RecurrenceDayOfMonthMin) return 'DayOfMonthExcluded';
    if (rule.RecurrenceDayOfMonthMax != null && dom > rule.RecurrenceDayOfMonthMax) return 'DayOfMonthExcluded';

    const from = parseTimeOfDay(rule.TimeOfDayStart);
    const to = parseTimeOfDay(rule.TimeOfDayEnd);
    if (from != null || to != null) {
        const now = minutesOfDay(ctx.AsOf);
        if (from != null && to != null && to < from) {
            // An OVERNIGHT window (22:00–02:00) wraps midnight, so the test inverts. Treating it as
            // an empty range instead would silently disable every late-night rate.
            if (now < from && now > to) return 'TimeOfDayExcluded';
        } else {
            if (from != null && now < from) return 'TimeOfDayExcluded';
            if (to != null && now > to) return 'TimeOfDayExcluded';
        }
    }

    return null;
}

/** The outcome of picking a rule — including the ambiguous case, which is an error, not a winner. */
export interface RulePick {
    /** Index into the candidates, or -1 when none applied. */
    Index: number;
    /** Set when two or more applicable rules tie on Priority — the caller must refuse. */
    AmbiguousWith?: number[];
}

/**
 * Of the applicable rules, which wins?
 *
 * Highest `Priority`. **A TIE IS NOT RESOLVED** — it is reported, so the caller can refuse. Two
 * equally-applicable rules would otherwise produce a winner decided by array order, which is
 * whatever the database happened to return: stable in a test, liable to flip in production, and
 * silently wrong because a wrong price still looks exactly like a price.
 *
 * This is the same stance `IntercompanyAccountMatch` takes on duplicate active pairs, for the same
 * reason.
 */
export function PickPriceRule(candidates: PriceRule[], ctx: PriceContext): RulePick {
    const applicable: number[] = [];
    candidates.forEach((r, i) => {
        if (IsRuleApplicable(r, ctx) === null) applicable.push(i);
    });
    if (applicable.length === 0) return { Index: -1 };

    let best = applicable[0];
    for (const i of applicable) {
        if (candidates[i].Priority > candidates[best].Priority) best = i;
    }

    const tied = applicable.filter((i) => candidates[i].Priority === candidates[best].Priority);
    if (tied.length > 1) return { Index: best, AmbiguousWith: tied };

    return { Index: best };
}

/** Money, to the cent. Every public amount goes through this so rounding happens in ONE place. */
export function Money(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Tiers sorted and bounded, so tier maths never depends on how they were stored. */
function orderedTiers(rule: PriceRule): PriceTierRule[] {
    return [...(rule.Tiers ?? [])].sort(
        (a, b) => a.MinQuantity - b.MinQuantity || a.SortOrder - b.SortOrder,
    );
}

/**
 * What does `quantity` cost under this rule?
 *
 * **Volume vs Tiered, pinned** — the industry uses these words inconsistently, so they are defined
 * here and the tests assert both. For 100 units with bands 1–50 @ 10 and 51+ @ 8:
 *
 *   - `Volume`  — the WHOLE quantity at the band it lands in  → 100 × 8 = 800
 *   - `Tiered`  — each band's units at that band's rate, summed → (50 × 10) + (50 × 8) = 900
 *
 * Throws for `Usage`: metered billing needs a usage-record pipeline that does not exist, and a stub
 * would be complex enough to become a blocker (the same reasoning D23 applies to tax).
 */
export function ComputeAmount(rule: PriceRule, quantity: number): number {
    if (quantity < 0) throw new Error(`Quantity cannot be negative (got ${quantity}).`);

    switch (rule.PricingModel) {
        case 'Flat':
            // The line costs this, however many units it names.
            return Money(rule.Amount);

        case 'PerUnit':
            return Money(rule.Amount * quantity);

        case 'Package': {
            const per = rule.PackageQuantity ?? 0;
            if (per <= 0) {
                throw new Error(`Package pricing needs a positive PackageQuantity (rule ${rule.ID}).`);
            }
            // Whole packages, then the remainder at the same per-unit rate — otherwise buying 13 of
            // a 12-pack would cost the same as buying 24, which no customer would accept.
            const whole = Math.floor(quantity / per);
            const remainder = quantity - whole * per;
            const unit = rule.Amount / per;
            return Money(whole * rule.Amount + remainder * unit);
        }

        case 'Volume': {
            const tiers = orderedTiers(rule);
            if (!tiers.length) return Money(rule.Amount * quantity);
            const band = tiers.find(
                (t) => quantity >= t.MinQuantity - EPSILON && (t.MaxQuantity == null || quantity <= t.MaxQuantity + EPSILON),
            );
            // Below the lowest band, the rule's own Amount is the rate — a band table that starts at
            // 10 should not make an order for 1 free.
            const rate = band ? band.Amount : rule.Amount;
            return Money(rate * quantity);
        }

        case 'Tiered': {
            const tiers = orderedTiers(rule);
            if (!tiers.length) return Money(rule.Amount * quantity);
            // GRADUATED: each band prices only the units that fall inside it.
            //
            // A band [Min, Max] covers the units ABOVE Min-1 and up to Max, so the count inside it
            // is `min(quantity, Max) - (Min - 1)`, floored at zero. Expressing it as an exclusive
            // lower bound rather than an inclusive count is what makes fractional quantities and
            // the unbounded top band fall out without special cases.
            let total = 0;
            for (const t of tiers) {
                const lower = t.MinQuantity - 1;
                const upper = t.MaxQuantity == null ? Infinity : t.MaxQuantity;
                const units = Math.max(0, Math.min(quantity, upper) - lower);
                if (units <= EPSILON) continue;
                total += units * t.Amount;
            }
            // Units below the first band's floor are priced by the rule's own Amount — a band table
            // starting at 10 must not make an order for 5 free.
            const firstFloor = tiers[0].MinQuantity - 1;
            if (firstFloor > EPSILON) {
                total += Math.min(quantity, firstFloor) * rule.Amount;
            }
            // Units ABOVE a bounded top band keep that band's rate rather than falling off a cliff.
            // Without this a bounded table silently stops charging past its last bound, which reads
            // as a discount and is really a hole.
            const last = tiers[tiers.length - 1];
            if (last.MaxQuantity != null && quantity > last.MaxQuantity + EPSILON) {
                total += (quantity - last.MaxQuantity) * last.Amount;
            }
            return Money(total);
        }

        case 'Usage':
            throw new Error(
                `Usage-based pricing is not implemented (rule ${rule.ID}). Metered billing needs a usage-record ` +
                    `pipeline; until it exists, a Usage rule must not silently resolve to a price.`,
            );

        default:
            throw new Error(`Unknown pricing model '${rule.PricingModel}' on rule ${rule.ID}.`);
    }
}

/**
 * Pro-rata allocation of `total` across `weights`, with the LARGEST weight absorbing the rounding
 * remainder so the parts always sum exactly to the whole.
 *
 * Used for order-level adjustments and charges alike (D70/D71). The largest share absorbing the
 * remainder is the same rule the intercompany allocation uses — putting it on the largest line
 * keeps the distortion proportionally smallest.
 */
export function AllocateProRata(total: number, weights: number[]): number[] {
    if (!weights.length) return [];

    // LARGEST-REMAINDER, not round-then-patch.
    //
    // The obvious implementation — round every share, then dump the drift on the biggest one —
    // produces a NEGATIVE share whenever rounding overshoots. 7p across 13 equal lines rounds each
    // to 1p, totals 13p against a 7p charge, and the largest line absorbs -6p to compensate. In
    // production that is a line carrying a negative shipping charge, or a discount that quietly
    // becomes a surcharge.
    //
    // So: floor every share to the penny, then hand out the leftover pennies one at a time to
    // whichever shares were cut hardest. Every part is non-negative by construction, the total is
    // exact, and the drift lands where it distorts least — which is what the naive version was
    // trying to achieve and only managed when rounding happened to go down.
    const sign = total < 0 ? -1 : 1;
    const magnitude = Math.abs(total);
    const pennies = Math.round(magnitude * 100);

    const sum = weights.reduce((a, b) => a + b, 0);
    // No basis to weight by: spread evenly rather than dropping the amount on the floor.
    const basis = sum > 0 ? weights : weights.map(() => 1);
    const basisSum = sum > 0 ? sum : weights.length;

    const exact = basis.map((w) => (w / basisSum) * pennies);
    const floors = exact.map((e) => Math.floor(e));
    let remaining = pennies - floors.reduce((a, b) => a + b, 0);

    // Biggest fractional part first; ties break on the larger weight, then on position, so the
    // result is deterministic for identical inputs.
    const order = exact
        .map((e, i) => ({ i, frac: e - Math.floor(e) }))
        .sort((a, b) => b.frac - a.frac || basis[b.i] - basis[a.i] || a.i - b.i);

    const parts = floors.slice();
    for (let k = 0; k < order.length && remaining > 0; k++, remaining--) {
        parts[order[k].i] += 1;
    }
    // More pennies than recipients only happens if the floors underflowed by a whole unit each,
    // which cannot occur — but if it ever did, the last recipient carries the rest rather than the
    // total silently coming up short.
    if (remaining > 0) parts[order[order.length - 1].i] += remaining;

    return parts.map((p) => Money((sign * p) / 100));
}

