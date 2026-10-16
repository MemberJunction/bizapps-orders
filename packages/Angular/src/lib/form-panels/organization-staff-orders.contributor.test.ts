import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import type { OrganizationStaffMember } from '@mj-biz-apps/common-ng';
import {
    BuildStaffOrderContribution,
    OrdersStaffContributor,
    QuotedStaffIDs,
    type StaffOrderRow,
} from './organization-staff-orders.contributor';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const staff: OrganizationStaffMember[] = [
    { PersonID: A, Name: 'Ana', Title: null, StartDate: null },
    { PersonID: B, Name: 'Ben', Title: null, StartDate: null },
    { PersonID: C, Name: 'Cy', Title: null, StartDate: null },
];
const order = (person: string, gross: number, balance: number, overdue: boolean, date: string): StaffOrderRow =>
    ({ BillToPersonID: person, TotalGross: gross, Balance: balance, IsOverdue: overdue, OrderDate: date });

describe('BuildStaffOrderContribution', () => {
    const orders = [
        order(A, 100, 0, false, '2025-01-10'),
        order(A.toLowerCase(), 250.4, 50, false, '2025-12-23'), // id case differs; balance due = open
        order(B, 40, 40, true, '2024-06-01'), // overdue = open and overdue
    ];
    const result = BuildStaffOrderContribution(staff, orders, [{ BeneficiaryPersonID: A }]);

    it('rolls up staff LTV, orders, open/overdue, active subs and last order', () => {
        expect(result.Figures).toEqual([
            { Label: 'Staff LTV', Value: '$390', Icon: 'fa-solid fa-sack-dollar', Detail: '2 of 3 staff have bought' },
            { Label: 'Staff orders', Value: 3, Icon: 'fa-solid fa-cart-shopping', Detail: '2 open · 1 overdue', Tone: 'warn' },
            { Label: 'Active subs', Value: 1, Icon: 'fa-solid fa-rotate' },
            { Label: 'Last staff order', Value: 'Dec 23, 2025', Icon: 'fa-solid fa-calendar-check' },
        ]);
    });

    it('gives every staff member Orders and LTV cells, muted zeros for people with no orders', () => {
        expect(result.Columns).toEqual([{ Key: 'orders', Header: 'Orders' }, { Key: 'ltv', Header: 'LTV' }]);
        expect(result.Cells.get(A)).toEqual({ orders: { Text: '2' }, ltv: { Text: '$350' } });
        expect(result.Cells.get(B)).toEqual({ orders: { Text: '1' }, ltv: { Text: '$40' } });
        expect(result.Cells.get(C)).toEqual({ orders: { Text: '0', Tone: 'muted' }, ltv: { Text: '$0', Tone: 'muted' } });
    });

    it('reads cleanly when nobody has bought anything', () => {
        const empty = BuildStaffOrderContribution(staff, [], []);
        expect(empty.Figures[0]).toEqual({ Label: 'Staff LTV', Value: '$0', Icon: 'fa-solid fa-sack-dollar', Detail: 'No staff purchases yet' });
        expect(empty.Figures[1].Tone).toBe('none');
        expect(empty.Figures[3].Value).toBe('—');
    });
});

describe('BuildStaffOrderContribution with the shapes the providers really send', () => {
    it('reads IsOverdue as 1/0 and picks the latest OrderDate from Date objects', () => {
        const rows: StaffOrderRow[] = [
            { BillToPersonID: A, TotalGross: 170, Balance: 170, IsOverdue: 1, OrderDate: new Date('2025-12-23T00:00:00.000Z') },
            { BillToPersonID: A, TotalGross: 150, Balance: 150, IsOverdue: 0, OrderDate: new Date('2026-07-06T00:00:00.000Z') },
            { BillToPersonID: B, TotalGross: 90, Balance: 0, IsOverdue: 0, OrderDate: new Date('2023-10-12T00:00:00.000Z') },
        ];
        const res = BuildStaffOrderContribution(staff, rows, []);
        expect(res.Figures[1].Detail).toBe('2 open · 1 overdue');
        expect(res.Figures[1].Tone).toBe('warn');
        expect(res.Figures[3].Value).toBe('Jul 6, 2026');
    });
});

describe('QuotedStaffIDs', () => {
    it('quotes UUIDs for an IN list and refuses anything else', () => {
        expect(QuotedStaffIDs(staff.slice(0, 2))).toBe(`'${A}','${B}'`);
        expect(() => QuotedStaffIDs([{ PersonID: "x' OR 1=1 --", Name: 'x', Title: null, StartDate: null }])).toThrow('is not valid');
    });
});

describe('OrdersStaffContributor.Load', () => {
    it('reads non-voided orders billed to staff and their active subscriptions in one batch', async () => {
        const runViews = vi.fn().mockResolvedValue([
            { Success: true, Results: [order(A, 10, 0, false, '2026-01-01')] },
            { Success: true, Results: [] },
        ]);
        const provider = { RunViews: runViews } as unknown as IMetadataProvider;
        const res = await new OrdersStaffContributor().Load({ OrganizationID: 'ORG', Staff: staff.slice(0, 1), Provider: provider });
        const [ordersParams, subsParams] = runViews.mock.calls[0][0];
        expect(ordersParams.EntityName).toBe('MJ_BizApps_Orders: Order Headers');
        expect(ordersParams.ExtraFilter).toBe(`BillToPersonID IN ('${A}') AND Status <> 'Voided'`);
        expect(subsParams.EntityName).toBe('MJ_BizApps_Orders: Subscriptions');
        expect(subsParams.ExtraFilter).toBe(`BeneficiaryPersonID IN ('${A}') AND Status = 'Active'`);
        expect(res.Figures[1].Value).toBe(1);
    });

    it('throws when the orders view fails, so the Staff section can name it', async () => {
        const provider = { RunViews: vi.fn().mockResolvedValue([{ Success: false, ErrorMessage: 'denied', Results: [] }, { Success: true, Results: [] }]) } as unknown as IMetadataProvider;
        await expect(new OrdersStaffContributor().Load({ OrganizationID: 'ORG', Staff: staff.slice(0, 1), Provider: provider })).rejects.toThrow('denied');
    });
});
