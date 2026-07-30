/**
 * Unit tests for the reversal rules and for the discount clamp they exposed. No database.
 *
 * WHY THESE EXIST IN THIS SHAPE. The integration bundle found four defects on the reverse path, and
 * three of them were the same mistake written in three places: `<= 0` or `Math.max(0, …)` treating a
 * NEGATIVE line as if it were a ZERO line. That collapse is invisible on the forward path — every
 * sale is positive — and each occurrence produced a balanced ledger while doing something wrong:
 *
 *   - `computeTotals` stored 0 on every reversal line, so reports read returns as nothing
 *   - the charge base stored 0, so a return owed no tax refund
 *   - `resolveTaxCharges` skipped the line, same effect by a different route
 *
 * So the tests below assert the SIGN behaviour explicitly at each boundary, and the over-discount
 * clamp — which is what the `Math.max` was actually for — is pinned in both directions so a future
 * simplification back to `Math.max(0, …)` fails here rather than in production.
 */
import { describe, it, expect } from 'vitest';
import { NetAfterDiscount } from '../PricingBehavior.js';
import { RemainingReturnable, ValidateReversal, InheritedTerms } from '../ReversalBehavior.js';

const origin = (over: Partial<Parameters<typeof ValidateReversal>[1]> = {}) => ({
    ID: 'origin-1',
    ProductID: 'prod-1',
    Quantity: 4,
    UnitPrice: 100,
    DiscountPct: 0,
    ...over,
});

describe('NetAfterDiscount — the clamp is about over-discounting, not about sign', () => {
    it('a plain sale is its gross', () => {
        expect(NetAfterDiscount(400, 0, 0)).toBe(400);
    });

    it('applies the percentage, then the amount, in that order', () => {
        // 400 less 25% is 300, less a 50 allocated promotion is 250. The other order gives 262.50.
        expect(NetAfterDiscount(400, 0.25, 50)).toBe(250);
    });

    it('a SALE cannot be discounted below zero', () => {
        // Over-discounting is a configuration mistake, and a sale that went negative would read as
        // revenue in the journal entry.
        expect(NetAfterDiscount(100, 0, 500)).toBe(0);
        expect(NetAfterDiscount(100, 1.5, 0)).toBe(0);
    });

    it('a REVERSAL keeps its negative total', () => {
        // The bug: `Math.max(0, …)` stored 0 here, so the line said the customer got nothing back
        // while the ledger — which computes its own gross — booked the real refund.
        expect(NetAfterDiscount(-400, 0, 0)).toBe(-400);
    });

    it('a reversal carries its discount through proportionally', () => {
        // A 25%-discounted sale of 400 nets 300; returning all of it must give back 300, not 400.
        expect(NetAfterDiscount(-400, 0.25, 0)).toBe(-300);
    });

    it('a CREDIT cannot be discounted above zero', () => {
        // The mirror of the sale rule: an over-large discount must not flip a credit into a sale.
        expect(NetAfterDiscount(-100, 0, 500)).toBe(0);
        expect(NetAfterDiscount(-100, 0, -500)).toBe(0);
    });

    it('a discount REDUCES a credit rather than enlarging it', () => {
        // Marcelo, PR #17. `DiscountAmount` is a magnitude (the column is CHECK >= 0), and
        // subtracting it unconditionally gave -150 here: a 50 discount making the refund BIGGER.
        // A discount reduces what changes hands, in whichever direction it changes hands.
        expect(NetAfterDiscount(-100, 0, 50)).toBe(-50);
    });

    it('reads the discount by MAGNITUDE, so its sign cannot flip the rule', () => {
        expect(NetAfterDiscount(-100, 0, 50)).toBe(NetAfterDiscount(-100, 0, -50));
        expect(NetAfterDiscount(100, 0, 50)).toBe(NetAfterDiscount(100, 0, -50));
    });

    it('a promoted sale and its full return net to ZERO', () => {
        // The end-to-end shape of the defect: 4 x 100 less a 50 allocated promotion is 350 paid, so
        // returning all four must give back 350. It gave back 400 and the 50 was simply lost against
        // a perfectly balanced journal entry.
        const sold = NetAfterDiscount(400, 0, 50);
        const refunded = NetAfterDiscount(-400, 0, 50);
        expect(sold).toBe(350);
        expect(refunded).toBe(-350);
        expect(sold + refunded).toBe(0);
    });

    it('zero is zero from either direction', () => {
        expect(NetAfterDiscount(0, 0.5, 10)).toBe(0);
        expect(Object.is(NetAfterDiscount(-0, 0, 0), 0) || NetAfterDiscount(-0, 0, 0) === 0).toBe(true);
    });

    it('rounds to the penny rather than accumulating float dust', () => {
        expect(NetAfterDiscount(100, 1 / 3, 0)).toBe(66.67);
        expect(NetAfterDiscount(-100, 1 / 3, 0)).toBe(-66.67);
    });
});

describe('RemainingReturnable', () => {
    it('is the original when nothing has been returned', () => {
        expect(RemainingReturnable(4, 0)).toBe(4);
    });

    it('subtracts what prior reversals took', () => {
        expect(RemainingReturnable(4, 1)).toBe(3);
        expect(RemainingReturnable(4, 4)).toBe(0);
    });

    it('reads both arguments by magnitude — reversals are stored negative', () => {
        // A signed subtraction here would ADD the prior reversal to the allowance, so every return
        // would enlarge the amount still returnable.
        expect(RemainingReturnable(4, -1)).toBe(3);
        expect(RemainingReturnable(-4, -1)).toBe(3);
    });

    it('rounds to the quantity column scale, so a prorated final return is not refused by float dust', () => {
        // A prorated subscription line carries a fractional quantity; 0.3333 of it three times must
        // not leave a billionth outstanding that rejects the last one.
        expect(RemainingReturnable(0.3333, 0.3333)).toBe(0);
    });
});

describe('ValidateReversal — the origin is the only authority', () => {
    it('accepts a return within the original', () => {
        expect(ValidateReversal({ ProductID: 'prod-1', Quantity: -2 }, origin(), 0)).toBeNull();
    });

    it('accepts a return of exactly the original', () => {
        expect(ValidateReversal({ ProductID: 'prod-1', Quantity: -4 }, origin(), 0)).toBeNull();
    });

    it('REFUSES more than was bought, and says how much remains', () => {
        // The refusal has to carry the number: the person processing the return needs to know what
        // to do instead, and "invalid quantity" does not tell them.
        const why = ValidateReversal({ ProductID: 'prod-1', Quantity: -5 }, origin(), 0);
        expect(why).not.toBeNull();
        expect(why).toContain('4');
    });

    it('counts prior reversals — each within the original, their SUM is not', () => {
        // 2 returned already, 3 more requested against a 4-unit line. Reading the request alone
        // passes it, and passes the one after that too.
        expect(ValidateReversal({ ProductID: 'prod-1', Quantity: -2 }, origin(), 2)).toBeNull();
        expect(ValidateReversal({ ProductID: 'prod-1', Quantity: -3 }, origin(), 2)).not.toBeNull();
    });

    it('refuses when the line is already fully returned', () => {
        const why = ValidateReversal({ ProductID: 'prod-1', Quantity: -1 }, origin(), 4);
        expect(why).toContain('Nothing remains');
    });

    it('refuses a DIFFERENT product — the credit would land on the wrong revenue account', () => {
        const why = ValidateReversal({ ProductID: 'prod-2', Quantity: -1 }, origin(), 0);
        expect(why).toContain('different product');
    });

    it('compares product IDs case-insensitively', () => {
        // SQL Server returns UUIDs uppercase and application code writes them lowercase. A `!==`
        // here refuses every legitimate reversal, with a message showing the same ID twice.
        expect(
            ValidateReversal({ ProductID: 'PROD-1', Quantity: -1 }, origin({ ProductID: 'prod-1' }), 0),
        ).toBeNull();
    });

    it('reads the requested quantity by magnitude, so the sign convention cannot flip the rule', () => {
        expect(ValidateReversal({ ProductID: 'prod-1', Quantity: 5 }, origin(), 0)).not.toBeNull();
        expect(ValidateReversal({ ProductID: 'prod-1', Quantity: -5 }, origin(), 0)).not.toBeNull();
    });

    it('handles a fractional origin from a prorated subscription line', () => {
        const prorated = origin({ Quantity: 0.5833 });
        expect(ValidateReversal({ ProductID: 'prod-1', Quantity: -0.5833 }, prorated, 0)).toBeNull();
        expect(ValidateReversal({ ProductID: 'prod-1', Quantity: -0.6 }, prorated, 0)).not.toBeNull();
    });
});

describe('InheritedTerms — a return refunds what was PAID', () => {
    it('takes the price the origin was sold at, not today\'s', () => {
        expect(InheritedTerms(origin({ UnitPrice: 80 }), -4)).toEqual({
            UnitPrice: 80,
            DiscountPct: 0,
            DiscountAmount: 0,
        });
    });

    it('carries the discount RATE on the origin through unchanged', () => {
        // A percentage applies to any quantity, so it needs no scaling.
        expect(InheritedTerms(origin({ UnitPrice: 100, DiscountPct: 0.25 }), -2).DiscountPct).toBe(0.25);
    });

    it('carries the ALLOCATED discount through PROPORTIONALLY', () => {
        // The defect Marcelo's question led to. DiscountAmount is an allocated cash share of an
        // order-level promotion, so returning half the units gives back half of it. Leaving it out
        // entirely — which is what happened — refunds the undiscounted price.
        const promoted = origin({ Quantity: 4, UnitPrice: 100, DiscountAmount: 50 });
        expect(InheritedTerms(promoted, -4).DiscountAmount).toBe(50);
        expect(InheritedTerms(promoted, -2).DiscountAmount).toBe(25);
        expect(InheritedTerms(promoted, -1).DiscountAmount).toBe(12.5);
    });

    it('rounds the allocated share to the penny', () => {
        const promoted = origin({ Quantity: 3, UnitPrice: 100, DiscountAmount: 10 });
        expect(InheritedTerms(promoted, -1).DiscountAmount).toBe(3.33);
    });

    it('reads the reversal quantity by magnitude', () => {
        const promoted = origin({ Quantity: 4, DiscountAmount: 50 });
        expect(InheritedTerms(promoted, 2).DiscountAmount).toBe(InheritedTerms(promoted, -2).DiscountAmount);
    });

    it('treats a null discount as none', () => {
        expect(InheritedTerms(origin({ DiscountPct: null as unknown as number }), -1).DiscountPct).toBe(0);
        expect(InheritedTerms(origin({ DiscountAmount: undefined }), -1).DiscountAmount).toBe(0);
    });

    it('a zero-quantity origin allocates nothing rather than dividing by zero', () => {
        expect(InheritedTerms(origin({ Quantity: 0, DiscountAmount: 50 }), -1).DiscountAmount).toBe(0);
    });
});
