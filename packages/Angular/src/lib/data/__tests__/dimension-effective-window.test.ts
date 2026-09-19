/**
 * Which dimension values an order line may be tagged with.
 *
 * WHY THIS IS WORTH A TEST. `DimensionValue` is effective-dated, and the picker filters it against
 * the ORDER's date rather than today's — a back-dated order has to offer the values that were live
 * when it was placed. Every way of getting that wrong is silent: an off-by-one at a boundary drops a
 * legitimate value from the list on exactly the day someone reaches for it, and an inverted
 * comparison offers values that were not yet in effect. Either way the line ends up tagged wrongly
 * or not at all, and the only downstream symptom is a journal entry that reports against the wrong
 * axis — which nobody sees until someone runs the P&L.
 *
 * Both bounds are inclusive and either may be absent, which is what
 * `CK_DimensionValue_EffectiveRange` allows.
 */
import { describe, expect, it } from 'vitest';

import { DimensionValueCoversDate } from '../orders-queries';

const JAN = new Date('2026-01-01T00:00:00Z');
const JUN = new Date('2026-06-15T00:00:00Z');
const DEC = new Date('2026-12-31T00:00:00Z');

describe('DimensionValueCoversDate', () => {
    it('covers every date when the window is open at both ends', () => {
        expect(DimensionValueCoversDate({}, JUN)).toBe(true);
        expect(DimensionValueCoversDate({ EffectiveFrom: null, EffectiveTo: null }, JUN)).toBe(true);
    });

    it('includes both boundary days', () => {
        const window = { EffectiveFrom: JAN, EffectiveTo: DEC };
        expect(DimensionValueCoversDate(window, JAN)).toBe(true);
        expect(DimensionValueCoversDate(window, DEC)).toBe(true);
    });

    it('excludes dates outside a closed window', () => {
        const window = { EffectiveFrom: JUN, EffectiveTo: DEC };
        expect(DimensionValueCoversDate(window, JAN)).toBe(false);
        expect(DimensionValueCoversDate({ EffectiveFrom: JAN, EffectiveTo: JUN }, DEC)).toBe(false);
    });

    it('treats a missing bound as open in that direction only', () => {
        expect(DimensionValueCoversDate({ EffectiveFrom: JUN }, DEC)).toBe(true);
        expect(DimensionValueCoversDate({ EffectiveFrom: JUN }, JAN)).toBe(false);
        expect(DimensionValueCoversDate({ EffectiveTo: JUN }, JAN)).toBe(true);
        expect(DimensionValueCoversDate({ EffectiveTo: JUN }, DEC)).toBe(false);
    });

    /**
     * MJ has changed which of these a `'entity_object'` read hands back at least once — date columns
     * used to arrive as ISO strings and are now normalized to `Date` — so the rule accepts either
     * rather than trusting the declared type.
     */
    it('accepts ISO strings as well as Date values', () => {
        const window = { EffectiveFrom: '2026-06-15', EffectiveTo: '2026-12-31' };
        expect(DimensionValueCoversDate(window, JUN)).toBe(true);
        expect(DimensionValueCoversDate(window, JAN)).toBe(false);
    });

    it('judges the order date, not today', () => {
        // A 2026 order placed against a value that lapsed in 2026 still offers it, however long ago
        // that was — which is the whole reason the caller passes a date at all.
        const lapsed = { EffectiveFrom: '2026-01-01', EffectiveTo: '2026-12-31' };
        expect(DimensionValueCoversDate(lapsed, JUN)).toBe(true);
        expect(DimensionValueCoversDate(lapsed, new Date('2030-01-01T00:00:00Z'))).toBe(false);
    });
});
