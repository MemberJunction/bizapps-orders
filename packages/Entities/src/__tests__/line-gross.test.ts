import { describe, expect, it } from 'vitest';
import { LineGross, NetAfterDiscount } from '../pricing/PricingBehavior';

/**
 * `quantity × unitPrice` is correct ONLY for PerUnit pricing.
 *
 * Flat and Package compute a total that is not a multiple of a unit rate, so their
 * "unit price" is a derived display value — dividing and re-multiplying does not
 * return the original. This is not theoretical: a flat-100 service pack billed
 * 99.99 at quantity 3 and 100.03 at quantity 7 against the running system, and the
 * journal entry balanced at the wrong figure both times, so nothing downstream
 * could notice.
 */
describe('LineGross', () => {
    it('uses the exact extended amount a rule computed, not the re-multiplied rate', () => {
        // The two that shipped wrong. 100/3 -> 33.33 -> 99.99; 100/7 -> 14.29 -> 100.03.
        expect(LineGross(3, 33.33, 100)).toBe(100);
        expect(LineGross(7, 14.29, 100)).toBe(100);
    });

    it('falls back to quantity × price when no rule priced the line', () => {
        // A hand-typed unit price: the rate IS the authority, so the classic formula
        // is right and must not be second-guessed.
        expect(LineGross(3, 33.33, null)).toBe(99.99);
        expect(LineGross(3, 33.33, undefined)).toBe(99.99);
        expect(LineGross(4, 25, null)).toBe(100);
    });

    it('treats a genuine zero extended amount as authoritative, not as absent', () => {
        // The nullish check has to be `== null`, not falsy — a freebie priced at 0.00
        // by a rule must stay 0.00 rather than falling through to quantity × price.
        expect(LineGross(5, 20, 0)).toBe(0);
    });

    it('keeps PerUnit unchanged, since that is what the old formula got right', () => {
        expect(LineGross(3, 50, 150)).toBe(150);
        expect(LineGross(3, 50, null)).toBe(150);
    });

    it('rounds to the cent, like every other public amount', () => {
        expect(LineGross(3, 33.333333, null)).toBe(100);
        expect(LineGross(1, 10.005, null)).toBe(10.01);
    });

    it('survives a negative reversal line in both modes', () => {
        expect(LineGross(-2, 50, -100)).toBe(-100);
        expect(LineGross(-2, 50, null)).toBe(-100);
    });

    // The whole point is that the three call sites agree, so pin the composition too.
    it('composes with NetAfterDiscount to the same net a discount would give', () => {
        expect(NetAfterDiscount(LineGross(3, 33.33, 100), 0.1, 0)).toBe(90);
        expect(NetAfterDiscount(LineGross(7, 14.29, 100), 0, 25)).toBe(75);
    });
});
