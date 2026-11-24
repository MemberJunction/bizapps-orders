/**
 * @fileoverview What the Receivables worklists share: the company filter, the date window, search,
 * column sorting, the saved view and the export.
 *
 * Billing worklist, Overdue worklist, Invoicing queue and Progress attestation each list rows a
 * person works through, and each needs the same five things done to that list. They are stated once
 * here, as plain functions over plain rows, so the four screens cannot drift apart and so the rules
 * can be tested without mounting a component.
 *
 * Nothing here reads or writes data. The pages load their rows from the worklist operations and
 * hand them in.
 *
 * @module @mj-biz-apps/orders-ng
 */

const lower = (value: string | null | undefined): string => (value ?? '').toLowerCase();

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void } | null | undefined;

/* ── Company filter ───────────────────────────────────────────────────────── */

/** A choice in the Company filter, with how many rows it has. Matches `MJOMultiSelectOption`. */
export interface WorklistCompanyOption {
    Value: string;
    Text: string;
    Count: number;
}

/** Reads one row's company. */
export interface CompanyReader<T> {
    ID: (row: T) => string | null | undefined;
    Name: (row: T) => string | null | undefined;
}

/** The companies that appear in the rows, by name, each with its row count. */
export function CompanyOptionsOf<T>(rows: ReadonlyArray<T>, company: CompanyReader<T>): WorklistCompanyOption[] {
    const byCompany = new Map<string, WorklistCompanyOption>();
    for (const row of rows) {
        const id = lower(company.ID(row));
        if (!id) continue;
        const option = byCompany.get(id);
        if (option) option.Count += 1;
        else byCompany.set(id, { Value: id, Text: company.Name(row)?.trim() || '(no company)', Count: 1 });
    }
    return [...byCompany.values()].sort((a, b) => a.Text.localeCompare(b.Text));
}

/** The rows of the chosen companies; every row when none is chosen. */
export function FilterByCompanies<T>(rows: ReadonlyArray<T>, picks: ReadonlyArray<string>, id: (row: T) => string | null | undefined): T[] {
    if (!picks.length) return rows.slice();
    const chosen = new Set(picks.map(lower));
    return rows.filter((row) => chosen.has(lower(id(row))));
}

/**
 * The Company filter's choices and picks after a load or a filter change.
 *
 * The filter offers only the companies that have rows on the page, so it never lists a company
 * there is nothing to show for. The choice itself is shared across Receivables and may name a
 * company with no rows here: that company is left out of this page's picks without being dropped
 * from the choice, so the page lists every company and its filter reads "All", and the pick comes
 * back when the company has rows again (a wider window, another page).
 *
 * @param choice - The company choice as chosen, shared across Receivables.
 */
export function ReconcileCompanies<T>(rows: ReadonlyArray<T>, company: CompanyReader<T>, choice: ReadonlyArray<string>): { Options: WorklistCompanyOption[]; Picks: string[] } {
    const options = CompanyOptionsOf(rows, company);
    const offered = new Set(options.map((o) => o.Value));
    return { Options: options, Picks: [...new Set(choice.map(lower))].filter((pick) => offered.has(pick)) };
}

/* ── One company choice across Receivables, and the tab address ───────────── */

/**
 * Where the company choice is kept between visits. One key for every Receivables page: a person
 * working one company's book should not have to pick it again on each screen.
 */
export const RECEIVABLES_COMPANIES_KEY = 'mjOrders.receivables.companies';

/** The tab-address key that carries the company choice, so a filtered view can be linked. */
export const COMPANY_ADDRESS_KEY = 'company';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Company IDs that are IDs, lower case, each once. An address or a saved value is typed text until it passes here. */
export function CleanCompanyIDs(values: ReadonlyArray<unknown>): string[] {
    const ids = values.filter((v): v is string => typeof v === 'string' && UUID.test(v.trim())).map((v) => v.trim().toLowerCase());
    return [...new Set(ids)];
}

/** The company choice saved for Receivables; none when nothing is saved or it cannot be read. */
export function ReadSharedCompanies(storage: ReadableStorage): string[] {
    try {
        const parsed: unknown = JSON.parse(storage?.getItem(RECEIVABLES_COMPANIES_KEY) ?? '[]');
        return Array.isArray(parsed) ? CleanCompanyIDs(parsed) : [];
    } catch {
        return [];
    }
}

export function WriteSharedCompanies(storage: WritableStorage, picks: ReadonlyArray<string>): void {
    try {
        storage?.setItem(RECEIVABLES_COMPANIES_KEY, JSON.stringify(CleanCompanyIDs(picks)));
    } catch {
        /* the choice simply does not persist */
    }
}

/** The company choice as its address value; null (key removed) when no company is chosen. */
export function CompaniesToAddress(picks: ReadonlyArray<string>): string | null {
    const ids = CleanCompanyIDs(picks);
    return ids.length ? ids.join(',') : null;
}

/**
 * One key of the tab's address, as one page has seen it.
 *
 * The address reaches a page every time the page is shown, and on Back, Forward or a link. A key
 * that is absent can mean two things, and they need different answers: the address has never said
 * anything about it (so what the page saved applies), or it did and no longer does (so the person
 * went Back past the change, or cleared it on another page, and the page must follow). The page
 * cannot tell these apart from one delivery, so this remembers whether the key has been present, or
 * written by this page, before.
 *
 * One consequence, accepted: a page opens on its saved choice without writing it to the address (a
 * write is a history entry), so Back past the FIRST change of a session lands on "none" or the
 * default, not on the saved choice that was showing.
 */
export class AddressKey {
    private seen = false;

    constructor(public readonly Name: string) {}

    /**
     * What the address says for this key: its value; `''` when it was there before and is gone;
     * `null` when it has never been there, which is no statement at all.
     */
    public Read(params: Record<string, string>): string | null {
        const value = params[this.Name];
        if (value !== undefined && value !== '') {
            this.seen = true;
            return value;
        }
        return this.seen ? '' : null;
    }

    /** The address change that sets this key (null removes it). From here on its absence is a statement. */
    public Write(value: string | null): Record<string, string | null> {
        this.seen = true;
        return { [this.Name]: value };
    }
}

/**
 * The company choice a page should show, given the tab's address and what is saved.
 *
 * What the address states wins, and is saved, so the next page opened agrees with it; that includes
 * the address stating "no company" after having named one. Only when the address has never named a
 * company does the saved choice apply, which is the first page of a session. Nothing is written to
 * the address here: a write is a history entry, and a page that made one on opening would put a
 * step between the person and the page they came from.
 */
export function AdoptCompanyChoice(key: AddressKey, params: Record<string, string>, storage: ReadableStorage & WritableStorage): string[] {
    const stated = key.Read(params);
    if (stated === null) return ReadSharedCompanies(storage);
    const picks = CleanCompanyIDs(stated.split(','));
    // A value with no company ID in it (a mangled link) states nothing: it must not wipe the saved choice.
    if (stated !== '' && !picks.length) return ReadSharedCompanies(storage);
    WriteSharedCompanies(storage, picks);
    return picks;
}

/**
 * The window a page should show, given what the address says for its key: the named window; the
 * page's default when the key was there and is gone; the window the page already has when the
 * address has never named one.
 */
export function AdoptWindow(key: AddressKey, params: Record<string, string>, options: ReadonlyArray<DayWindowOption>, current: DayWindow, fallback: DayWindow): DayWindow {
    const stated = key.Read(params);
    if (stated === null) return current;
    return WindowFromAddress(stated, options) ?? fallback;
}

/** Whether two company choices are the same set. */
export function SameChoice(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
    if (a.length !== b.length) return false;
    const set = new Set(a.map(lower));
    return b.every((id) => set.has(lower(id)));
}

/** A date window as its address value: the choice's key, or `from..to` for custom days. */
export function WindowToAddress(window: DayWindow): string {
    return window.Key === CUSTOM_WINDOW ? `${window.From ?? ''}..${window.To ?? ''}` : window.Key;
}

/** The window an address value names, when the page offers it; null for anything else. */
export function WindowFromAddress(value: string | undefined, options: ReadonlyArray<DayWindowOption>): DayWindow | null {
    if (!value) return null;
    if (value.includes('..')) {
        if (!options.some((o) => o.Key === CUSTOM_WINDOW)) return null;
        const [from, to] = value.split('..');
        const window = { Key: CUSTOM_WINDOW, From: AsDay(from), To: AsDay(to) };
        return window.From || window.To ? window : null;
    }
    return value !== CUSTOM_WINDOW && options.some((o) => o.Key === value) ? { Key: value, From: null, To: null } : null;
}

/** Whether two windows are the same choice. */
export function SameWindow(a: DayWindow, b: DayWindow): boolean {
    return a.Key === b.Key && (a.Key !== CUSTOM_WINDOW || (a.From === b.From && a.To === b.To));
}

/* ── Search ───────────────────────────────────────────────────────────────── */

/** Whether any of a row's searchable values contains what was typed. Blank text matches every row. */
export function MatchesText(values: ReadonlyArray<string | number | null | undefined>, text: string): boolean {
    const needle = text.trim().toLowerCase();
    if (!needle) return true;
    return values.some((value) => value != null && String(value).toLowerCase().includes(needle));
}

/* ── Date window ──────────────────────────────────────────────────────────── */

/** The key of the choice that takes its two days from the person. */
export const CUSTOM_WINDOW = 'custom';

/**
 * A choice in a date window picker. The two offsets are whole days from today (negative is the
 * past); null leaves that side open. The custom choice carries no offsets: its days are typed in.
 */
export interface DayWindowOption {
    Key: string;
    Label: string;
    FromOffset: number | null;
    ToOffset: number | null;
}

/** The window a page holds: which choice, and the two typed days when the choice is custom. */
export interface DayWindow {
    Key: string;
    From: string | null;
    To: string | null;
}

/** Two calendar days, `YYYY-MM-DD`, either side open. */
export interface DayRange {
    From: string | null;
    To: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` day, or null for anything else. */
export function AsDay(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const day = value.slice(0, 10);
    if (!ISO_DAY.test(day)) return null;
    const [y, m, d] = day.split('-').map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? day : null;
}

/** A day plus a number of days. */
export function AddDays(day: string, days: number): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from one day to another; negative when `to` is earlier. */
export function DaysBetween(from: string, to: string): number {
    const at = (day: string): number => {
        const [y, m, d] = day.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((at(to) - at(from)) / 86_400_000);
}

/**
 * The days a window covers as of today. A custom window uses its typed days, in order whichever
 * way round they were entered. A key no longer offered covers everything.
 */
export function ResolveWindow(window: DayWindow, options: ReadonlyArray<DayWindowOption>, today: string): DayRange {
    if (window.Key === CUSTOM_WINDOW) {
        const from = AsDay(window.From);
        const to = AsDay(window.To);
        return from && to && from > to ? { From: to, To: from } : { From: from, To: to };
    }
    const option = options.find((o) => o.Key === window.Key);
    if (!option) return { From: null, To: null };
    return {
        From: option.FromOffset == null ? null : AddDays(today, option.FromOffset),
        To: option.ToOffset == null ? null : AddDays(today, option.ToOffset),
    };
}

/** Whether a day falls in a range. A row with no day only belongs to a range open on both sides. */
export function InDayRange(day: string | null | undefined, range: DayRange): boolean {
    if (!range.From && !range.To) return true;
    const value = AsDay(day);
    if (!value) return false;
    if (range.From && value < range.From) return false;
    if (range.To && value > range.To) return false;
    return true;
}

/** Whether a range is open on both sides, and so narrows nothing. */
export function IsOpenRange(range: DayRange): boolean {
    return !range.From && !range.To;
}

/* ── Sorting ──────────────────────────────────────────────────────────────── */

/** What a sort needs from a column. `MJOColumn` satisfies it. */
export interface SortableColumn<T> {
    Key: string;
    Kind?: string;
    SortValue?: (row: T) => string | number | null | undefined;
}

/** The column a list is sorted on. A null key is the list's own order. */
export interface WorklistSort {
    Key: string | null;
    Descending: boolean;
}

const isBlank = (value: unknown): boolean => value === null || value === undefined || value === '';

function compareValues(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * The rows in a column's order. Rows with no value in that column go last in either direction, and
 * rows that tie keep the order they arrived in. A null key, or one no column has, returns the rows
 * as they arrived.
 */
export function SortRows<T>(rows: ReadonlyArray<T>, columns: ReadonlyArray<SortableColumn<T>>, sort: WorklistSort): T[] {
    const column = sort.Key ? columns.find((c) => c.Key === sort.Key) : null;
    if (!column) return rows.slice();
    const valueOf = (row: T): unknown => (column.SortValue ? column.SortValue(row) : (row as Record<string, unknown>)[column.Key]);
    const direction = sort.Descending ? -1 : 1;
    return rows
        .map((row) => ({ row, value: valueOf(row) }))
        .sort((a, b) => {
            const aBlank = isBlank(a.value);
            const bBlank = isBlank(b.value);
            if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
            return compareValues(a.value, b.value) * direction;
        })
        .map((entry) => entry.row);
}

/**
 * The sort after a header click. A new column starts largest first for amounts and counts, A to Z
 * or earliest first for the rest; the same column again reverses it; a third click returns the list
 * to its own order.
 */
export function NextSort<T>(current: WorklistSort, key: string, columns: ReadonlyArray<SortableColumn<T>>): WorklistSort {
    const kind = columns.find((c) => c.Key === key)?.Kind;
    const startsDescending = kind === 'money' || kind === 'number';
    if (current.Key !== key) return { Key: key, Descending: startsDescending };
    if (current.Descending === startsDescending) return { Key: key, Descending: !startsDescending };
    return { Key: null, Descending: false };
}

/* ── Saved view ───────────────────────────────────────────────────────────── */

/** What one worklist remembers between visits, per browser. The company choice is kept apart, shared by every Receivables page. */
export interface WorklistViewState {
    Window: DayWindow | null;
    Sort: WorklistSort;
}

/**
 * The saved view, or null when there is none or it cannot be read. Each part falls back on its own,
 * so one malformed field does not discard the rest. The page still checks the window key and the
 * sort key against what it offers today.
 */
export function ReadWorklistState(storage: ReadableStorage, key: string): WorklistViewState | null {
    try {
        const raw = storage?.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<WorklistViewState> | null;
        if (!parsed || typeof parsed !== 'object') return null;
        const w = parsed.Window;
        const window = w && typeof w === 'object' && typeof w.Key === 'string' && w.Key ? { Key: w.Key, From: AsDay(w.From), To: AsDay(w.To) } : null;
        const s = parsed.Sort;
        const sort = s && typeof s === 'object' && typeof s.Key === 'string' && s.Key ? { Key: s.Key, Descending: s.Descending === true } : { Key: null, Descending: false };
        return { Window: window, Sort: sort };
    } catch {
        return null;
    }
}

/** Save the view. Storage that is missing or refuses is not an error: the page starts fresh next time. */
export function WriteWorklistState(storage: WritableStorage, key: string, state: WorklistViewState): void {
    try {
        storage?.setItem(key, JSON.stringify(state));
    } catch {
        /* the view simply does not persist */
    }
}

/** A saved window the page still offers, else the page's default. */
export function RestoreWindow(saved: DayWindow | null | undefined, options: ReadonlyArray<DayWindowOption>, fallback: DayWindow): DayWindow {
    if (!saved) return fallback;
    if (saved.Key === CUSTOM_WINDOW) return options.some((o) => o.Key === CUSTOM_WINDOW) && (saved.From || saved.To) ? saved : fallback;
    return options.some((o) => o.Key === saved.Key) ? { Key: saved.Key, From: null, To: null } : fallback;
}

/** A saved sort on a column the page still has, else the list's own order. */
export function RestoreSort<T>(saved: WorklistSort | null | undefined, columns: ReadonlyArray<SortableColumn<T>>): WorklistSort {
    return saved?.Key && columns.some((c) => c.Key === saved.Key) ? saved : { Key: null, Descending: false };
}

/* ── Export ───────────────────────────────────────────────────────────────── */

/** One column of a worklist export: its heading, how the value is typed, and where it comes from. */
export interface WorklistExportField<T> {
    Name: string;
    Label: string;
    Type?: 'text' | 'money' | 'number' | 'date';
    Value: (row: T) => string | number | null | undefined;
}

/** A column as MJ's export service takes it. Matches its `ExportColumn`. */
export interface WorklistExportColumn {
    name: string;
    displayName: string;
    dataType: 'string' | 'number' | 'dateonly';
    numberFormat?: string;
}

export type WorklistExportRow = Record<string, string | number | null>;
export type WorklistExportFormat = 'excel' | 'csv';

/** Everything the export service needs for one file. */
export interface WorklistExportFile {
    FileName: string;
    Columns: WorklistExportColumn[];
    Rows: WorklistExportRow[];
}

const MONEY_FORMAT = '#,##0.00';
const DATE_FORMAT = 'mm/dd/yyyy';

function exportColumn<T>(field: WorklistExportField<T>, format: WorklistExportFormat): WorklistExportColumn {
    switch (field.Type) {
        case 'money':
            return { name: field.Name, displayName: field.Label, dataType: 'number', numberFormat: MONEY_FORMAT };
        case 'number':
            return { name: field.Name, displayName: field.Label, dataType: 'number' };
        case 'date':
            // Excel takes a real date and shows it MM/DD/YYYY; CSV has no formats, so the text is written that way.
            return format === 'excel'
                ? { name: field.Name, displayName: field.Label, dataType: 'dateonly', numberFormat: DATE_FORMAT }
                : { name: field.Name, displayName: field.Label, dataType: 'string' };
        default:
            return { name: field.Name, displayName: field.Label, dataType: 'string' };
    }
}

function exportCell<T>(field: WorklistExportField<T>, row: T, format: WorklistExportFormat): string | number | null {
    const value = field.Value(row);
    if (value === null || value === undefined || value === '') return null;
    if (field.Type === 'date') {
        const day = AsDay(String(value));
        if (!day || format === 'excel') return day;
        return `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`;
    }
    if (field.Type === 'money' || field.Type === 'number') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return String(value);
}

/** The rows listed, as the columns and cells of an export, in the order they are on screen. */
export function BuildWorklistExport<T>(
    fields: ReadonlyArray<WorklistExportField<T>>,
    rows: ReadonlyArray<T>,
    format: WorklistExportFormat,
): { Columns: WorklistExportColumn[]; Rows: WorklistExportRow[] } {
    return {
        Columns: fields.map((field) => exportColumn(field, format)),
        Rows: rows.map((row) => Object.fromEntries(fields.map((field) => [field.Name, exportCell(field, row, format)]))),
    };
}

/** A file-name-safe form of a name: lower case, words joined by hyphens. */
export function FileSlug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** `billing-worklist-acme-as-of-2026-11-24`: the list, the one company when one is chosen, and the day. */
export function ExportFileName(base: string, picks: ReadonlyArray<string>, offered: ReadonlyArray<WorklistCompanyOption>, today: string | null): string {
    const only = picks.length === 1 ? offered.find((o) => o.Value === lower(picks[0]))?.Text : null;
    return [base, only ? FileSlug(only) : null, today ? `as-of-${today}` : null].filter(Boolean).join('-');
}

/** "12 of 40 shown" when filters hide rows, else "40 installments". */
export function ShownSummary(shown: number, total: number, noun: string, plural = `${noun}s`): string {
    const word = (n: number): string => (n === 1 ? noun : plural);
    return shown === total ? `${total} ${word(total)}` : `${shown} of ${total} ${word(total)} shown`;
}
