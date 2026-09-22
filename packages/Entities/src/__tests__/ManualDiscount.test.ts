import { describe, expect, it } from 'vitest';
import { ManualDiscountAmount } from '../pricing/PromotionEngine';

/**
 * A manual discount's value, however it was expressed — golive #252.
 *
 * The concession is one thing whether it was agreed as "$240 off" or as "20%", and the cap on a
 * `SalesAuthority` is a percentage, so the two have to meet on one number before anything can be
 * judged. These pin where they meet, because the alternative — each caller deciding what a
 * percentage means — is how a rate against gross and a rate against net end up both being called
 * twenty percent.
 */
describe('ManualDiscountAmount', () => {
    it('takes a stated amount as it stands', () => {
        expect(ManualDiscountAmount({ Amount: 240, Reason: 'goodwill' }, 1200)).toBe(240);
    });

    it('resolves a rate against the base it reduces', () => {
        expect(ManualDiscountAmount({ Percent: 0.2, Reason: 'goodwill' }, 1200)).toBe(240);
    });

    it('rounds a rate to cents, so the line and the ledger cannot differ by a fraction', () => {
        // A third off 333.33 is 111.11 to the penny and 111.109999… in full precision. The stored
        // figure is what the journal entry mirrors, so the rounding has to happen here.
        expect(ManualDiscountAmount({ Percent: 1 / 3, Reason: 'goodwill' }, 333.33)).toBe(111.11);
    });

    it('prefers a stated amount over a rate, because the amount is what was agreed', () => {
        expect(ManualDiscountAmount({ Amount: 100, Percent: 0.5, Reason: 'goodwill' }, 1200)).toBe(100);
    });

    it('treats a request that states neither as nothing, rather than as everything', () => {
        expect(ManualDiscountAmount({ Reason: 'goodwill' }, 1200)).toBe(0);
    });

    it('never turns a negative base into a discount that enlarges the line', () => {
        // A reversal line's net is negative. A percentage off it is not a concession to be handed
        // back — it would deepen the credit, which is the mistake `NetAfterDiscount` was fixed for.
        expect(ManualDiscountAmount({ Percent: 0.2, Reason: 'goodwill' }, -1200)).toBe(0);
    });
});
