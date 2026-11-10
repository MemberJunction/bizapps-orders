/**
 * @fileoverview The Renewals page's decisions, as functions: which rows a preset shows, what a
 * search matches, which rows may have a renewal placed, how a state and a price read, and what the
 * confirmation says before orders are placed. Plain data in, plain data out, so each is testable
 * without Angular and the page stays a thin binding over them.
 *
 * @module @mj-biz-apps/orders-ng
 */
import type { OrdersChangeSubscriptionProductOutput, OrdersSetRenewalSettingsOutput, RenewalCandidate, RenewalWorklistRow, RenewalWorklistState } from '@mj-biz-apps/orders-entities';
import { FormatDate, FormatMoney } from '../../panels/money-format';

/** Every day on the Renewals page is written MM/DD/YYYY: finance reads this list, and that is how finance writes a date. */
export const RENEWALS_DATE = { Numeric: true } as const;

/** The quick filters above the table. */
export type RenewalsPreset = 'all' | 'auto' | 'manual' | 'placed' | 'attention';

/** How far ahead the page can look. The first entry is the default: finance's lead time is 90 days. */
export const RENEWAL_WINDOWS: ReadonlyArray<{ Days: number; Label: string }> = [
    { Days: 90, Label: 'Next 90 days' },
    { Days: 30, Label: 'Next 30 days' },
    { Days: 60, Label: 'Next 60 days' },
    { Days: 180, Label: 'Next 6 months' },
    { Days: 365, Label: 'Next 12 months' },
];

/** The states the scheduled pass will still act on. */
const AUTO_STATES: ReadonlyArray<RenewalWorklistState> = ['DueNow', 'Scheduled'];
/** The states where a person has to place the renewal, or let it end. */
const MANUAL_STATES: ReadonlyArray<RenewalWorklistState> = ['WillEnd', 'Lapsed'];
/** The states where a renewal order already exists. */
const PLACED_STATES: ReadonlyArray<RenewalWorklistState> = ['Renewed', 'RenewalPending'];

/** Whether a row belongs to a preset. `all` is everything in the window. */
export function MatchesPreset(row: RenewalWorklistRow, preset: RenewalsPreset): boolean {
    switch (preset) {
        case 'auto':
            return AUTO_STATES.includes(row.State);
        case 'manual':
            return MANUAL_STATES.includes(row.State);
        case 'placed':
            return PLACED_STATES.includes(row.State);
        case 'attention':
            return NeedsAttention(row);
        default:
            return true;
    }
}

/**
 * A row somebody should look at before the pass does: a renewal that could not be priced, an
 * expiring term one day long (a data defect: the pass would renew from the wrong day and skip the
 * increase), a term that lapsed with auto-renew on (the pass will not revive it), or a draft
 * renewal nobody confirmed for a term that has already ended.
 */
export function NeedsAttention(row: RenewalWorklistRow): boolean {
    if (row.ProjectionProblem) return true;
    if (OneDayTerm(row)) return true;
    if (row.State === 'Lapsed') return true;
    if (row.State === 'RenewalPending' && row.DaysUntilEnd < 0) return true;
    return false;
}

/**
 * An expiring term that starts and ends on the same day. The cutover load split a line whose legacy
 * dates ran a year inclusive into a twelve-month term plus this one-day remainder, so the renewal
 * would start the day AFTER the anniversary and never cross one: the increase is skipped and the new
 * term sits a day off for good. Flagged so the data gets fixed before the pass renews from it.
 */
export function OneDayTerm(row: RenewalWorklistRow): boolean {
    return !!row.TermStartDate && row.TermStartDate === row.TermEndDate;
}

/** The muted warning under the Ends column, or null. */
export function TermWarning(row: RenewalWorklistRow): string | null {
    return OneDayTerm(row) ? 'one-day term: check the data' : null;
}

/** Whether a renewal order may be placed for this row from the page. Mirrors the operation's own refusals. */
export function CanPlaceRenewal(row: RenewalWorklistRow): boolean {
    if (row.RenewalOrderID || row.ProviderBilled) return false;
    return AUTO_STATES.includes(row.State) || MANUAL_STATES.includes(row.State);
}

/** Case-insensitive match over the things people search a renewal list by. */
export function MatchesSearch(row: RenewalWorklistRow, text: string): boolean {
    const needle = text.trim().toLowerCase();
    if (!needle) return true;
    const hay = [
        row.SubscriptionNumber,
        row.ContactName,
        row.AccountName,
        row.CompanyName,
        row.ProductName,
        row.ProjectedProductName,
        row.CurrentOrderNumber,
        row.RenewalOrderNumber,
    ];
    return hay.some((v) => !!v && String(v).toLowerCase().includes(needle));
}

/** The state as a short label for the chip. */
export function RenewalStateLabel(state: RenewalWorklistState): string {
    switch (state) {
        case 'Renewed':
            return 'Renewed';
        case 'RenewalPending':
            return 'Draft placed';
        case 'DueNow':
            return 'Due for renewal';
        case 'Scheduled':
            return 'Auto-renews';
        case 'Lapsed':
            return 'Lapsed';
        case 'WillEnd':
            return 'Will end';
        case 'ProviderBilled':
            return 'Gateway billed';
        case 'Inactive':
            return 'Not renewable';
        default:
            return String(state);
    }
}

/** The chip variant for a state: success for settled, warning for "somebody should look", outline for the rest. */
export function RenewalStateChipClass(state: RenewalWorklistState): string {
    switch (state) {
        case 'Renewed':
            return 'mjo-chip--success';
        case 'RenewalPending':
        case 'Scheduled':
        case 'DueNow':
            return 'mjo-chip--info';
        case 'WillEnd':
        case 'Lapsed':
            return 'mjo-chip--warning';
        default:
            return 'mjo-chip--outline';
    }
}

/** The muted line under the state chip: when the pass will act, or why nothing will. */
export function RenewalStateNote(row: RenewalWorklistRow): string | null {
    switch (row.State) {
        case 'Scheduled':
            return row.AutoRenewOn ? `on ${FormatDate(row.AutoRenewOn, RENEWALS_DATE)}` : null;
        case 'DueNow':
            return 'in the lead window';
        case 'Renewed':
            return row.RenewalTermEnd ? `through ${FormatDate(row.RenewalTermEnd, RENEWALS_DATE)}` : null;
        case 'RenewalPending':
            return 'awaiting confirmation';
        case 'WillEnd':
            return 'auto-renew is off';
        case 'Lapsed':
            return 'ended before the pass';
        case 'Inactive':
            return row.Status;
        default:
            return null;
    }
}

/** "in 32d", "today", "ended 3d ago". */
export function EndsNote(daysUntilEnd: number): string {
    if (daysUntilEnd < 0) return `ended ${-daysUntilEnd}d ago`;
    if (daysUntilEnd === 0) return 'ends today';
    return `in ${daysUntilEnd}d`;
}

/** The renewal price column: the placed order's price when there is one, else the projection, else a dash. */
export function RenewalPriceDisplay(row: RenewalWorklistRow): string {
    if (row.RenewalOrderID && row.RenewalUnitPrice != null) return FormatMoney(row.RenewalUnitPrice);
    if (row.ProjectedUnitPrice != null) return FormatMoney(row.ProjectedUnitPrice);
    return '—';
}

/**
 * The percentage a placed renewal moved from the current term's unit price: `5` for 5% up, `-3`
 * for 3% down, `0` for the same price. Null when either price is missing or the current price is
 * zero (a free term has no base to move from). Two decimals.
 */
export function PriceChangePercent(current: number | null | undefined, renewal: number | null | undefined): number | null {
    if (current == null || renewal == null || !(current > 0)) return null;
    return Math.round((renewal / current - 1) * 10000) / 100;
}

/**
 * The increase, under the renewal price, so the two read together. For a projection: the increase
 * the pricer applied and where it was set ("projected · +5% (subscription)"), or why the price
 * moved without one ("successor list", "discount lapses", "no increase"). For a placed renewal:
 * how far the order's price actually moved from the current term ("+5% vs current", "same price").
 * Seats follow when there is more than one.
 */
export function RenewalPriceNote(row: RenewalWorklistRow): string | null {
    const parts: string[] = [];
    if (row.RenewalOrderID) {
        const change = PriceChangePercent(row.CurrentUnitPrice, row.RenewalUnitPrice);
        if (change != null) parts.push(change === 0 ? 'same price' : `${change > 0 ? '+' : '−'}${TrimPercent(Math.abs(change))}% vs current`);
        if (row.RenewalQuantity != null && row.RenewalQuantity !== 1) parts.push(`× ${row.RenewalQuantity}`);
        return parts.length ? parts.join(' · ') : null;
    }
    if (row.ProjectionProblem) return 'could not be priced';
    if (row.ProjectedUnitPrice == null) return null;
    parts.push('projected');
    if (row.ProjectedIncreasePercent && row.ProjectedIncreasePercent > 0) {
        parts.push(`+${TrimPercent(row.ProjectedIncreasePercent)}% (${String(row.ProjectedIncreaseSource ?? '').toLowerCase()})`);
    } else if (row.ProjectedIncreaseApplied === false && row.ProjectedIncreaseSetPercent) {
        parts.push(`${TrimPercent(row.ProjectedIncreaseSetPercent)}% set, not applied: no anniversary this term`);
    } else if (row.ProjectedBasePriceSource === 'SuccessorList') {
        parts.push('successor list');
    } else if (row.ProjectedBasePriceSource === 'PriorList') {
        parts.push('discount lapses');
    } else {
        parts.push('no increase');
    }
    if (row.ProjectedQuantity != null && row.ProjectedQuantity !== 1) parts.push(`× ${row.ProjectedQuantity}`);
    return parts.join(' · ');
}

/* ── Facets: Company and Product ───────────────────────────────────────────── */

/** The two dimensions a person narrows the list by. Each holds IDs; empty means "all". */
export interface RenewalsFacets {
    Companies: string[];
    Products: string[];
}

export const NO_FACETS: RenewalsFacets = { Companies: [], Products: [] };

export type RenewalsFacetKey = 'Company' | 'Product';

/** One choice in a facet dropdown, with how many rows carry it. */
export interface RenewalsFacetOption {
    Value: string;
    Text: string;
    Count: number;
}

/**
 * The choices for one facet, drawn from the rows in the window: only the companies (or products)
 * that actually have a subscription ending, sorted by name. `countRows` are the rows the count is
 * taken over, normally the rows the OTHER facet leaves, so a product's count answers "how many of
 * these, for the companies I picked", and drops to 0 rather than disappearing when none remain.
 */
export function FacetOptions(
    rows: ReadonlyArray<RenewalWorklistRow>,
    key: RenewalsFacetKey,
    countRows: ReadonlyArray<RenewalWorklistRow> = rows,
): RenewalsFacetOption[] {
    const id = (r: RenewalWorklistRow): string => (key === 'Company' ? r.CompanyID : r.ProductID);
    const name = (r: RenewalWorklistRow): string => (key === 'Company' ? r.CompanyName : r.ProductName) || '(none)';
    const counts = new Map<string, number>();
    for (const r of countRows) counts.set(id(r), (counts.get(id(r)) ?? 0) + 1);
    const seen = new Map<string, RenewalsFacetOption>();
    for (const r of rows) {
        if (!seen.has(id(r))) seen.set(id(r), { Value: id(r), Text: name(r), Count: counts.get(id(r)) ?? 0 });
    }
    return [...seen.values()].sort((a, b) => a.Text.localeCompare(b.Text, undefined, { sensitivity: 'base' }) || (a.Value < b.Value ? -1 : 1));
}

/** Whether a row survives the facets. An empty facet keeps everything. */
export function MatchesFacets(row: RenewalWorklistRow, facets: RenewalsFacets): boolean {
    if (facets.Companies.length && !facets.Companies.includes(row.CompanyID)) return false;
    if (facets.Products.length && !facets.Products.includes(row.ProductID)) return false;
    return true;
}

/** An applied-filter chip: the dimension, the name, and a key the page can remove it by. */
export interface RenewalsAppliedFacet {
    key: string;
    label: string;
    value: string;
}

/** The "Filtered by" chips for the current facets, one per ticked company or product. */
export function AppliedFacets(
    facets: RenewalsFacets,
    companies: ReadonlyArray<RenewalsFacetOption>,
    products: ReadonlyArray<RenewalsFacetOption>,
): RenewalsAppliedFacet[] {
    const chip = (key: RenewalsFacetKey, id: string, options: ReadonlyArray<RenewalsFacetOption>): RenewalsAppliedFacet => ({
        key: `${key}:${id}`,
        label: key,
        value: options.find((o) => o.Value === id)?.Text ?? id,
    });
    return [...facets.Companies.map((id) => chip('Company', id, companies)), ...facets.Products.map((id) => chip('Product', id, products))];
}

/** The facets with any product tick that the offered options no longer include removed. Same object when nothing changes. */
export function PruneProducts(facets: RenewalsFacets, offered: ReadonlyArray<RenewalsFacetOption>): RenewalsFacets {
    const ids = new Set(offered.map((o) => o.Value));
    if (facets.Products.every((p) => ids.has(p))) return facets;
    return { ...facets, Products: facets.Products.filter((p) => ids.has(p)) };
}

/** The facets without the one a chip's key names. An unknown key changes nothing. */
export function RemoveFacet(facets: RenewalsFacets, chipKey: string): RenewalsFacets {
    const at = chipKey.indexOf(':');
    const key = chipKey.slice(0, at);
    const id = chipKey.slice(at + 1);
    if (key === 'Company') return { ...facets, Companies: facets.Companies.filter((v) => v !== id) };
    if (key === 'Product') return { ...facets, Products: facets.Products.filter((v) => v !== id) };
    return facets;
}

/* ── The subscription's own increase ───────────────────────────────────────── */

/**
 * What the subscription itself says about its increase, for the side panel: its own rate when one
 * is set, else what it inherits (known only where a projection ran), else that nothing is set.
 */
export function SubscriptionIncreaseNote(row: RenewalWorklistRow): string {
    if (row.SubscriptionIncreasePercent != null) return `${TrimPercent(row.SubscriptionIncreasePercent)}% · set on this subscription`;
    const source = row.ProjectedIncreaseSetSource ?? row.ProjectedIncreaseSource;
    const percent = row.ProjectedIncreaseSetPercent ?? row.ProjectedIncreasePercent;
    if (source && source !== 'None' && source !== 'Subscription' && percent) {
        return `Not set · inherits ${TrimPercent(percent)}% from the ${source.toLowerCase()}`;
    }
    return 'Not set · inherits from the product, its category or the company (none set)';
}

/**
 * The rate to prefill the update dialog with: the one rate every chosen subscription already holds
 * (null when they all inherit), or `undefined` when they differ and the field should start empty.
 */
export function SharedIncrease(rows: ReadonlyArray<RenewalWorklistRow>): number | null | undefined {
    if (!rows.length) return undefined;
    const first = rows[0].SubscriptionIncreasePercent ?? null;
    return rows.every((r) => (r.SubscriptionIncreasePercent ?? null) === first) ? first : undefined;
}

/** What the page says after `Orders.SetRenewalSettings` ran. */
export function SettingsUpdateText(output: OrdersSetRenewalSettingsOutput): { Tone: 'success' | 'warning' | 'error'; Text: string } {
    const failed = output.Changes.filter((c) => c.Error);
    const detail = failed.length
        ? ` ${failed
              .slice(0, 3)
              .map((c) => `${c.SubscriptionNumber ?? c.SubscriptionID}: ${c.Error}`)
              .join('; ')}${failed.length > 3 ? `; and ${failed.length - 3} more` : ''}.`
        : '';
    const tail = output.Updated ? ' No order was changed; the next renewal each one places follows the new settings.' : '';
    return {
        Tone: !output.Success ? 'error' : failed.length ? 'warning' : 'success',
        Text: `${output.Message ?? ''}${detail}${tail}`.trim(),
    };
}

/* ── Changing the product ──────────────────────────────────────────────────── */

/** "Betty (converted pricing) ×3, rasa.io Newsletter ×1": what the chosen rows are on now, most common first. */
export function CurrentProductsNote(rows: ReadonlyArray<RenewalWorklistRow>): string {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.ProductName, (counts.get(r.ProductName) ?? 0) + 1);
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, n]) => (rows.length > 1 ? `${name} ×${n}` : name))
        .join(', ');
}

/** What the page says after `Orders.ChangeSubscriptionProduct` ran. */
export function ProductChangeText(output: OrdersChangeSubscriptionProductOutput): { Tone: 'success' | 'warning' | 'error'; Text: string } {
    const failed = output.Changes.filter((c) => c.Error);
    const warned = output.Changes.filter((c) => c.Changed && c.Warning);
    const list = (items: Array<{ SubscriptionNumber: string | null; SubscriptionID: string }>, text: (c: { SubscriptionNumber: string | null; SubscriptionID: string }) => string) =>
        `${items
            .slice(0, 3)
            .map(text)
            .join('; ')}${items.length > 3 ? `; and ${items.length - 3} more` : ''}.`;
    const detail = [
        failed.length ? ` ${list(failed, (c) => `${c.SubscriptionNumber ?? c.SubscriptionID}: ${(c as { Error?: string }).Error}`)}` : '',
        warned.length ? ` ${list(warned, (c) => `${c.SubscriptionNumber ?? c.SubscriptionID}: ${(c as { Warning?: string }).Warning}`)}` : '',
    ].join('');
    const tail = output.Updated ? ' Booked orders and deals are unchanged; the next renewal uses the new product at the current price plus increase.' : '';
    return {
        Tone: !output.Success ? 'error' : failed.length ? 'warning' : 'success',
        Text: `${output.Message ?? ''}${detail}${tail}`.trim(),
    };
}

/* ── Selected rows a renewal cannot be placed for ─────────────────────────── */

/**
 * "2 · already renewed (1), billed by a payment gateway (1)": the ticked rows the create-renewals
 * dialog leaves out, with why, for its Excluded line, so a person is never surprised by a count
 * smaller than their selection. Null when every ticked row can be placed.
 */
export function ExclusionNote(excluded: ReadonlyArray<RenewalWorklistRow>): string | null {
    if (!excluded.length) return null;
    const reason = (r: RenewalWorklistRow): string => {
        if (r.ProviderBilled) return 'billed by a payment gateway';
        if (r.State === 'Renewed') return 'already renewed';
        if (r.State === 'RenewalPending') return 'a renewal draft already exists';
        if (r.State === 'Inactive') return `not renewable (${r.Status.toLowerCase()})`;
        return 'cannot be renewed from here';
    };
    const counts = new Map<string, number>();
    for (const r of excluded) counts.set(reason(r), (counts.get(reason(r)) ?? 0) + 1);
    const list = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([why, n]) => `${why} (${n})`)
        .join(', ');
    return `${excluded.length} · ${list}`;
}

/* ── Remembering the filters ───────────────────────────────────────────────── */

/** What the page keeps between visits and across the Explorer's refresh: the window, the facets and the quick filter. */
export interface RenewalsPageState {
    WindowDays: number;
    Companies: string[];
    Products: string[];
    Preset: RenewalsPreset;
}

export const RENEWALS_STATE_KEY = 'mjOrders.renewals.filters';

const PRESETS: ReadonlyArray<RenewalsPreset> = ['all', 'auto', 'manual', 'placed', 'attention'];

/** The saved state, or null when there is none or it cannot be read. Anything malformed falls back field by field. */
export function ReadPageState(storage: { getItem(key: string): string | null } | null | undefined, key = RENEWALS_STATE_KEY): RenewalsPageState | null {
    try {
        const raw = storage?.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<RenewalsPageState>;
        const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);
        const window = RENEWAL_WINDOWS.some((w) => w.Days === parsed.WindowDays) ? (parsed.WindowDays as number) : RENEWAL_WINDOWS[0].Days;
        const preset = PRESETS.includes(parsed.Preset as RenewalsPreset) ? (parsed.Preset as RenewalsPreset) : 'all';
        return { WindowDays: window, Companies: ids(parsed.Companies), Products: ids(parsed.Products), Preset: preset };
    } catch {
        return null;
    }
}

/** Save the state. Storage that is missing or refuses is not an error: the page simply starts fresh next time. */
export function WritePageState(storage: { setItem(key: string, value: string): void } | null | undefined, state: RenewalsPageState, key = RENEWALS_STATE_KEY): void {
    try {
        storage?.setItem(key, JSON.stringify(state));
    } catch {
        /* preferences simply do not persist */
    }
}

/** The facets with any company tick the offered options no longer include removed. Same object when nothing changes. */
export function PruneCompanies(facets: RenewalsFacets, offered: ReadonlyArray<RenewalsFacetOption>): RenewalsFacets {
    const ids = new Set(offered.map((o) => o.Value));
    if (facets.Companies.every((c) => ids.has(c))) return facets;
    return { ...facets, Companies: facets.Companies.filter((c) => ids.has(c)) };
}

/* ── Export ────────────────────────────────────────────────────────────────── */

/** A column of the renewals export. Matches MJ's `ExportColumn`, so it goes to the export dialog as is. */
export interface RenewalsExportColumn {
    name: string;
    displayName: string;
    dataType: 'string' | 'number' | 'dateonly';
    numberFormat?: string;
}

export type RenewalsExportRow = Record<string, string | number | null>;

export interface RenewalsExport {
    Columns: RenewalsExportColumn[];
    Rows: RenewalsExportRow[];
}

const MONEY = '#,##0.00';

/**
 * The list as a spreadsheet: one row per subscription, the same facts the grid shows plus the ones
 * the side panel holds, in words a reader outside the app understands ("Auto-renews", "Yes"). The
 * renewal price column carries the placed order's price when there is one, else the projection,
 * and the increase column the percentage behind it, so a finance reviewer can total and sort
 * without opening the page.
 */
export function BuildRenewalsExport(rows: ReadonlyArray<RenewalWorklistRow>): RenewalsExport {
    const Columns: RenewalsExportColumn[] = [
        { name: 'Subscription', displayName: 'Subscription', dataType: 'string' },
        { name: 'Customer', displayName: 'Customer', dataType: 'string' },
        { name: 'Account', displayName: 'Account', dataType: 'string' },
        { name: 'Company', displayName: 'Company', dataType: 'string' },
        { name: 'Product', displayName: 'Product', dataType: 'string' },
        { name: 'SubscriptionType', displayName: 'Subscription type', dataType: 'string' },
        { name: 'Status', displayName: 'Status', dataType: 'string' },
        { name: 'AutoRenew', displayName: 'Auto-renew', dataType: 'string' },
        { name: 'RenewalState', displayName: 'Renewal', dataType: 'string' },
        { name: 'AutoRenewsOn', displayName: 'Auto-renews on', dataType: 'dateonly' },
        { name: 'SubscribedSince', displayName: 'Subscribed since', dataType: 'dateonly' },
        { name: 'TermNumber', displayName: 'Term', dataType: 'number' },
        { name: 'TermStart', displayName: 'Term start', dataType: 'dateonly' },
        { name: 'TermEnd', displayName: 'Term end', dataType: 'dateonly' },
        { name: 'DaysUntilEnd', displayName: 'Days until end', dataType: 'number' },
        { name: 'CurrentOrder', displayName: 'Current order', dataType: 'string' },
        { name: 'CurrentOrderDate', displayName: 'Current order date', dataType: 'dateonly' },
        { name: 'CurrentOrderStatus', displayName: 'Current order status', dataType: 'string' },
        { name: 'CurrentPrice', displayName: 'Current price', dataType: 'number', numberFormat: MONEY },
        { name: 'CurrentQuantity', displayName: 'Current qty', dataType: 'number' },
        { name: 'CurrentTotal', displayName: 'Current total', dataType: 'number', numberFormat: MONEY },
        { name: 'CurrentBalance', displayName: 'Still owed', dataType: 'number', numberFormat: MONEY },
        { name: 'RenewalOrder', displayName: 'Renewal order', dataType: 'string' },
        { name: 'RenewalOrderDate', displayName: 'Renewal order date', dataType: 'dateonly' },
        { name: 'RenewalOrderStatus', displayName: 'Renewal order status', dataType: 'string' },
        { name: 'RenewalPrice', displayName: 'Renewal price', dataType: 'number', numberFormat: MONEY },
        { name: 'RenewalQuantity', displayName: 'Renewal qty', dataType: 'number' },
        { name: 'RenewalTotal', displayName: 'Renewal total', dataType: 'number', numberFormat: MONEY },
        { name: 'RenewalPriceBasis', displayName: 'Renewal price basis', dataType: 'string' },
        { name: 'IncreasePercent', displayName: 'Increase %', dataType: 'number', numberFormat: '0.00' },
        { name: 'IncreaseSource', displayName: 'Increase set on', dataType: 'string' },
        { name: 'IncreaseApplied', displayName: 'Increase applied', dataType: 'string' },
        { name: 'SubscriptionIncreasePercent', displayName: 'Subscription increase %', dataType: 'number', numberFormat: '0.00' },
        { name: 'RenewalTermStart', displayName: 'Renewal term start', dataType: 'dateonly' },
        { name: 'RenewalTermEnd', displayName: 'Renewal term end', dataType: 'dateonly' },
        { name: 'ProjectionProblem', displayName: 'Pricing problem', dataType: 'string' },
    ];
    const basis = (r: RenewalWorklistRow): string | null => {
        if (r.RenewalOrderID) return 'Placed order';
        if (r.ProjectionProblem) return null;
        if (r.ProjectedUnitPrice == null) return null;
        return { PriorPrice: 'Current undiscounted price', PriorList: 'Current list price', SuccessorList: 'Successor list price' }[r.ProjectedBasePriceSource ?? 'PriorPrice'];
    };
    const Rows: RenewalsExportRow[] = rows.map((r) => {
        const placed = !!r.RenewalOrderID;
        return {
            Subscription: r.SubscriptionNumber,
            Customer: r.ContactName ?? null,
            Account: r.AccountName ?? null,
            Company: r.CompanyName,
            Product: r.ProductName,
            SubscriptionType: r.SubscriptionTypeName,
            Status: r.Status,
            AutoRenew: r.AutoRenew ? 'Yes' : 'No',
            RenewalState: RenewalStateLabel(r.State),
            AutoRenewsOn: r.AutoRenewOn ?? null,
            SubscribedSince: r.StartDate,
            TermNumber: r.TermNumber,
            TermStart: r.TermStartDate,
            TermEnd: r.TermEndDate,
            DaysUntilEnd: r.DaysUntilEnd,
            CurrentOrder: r.CurrentOrderNumber ?? null,
            CurrentOrderDate: r.CurrentOrderDate ?? null,
            CurrentOrderStatus: r.CurrentOrderStatus ?? null,
            CurrentPrice: r.CurrentUnitPrice ?? null,
            CurrentQuantity: r.CurrentQuantity ?? null,
            CurrentTotal: r.CurrentLineTotal ?? null,
            CurrentBalance: r.CurrentOrderBalance ?? null,
            RenewalOrder: r.RenewalOrderNumber ?? null,
            RenewalOrderDate: r.RenewalOrderDate ?? null,
            RenewalOrderStatus: r.RenewalOrderStatus ?? null,
            RenewalPrice: placed ? (r.RenewalUnitPrice ?? null) : (r.ProjectedUnitPrice ?? null),
            RenewalQuantity: placed ? (r.RenewalQuantity ?? null) : (r.ProjectedQuantity ?? null),
            RenewalTotal: placed ? (r.RenewalLineTotal ?? null) : (r.ProjectedLineTotal ?? null),
            RenewalPriceBasis: basis(r),
            IncreasePercent: placed ? PriceChangePercent(r.CurrentUnitPrice, r.RenewalUnitPrice) : (r.ProjectedUnitPrice == null ? null : (r.ProjectedIncreasePercent ?? 0)),
            IncreaseSource: placed ? (PriceChangePercent(r.CurrentUnitPrice, r.RenewalUnitPrice) == null ? null : 'Actual, vs current price') : r.ProjectedIncreaseSetPercent ? (r.ProjectedIncreaseSetSource ?? null) : r.ProjectedIncreasePercent ? (r.ProjectedIncreaseSource ?? null) : null,
            IncreaseApplied: placed || r.ProjectedUnitPrice == null ? null : r.ProjectedIncreaseApplied === false && r.ProjectedIncreaseSetPercent ? 'No: no anniversary this term' : r.ProjectedIncreasePercent ? 'Yes' : 'None set',
            SubscriptionIncreasePercent: r.SubscriptionIncreasePercent ?? null,
            RenewalTermStart: placed ? (r.RenewalTermStart ?? null) : (r.ProjectedTermStart ?? null),
            RenewalTermEnd: placed ? (r.RenewalTermEnd ?? null) : (r.ProjectedTermEnd ?? null),
            ProjectionProblem: r.ProjectionProblem ?? null,
        };
    });
    return { Columns, Rows };
}

/** One short line of the side panel's projection: what it is, and the value. */
export interface ProjectionLine {
    Label: string;
    Text: string;
}

/**
 * How the projected price was reached, as three short lines rather than a paragraph: the base
 * price and where it came from, the increase and whether it applied, and the new term. Null when
 * there is no projection; a single "Cannot price" line when the pricer refused.
 */
export function ProjectionLines(row: RenewalWorklistRow): ProjectionLine[] | null {
    if (row.ProjectionProblem) return [{ Label: 'Cannot price', Text: row.ProjectionProblem }];
    if (row.ProjectedUnitPrice == null) return null;
    const base = {
        PriorPrice: 'current price',
        PriorList: 'list price, discount lapses',
        SuccessorList: `list price of ${row.ProjectedProductName ?? 'the successor'}`,
    }[row.ProjectedBasePriceSource ?? 'PriorPrice'];
    const level = (source: string | null | undefined): string => (source ? String(source).toLowerCase() : 'none');
    const increase =
        row.ProjectedIncreasePercent && row.ProjectedIncreasePercent > 0
            ? `+${TrimPercent(row.ProjectedIncreasePercent)}% · set on the ${level(row.ProjectedIncreaseSource)}`
            : row.ProjectedIncreaseApplied === false && row.ProjectedIncreaseSetPercent
              ? `${TrimPercent(row.ProjectedIncreaseSetPercent)}% set on the ${level(row.ProjectedIncreaseSetSource)} · not applied: no anniversary this term`
              : 'none set';
    const out: ProjectionLine[] = [
        { Label: 'Base', Text: `${FormatMoney(row.ProjectedBasePrice)} · ${base}` },
        { Label: 'Increase', Text: increase },
    ];
    if (row.ProjectedTermStart && row.ProjectedTermEnd) {
        out.push({ Label: 'New term', Text: `${FormatDate(row.ProjectedTermStart, RENEWALS_DATE)} – ${FormatDate(row.ProjectedTermEnd, RENEWALS_DATE)}` });
    }
    return out;
}

function TrimPercent(value: number): string {
    return String(Math.round(value * 100) / 100);
}

/** How the page leaves the renewal orders it creates. Draft is the default: a person reviews, then confirms. */
export type RenewalPlacement = 'Draft' | 'Confirmed';

/** What the create-renewals dialog says, from a preview's candidates and the placement chosen. */
export interface PlacementSummary {
    /** Candidates the live run will place. */
    Placeable: RenewalCandidate[];
    /** Renewal orders the live run will create: subscriptions for one customer ending the same day share one. */
    Orders: number;
    /** Candidates the preview skipped, with their reasons. */
    Skipped: RenewalCandidate[];
    /** Sum of unit price times seats over what will be placed. Before tax and promotions. */
    Total: number;
    Message: string;
    Detail: string;
}

export function SummarizePlacement(candidates: ReadonlyArray<RenewalCandidate>, placeAs: RenewalPlacement = 'Draft'): PlacementSummary {
    const placeable = candidates.filter((c) => !c.SkippedReason);
    const skipped = candidates.filter((c) => !!c.SkippedReason);
    const total = placeable.reduce((s, c) => s + Number(c.UnitPrice ?? 0) * Number(c.Quantity ?? 1) * (1 - Number(c.DiscountPct ?? 0)), 0);
    const n = placeable.length;
    const orders = new Set(placeable.map((c, i) => (c.OrderGroup == null ? `own-${i}` : `group-${c.OrderGroup}`))).size;
    const how = placeAs === 'Confirmed' ? 'confirmed' : 'drafts';
    const message = n
        ? orders === n
            ? `${n} renewal order${n === 1 ? '' : 's'} will be created as ${n === 1 && how === 'drafts' ? 'a draft' : how}, ${FormatMoney(total)} before tax.`
            : `${n} subscriptions will renew on ${orders} renewal order${orders === 1 ? '' : 's'}, created as ${how}, ${FormatMoney(total)} before tax.`
        : 'Nothing can be placed for the rows you ticked.';
    const detail = skipped.length
        ? `${skipped.length} will be skipped: ${skipped
              .slice(0, 3)
              .map((c) => `${c.SubscriptionNumber} (${c.SkippedReason})`)
              .join('; ')}${skipped.length > 3 ? `, and ${skipped.length - 3} more` : ''}.`
        : '';
    return { Placeable: placeable, Orders: orders, Skipped: skipped, Total: Math.round(total * 100) / 100, Message: message, Detail: detail };
}

/**
 * Warnings for the create-renewals dialog about subscriptions bought together. The engine puts one
 * customer's subscriptions ending the same day on one renewal order, so the thing to catch is a
 * sibling that would be LEFT OUT: a person renewing one product by hand may not notice the other
 * bought with it is ending too, and renewing it later puts it on a second order.
 */
export function SharedOrderWarnings(selected: ReadonlyArray<RenewalWorklistRow>, all: ReadonlyArray<RenewalWorklistRow>): string[] {
    const chosen = new Set(selected.map((r) => r.SubscriptionID));
    const orders = new Map<string, RenewalWorklistRow>();
    for (const r of selected) if (r.CurrentOrderID && !orders.has(r.CurrentOrderID)) orders.set(r.CurrentOrderID, r);
    const leftOut: string[] = [];
    for (const [orderID, row] of orders) {
        const siblings = all.filter((r) => r.CurrentOrderID === orderID && !chosen.has(r.SubscriptionID) && !r.RenewalOrderID);
        if (siblings.length) leftOut.push(`${row.CurrentOrderNumber ?? 'an order'} (${siblings.map((r) => r.ProductName).join(', ')})`);
    }
    if (!leftOut.length) return [];
    return [
        `Other subscriptions from the same original order${leftOut.length === 1 ? '' : 's'} are ending in this window and are not selected: ${leftOut.slice(0, 3).join('; ')}${leftOut.length > 3 ? `; and ${leftOut.length - 3} more` : ''}. Renewed later, they would go on a separate order.`,
    ];
}

/** Sort keys the table header offers, and how each compares. */
export type RenewalsSortKey =
    | 'TermEndDate'
    | 'ContactName'
    | 'CompanyName'
    | 'ProductName'
    | 'StartDate'
    | 'Status'
    | 'AutoRenew'
    | 'State'
    | 'CurrentOrderNumber'
    | 'CurrentUnitPrice'
    | 'RenewalOrderNumber'
    | 'RenewalPrice';

/** The order the renewal states sort in: what needs a person first, then what the pass handles, then what is done. */
const STATE_ORDER: ReadonlyArray<RenewalWorklistState> = ['Lapsed', 'WillEnd', 'DueNow', 'Scheduled', 'RenewalPending', 'Renewed', 'ProviderBilled', 'Inactive'];

export function CompareRows(a: RenewalWorklistRow, b: RenewalWorklistRow, key: RenewalsSortKey): number {
    const text = (v: string | null | undefined): string => (v ?? '').toLowerCase();
    const value = (row: RenewalWorklistRow): string | number => {
        switch (key) {
            case 'ContactName':
                return text(row.ContactName ?? row.AccountName);
            case 'CompanyName':
                return text(row.CompanyName);
            case 'ProductName':
                return text(row.ProductName);
            case 'StartDate':
                return row.StartDate;
            case 'Status':
                return text(row.Status);
            case 'AutoRenew':
                return row.AutoRenew ? 0 : 1;
            case 'State':
                return STATE_ORDER.indexOf(row.State);
            case 'CurrentOrderNumber':
                return text(row.CurrentOrderNumber);
            case 'CurrentUnitPrice':
                return row.CurrentUnitPrice ?? -1;
            case 'RenewalOrderNumber':
                return text(row.RenewalOrderNumber);
            case 'RenewalPrice':
                return row.RenewalOrderID ? (row.RenewalUnitPrice ?? -1) : (row.ProjectedUnitPrice ?? -1);
            default:
                return row.TermEndDate;
        }
    };
    const x = value(a);
    const y = value(b);
    if (x < y) return -1;
    if (x > y) return 1;
    return a.SubscriptionNumber < b.SubscriptionNumber ? -1 : a.SubscriptionNumber > b.SubscriptionNumber ? 1 : 0;
}
