/**
 * PromotionBehavior — the PURE promotions engine (plan D70).
 *
 * No database, no entities. The decisions here are where money leaks, and they should be provable
 * without a schema:
 *
 *   - WHICH promotions survive together (stacking, exclusivity)
 *   - HOW they combine arithmetically (sequential vs additive)
 *   - WHAT each one is worth against a given base
 *
 * The three that matter, and why:
 *
 *   STACKING ARITHMETIC. Two 10% promotions are 19% sequentially and 20% additively. On £1,000
 *   that is £10 an order, forever. It is configured per COMPANY, not per promotion, because the
 *   mode describes how a SET combines — two promotions disagreeing about it has no coherent answer.
 *
 *   EXCLUSIVITY. When two non-stacking promotions collide the HIGHER VALUE wins, and the loser is
 *   still reported so "why didn't my code work?" has an answer. Resolving by sequence instead is
 *   deterministic but can silently hand the customer the worse of two offers.
 *
 *   ORDER-LEVEL ALLOCATION. An order-level promotion must land on lines, because tax and GL are per
 *   line. That is `AllocateProRata` in PricingBehavior — shared, not reimplemented.
 *
 * CONNECTS TO:
 *   PURE:   ./PricingBehavior.ts (Money, AllocateProRata)
 *   SERVER: ./PromotionEngine.ts (loads rows, applies the outcome)
 *   DOC:    plans/pricing-charges-and-promotions.md §4
 */
import { Money } from './PricingBehavior.js';

export type PromotionValueKind = 'PercentOff' | 'AmountOff' | 'OverridePrice' | 'FreeShipping';
export type StackingMode = 'Sequential' | 'Additive';

/** The subset of a `Promotion` this engine reasons about. */
export interface PromotionRule {
    ID: string;
    Code: string;
    Name: string;
    /** The `PromotionType.Code` — decides how `Value` is read. */
    Kind: PromotionValueKind;
    Value: number;
    AppliesAt: 'Line' | 'Order' | 'Either';
    AllowsStacking: boolean;
    StackSequence: number;
    MinimumOrderAmount: number | null;
    MinimumQuantity: number | null;
    /** Redemptions already recorded, across all customers. */
    RedemptionCount?: number;
    MaxRedemptions: number | null;
    /** Redemptions already recorded for THIS customer. */
    CustomerRedemptionCount?: number;
    MaxRedemptionsPerCustomer: number | null;
}

/** Why a promotion did not apply. Reported rather than swallowed — see the module header. */
export type PromotionRejection =
    | 'NotApplicableAtThisLevel'
    | 'BelowMinimumOrderAmount'
    | 'BelowMinimumQuantity'
    | 'RedemptionLimitReached'
    | 'CustomerRedemptionLimitReached'
    | 'LostExclusiveCollision'
    | 'StackingNotPermitted';

export interface PromotionOutcome {
    Promotion: PromotionRule;
    /** What it took off, against the base it was applied to. */
    Amount: number;
    /** The running total after this promotion. */
    RunningTotal: number;
}

export interface RejectedPromotion {
    Promotion: PromotionRule;
    Reason: PromotionRejection;
    /** For a lost collision, the promotion that beat it. */
    LostTo?: string;
}

export interface ApplyPromotionsResult {
    Applied: PromotionOutcome[];
    Rejected: RejectedPromotion[];
    /** The base after every applied promotion. */
    FinalAmount: number;
    /** Everything taken off, in total. */
    TotalDiscount: number;
}

export interface PromotionContext {
    /** What the promotions apply against — the line net, or the order net. */
    BaseAmount: number;
    /** For minimum-quantity rules; irrelevant at order level. */
    Quantity: number;
    Level: 'Line' | 'Order';
    /** From `OrderCompanyPolicy` — both are supported and this decides which. */
    StackingMode: StackingMode;
    /** From `OrderCompanyPolicy`. When false, at most ONE promotion applies however they are flagged. */
    AllowStacking: boolean;
}

/** What a promotion is worth against a base, before any stacking decision. */
export function ValuePromotion(rule: PromotionRule, base: number): number {
    switch (rule.Kind) {
        case 'PercentOff':
            return Money(base * rule.Value);
        case 'AmountOff':
            // Never more than the base — a £50 coupon on a £30 line takes £30, not £50, and
            // certainly does not turn into £20 of change.
            return Money(Math.min(base, rule.Value));
        case 'OverridePrice':
            // Value IS the new price, so the discount is whatever gets us there.
            return Money(Math.max(0, base - rule.Value));
        case 'FreeShipping':
            // Worth nothing against the LINE base; it discounts a shipping charge, which is a
            // phase-3 concern. Valued at zero here so it neither wins a collision nor changes a total.
            return 0;
        default:
            return 0;
    }
}

/** Eligibility that does not depend on the other promotions in play. */
export function ScreenPromotion(rule: PromotionRule, ctx: PromotionContext): PromotionRejection | null {
    if (rule.AppliesAt !== 'Either' && rule.AppliesAt !== ctx.Level) return 'NotApplicableAtThisLevel';
    if (rule.MinimumOrderAmount != null && ctx.BaseAmount < rule.MinimumOrderAmount) return 'BelowMinimumOrderAmount';
    if (rule.MinimumQuantity != null && ctx.Quantity < rule.MinimumQuantity) return 'BelowMinimumQuantity';
    if (rule.MaxRedemptions != null && (rule.RedemptionCount ?? 0) >= rule.MaxRedemptions) {
        return 'RedemptionLimitReached';
    }
    if (
        rule.MaxRedemptionsPerCustomer != null &&
        (rule.CustomerRedemptionCount ?? 0) >= rule.MaxRedemptionsPerCustomer
    ) {
        return 'CustomerRedemptionLimitReached';
    }
    return null;
}

/**
 * Decide which promotions apply, in what order, and what each is worth.
 *
 * The sequence is deliberate:
 *   1. screen each on its own terms
 *   2. resolve exclusivity — HIGHEST VALUE wins, losers reported
 *   3. apply the survivors in `StackSequence`, under the company's stacking mode
 *
 * Valuing before resolving the collision is what makes "highest value wins" meaningful: you cannot
 * know which of two offers is better for the customer without pricing both.
 */
export function ApplyPromotions(rules: PromotionRule[], ctx: PromotionContext): ApplyPromotionsResult {
    const rejected: RejectedPromotion[] = [];
    const eligible: PromotionRule[] = [];

    for (const r of rules) {
        const reason = ScreenPromotion(r, ctx);
        if (reason) rejected.push({ Promotion: r, Reason: reason });
        else eligible.push(r);
    }
    if (!eligible.length) {
        return { Applied: [], Rejected: rejected, FinalAmount: Money(ctx.BaseAmount), TotalDiscount: 0 };
    }

    // Value everything against the ORIGINAL base so the comparison is like-for-like. Valuing
    // against a running total would make a promotion's worth depend on where it happened to sit
    // in the sequence, and "highest value wins" would stop meaning anything.
    const valued = eligible
        .map((r) => ({ rule: r, worth: ValuePromotion(r, ctx.BaseAmount) }))
        .sort((a, b) => b.worth - a.worth || a.rule.StackSequence - b.rule.StackSequence);

    const stackable = ctx.AllowStacking;
    const survivors: PromotionRule[] = [];

    if (!stackable) {
        // Company policy forbids combining outright: the best single offer applies, whatever the
        // promotions themselves claim.
        survivors.push(valued[0].rule);
        for (const v of valued.slice(1)) {
            rejected.push({ Promotion: v.rule, Reason: 'StackingNotPermitted', LostTo: valued[0].rule.Code });
        }
    } else {
        // The best offer always applies. After that, only promotions that opt IN to stacking may
        // join it — and if the winner itself refuses to stack, nothing else can.
        const winner = valued[0];
        survivors.push(winner.rule);
        for (const v of valued.slice(1)) {
            if (!winner.rule.AllowsStacking) {
                rejected.push({ Promotion: v.rule, Reason: 'LostExclusiveCollision', LostTo: winner.rule.Code });
            } else if (!v.rule.AllowsStacking) {
                rejected.push({ Promotion: v.rule, Reason: 'LostExclusiveCollision', LostTo: winner.rule.Code });
            } else {
                survivors.push(v.rule);
            }
        }
    }

    // Apply in the configured sequence — the ORDER of application is a business decision, distinct
    // from which of them apply at all.
    survivors.sort((a, b) => a.StackSequence - b.StackSequence || b.Value - a.Value);

    const applied: PromotionOutcome[] = [];
    let running = Money(ctx.BaseAmount);

    if (ctx.StackingMode === 'Additive') {
        // Percentages sum and apply ONCE to the original base; fixed amounts add on top. Computing
        // each against the original is the whole difference from Sequential.
        let pctTotal = 0;
        let flatTotal = 0;
        for (const r of survivors) {
            if (r.Kind === 'PercentOff') pctTotal += r.Value;
            else flatTotal += ValuePromotion(r, ctx.BaseAmount);
        }
        const pctAmount = Money(ctx.BaseAmount * Math.min(1, pctTotal));
        const total = Money(Math.min(ctx.BaseAmount, pctAmount + flatTotal));
        // Report per promotion, pro-rated when the cap bit, so the audit trail still names each one.
        let remaining = total;
        survivors.forEach((r, i) => {
            const raw = r.Kind === 'PercentOff' ? Money(ctx.BaseAmount * r.Value) : ValuePromotion(r, ctx.BaseAmount);
            const amount = i === survivors.length - 1 ? Money(remaining) : Money(Math.min(remaining, raw));
            remaining = Money(remaining - amount);
            running = Money(running - amount);
            applied.push({ Promotion: r, Amount: amount, RunningTotal: running });
        });
    } else {
        for (const r of survivors) {
            const amount = Money(Math.min(running, ValuePromotion(r, running)));
            running = Money(running - amount);
            applied.push({ Promotion: r, Amount: amount, RunningTotal: running });
        }
    }

    return {
        Applied: applied,
        Rejected: rejected,
        FinalAmount: Money(running),
        TotalDiscount: Money(ctx.BaseAmount - running),
    };
}
