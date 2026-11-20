/**
 * The Customer A/R page's figures, tested as the plain functions they are.
 */
// The model reads the age rule from the aging bar's file, which is an Angular component.
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { GroupInstalmentsByOrder as GroupByOrder } from '../../panels/aging-bar.component';
import {
    BuildCustomers,
    BuildItemsExport,
    BuildSummaryExport,
    CompanyOptions,
    CompareItems,
    ExportDay,
    CanIssue,
    FilterByCompany,
    InvoicedDay,
    ItemFilterOptions,
    ItemStatus,
    LastReceived,
    MatchesItemFilter,
    MatchesPreset,
    NeighbourKey,
    UpdatedLabel,
    MatchesSearch,
    OpenItemsOf,
    PruneCompanyPicks,
    ReadPageState,
    Slug,
    SortCustomers,
    SortItems,
    SumCustomers,
    WritePageState,
    type ARSourceInstalment,
    type ARSourceOrder,
} from '../receivables/customer-ar-page.model';

const TODAY = '2026-11-19';
const ACME = 'aaaaaaaa-0000-0000-0000-000000000001';
const BOLT = 'bbbbbbbb-0000-0000-0000-000000000002';
const CO_ONE = 'c0000000-0000-0000-0000-000000000001';
const CO_TWO = 'c0000000-0000-0000-0000-000000000002';

function order(over: Partial<ARSourceOrder> & { ID: string }): ARSourceOrder {
    return {
        OrderNumber: `ORD-${over.ID}`,
        OrderDate: '2026-07-01',
        DueDate: '2026-07-01',
        TotalGross: 1000,
        Balance: 1000,
        CompanyID: CO_ONE,
        Company: 'Company One',
        BillToOrganizationID: ACME,
        BillToOrganization: 'Acme',
        BillToPersonID: null,
        BillToPerson: null,
        ...over,
    };
}

function row(orderID: string, n: number, due: string, balance: number, status: string, over: Partial<ARSourceInstalment> = {}): ARSourceInstalment {
    return {
        ID: `row-${orderID}-${n}`,
        OrderHeaderID: orderID,
        InstallmentNumber: n,
        DueDate: due,
        Amount: balance,
        AmountPaid: 0,
        Balance: balance,
        Status: status,
        DocumentNumber: status === 'Scheduled' ? null : `ORD-${orderID}-${n}`,
        InvoicedAt: status === 'Scheduled' ? null : '2026-11-04',
        ...over,
    };
}

describe('OpenItemsOf', () => {
    it('shows an order with no schedule as one invoice for the whole order', () => {
        const items = OpenItemsOf(order({ ID: 'A', TotalGross: 1000, Balance: 400, DueDate: '2026-11-09' }), undefined, TODAY);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ Label: 'Invoice', State: 'Invoiced', DocumentNumber: 'ORD-A', Amount: 1000, Paid: 600, Balance: 400, DaysPastDue: 10, Bucket: 'Days1To30' });
    });

    it('keeps an invoiced installment and a scheduled one apart, and does not age the scheduled one', () => {
        const items = OpenItemsOf(
            order({ ID: 'B', TotalGross: 300, Balance: 200 }),
            [row('B', 2, '2026-11-01', 100, 'Invoiced'), row('B', 3, '2026-11-15', 100, 'Scheduled')],
            TODAY,
        );
        expect(items.map((i) => [i.Label, i.State, i.DaysPastDue, i.Bucket, i.DocumentNumber])).toEqual([
            ['Installment 2', 'Invoiced', 18, 'Days1To30', 'ORD-B-2'],
            // Due four days ago and never issued: it has no invoice, so it is not late.
            ['Installment 3', 'Scheduled', 0, null, null],
        ]);
    });

    it('never lets installments account for more than the order still owes', () => {
        const items = OpenItemsOf(order({ ID: 'C', Balance: 150 }), [row('C', 1, '2026-12-01', 100, 'Invoiced'), row('C', 2, '2027-01-01', 100, 'Scheduled')], TODAY);
        expect(items.map((i) => i.Balance)).toEqual([100, 50]);
        expect(items.reduce((sum, i) => sum + i.Balance, 0)).toBe(150);
    });

    it('puts what no installment covers on the order date as its own invoiced line', () => {
        const items = OpenItemsOf(order({ ID: 'D', Balance: 250, DueDate: '2026-12-31' }), [row('D', 1, '2026-12-01', 100, 'Scheduled')], TODAY);
        // It has no invoice of its own to point at, so it carries no number and no invoice date.
        expect(items[1]).toMatchObject({ Label: 'Unscheduled balance', State: 'Invoiced', Balance: 150, Bucket: 'Current', DocumentNumber: null, InvoicedOn: null });
    });

    it('reads what was paid on a whole order, and does not call a credit or write-off a payment', () => {
        const [item] = OpenItemsOf(order({ ID: 'H', TotalGross: 1000, AmountPaid: 250, Balance: 400 }), undefined, TODAY);
        expect(item).toMatchObject({ Amount: 1000, Paid: 250, Balance: 400 });
    });

    it('shows a partly paid invoiced installment as the row has it', () => {
        const [item] = OpenItemsOf(order({ ID: 'I', Balance: 60 }), [row('I', 2, '2026-12-01', 60, 'Invoiced', { Amount: 100, AmountPaid: 40 })], TODAY);
        expect(item).toMatchObject({ Amount: 100, Paid: 40, Balance: 60, State: 'Invoiced' });
    });

    it('marks a scheduled installment whose date has arrived as ready to invoice, without aging it', () => {
        const items = OpenItemsOf(order({ ID: 'J', Balance: 300 }), [row('J', 2, '2026-11-15', 100, 'Scheduled'), row('J', 3, TODAY, 100, 'Scheduled'), row('J', 4, '2026-11-20', 100, 'Scheduled')], TODAY);
        expect(items.map((i) => [i.ReadyToInvoice, i.DaysPastDue, i.Bucket, ItemStatus(i)])).toEqual([
            [true, 0, null, 'Ready to invoice'],
            [true, 0, null, 'Ready to invoice'],
            [false, 0, null, 'Scheduled'],
        ]);
    });

    it('keys items by their schedule row, so two rows never collide', () => {
        const items = OpenItemsOf(order({ ID: 'K', Balance: 200 }), [row('K', 2, '2026-12-01', 100, 'Scheduled'), row('K', 3, '2027-01-01', 100, 'Scheduled')], TODAY);
        expect(new Set(items.map((i) => i.Key)).size).toBe(2);
        expect(items[0].ScheduleID).toBe('row-K-2');
    });

    it('yields nothing for a credit or a settled order', () => {
        expect(OpenItemsOf(order({ ID: 'E', Balance: -50 }), undefined, TODAY)).toEqual([]);
        expect(OpenItemsOf(order({ ID: 'F', Balance: 0 }), undefined, TODAY)).toEqual([]);
    });

    it('sums to the cent', () => {
        const rows = [row('G', 1, '2026-12-01', 16666.67, 'Invoiced'), row('G', 2, '2027-01-01', 16666.67, 'Scheduled'), row('G', 3, '2027-02-01', 16666.66, 'Scheduled')];
        const items = OpenItemsOf(order({ ID: 'G', TotalGross: 50000, Balance: 50000 }), rows, TODAY);
        expect(Math.round(items.reduce((sum, i) => sum + i.Balance, 0) * 100)).toBe(5000000);
    });
});

describe('BuildCustomers', () => {
    const orders = [
        // Acme: an installment order (one invoiced and late, two scheduled) and a whole-order invoice not yet due.
        order({ ID: 'A1', TotalGross: 400, Balance: 300 }),
        order({ ID: 'A2', TotalGross: 500, Balance: 500, DueDate: '2026-12-01', CompanyID: CO_TWO, Company: 'Company Two' }),
        // Bolt: a credit and an old unpaid invoice.
        order({ ID: 'B1', Balance: -75, BillToOrganizationID: BOLT, BillToOrganization: 'Bolt' }),
        order({ ID: 'B2', TotalGross: 200, Balance: 200, DueDate: '2026-08-01', BillToOrganizationID: BOLT, BillToOrganization: 'Bolt' }),
    ];
    const instalments = GroupByOrder([row('A1', 2, '2026-11-01', 100, 'Invoiced'), row('A1', 3, '2026-12-01', 100, 'Scheduled'), row('A1', 4, '2027-03-01', 100, 'Scheduled')]);
    const customers = BuildCustomers(orders, instalments, TODAY);
    const acme = customers.find((c) => c.Name === 'Acme')!;
    const bolt = customers.find((c) => c.Name === 'Bolt')!;

    it('counts only invoiced money as receivable and ages only that', () => {
        expect(acme.Owed).toBe(600);
        expect(acme.Scheduled).toBe(200);
        expect(acme.Buckets).toEqual({ Current: 500, Days1To30: 100, Days31To60: 0, Days61Plus: 0 });
        expect(acme.PastDue).toBe(100);
        expect(acme.OldestDaysPastDue).toBe(18);
    });

    it('receivable plus scheduled is what the orders carry', () => {
        expect(acme.Owed + acme.Scheduled).toBe(800);
    });

    it('finds the next date anything falls due and everything due on it, invoiced or scheduled', () => {
        // 12/1: the whole-order invoice (500) and a scheduled installment (100).
        expect(ExportDay(acme.NextDueDate)).toBe('2026-12-01');
        expect(acme.NextDueAmount).toBe(600);
    });

    it('has no next due date when everything is already past its date', () => {
        expect(bolt.NextDueDate).toBeNull();
        expect(bolt.NextDueAmount).toBe(0);
    });

    it('says when the next date is an invoice to come, not money due', () => {
        expect(acme.NextDueIsScheduled).toBe(true);
        const [invoicedOnly] = BuildCustomers([order({ ID: 'N', DueDate: '2026-12-01' })], new Map(), TODAY);
        expect(invoicedOnly.NextDueIsScheduled).toBe(false);
    });

    it('holds credit apart from what is owed, and does not count a credit as an open order', () => {
        expect(bolt).toMatchObject({ Owed: 200, Credit: 75, PastDue: 200, OrderCount: 1 });
        expect(bolt.Buckets.Days61Plus).toBe(200);
        expect(bolt.Credits).toEqual([{ ID: 'B1', OrderNumber: 'ORD-B1', Amount: 75 }]);
    });

    it('lists the largest receivable first, and invoiced items before scheduled ones', () => {
        expect(customers.map((c) => c.Name)).toEqual(['Acme', 'Bolt']);
        expect(acme.Items.map((i) => i.State)).toEqual(['Invoiced', 'Invoiced', 'Scheduled', 'Scheduled']);
        expect(acme.Items.slice().sort(CompareItems)).toEqual(acme.Items);
    });

    it('bills an employee order to the employer', () => {
        const [only] = BuildCustomers([order({ ID: 'P', BillToPersonID: 'p-1', BillToPerson: 'Pat' })], new Map(), TODAY);
        expect(only).toMatchObject({ Name: 'Acme', IsOrganization: true });
    });

    it('totals the customers it is given', () => {
        expect(SumCustomers(customers)).toEqual({
            Customers: 2,
            OwingCustomers: 2,
            ReadyToInvoice: 0,
            Owed: 800,
            PastDue: 300,
            PastDueCustomers: 2,
            Scheduled: 200,
            Credit: 75,
            Buckets: { Current: 500, Days1To30: 100, Days31To60: 0, Days61Plus: 200 },
        });
    });

    it('narrows by company before grouping', () => {
        const one = BuildCustomers(FilterByCompany(orders, [CO_TWO.toUpperCase()]), instalments, TODAY);
        expect(one).toHaveLength(1);
        expect(one[0]).toMatchObject({ Name: 'Acme', Owed: 500, Scheduled: 0 });
        expect(FilterByCompany(orders, [])).toHaveLength(orders.length);
    });

    it('offers the companies that have something open, with their order counts', () => {
        expect(CompanyOptions(orders)).toEqual([
            { Value: CO_ONE, Text: 'Company One', Count: 3 },
            { Value: CO_TWO, Text: 'Company Two', Count: 1 },
        ]);
        expect(PruneCompanyPicks([CO_TWO, 'gone'], CompanyOptions(orders))).toEqual([CO_TWO]);
    });

    it('searches names, order numbers and invoice numbers', () => {
        expect(MatchesSearch(acme, 'acm')).toBe(true);
        expect(MatchesSearch(acme, 'ord-a1-2')).toBe(true);
        expect(MatchesSearch(acme, 'ORD-A2')).toBe(true);
        expect(MatchesSearch(acme, 'bolt')).toBe(false);
        expect(MatchesSearch(acme, '   ')).toBe(true);
    });

    it('quick filters read the figures', () => {
        expect(MatchesPreset(acme, 'pastdue')).toBe(true);
        expect(MatchesPreset(acme, 'scheduled')).toBe(true);
        expect(MatchesPreset(acme, 'credit')).toBe(false);
        expect(MatchesPreset(bolt, 'credit')).toBe(true);
        expect(MatchesPreset(bolt, 'scheduled')).toBe(false);
    });

    it('sorts on any column', () => {
        expect(SortCustomers(customers, 'Name', false).map((c) => c.Name)).toEqual(['Acme', 'Bolt']);
        expect(SortCustomers(customers, 'Name', true).map((c) => c.Name)).toEqual(['Bolt', 'Acme']);
        expect(SortCustomers(customers, 'Days61Plus', true).map((c) => c.Name)).toEqual(['Bolt', 'Acme']);
        expect(SortCustomers(customers, 'PastDue', true).map((c) => c.Name)).toEqual(['Bolt', 'Acme']);
    });

    it('keeps a customer with no date last whichever way the date column runs', () => {
        expect(SortCustomers(customers, 'NextDueDate', false).map((c) => c.Name)).toEqual(['Acme', 'Bolt']);
        expect(SortCustomers(customers, 'NextDueDate', true).map((c) => c.Name)).toEqual(['Acme', 'Bolt']);
    });

    it('breaks ties by name A to Z in both directions', () => {
        const tied = BuildCustomers(
            ['Zed', 'Ada', 'Moe'].map((name, i) => order({ ID: `T${i}`, Balance: 100, DueDate: '2026-12-01', BillToOrganizationID: `org-${name}`, BillToOrganization: name })),
            new Map(),
            TODAY,
        );
        expect(SortCustomers(tied, 'Owed', true).map((c) => c.Name)).toEqual(['Ada', 'Moe', 'Zed']);
        expect(SortCustomers(tied, 'Owed', false).map((c) => c.Name)).toEqual(['Ada', 'Moe', 'Zed']);
    });

    it('counts only customers with a receivable as owing', () => {
        const mixed = BuildCustomers(
            [
                order({ ID: 'O1', BillToOrganizationID: 'org-owes', BillToOrganization: 'Owes' }),
                order({ ID: 'O2', Balance: -20, BillToOrganizationID: 'org-credit', BillToOrganization: 'Credit only' }),
                order({ ID: 'O3', Balance: 100, BillToOrganizationID: 'org-sched', BillToOrganization: 'Scheduled only' }),
            ],
            GroupByOrder([row('O3', 2, '2026-11-10', 100, 'Scheduled')]),
            TODAY,
        );
        expect(SumCustomers(mixed)).toMatchObject({ Customers: 3, OwingCustomers: 1, Scheduled: 100, ReadyToInvoice: 100, Credit: 20 });
    });

    it('exports the summary with the as-of day, and a blank where nothing is coming due', () => {
        const summary = BuildSummaryExport(customers, TODAY);
        // The as-of day, then the screen's order: A/R, past due, then the buckets.
        expect(summary.Columns.map((c) => c.name).slice(0, 8)).toEqual(['AsOf', 'Customer', 'Owed', 'PastDue', 'Current', 'Days1To30', 'Days31To60', 'Days61Plus']);
        expect(summary.Columns.find((c) => c.name === 'Owed')?.displayName).toBe('A/R');
        expect(summary.Rows[0]).toMatchObject({ AsOf: TODAY, Customer: 'Acme', Owed: 600, Days1To30: 100, Scheduled: 200, NextDue: '2026-12-01', NextDueAmount: 600 });
        expect(summary.Rows[1]).toMatchObject({ Customer: 'Bolt', NextDue: null, NextDueAmount: null, Credit: 75 });
    });

    it('exports one row per invoice or installment, with A/R and scheduled money in separate columns', () => {
        const items = BuildItemsExport(customers, TODAY);
        expect(items.Rows).toHaveLength(5);
        expect(items.Rows[0]).toMatchObject({
            AsOf: TODAY,
            Customer: 'Acme',
            Order: 'ORD-A1',
            Item: 'Installment 2',
            Status: 'Past due',
            InvoiceNumber: 'ORD-A1-2',
            InvoiceDate: '2026-11-04',
            DueDate: '2026-11-01',
            DaysPastDue: 18,
            Receivable: 100,
            Scheduled: null,
        });
        const scheduled = items.Rows.find((r) => r['Item'] === 'Installment 3')!;
        expect(scheduled).toMatchObject({ Status: 'Scheduled', InvoiceNumber: null, InvoiceDate: null, DaysPastDue: null, Receivable: null });
        expect(scheduled['Scheduled']).toBeGreaterThan(0);
        expect(items.Rows.map((r) => r['Status'])).toEqual(['Past due', 'Current', 'Scheduled', 'Scheduled', 'Past due']);
        // Summing the A/R column gives the receivable; scheduled money is never in it.
        const sum = (name: string): number => items.Rows.reduce((total, r) => total + (Number(r[name]) || 0), 0);
        expect(sum('Receivable')).toBe(customers.reduce((total, c) => total + c.Owed, 0));
        expect(sum('Scheduled')).toBe(customers.reduce((total, c) => total + c.Scheduled, 0));
    });

    it('gives Excel real dates to format and writes CSV dates as MM/DD/YYYY', () => {
        const excel = BuildItemsExport(customers, TODAY, 'excel');
        expect(excel.Columns.find((c) => c.name === 'DueDate')).toMatchObject({ dataType: 'dateonly', numberFormat: 'mm/dd/yyyy' });
        const csv = BuildItemsExport(customers, TODAY, 'csv');
        expect(csv.Columns.find((c) => c.name === 'DueDate')).toMatchObject({ dataType: 'string' });
        expect(csv.Rows[0]).toMatchObject({ AsOf: '11/19/2026', DueDate: '11/01/2026', InvoiceDate: '11/04/2026' });
        expect(BuildSummaryExport(customers, TODAY, 'csv').Rows[0]).toMatchObject({ AsOf: '11/19/2026', NextDue: '12/01/2026' });
    });
});

describe('working one customer', () => {
    const orders = [
        order({ ID: 'W1', Status: 'Confirmed', TotalGross: 400, Balance: 300, BillToPersonID: 'P-1', BillToPerson: 'Pat' }),
        order({ ID: 'W2', Status: 'Confirmed', TotalGross: 500, Balance: 500, DueDate: '2026-08-01', BillToPersonID: 'p-1', BillToPerson: 'Pat' }),
    ];
    const rows = [
        row('W1', 2, '2026-11-01', 100, 'Invoiced', { ID: 's-2' }),
        row('W1', 3, '2026-12-01', 100, 'Scheduled', { ID: 's-3' }),
        row('W1', 4, '2027-03-01', 100, 'Scheduled', { ID: 's-4' }),
    ];
    const [customer] = BuildCustomers(orders, GroupByOrder(rows), TODAY);
    const byLabel = (label: string) => customer.Items.find((i) => i.Label === label)!;

    it('sorts the items on a column, blanks last, and leaves their own order when no column is chosen', () => {
        const labels = (key: Parameters<typeof SortItems>[1], descending: boolean): string[] => SortItems(customer.Items, key, descending).map((i) => i.Label);
        expect(labels(null, false)).toEqual(customer.Items.map((i) => i.Label));
        expect(labels('Balance', true)[0]).toBe('Invoice');
        expect(labels('DueDate', false)).toEqual(['Invoice', 'Installment 2', 'Installment 3', 'Installment 4']);
        expect(labels('DueDate', true)).toEqual(['Installment 4', 'Installment 3', 'Installment 2', 'Invoice']);
        // The two scheduled rows have no invoice number: last in both directions.
        expect(labels('DocumentNumber', false).slice(2)).toEqual(['Installment 3', 'Installment 4']);
        expect(labels('DocumentNumber', true).slice(2)).toEqual(['Installment 3', 'Installment 4']);
        // Both invoiced items are past due: a tie keeps their own order, in either direction.
        expect(labels('Status', false)).toEqual(['Invoice', 'Installment 2', 'Installment 3', 'Installment 4']);
        expect(labels('Status', true)).toEqual(['Installment 3', 'Installment 4', 'Invoice', 'Installment 2']);
    });

    it('narrows the items to one figure from the table', () => {
        const count = (filter: Parameters<typeof MatchesItemFilter>[1]): number => customer.Items.filter((i) => MatchesItemFilter(i, filter)).length;
        expect(count('all')).toBe(4);
        expect(count('pastdue')).toBe(2);
        expect(count('Days1To30')).toBe(1);
        expect(count('Days61Plus')).toBe(1);
        expect(count('Current')).toBe(0);
        expect(count('scheduled')).toBe(2);
    });

    it('offers only the filters that would show something, with what they hold', () => {
        expect(ItemFilterOptions(customer.Items).map((o) => [o.Key, o.Count, o.Amount])).toEqual([
            ['all', 4, 800],
            ['pastdue', 2, 600],
            ['Days1To30', 1, 100],
            ['Days61Plus', 1, 500],
            ['scheduled', 2, 200],
        ]);
    });

    it('offers to issue a scheduled installment only once its date has arrived and the order is live', () => {
        const arrived = { ...byLabel('Installment 3'), DueDate: TODAY, ReadyToInvoice: true };
        expect(CanIssue(arrived)).toBe(true);
        // 12/1 has not arrived: issuing ahead of the date belongs to the Billing worklist.
        expect(CanIssue(byLabel('Installment 3'))).toBe(false);
        expect(CanIssue(byLabel('Installment 4'))).toBe(false);
        // Already invoiced, or a whole-order invoice: nothing to issue.
        expect(CanIssue(byLabel('Installment 2'))).toBe(false);
        expect(CanIssue(byLabel('Invoice'))).toBe(false);
        expect(CanIssue({ ...arrived, OrderStatus: 'Voided' })).toBe(false);
        expect(CanIssue({ ...arrived, ScheduleID: null })).toBe(false);
    });

    it('takes the last payment that brought money in, not a zero or failed one', () => {
        const payments = [
            { Status: 'Captured', Amount: 0, N: 'credit applied' },
            { Status: 'Failed', Amount: 500, N: 'failed' },
            { Status: 'Captured', Amount: 250, N: 'real' },
            { Status: 'Captured', Amount: 900, N: 'older' },
        ];
        expect(LastReceived(payments)?.N).toBe('real');
        expect(LastReceived([{ Status: 'Refunded', Amount: 10 }])).toBeNull();
    });

    it('issues a scheduled installment that is already past its date', () => {
        const [late] = BuildCustomers([order({ ID: 'L', Status: 'Confirmed', Balance: 100 })], GroupByOrder([row('L', 2, '2026-11-15', 100, 'Scheduled', { ID: 's' })]), TODAY);
        expect(CanIssue(late.Items[0], TODAY)).toBe(true);
    });

    it('steps to the next and previous customer and stops at the ends', () => {
        const list = [{ Key: 'a' }, { Key: 'b' }, { Key: 'c' }];
        expect(NeighbourKey(list, 'a', 1)).toBe('b');
        expect(NeighbourKey(list, 'b', -1)).toBe('a');
        expect(NeighbourKey(list, 'c', 1)).toBe('c');
        expect(NeighbourKey(list, 'a', -1)).toBe('a');
        expect(NeighbourKey(list, 'gone', 1)).toBe('a');
        expect(NeighbourKey([], 'a', 1)).toBeNull();
    });

    it('says how fresh the figures are', () => {
        const at = new Date('2026-11-19T15:00:00Z');
        expect(UpdatedLabel(null, at)).toBe('');
        expect(UpdatedLabel(at, new Date('2026-11-19T15:00:30Z'))).toBe('Updated just now');
        expect(UpdatedLabel(at, new Date('2026-11-19T15:01:00Z'))).toBe('Updated 1 minute ago');
        expect(UpdatedLabel(at, new Date('2026-11-19T15:12:00Z'))).toBe('Updated 12 minutes ago');
        expect(UpdatedLabel(at, new Date('2026-11-19T17:00:00Z'))).toMatch(/^Updated at /);
    });
});

describe('saved view', () => {
    it('round-trips and falls back field by field', () => {
        const store = new Map<string, string>();
        const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
        expect(ReadPageState(storage)).toBeNull();
        WritePageState(storage, { Companies: [CO_ONE], SortKey: 'Days61Plus', SortDescending: false });
        expect(ReadPageState(storage)).toEqual({ Companies: [CO_ONE], SortKey: 'Days61Plus', SortDescending: false });
        store.set('mjOrders.customerAR.view', JSON.stringify({ Companies: 'nope', SortKey: 'Bogus' }));
        expect(ReadPageState(storage)).toEqual({ Companies: [], SortKey: 'Owed', SortDescending: true });
        store.set('mjOrders.customerAR.view', '{not json');
        expect(ReadPageState(storage)).toBeNull();
        expect(ReadPageState(null)).toBeNull();
    });
});

describe('the day an installment was invoiced', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };
    beforeEach(() => {
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
        engine._loaded = true;
    });
    afterEach(() => {
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
    });

    it('is the business day of the instant, not its UTC day', () => {
        // 7 PM Central on the 4th is already the 5th in UTC.
        expect(InvoicedDay(new Date('2026-11-05T01:00:00Z'))).toBe('2026-11-04');
        expect(InvoicedDay('2026-11-05T01:00:00Z')).toBe('2026-11-04');
        expect(InvoicedDay(null)).toBeNull();
    });

    it('reaches the item and the export as that day', () => {
        const [item] = OpenItemsOf(order({ ID: 'Z', Balance: 100 }), [row('Z', 2, '2026-12-01', 100, 'Invoiced', { InvoicedAt: new Date('2026-11-05T01:00:00Z') })], TODAY);
        expect(item.InvoicedOn).toBe('2026-11-04');
        expect(ExportDay(item.InvoicedOn)).toBe('2026-11-04');
    });
});

describe('small helpers', () => {
    it('reads a day from a date or a string', () => {
        expect(ExportDay(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12-01');
        expect(ExportDay('2026-12-01T00:00:00.000Z')).toBe('2026-12-01');
        expect(ExportDay(null)).toBeNull();
    });

    it('makes a file-name fragment', () => {
        expect(Slug('Northwind Trading Co.')).toBe('northwind-trading-co');
        expect(Slug('acme.example')).toBe('acme-example');
    });
});
