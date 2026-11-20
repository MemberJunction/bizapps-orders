/**
 * Which promotion codes an automatic renewal presents, and what became of each (#289).
 *
 * A promotion with `AppliesToRenewals` set carries into automatic renewals. The renewal pass reads
 * the codes recorded on the order line that bought the expiring term (its `OrderAdjustment` rows),
 * keeps those whose promotion is flagged, and presents them on the renewal order through the
 * ordinary promotion path. The pricing engine then decides whether each still applies: the
 * promotion Active and inside its dates on the renewal's order date, and its targets, minimums,
 * redemption limits and qualifier passing. These functions are the two decisions around that call,
 * kept free of I/O so they can be tested alone.
 *
 * CONNECTS TO:
 *   CALLER:  SpawnRenewalsOperation (preview and live pass)
 *   ENGINE:  orders-entities RunPromotions, through OrderPricingService
 */

/** A promotion code recorded on the line that bought the expiring term. */
export interface RecordedPromotionCode {
    Code: string;
    /** `Promotion.AppliesToRenewals` of the code's promotion. */
    AppliesToRenewals: boolean;
}

/** A code presented on a renewal that gave no discount, and why. */
export interface UnusableRenewalPromotionCode {
    Code: string;
    Reason: string;
}

/** What became of the codes a renewal presented. */
export interface RenewalPromotionOutcome {
    /** Codes that discounted the renewal. */
    Applied: string[];
    /** Codes that did not, each with the engine's reason. */
    Unusable: UnusableRenewalPromotionCode[];
}

/** The reason given for a code the engine accepted but that discounted nothing on this renewal. */
export const NO_DISCOUNT_ON_RENEWAL = 'the promotion gave no discount on this renewal (its targets, minimums or redemption limits)';

const key = (code: string) => code.trim().toLowerCase();

/**
 * The codes a renewal presents: those whose promotion carries into renewals, each once, in the
 * order recorded. A code redeemed on one line appears on every adjustment row it wrote (an
 * order-level promotion writes one per line), so duplicates are expected and dropped, compared
 * without case as the engine compares them.
 */
export function SelectRenewalPromotionCodes(recorded: readonly RecordedPromotionCode[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of recorded) {
        const code = row.Code?.trim();
        if (!code || !row.AppliesToRenewals) continue;
        if (seen.has(key(code))) continue;
        seen.add(key(code));
        out.push(code);
    }
    return out;
}

/**
 * Sort the presented codes into applied and unusable.
 *
 * `engineUnusable` is the engine's own verdict (no such code, the code or promotion not running,
 * the customer not qualifying). `appliedCodes` are the codes the engine wrote a discount for. A
 * presented code in neither list was accepted but discounted nothing, which happens when the
 * renewal misses the promotion's targets or minimums or its redemption limits are used up; it is
 * reported as unusable too, because the renewal is placed at the undiscounted price either way.
 */
export function ClassifyRenewalPromotionCodes(
    presented: readonly string[],
    engineUnusable: ReadonlyArray<{ Code: string; Reason: string }>,
    appliedCodes: Iterable<string>,
): RenewalPromotionOutcome {
    const applied = new Set<string>();
    for (const code of appliedCodes) applied.add(key(code));
    const reasons = new Map<string, string>();
    for (const u of engineUnusable) {
        if (!reasons.has(key(u.Code))) reasons.set(key(u.Code), u.Reason);
    }

    const out: RenewalPromotionOutcome = { Applied: [], Unusable: [] };
    for (const code of presented) {
        const k = key(code);
        const reason = reasons.get(k);
        if (reason !== undefined) out.Unusable.push({ Code: code, Reason: reason });
        else if (applied.has(k)) out.Applied.push(code);
        else out.Unusable.push({ Code: code, Reason: NO_DISCOUNT_ON_RENEWAL });
    }
    return out;
}

/** The sentence the renewal's notes carry about its promotions; empty when none were presented. */
export function RenewalPromotionNote(outcome: RenewalPromotionOutcome): string {
    const parts: string[] = [];
    if (outcome.Applied.length) {
        parts.push(`Promotion ${outcome.Applied.join(', ')} carried into this renewal.`);
    }
    for (const u of outcome.Unusable) {
        parts.push(`Promotion ${u.Code} not applied: ${u.Reason}.`);
    }
    return parts.join(' ');
}
