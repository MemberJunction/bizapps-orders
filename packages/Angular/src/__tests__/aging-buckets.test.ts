import '@angular/compiler';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { AgingBucketOf, EmptyAgingBuckets } from '../lib/panels/aging-bar.component';
import { MJOOrdersDashboardPageComponent } from '../lib/pages/orders/orders-dashboard.page';

/**
 * ONE AGING DEFINITION ACROSS THE APP (bc-aidp-next-golive#361).
 *
 * The Orders dashboard and the Customer A/R page each bucketed open balances by age, separately.
 * The dashboard's first tile read "Current (0-30 days)" and swept in everything up to THIRTY DAYS
 * PAST DUE, so on QA it reported $6,804,972 as "Due or recently invoiced" while Receivables split
 * the same money into Current $285,195 and 1-30 days $6,519,777. The totals agreed; only the labels
 * disagreed, which is the worst kind of disagreement because both pages look right alone.
 *
 * The rule now lives once, in `AgingBucketOf`. These pin what it means and that the dashboard asks
 * it rather than counting again.
 */
describe('AgingBucketOf is the age rule, stated once', () => {
    const TODAY = '2026-10-18';

    it('puts a balance that is not yet due in Current', () => {
        expect(AgingBucketOf('2026-11-01', TODAY)).toBe('Current');
    });

    it('puts a balance due TODAY in Current — due is not late', () => {
        expect(AgingBucketOf(TODAY, TODAY)).toBe('Current');
    });

    it('puts a balance with no due date in Current — no date is no age', () => {
        expect(AgingBucketOf(null, TODAY)).toBe('Current');
    });

    /** The band the dashboard used to call Current. This is the defect, stated as a boundary. */
    it('puts 1 and 30 days past due in Days1To30, NOT Current', () => {
        expect(AgingBucketOf('2026-10-17', TODAY)).toBe('Days1To30');
        expect(AgingBucketOf('2026-09-18', TODAY)).toBe('Days1To30');
    });

    it('puts 31 and 60 days past due in Days31To60', () => {
        expect(AgingBucketOf('2026-09-17', TODAY)).toBe('Days31To60');
        expect(AgingBucketOf('2026-08-19', TODAY)).toBe('Days31To60');
    });

    it('puts 61 days and beyond in Days61Plus', () => {
        expect(AgingBucketOf('2026-08-18', TODAY)).toBe('Days61Plus');
        expect(AgingBucketOf('2025-01-01', TODAY)).toBe('Days61Plus');
    });

    it('offers an empty set rather than four keys to remember', () => {
        expect(EmptyAgingBuckets()).toEqual({ Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 });
    });
});

/**
 * The reported numbers, scaled down. A mix of not-yet-due and 1-30 money must land in two tiles,
 * not one: the old `AgingCurrentDisplay` summed both into Current.
 */
describe('the dashboard aging tiles split not-yet-due from overdue', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };
    beforeEach(() => {
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
        engine._loaded = true;
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
    });

    const dashboardWith = (rows: unknown[]) => {
        const page = Object.create(MJOOrdersDashboardPageComponent.prototype) as MJOOrdersDashboardPageComponent & { orders: unknown[] };
        Object.defineProperty(page, 'orders', { value: rows, writable: true });
        return page;
    };
    const order = (balance: number, due: string | null) => ({ Status: 'Confirmed', Balance: balance, DueDate: due });

    it('keeps money that is 1-30 days late OUT of Current', () => {
        const page = dashboardWith([
            order(285, '2026-11-15'), // not yet due
            order(6519, '2026-10-10'), // 8 days past due
        ]);
        const buckets = page.AgingBuckets;
        expect(buckets.Current).toBe(285);
        expect(buckets.Days1To30).toBe(6519);
    });

    it('spreads a balance across all four buckets by age', () => {
        const page = dashboardWith([
            order(100, '2026-12-01'),
            order(200, '2026-10-01'),
            order(300, '2026-09-01'),
            order(400, '2026-06-01'),
        ]);
        expect(page.AgingBuckets).toEqual({ Current: 100, Days1To30: 200, Days31To60: 300, Days61Plus: 400 });
    });

    it('counts only open orders with a balance, as the tiles always did', () => {
        const page = dashboardWith([
            order(500, '2026-10-01'),
            { Status: 'Voided', Balance: 900, DueDate: '2026-10-01' },
            { Status: 'Draft', Balance: 900, DueDate: '2026-10-01' },
            { Status: 'Confirmed', Balance: 0, DueDate: '2026-10-01' },
        ]);
        expect(page.AgingBuckets.Days1To30).toBe(500);
    });

    it('totals the same money however it is split', () => {
        const rows = [order(285, '2026-11-15'), order(6519, '2026-10-10'), order(369, '2026-07-01')];
        const buckets = dashboardWith(rows).AgingBuckets;
        const summed = buckets.Current + buckets.Days1To30 + buckets.Days31To60 + buckets.Days61Plus;
        expect(summed).toBe(285 + 6519 + 369);
    });
});

/**
 * THE INVARIANT THE ISSUE ITSELF USED TO FIND THE BUG.
 *
 * The reporter noticed that the dashboard's own Overdue tile ($6,889,525) equalled Receivables'
 * 1-30 + 31-60 + 61+ buckets, while the dashboard's aging tiles did not -- which is how they knew
 * the aging tab was mislabelling rather than miscounting. Two tiles on the SAME page disagreeing
 * about what is overdue is the defect in its smallest form, so it is worth holding directly.
 *
 * `overdue` is the orders past their due day; the three past-due buckets are the same money split
 * by how far past. They have to sum to each other, whatever the data.
 */
describe('the Overdue tile and the past-due buckets are the same money', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };
    beforeEach(() => {
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
        engine._loaded = true;
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
    });

    const dashboardWith = (rows: unknown[]) => {
        const page = Object.create(MJOOrdersDashboardPageComponent.prototype) as MJOOrdersDashboardPageComponent & { orders: unknown[] };
        Object.defineProperty(page, 'orders', { value: rows, writable: true });
        return page;
    };
    const order = (balance: number, due: string | null) => ({ Status: 'Confirmed', Balance: balance, DueDate: due });

    const pastDue = (page: MJOOrdersDashboardPageComponent): number => {
        const b = page.AgingBuckets;
        return b.Days1To30 + b.Days31To60 + b.Days61Plus;
    };
    const overdueTotal = (page: MJOOrdersDashboardPageComponent): number =>
        page.overdue.reduce((s, o) => s + (o.Balance ?? 0), 0);

    it('agrees on a mix spanning every bucket', () => {
        const page = dashboardWith([
            order(285, '2026-11-15'),
            order(6519, '2026-10-10'),
            order(1200, '2026-09-05'),
            order(369, '2026-07-01'),
            order(50, null),
        ]);
        expect(pastDue(page)).toBe(overdueTotal(page));
    });

    it('agrees when nothing is late', () => {
        const page = dashboardWith([order(100, '2026-12-01'), order(50, null)]);
        expect(pastDue(page)).toBe(0);
        expect(overdueTotal(page)).toBe(0);
    });

    it('agrees when everything is late', () => {
        const page = dashboardWith([order(100, '2026-01-01'), order(200, '2026-10-17')]);
        expect(pastDue(page)).toBe(300);
        expect(overdueTotal(page)).toBe(300);
    });

    /** A balance due exactly today sits in Current and is not overdue, on both readings. */
    it('puts money due today on the not-overdue side of both', () => {
        const page = dashboardWith([order(999, '2026-10-18')]);
        expect(page.AgingBuckets.Current).toBe(999);
        expect(pastDue(page)).toBe(0);
        expect(overdueTotal(page)).toBe(0);
    });
});
