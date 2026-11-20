import '@angular/compiler';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { AddOrderToAgingBuckets, AgingBucketOf, EmptyAgingBuckets, GroupInstalmentsByOrder, NextDueDayOf, PastDueAmountOf } from '../lib/panels/aging-bar.component';
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
    /** What the Overdue tile shows. With no instalments in play it is the overdue orders' balances. */
    const overdueTotal = (page: MJOOrdersDashboardPageComponent): number => {
        expect(page.OverdueValue).toBe(page.overdue.reduce((s, o) => s + (o.Balance ?? 0), 0));
        return page.OverdueValue;
    };

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

/**
 * AN INSTALMENT ORDER AGES EACH INSTALMENT ON ITS OWN DUE DATE (bc-aidp-next-golive#481).
 *
 * Both aging screens put an order's whole balance in the bucket of the header's `DueDate`. An order
 * billed in nine monthly instalments with one of them late read as wholly late, and the header date
 * never moved as instalments were paid. The rule is `AddOrderToAgingBuckets`, stated once beside
 * `AgingBucketOf`; these pin what it means.
 */
describe('AddOrderToAgingBuckets ages each instalment on its own due date', () => {
    const TODAY = '2026-11-18';
    const ORDER = 'aaaaaaaa-0000-4000-8000-000000000001';
    const inst = (due: string, balance: number, orderID = ORDER) => ({ OrderHeaderID: orderID, DueDate: due, Balance: balance });

    it('ages an order with no instalments on its header date, as it always did', () => {
        const b = EmptyAgingBuckets();
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: '2026-11-01', Balance: 500 }, undefined, TODAY);
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: '2026-12-01', Balance: 200 }, [], TODAY);
        expect(b).toEqual({ Current: 200, Days1To30: 500, Days31To60: 0, Days61Plus: 0 });
    });

    it('puts only the late instalment past due, not the whole balance', () => {
        const b = EmptyAgingBuckets();
        // Header date is the order date, months ago: the reported defect aged all 300 at 61+.
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: '2026-07-01', Balance: 300 },
            [inst('2026-11-01', 100), inst('2026-12-01', 100), inst('2027-01-01', 100)], TODAY);
        expect(b).toEqual({ Current: 200, Days1To30: 100, Days31To60: 0, Days61Plus: 0 });
    });

    it('spreads instalments across every bucket by their own age', () => {
        const b = EmptyAgingBuckets();
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: null, Balance: 1000 },
            [inst('2026-08-01', 400), inst('2026-10-01', 300), inst('2026-11-10', 200), inst('2027-02-01', 100)], TODAY);
        expect(b).toEqual({ Current: 100, Days1To30: 200, Days31To60: 300, Days61Plus: 400 });
    });

    it('ages the part of the balance no instalment accounts for on the header date', () => {
        const b = EmptyAgingBuckets();
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: '2026-11-10', Balance: 500 }, [inst('2027-01-01', 300)], TODAY);
        expect(b).toEqual({ Current: 300, Days1To30: 200, Days31To60: 0, Days61Plus: 0 });
    });

    it('never ages more than the order still owes', () => {
        const b = EmptyAgingBuckets();
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: '2026-07-01', Balance: 150 },
            [inst('2026-11-01', 100), inst('2026-12-01', 100)], TODAY);
        expect(b.Current + b.Days1To30 + b.Days31To60 + b.Days61Plus).toBe(150);
        expect(b).toEqual({ Current: 50, Days1To30: 100, Days31To60: 0, Days61Plus: 0 });
    });

    it('adds nothing for a paid order or a credit balance', () => {
        const b = EmptyAgingBuckets();
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: '2026-07-01', Balance: 0 }, [inst('2026-11-01', 100)], TODAY);
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: '2026-07-01', Balance: -250 }, [inst('2026-11-01', 100)], TODAY);
        expect(b).toEqual(EmptyAgingBuckets());
    });

    it('keeps cents exact across many instalments', () => {
        const b = EmptyAgingBuckets();
        // Nine instalments of a round total: eight equal and one that absorbs the odd cent.
        const rows = [...Array.from({ length: 8 }, (_, i) => inst(`2027-0${i + 1}-01`, 1111.11)), inst('2027-09-01', 1111.12)];
        AddOrderToAgingBuckets(b, { ID: ORDER, DueDate: '2026-07-01', Balance: 10000 }, rows, TODAY);
        expect(b.Current).toBe(10000);
    });

    it('reports how much of one order is past due, not its whole balance', () => {
        const order = { ID: ORDER, DueDate: '2026-07-01', Balance: 300 };
        expect(PastDueAmountOf(order, [inst('2026-11-01', 100), inst('2026-12-01', 200)], TODAY)).toBe(100);
        expect(PastDueAmountOf(order, undefined, TODAY)).toBe(300); // no schedule: the header date decides
        expect(PastDueAmountOf({ ...order, DueDate: '2026-12-01' }, undefined, TODAY)).toBe(0);
    });

    it('reads the next due day from the next unpaid instalment, else the header', () => {
        expect(NextDueDayOf({ NextDueDate: '2026-12-01', DueDate: '2026-07-01' })).toBe('2026-12-01');
        expect(NextDueDayOf({ NextDueDate: null, DueDate: '2026-07-01' })).toBe('2026-07-01');
        expect(NextDueDayOf({})).toBeNull();
    });

    it('groups instalments by order whatever the case of the id', () => {
        const other = 'BBBBBBBB-0000-4000-8000-000000000002';
        const grouped = GroupInstalmentsByOrder([inst('2026-11-01', 1, ORDER.toUpperCase()), inst('2026-12-01', 2), inst('2026-12-01', 3, other)]);
        expect(grouped.get(ORDER)?.map((r) => r.Balance)).toEqual([1, 2]);
        expect(grouped.get(other.toLowerCase())?.map((r) => r.Balance)).toEqual([3]);
    });
});

/**
 * The dashboard reads the same rule, and its Overdue tile stays the same money as the past-due
 * buckets (golive#361) once instalments are in play: the tile is what is LATE, not the whole balance
 * of every order that has something late.
 */
describe('the dashboard ages instalment orders by instalment', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };
    beforeEach(() => {
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
        engine._loaded = true;
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-18T15:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
    });

    const A = 'aaaaaaaa-0000-4000-8000-000000000001';
    const B = 'bbbbbbbb-0000-4000-8000-000000000002';
    const inst = (orderID: string, due: string, balance: number) => ({ OrderHeaderID: orderID, DueDate: due, Balance: balance });
    const dashboardWith = (rows: unknown[], instalments: Array<ReturnType<typeof inst>>) => {
        const page = Object.create(MJOOrdersDashboardPageComponent.prototype) as MJOOrdersDashboardPageComponent;
        Object.defineProperty(page, 'orders', { value: rows, writable: true });
        Object.defineProperty(page, 'instalmentsByOrder', { value: GroupInstalmentsByOrder(instalments), writable: true });
        return page;
    };

    // A: three instalments, the first late. B: no schedule, late on its header date.
    const rows = [
        { ID: A, Status: 'Confirmed', Balance: 300, DueDate: '2026-07-01', NextDueDate: '2026-11-01' },
        { ID: B, Status: 'Confirmed', Balance: 500, DueDate: '2026-10-01', NextDueDate: '2026-10-01' },
    ];
    const instalments = [inst(A, '2026-11-01', 100), inst(A, '2026-12-01', 100), inst(A, '2027-01-01', 100)];

    it('buckets each instalment on its own date', () => {
        expect(dashboardWith(rows, instalments).AgingBuckets).toEqual({ Current: 200, Days1To30: 100, Days31To60: 500, Days61Plus: 0 });
    });

    it('keeps the Overdue tile equal to the past-due buckets', () => {
        const page = dashboardWith(rows, instalments);
        const b = page.AgingBuckets;
        expect(page.OverdueValue).toBe(b.Days1To30 + b.Days31To60 + b.Days61Plus);
        expect(page.OverdueValue).toBe(600); // not 800: 200 of order A is not due yet
    });

    it('names the worst overdue order with what is late, not its whole balance', () => {
        const page = dashboardWith(rows, instalments) as MJOOrdersDashboardPageComponent & { customerOf: () => string };
        Object.defineProperty(page, 'customerOf', { value: () => 'Acme' });
        const worst = page.WorthALook[0];
        // B is 48 days late on its header date; A is 17 days late on one instalment of three.
        expect(worst?.Headline).toMatch(/48 days past due/);
        const onlyA = dashboardWith([rows[0]], instalments) as MJOOrdersDashboardPageComponent;
        Object.defineProperty(onlyA, 'customerOf', { value: () => 'Acme' });
        expect(onlyA.WorthALook[0]?.Headline).toMatch(/17 days past due/);
        expect(onlyA.WorthALook[0]?.Detail).toContain('100');
        expect(onlyA.WorthALook[0]?.Detail).not.toContain('300');
    });

    it('calls an order overdue on its next unpaid instalment, not its header date', () => {
        // Header date long past, but the next unpaid instalment is still ahead: not overdue.
        const page = dashboardWith(
            [{ ID: A, Status: 'Confirmed', Balance: 200, DueDate: '2026-07-01', NextDueDate: '2026-12-01' }],
            [inst(A, '2026-12-01', 100), inst(A, '2027-01-01', 100)],
        );
        expect(page.overdue).toHaveLength(0);
        expect(page.AgingBuckets.Current).toBe(200);
        expect(page.OverdueValue).toBe(0);
    });
});
