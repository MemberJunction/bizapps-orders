import { describe, expect, it } from 'vitest';
import { PickCancelRefundDefault, TermCancelledOn, type MJOCancelTermRow } from '../cancel-refund-default';

const TODAY = '2026-11-16';

function term(start: string, end: string, amount = 8000): MJOCancelTermRow {
    return { StartDate: new Date(`${start}T00:00:00Z`), EndDate: new Date(`${end}T00:00:00Z`), Amount: amount, OrderLineID: 'line' };
}

describe('TermCancelledOn', () => {
    it('picks the term covering today, else the earliest still to start', () => {
        const current = term('2026-01-01', '2026-12-31');
        const next = term('2027-01-01', '2027-12-31');
        expect(TermCancelledOn([next, current], TODAY)).toBe(current);
        const later = term('2028-01-01', '2028-12-31');
        expect(TermCancelledOn([later, next], TODAY)).toBe(next);
        expect(TermCancelledOn([], TODAY)).toBeNull();
    });
});

describe('PickCancelRefundDefault (golive #384)', () => {
    const unstarted = term('2026-12-01', '2027-11-30');

    it('starts on the whole term when the term has not started and nothing was paid', () => {
        expect(PickCancelRefundDefault(unstarted, 0, TODAY)).toEqual({ Refund: 'Full', TermStart: '2026-12-01' });
    });

    it('keeps the type\'s rule once money came in', () => {
        expect(PickCancelRefundDefault(unstarted, 100, TODAY)).toBeNull();
    });

    it('keeps the type\'s rule for a term under way or starting today', () => {
        expect(PickCancelRefundDefault(term('2026-01-01', '2026-12-31'), 0, TODAY)).toBeNull();
        expect(PickCancelRefundDefault(term(TODAY, '2027-11-15'), 0, TODAY)).toBeNull();
    });

    it('keeps the type\'s rule when the payment could not be read or the term charged nothing', () => {
        expect(PickCancelRefundDefault(unstarted, null, TODAY)).toBeNull();
        expect(PickCancelRefundDefault(term('2026-12-01', '2027-11-30', 0), 0, TODAY)).toBeNull();
        expect(PickCancelRefundDefault(null, 0, TODAY)).toBeNull();
    });
});
