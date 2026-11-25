/**
 * What the Overdue worklist counts as overdue: invoiced amounts past their own due date, as Customer
 * A/R reads them (bc-aidp-next-golive#481).
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { OverdueWorklistRow } from '@mj-biz-apps/orders-entities';
import { GroupInstalmentsByOrder } from '../../panels/aging-bar.component';
import { CreditHeld, RestateOverdue, SumAged, type OverdueInstalment } from '../receivables/overdue-page.model';

const TODAY = '2026-03-10';

const order = (id: string, over: Partial<OverdueWorklistRow> = {}): OverdueWorklistRow =>
    ({
        OrderHeaderID: id,
        OrderNumber: `ORD-${id}`,
        OrderDate: '2025-12-01',
        DueDate: '2026-02-18',
        DaysOverdue: 20,
        CompanyID: 'c1',
        CompanyName: 'Alpha',
        CustomerName: `Customer ${id}`,
        BillToOrganizationID: `org-${id}`,
        TotalGross: 1000,
        AmountPaid: 0,
        Balance: 1000,
        AvailableCredit: 0,
        ...over,
    }) as OverdueWorklistRow;

const inst = (orderID: string, due: string, balance: number, status: string): OverdueInstalment => ({ OrderHeaderID: orderID, DueDate: due, Balance: balance, Status: status });
const book = (rows: OverdueWorklistRow[], instalments: OverdueInstalment[] | null) => RestateOverdue(rows, instalments ? GroupInstalmentsByOrder(instalments) : null, TODAY);

describe('an order with no schedule', () => {
    it('reads as the operation returned it: the whole balance, from its own date', () => {
        const { Rows, NeverInvoiced } = book([order('a')], []);
        expect(NeverInvoiced).toEqual([]);
        expect(Rows).toHaveLength(1);
        expect(Rows[0].PastDue).toBe(1000);
        expect(Rows[0].DaysOverdue).toBe(20);
        expect(Rows[0].Aged).toEqual({ Current: 0, Days1To30: 1000, Days31To60: 0, Days61Plus: 0 });
    });
});

describe('an order billed in installments', () => {
    it('counts only invoiced installments past their date, each in the band of its own age', () => {
        const rows = [order('a', { Balance: 1000, DueDate: '2025-12-20', DaysOverdue: 80 })];
        const { Rows } = book(rows, [
            inst('a', '2025-12-20', 250, 'Invoiced'), // 80 days
            inst('a', '2026-02-18', 250, 'Invoiced'), // 20 days
            inst('a', '2026-04-01', 250, 'Invoiced'), // not due
            inst('a', '2026-06-01', 250, 'Scheduled'), // not due, not invoiced
        ]);
        expect(Rows[0].PastDue).toBe(500);
        expect(Rows[0].Balance).toBe(1000);
        expect(Rows[0].DueDate).toBe('2025-12-20');
        expect(Rows[0].DaysOverdue).toBe(80);
        expect(Rows[0].Aged).toEqual({ Current: 0, Days1To30: 250, Days31To60: 0, Days61Plus: 250 });
    });

    it('ages from the oldest INVOICED late installment, not from a late one that was never invoiced', () => {
        const rows = [order('a', { Balance: 600, DueDate: '2025-12-20', DaysOverdue: 80 })];
        const { Rows } = book(rows, [inst('a', '2025-12-20', 300, 'Scheduled'), inst('a', '2026-02-18', 300, 'Invoiced')]);
        expect(Rows[0].PastDue).toBe(300);
        expect(Rows[0].DueDate).toBe('2026-02-18');
        expect(Rows[0].DaysOverdue).toBe(20);
    });

    it('sets apart an order whose only late installments were never invoiced', () => {
        const rows = [order('a'), order('b')];
        const { Rows, NeverInvoiced } = book(rows, [inst('a', '2026-02-18', 500, 'Scheduled'), inst('a', '2026-05-01', 500, 'Scheduled')]);
        expect(NeverInvoiced.map((r) => r.OrderHeaderID)).toEqual(['a']);
        expect(Rows.map((r) => r.OrderHeaderID)).toEqual(['b']);
    });

    it('keeps an order in collections for a balance no installment accounts for, even beside a late uninvoiced installment', () => {
        const rows = [order('a', { Balance: 1000, DueDate: '2026-02-08', DaysOverdue: 30 })];
        const { Rows, NeverInvoiced } = book(rows, [inst('a', '2026-02-08', 400, 'Scheduled')]);
        expect(NeverInvoiced).toEqual([]);
        expect(Rows[0].PastDue).toBe(600);
        expect(Rows[0].Aged).toEqual({ Current: 0, Days1To30: 600, Days31To60: 0, Days61Plus: 0 });
    });

    it('never counts more than the order still owes', () => {
        const { Rows } = book([order('a', { Balance: 300 })], [inst('a', '2026-01-01', 250, 'Invoiced'), inst('a', '2026-02-01', 250, 'Invoiced')]);
        expect(Rows[0].PastDue).toBe(300);
    });

    it('matches installments to their order whatever the case of the ID', () => {
        const { Rows } = book([order('ABC', { Balance: 400 })], [inst('abc', '2026-02-18', 100, 'Invoiced'), inst('abc', '2026-05-01', 300, 'Invoiced')]);
        expect(Rows[0].PastDue).toBe(100);
    });
});

describe('when the installments cannot be read', () => {
    it('keeps every order as returned, so nothing vanishes', () => {
        const { Rows, NeverInvoiced } = book([order('a'), order('b', { DaysOverdue: 70 })], null);
        expect(NeverInvoiced).toEqual([]);
        expect(Rows.map((r) => [r.OrderHeaderID, r.PastDue])).toEqual([['b', 1000], ['a', 1000]]);
    });
});

describe('totals', () => {
    it('lists the most overdue first and sums the bands across rows', () => {
        const { Rows } = book([order('a'), order('b', { DaysOverdue: 70, DueDate: '2025-12-30', Balance: 200 })], []);
        expect(Rows.map((r) => r.OrderHeaderID)).toEqual(['b', 'a']);
        expect(SumAged(Rows)).toEqual({ Current: 0, Days1To30: 1000, Days31To60: 0, Days61Plus: 200 });
    });

    it('counts a customer\'s credit once however many of their orders are overdue', () => {
        const rows = [
            order('a', { BillToOrganizationID: 'org-1', AvailableCredit: 150 }),
            order('b', { BillToOrganizationID: 'ORG-1', AvailableCredit: 150 }),
            order('c', { BillToOrganizationID: 'org-2', AvailableCredit: 40 }),
        ];
        expect(CreditHeld(rows)).toBe(190);
    });
});
