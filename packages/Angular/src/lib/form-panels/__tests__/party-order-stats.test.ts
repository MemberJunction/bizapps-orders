import { describe, it, expect } from 'vitest';
import { FiguresFromLifetimeRow, formatTenure } from '../party-order-stats';

describe('formatTenure', () => {
    it('returns a dash when there is no first order', () => {
        expect(formatTenure(null, null)).toBe('—');
    });

    it('uses whole years when the party is at least a year old', () => {
        expect(formatTenure('2020-03-01', 6)).toBe('6 yr');
    });

    it('falls back to the first-order year in the first year', () => {
        expect(formatTenure('2026-01-15', 0)).toBe('since 2026');
    });
});

describe('FiguresFromLifetimeRow', () => {
    it('includes counts, LTV, and tenure', () => {
        const figures = FiguresFromLifetimeRow({
            OrderCount: 12,
            OpenCount: 2,
            OverdueCount: 1,
            ActiveSubCount: 3,
            LifetimeValue: 41230.44,
            FirstOrderDate: '2021-06-01',
            YearsAsCustomer: 5,
        });
        expect(figures.map((f) => f.Label)).toEqual([
            'Orders',
            'Open',
            'Overdue',
            'Active subs',
            'LTV',
            'Customer',
        ]);
        expect(figures.find((f) => f.Label === 'LTV')?.Value).toBe('$41,230');
        expect(figures.find((f) => f.Label === 'Customer')?.Value).toBe('5 yr');
        expect(figures.find((f) => f.Label === 'Orders')?.Value).toBe('12');
    });
});


describe('FiguresFromLifetimeRow with foreign orders left out (golive #492)', () => {
    const base = { OrderCount: 3, OpenCount: 0, OverdueCount: 0, ActiveSubCount: 0, LifetimeValue: 100, FirstOrderDate: '2021-06-01', YearsAsCustomer: 5 };

    it('adds no figure when every order converted', () => {
        expect(FiguresFromLifetimeRow({ ...base, UnconvertedOrderCount: 0 }).some((f) => f.Label === 'Not in LTV')).toBe(false);
    });

    it('names the orders left out of LTV', () => {
        const figure = FiguresFromLifetimeRow({ ...base, UnconvertedOrderCount: 2 }).find((f) => f.Label === 'Not in LTV');
        expect(figure).toEqual({ Label: 'Not in LTV', Value: '2 orders, no exchange rate yet', Tone: 'muted' });
    });
});
