/**
 * What the Receivables worklists share (company filter, date window, search, sort, saved view,
 * export), tested as the plain functions they are.
 */
import { describe, expect, it } from 'vitest';
import {
    AddDays,
    AddressKey,
    AdoptCompanyChoice,
    AdoptWindow,
    AsDay,
    BuildWorklistExport,
    COMPANY_ADDRESS_KEY,
    CUSTOM_WINDOW,
    CleanCompanyIDs,
    CompaniesToAddress,
    CompanyOptionsOf,
    DaysBetween,
    ExportFileName,
    FilterByCompanies,
    InDayRange,
    MatchesText,
    NextSort,
    RECEIVABLES_COMPANIES_KEY,
    ReadSharedCompanies,
    ReadWorklistState,
    ReconcileCompanies,
    ResolveWindow,
    RestoreSort,
    RestoreWindow,
    SameChoice,
    SameWindow,
    ShownSummary,
    SortRows,
    WindowFromAddress,
    WindowToAddress,
    WriteSharedCompanies,
    WriteWorklistState,
    type DayWindowOption,
    type WorklistExportField,
} from '../receivables/worklist-view.model';

interface Row {
    ID: string;
    CompanyID: string | null;
    CompanyName: string | null;
    Customer: string | null;
    Amount: number | null;
    Due: string | null;
}

const A = 'AAAAAAAA-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const row = (id: string, over: Partial<Row> = {}): Row => ({ ID: id, CompanyID: A, CompanyName: 'Alpha', Customer: 'Cust', Amount: 100, Due: '2026-03-10', ...over });
const company = { ID: (r: Row) => r.CompanyID, Name: (r: Row) => r.CompanyName };

const WINDOWS: DayWindowOption[] = [
    { Key: '30', Label: 'Next 30 days', FromOffset: null, ToOffset: 30 },
    { Key: 'late', Label: '1 to 30 days', FromOffset: -30, ToOffset: -1 },
    { Key: 'all', Label: 'All dates', FromOffset: null, ToOffset: null },
    { Key: CUSTOM_WINDOW, Label: 'Custom', FromOffset: null, ToOffset: null },
];

describe('company filter', () => {
    const rows = [row('1'), row('2', { CompanyID: B, CompanyName: 'Beta' }), row('3'), row('4', { CompanyID: null })];

    it('offers each company once, by name, with its row count, whatever the case of the ID', () => {
        expect(CompanyOptionsOf(rows, company)).toEqual([
            { Value: A.toLowerCase(), Text: 'Alpha', Count: 2 },
            { Value: B, Text: 'Beta', Count: 1 },
        ]);
    });

    it('lists every row when nothing is chosen, and only the chosen companies otherwise', () => {
        expect(FilterByCompanies(rows, [], company.ID)).toHaveLength(4);
        expect(FilterByCompanies(rows, [A.toLowerCase()], company.ID).map((r) => r.ID)).toEqual(['1', '3']);
    });

    it('offers only the companies that have rows', () => {
        const after = ReconcileCompanies([row('1')], company, []);
        expect(after.Options).toEqual([{ Value: A.toLowerCase(), Text: 'Alpha', Count: 1 }]);
        expect(after.Picks).toEqual([]);
    });

    it('leaves a chosen company with no rows here out of the picks, so the page lists every company and reads "All"', () => {
        const after = ReconcileCompanies([row('1')], company, [B]);
        expect(after.Picks).toEqual([]);
        expect(FilterByCompanies([row('1')], after.Picks, company.ID)).toHaveLength(1);
    });

    it('keeps the chosen companies that do have rows, each once, whatever the case', () => {
        const after = ReconcileCompanies(rows, company, [A, A.toLowerCase(), B, 'cccccccc-0000-0000-0000-000000000003']);
        expect(after.Picks).toEqual([A.toLowerCase(), B]);
    });
});

describe('search', () => {
    it('matches any value, ignoring case and blanks around the text', () => {
        expect(MatchesText(['Acme Corp', null, 'ORD-0012'], '  acme ')).toBe(true);
        expect(MatchesText(['Acme Corp', undefined, 12], '12')).toBe(true);
        expect(MatchesText(['Acme Corp'], 'zeta')).toBe(false);
    });

    it('matches every row when nothing is typed', () => {
        expect(MatchesText([null], '   ')).toBe(true);
    });
});

describe('date window', () => {
    const today = '2026-03-10';

    it('reads only real calendar days', () => {
        expect(AsDay('2026-03-10T05:00:00Z')).toBe('2026-03-10');
        expect(AsDay('2026-02-30')).toBeNull();
        expect(AsDay("2026-03-10' OR 1=1")).toBe('2026-03-10');
        expect(AsDay("x' OR 1=1")).toBeNull();
        expect(AsDay(null)).toBeNull();
    });

    it('adds and counts days across a month end', () => {
        expect(AddDays('2026-01-31', 1)).toBe('2026-02-01');
        expect(AddDays(today, -30)).toBe('2026-02-08');
        expect(DaysBetween(today, '2026-04-09')).toBe(30);
        expect(DaysBetween(today, '2026-03-01')).toBe(-9);
    });

    it('turns a choice into days counted from today', () => {
        expect(ResolveWindow({ Key: '30', From: null, To: null }, WINDOWS, today)).toEqual({ From: null, To: '2026-04-09' });
        expect(ResolveWindow({ Key: 'late', From: null, To: null }, WINDOWS, today)).toEqual({ From: '2026-02-08', To: '2026-03-09' });
        expect(ResolveWindow({ Key: 'all', From: null, To: null }, WINDOWS, today)).toEqual({ From: null, To: null });
    });

    it('takes custom days as typed, in order whichever way round, and ignores a bad one', () => {
        expect(ResolveWindow({ Key: CUSTOM_WINDOW, From: '2026-06-30', To: '2026-04-01' }, WINDOWS, today)).toEqual({ From: '2026-04-01', To: '2026-06-30' });
        expect(ResolveWindow({ Key: CUSTOM_WINDOW, From: 'soon', To: '2026-04-01' }, WINDOWS, today)).toEqual({ From: null, To: '2026-04-01' });
    });

    it('covers everything for a choice no longer offered', () => {
        expect(ResolveWindow({ Key: 'gone', From: null, To: null }, WINDOWS, today)).toEqual({ From: null, To: null });
    });

    it('includes both end days, and leaves a row with no day out of any range that has an end', () => {
        const range = { From: '2026-03-01', To: '2026-03-31' };
        expect(InDayRange('2026-03-01', range)).toBe(true);
        expect(InDayRange('2026-03-31', range)).toBe(true);
        expect(InDayRange('2026-04-01', range)).toBe(false);
        expect(InDayRange('2026-02-28', range)).toBe(false);
        expect(InDayRange(null, range)).toBe(false);
        expect(InDayRange(null, { From: null, To: null })).toBe(true);
    });
});

describe('sorting', () => {
    const rows = [row('1', { Customer: 'beta', Amount: 20, Due: '2026-03-10' }), row('2', { Customer: null, Amount: null, Due: null }), row('3', { Customer: 'Alpha', Amount: 100, Due: '2026-01-05' }), row('4', { Customer: 'alpha 10', Amount: 3, Due: '2026-01-05' })];
    const columns = [
        { Key: 'Customer' },
        { Key: 'Amount', Kind: 'money' },
        { Key: 'Due', Kind: 'date' },
        { Key: 'Twice', Kind: 'number', SortValue: (r: Row) => (r.Amount == null ? null : -r.Amount) },
    ];
    const ids = (sorted: Row[]): string => sorted.map((r) => r.ID).join('');

    it('orders numbers as numbers and text without regard to case', () => {
        expect(ids(SortRows(rows, columns, { Key: 'Amount', Descending: false }))).toBe('4132');
        expect(ids(SortRows(rows, columns, { Key: 'Customer', Descending: false }))).toBe('3412');
    });

    it('keeps rows with no value last in both directions', () => {
        expect(ids(SortRows(rows, columns, { Key: 'Amount', Descending: true }))).toBe('3142');
        expect(ids(SortRows(rows, columns, { Key: 'Due', Descending: true }))).toBe('1342');
    });

    it('keeps tied rows in the order they arrived', () => {
        expect(ids(SortRows(rows, columns, { Key: 'Due', Descending: false }))).toBe('3412');
    });

    it('sorts on a column\'s own value when it gives one', () => {
        expect(ids(SortRows(rows, columns, { Key: 'Twice', Descending: false }))).toBe('3142');
    });

    it('returns the rows as they arrived for no key or an unknown one, without changing the input', () => {
        expect(ids(SortRows(rows, columns, { Key: null, Descending: false }))).toBe('1234');
        expect(ids(SortRows(rows, columns, { Key: 'Nope', Descending: true }))).toBe('1234');
        expect(ids(rows)).toBe('1234');
    });

    it('cycles a header: first click, reversed, then back to the list\'s own order', () => {
        const first = NextSort({ Key: null, Descending: false }, 'Amount', columns);
        expect(first).toEqual({ Key: 'Amount', Descending: true });
        const second = NextSort(first, 'Amount', columns);
        expect(second).toEqual({ Key: 'Amount', Descending: false });
        expect(NextSort(second, 'Amount', columns)).toEqual({ Key: null, Descending: false });
        expect(NextSort(second, 'Customer', columns)).toEqual({ Key: 'Customer', Descending: false });
    });
});

describe('saved view', () => {
    const store = (): { data: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void } => {
        const data = new Map<string, string>();
        return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    };

    it('reads back what it wrote', () => {
        const s = store();
        const state = { Window: { Key: CUSTOM_WINDOW, From: '2026-04-01', To: null }, Sort: { Key: 'Amount', Descending: true } };
        WriteWorklistState(s, 'k', state);
        expect(ReadWorklistState(s, 'k')).toEqual(state);
    });

    it('falls back part by part on a malformed save, and to null on an unreadable one', () => {
        const s = store();
        s.setItem('k', JSON.stringify({ Window: { Key: 'custom', From: "x' OR 1=1", To: '2026-04-01' }, Sort: { Key: 9 } }));
        expect(ReadWorklistState(s, 'k')).toEqual({ Window: { Key: 'custom', From: null, To: '2026-04-01' }, Sort: { Key: null, Descending: false } });
        s.setItem('k', '{not json');
        expect(ReadWorklistState(s, 'k')).toBeNull();
        expect(ReadWorklistState(null, 'k')).toBeNull();
    });

    it('does not throw when storage refuses', () => {
        const refusing = { setItem: (): void => { throw new Error('quota'); } };
        expect(() => WriteWorklistState(refusing, 'k', { Window: null, Sort: { Key: null, Descending: false } })).not.toThrow();
    });

    it('restores only a window and a sort the page still offers', () => {
        const fallback = { Key: '30', From: null, To: null };
        expect(RestoreWindow({ Key: 'all', From: '2026-01-01', To: null }, WINDOWS, fallback)).toEqual({ Key: 'all', From: null, To: null });
        expect(RestoreWindow({ Key: 'gone', From: null, To: null }, WINDOWS, fallback)).toBe(fallback);
        expect(RestoreWindow({ Key: CUSTOM_WINDOW, From: null, To: null }, WINDOWS, fallback)).toBe(fallback);
        expect(RestoreWindow(null, WINDOWS, fallback)).toBe(fallback);
        expect(RestoreSort({ Key: 'Amount', Descending: true }, [{ Key: 'Amount' }])).toEqual({ Key: 'Amount', Descending: true });
        expect(RestoreSort({ Key: 'Removed', Descending: true }, [{ Key: 'Amount' }])).toEqual({ Key: null, Descending: false });
    });
});

describe('one company choice across Receivables, and the tab address', () => {
    const store = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } => {
        const data = new Map<string, string>();
        return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    };

    it('keeps only real IDs, lower case, each once', () => {
        expect(CleanCompanyIDs([A, A.toLowerCase(), `x') OR 1=1 --`, 7, '', ` ${B} `])).toEqual([A.toLowerCase(), B]);
    });

    it('saves and reads the choice under one key, and reads nothing from a bad save', () => {
        const s = store();
        WriteSharedCompanies(s, [A, 'not-an-id']);
        expect(ReadSharedCompanies(s)).toEqual([A.toLowerCase()]);
        s.setItem(RECEIVABLES_COMPANIES_KEY, '{not json');
        expect(ReadSharedCompanies(s)).toEqual([]);
        expect(ReadSharedCompanies(null)).toEqual([]);
    });

    it('writes the choice to the address as IDs, and removes the key when none is chosen', () => {
        expect(CompaniesToAddress([A, B])).toBe(`${A.toLowerCase()},${B}`);
        expect(CompaniesToAddress([])).toBeNull();
    });

    it('uses the saved choice while the address has never named a company, and writes nothing', () => {
        const s = store();
        WriteSharedCompanies(s, [A]);
        const key = new AddressKey(COMPANY_ADDRESS_KEY);
        expect(AdoptCompanyChoice(key, {}, s)).toEqual([A.toLowerCase()]);
        // Shown again later with the address still silent: the saved choice still applies.
        expect(AdoptCompanyChoice(key, { customer: 'x' }, s)).toEqual([A.toLowerCase()]);
        expect(ReadSharedCompanies(s)).toEqual([A.toLowerCase()]);
    });

    it('takes what the address states over what is saved, and saves it', () => {
        const s = store();
        WriteSharedCompanies(s, [A]);
        const key = new AddressKey(COMPANY_ADDRESS_KEY);
        expect(AdoptCompanyChoice(key, { [COMPANY_ADDRESS_KEY]: `${B},junk` }, s)).toEqual([B]);
        expect(ReadSharedCompanies(s)).toEqual([B]);
    });

    it('ignores a company value with no ID in it, and keeps the saved choice', () => {
        const s = store();
        WriteSharedCompanies(s, [A]);
        expect(AdoptCompanyChoice(new AddressKey(COMPANY_ADDRESS_KEY), { [COMPANY_ADDRESS_KEY]: 'not-an-id' }, s)).toEqual([A.toLowerCase()]);
        expect(ReadSharedCompanies(s)).toEqual([A.toLowerCase()]);
    });

    it('reads a key that was there and is gone as "no company": Back past the change, or cleared on another page', () => {
        const s = store();
        const key = new AddressKey(COMPANY_ADDRESS_KEY);
        AdoptCompanyChoice(key, { [COMPANY_ADDRESS_KEY]: B }, s);
        expect(AdoptCompanyChoice(key, {}, s)).toEqual([]);
        expect(ReadSharedCompanies(s)).toEqual([]);
    });

    it('treats a key this page wrote as seen, so Back to the address before it clears the choice', () => {
        const s = store();
        const key = new AddressKey(COMPANY_ADDRESS_KEY);
        expect(key.Write(CompaniesToAddress([A]))).toEqual({ [COMPANY_ADDRESS_KEY]: A.toLowerCase() });
        WriteSharedCompanies(s, [A]);
        expect(AdoptCompanyChoice(key, {}, s)).toEqual([]);
    });

    it('follows the address for a window: named, gone (the default), or never named (as it is)', () => {
        const key = new AddressKey('due');
        const current = { Key: 'all', From: null, To: null };
        const fallback = { Key: '30', From: null, To: null };
        expect(AdoptWindow(key, {}, WINDOWS, current, fallback)).toBe(current);
        expect(AdoptWindow(key, { due: 'late' }, WINDOWS, current, fallback)).toEqual({ Key: 'late', From: null, To: null });
        expect(AdoptWindow(key, {}, WINDOWS, current, fallback)).toBe(fallback);
        expect(AdoptWindow(key, { due: 'no-such-window' }, WINDOWS, current, fallback)).toBe(fallback);
    });

    it('compares choices as sets', () => {
        expect(SameChoice([A, B], [B, A.toLowerCase()])).toBe(true);
        expect(SameChoice([A], [A, B])).toBe(false);
        expect(SameChoice([], [])).toBe(true);
    });

    it('round-trips a window through the address, and refuses one the page does not offer', () => {
        expect(WindowToAddress({ Key: '30', From: null, To: null })).toBe('30');
        expect(WindowFromAddress('30', WINDOWS)).toEqual({ Key: '30', From: null, To: null });
        const custom = { Key: CUSTOM_WINDOW, From: '2026-04-01', To: null };
        expect(WindowToAddress(custom)).toBe('2026-04-01..');
        expect(WindowFromAddress('2026-04-01..', WINDOWS)).toEqual(custom);
        expect(WindowFromAddress('..', WINDOWS)).toBeNull();
        expect(WindowFromAddress("x' OR 1=1..", WINDOWS)).toBeNull();
        expect(WindowFromAddress('gone', WINDOWS)).toBeNull();
        expect(WindowFromAddress(CUSTOM_WINDOW, WINDOWS)).toBeNull();
        expect(WindowFromAddress(undefined, WINDOWS)).toBeNull();
    });

    it('compares windows by choice, and custom ones by their days', () => {
        expect(SameWindow({ Key: '30', From: null, To: null }, { Key: '30', From: '2026-01-01', To: null })).toBe(true);
        expect(SameWindow({ Key: CUSTOM_WINDOW, From: '2026-01-01', To: null }, { Key: CUSTOM_WINDOW, From: '2026-01-02', To: null })).toBe(false);
    });
});

describe('export', () => {
    const fields: WorklistExportField<Row>[] = [
        { Name: 'Customer', Label: 'Customer', Value: (r) => r.Customer },
        { Name: 'Amount', Label: 'Amount', Type: 'money', Value: (r) => r.Amount },
        { Name: 'Due', Label: 'Due date', Type: 'date', Value: (r) => r.Due },
    ];
    const rows = [row('1', { Customer: 'Acme', Amount: 1234.5, Due: '2026-03-10' }), row('2', { Customer: '', Amount: null, Due: null })];

    it('gives Excel real numbers and dates with their formats', () => {
        const file = BuildWorklistExport(fields, rows, 'excel');
        expect(file.Columns).toEqual([
            { name: 'Customer', displayName: 'Customer', dataType: 'string' },
            { name: 'Amount', displayName: 'Amount', dataType: 'number', numberFormat: '#,##0.00' },
            { name: 'Due', displayName: 'Due date', dataType: 'dateonly', numberFormat: 'mm/dd/yyyy' },
        ]);
        expect(file.Rows).toEqual([
            { Customer: 'Acme', Amount: 1234.5, Due: '2026-03-10' },
            { Customer: null, Amount: null, Due: null },
        ]);
    });

    it('writes CSV dates as MM/DD/YYYY text', () => {
        const file = BuildWorklistExport(fields, rows, 'csv');
        expect(file.Columns[2]).toEqual({ name: 'Due', displayName: 'Due date', dataType: 'string' });
        expect(file.Rows[0].Due).toBe('03/10/2026');
    });

    it('names the file for the list, the one company chosen, and the day', () => {
        const offered = CompanyOptionsOf([row('1', { CompanyName: 'Alpha & Sons, LLC' }), row('2', { CompanyID: B, CompanyName: 'Beta' })], company);
        expect(ExportFileName('billing-worklist', [A], offered, '2026-03-10')).toBe('billing-worklist-alpha-sons-llc-as-of-2026-03-10');
        expect(ExportFileName('billing-worklist', [A, B], offered, '2026-03-10')).toBe('billing-worklist-as-of-2026-03-10');
        expect(ExportFileName('billing-worklist', [], offered, null)).toBe('billing-worklist');
    });
});

describe('row count beside the filters', () => {
    it('says how many are listed, and of how many when filters hide some', () => {
        expect(ShownSummary(40, 40, 'installment')).toBe('40 installments');
        expect(ShownSummary(1, 1, 'installment')).toBe('1 installment');
        expect(ShownSummary(12, 40, 'installment')).toBe('12 of 40 installments shown');
        expect(ShownSummary(0, 0, 'order')).toBe('0 orders');
    });
});
