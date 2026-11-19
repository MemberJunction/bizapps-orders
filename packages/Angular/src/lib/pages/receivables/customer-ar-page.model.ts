/**
 * @fileoverview The figures behind the Customer A/R page, as pure functions.
 *
 * The page shows the whole book first (one row per customer) and one customer on demand. Both read
 * the same derivation, kept here so it is testable without Angular and so the two views cannot
 * disagree about a customer's numbers.
 *
 * INVOICED AND NOT YET INVOICED ARE DIFFERENT MONEY (bc-aidp-next-golive#481). An order billed in
 * installments carries its whole unpaid value in `Balance`, but only the installments that have been
 * issued are receivable. A `Scheduled` installment has no invoice behind it: the customer has not
 * been asked for it, so it cannot be late and it is not aged. It is shown beside the receivable, never
 * inside it. An order with no schedule is invoiced whole when it is confirmed, so all of its balance
 * is receivable.
 *
 * @module @mj-biz-apps/orders-ng
 */
import { LocalDay, ToISODate, type DateCell } from '@mj-biz-apps/orders-entities';
import { AgingBucketOf, EmptyAgingBuckets, type MJOAgingBuckets } from '../../panels/aging-bar.component';
import { DaysSince } from '../../panels/money-format';

/* ── Inputs ───────────────────────────────────────────────────────────────── */

/** The order facts the page reads. An order header entity satisfies it. */
export interface ARSourceOrder {
    ID: string;
    OrderNumber?: string | null;
    /** `Confirmed`, `Posted` or `Fulfilled` orders can have an installment issued. */
    Status?: string | null;
    OrderDate?: DateCell;
    DueDate?: DateCell;
    TotalGross?: number | null;
    /** What has been paid against the order. Read, not derived: total less balance would also count credits and write-offs as paid. */
    AmountPaid?: number | null;
    Balance?: number | null;
    CompanyID?: string | null;
    Company?: string | null;
    BillToOrganizationID?: string | null;
    BillToOrganization?: string | null;
    BillToPersonID?: string | null;
    BillToPerson?: string | null;
}

/** An unpaid installment, with what says whether it has been invoiced. */
export interface ARSourceInstalment {
    /** The schedule row, which is what issuing an installment names. */
    ID?: string | null;
    OrderHeaderID: string;
    InstallmentNumber?: number | null;
    DueDate: DateCell;
    Amount?: number | null;
    AmountPaid?: number | null;
    Balance: number | null;
    /** `Scheduled` has no invoice yet; anything else that still owes has been issued. */
    Status?: string | null;
    DocumentNumber?: string | null;
    InvoicedAt?: DateCell;
}

/* ── Open items ───────────────────────────────────────────────────────────── */

/** One line of what a customer owes or will be invoiced: a whole-order invoice or one installment. */
export interface AROpenItem {
    Key: string;
    OrderID: string;
    OrderNumber: string;
    OrderStatus: string;
    /** The schedule row behind an installment; null for a whole-order invoice. */
    ScheduleID: string | null;
    CompanyID: string;
    Company: string;
    /** "Invoice" for an order billed whole, "Installment 3" for a schedule row. */
    Label: string;
    /** The number the customer holds. Null until an installment is issued. */
    DocumentNumber: string | null;
    /** The day it was invoiced: always a calendar day, never an instant. */
    InvoicedOn: DateCell;
    DueDate: DateCell;
    /** Whole days past the due date; 0 when not late, and always 0 for a scheduled row. */
    DaysPastDue: number;
    Amount: number;
    Paid: number;
    Balance: number;
    State: 'Invoiced' | 'Scheduled';
    /** A scheduled installment whose date has arrived: nothing is late, but it is waiting to be invoiced. */
    ReadyToInvoice: boolean;
    /** The aging bucket of an invoiced item; null for a scheduled one, which is not aged. */
    Bucket: keyof MJOAgingBuckets | null;
}

const cents = (n: number | null | undefined): number => Math.round(Number(n ?? 0) * 100);
const money = (c: number): number => c / 100;
const lower = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

/**
 * The business day an installment was invoiced, as `YYYY-MM-DD`.
 *
 * `InvoicedAt` is an INSTANT, unlike every other date on this page, which are calendar days. Read by
 * its UTC parts, an installment issued at 7 PM Central would show, and export, as the next day.
 */
export function InvoicedDay(invoicedAt: DateCell): string | null {
    if (!invoicedAt) return null;
    const instant = invoicedAt instanceof Date ? invoicedAt : new Date(invoicedAt);
    return LocalDay(instant) || null;
}

/**
 * One order's open balance as the lines a collector reads.
 *
 * Installments are taken in the order given (earliest due first) and never account for more than the
 * order still owes, so the items always sum to the order's `Balance`. Whatever no installment covers
 * is one invoice line on the header's due date: for an order with no schedule that is the whole
 * order, shown with its full amount and what has been paid against it.
 *
 * @param order - The order. A balance of zero or less yields nothing (a negative balance is credit).
 * @param instalments - Its unpaid installments, earliest due first.
 * @param today - The business day, `YYYY-MM-DD`.
 */
export function OpenItemsOf(order: ARSourceOrder, instalments: ReadonlyArray<ARSourceInstalment> | undefined, today: Date | string): AROpenItem[] {
    let remaining = cents(order.Balance);
    if (remaining <= 0) return [];
    const base = {
        OrderID: order.ID,
        OrderNumber: order.OrderNumber ?? '',
        OrderStatus: order.Status ?? '',
        CompanyID: lower(order.CompanyID),
        Company: order.Company ?? '',
    };
    const items: AROpenItem[] = [];
    const rows = instalments ?? [];

    for (const row of rows) {
        const take = Math.min(cents(row.Balance), remaining);
        if (take <= 0) continue;
        remaining -= take;
        const scheduled = row.Status === 'Scheduled';
        const late = scheduled || !row.DueDate ? 0 : Math.max(0, DaysSince(row.DueDate, today));
        items.push({
            ...base,
            Key: `${lower(order.ID)}/${row.ID ? lower(row.ID) : `row-${items.length + 1}`}`,
            ScheduleID: row.ID ?? null,
            Label: row.InstallmentNumber ? `Installment ${row.InstallmentNumber}` : 'Installment',
            DocumentNumber: scheduled ? null : (row.DocumentNumber ?? null),
            InvoicedOn: scheduled ? null : InvoicedDay(row.InvoicedAt),
            DueDate: row.DueDate,
            DaysPastDue: late,
            Amount: money(cents(row.Amount ?? row.Balance)),
            Paid: money(cents(row.AmountPaid)),
            Balance: money(take),
            State: scheduled ? 'Scheduled' : 'Invoiced',
            ReadyToInvoice: scheduled && !!row.DueDate && DaysSince(row.DueDate, today) >= 0,
            Bucket: scheduled ? null : AgingBucketOf(row.DueDate, today),
        });
    }

    if (remaining > 0) {
        // No schedule: the order was invoiced whole when it was confirmed, under its own number. With a
        // schedule, what the rows do not cover has no invoice of its own to point at, so it is listed
        // without a number or an invoice date for someone to look into.
        const whole = rows.length === 0;
        const late = order.DueDate ? Math.max(0, DaysSince(order.DueDate, today)) : 0;
        const total = whole ? Math.max(cents(order.TotalGross), remaining) : remaining;
        const paid = whole ? (order.AmountPaid == null ? total - remaining : cents(order.AmountPaid)) : 0;
        items.push({
            ...base,
            Key: `${lower(order.ID)}/order`,
            ScheduleID: null,
            Label: whole ? 'Invoice' : 'Unscheduled balance',
            DocumentNumber: whole ? (order.OrderNumber ?? null) : null,
            InvoicedOn: whole ? (order.OrderDate ?? null) : null,
            DueDate: order.DueDate ?? null,
            DaysPastDue: late,
            Amount: money(total),
            Paid: money(Math.max(0, paid)),
            Balance: money(remaining),
            State: 'Invoiced',
            ReadyToInvoice: false,
            Bucket: AgingBucketOf(order.DueDate ?? null, today),
        });
    }
    return items;
}

/* ── Customers ────────────────────────────────────────────────────────────── */

/** A credit a customer holds: an order they have over-paid. */
export interface ARCreditOrder {
    ID: string;
    OrderNumber: string;
    Amount: number;
}

/** One customer's receivable picture. Every figure is derived from `Items` and `Credits`. */
export interface ARCustomer {
    Key: string;
    Name: string;
    IsOrganization: boolean;
    /** Invoiced and unpaid: the receivable. */
    Owed: number;
    /** The part of `Owed` past its due date. */
    PastDue: number;
    /** Scheduled installments, not yet invoiced. Not part of `Owed`, never aged. */
    Scheduled: number;
    /** Credit held (over-paid orders), as a positive number. */
    Credit: number;
    /** `Owed` by age. */
    Buckets: MJOAgingBuckets;
    /** Days past due of the oldest invoiced item; 0 when nothing is late. */
    OldestDaysPastDue: number;
    /** Scheduled installments whose date has arrived and that have not been invoiced: the part of `Scheduled` waiting on us. */
    ReadyToInvoice: number;
    /** The earliest date, today or later, on which an invoice falls due or an installment is scheduled. */
    NextDueDate: DateCell;
    /** Everything falling on `NextDueDate`. */
    NextDueAmount: number;
    /** True when any of `NextDueAmount` is a scheduled installment, which is an invoice to come, not money due. */
    NextDueIsScheduled: boolean;
    /** Orders with something owed or scheduled. Orders that only hold credit are not counted. */
    OrderCount: number;
    Items: AROpenItem[];
    Credits: ARCreditOrder[];
}

const round = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Group open orders by customer and derive each customer's figures.
 *
 * The organization wins over the person when both are present: an employee's order billed to their
 * employer is the employer's receivable. Customers come back largest receivable first.
 */
export function BuildCustomers(
    orders: ReadonlyArray<ARSourceOrder>,
    instalmentsByOrder: ReadonlyMap<string, ARSourceInstalment[]>,
    today: Date | string,
): ARCustomer[] {
    const byCustomer = new Map<string, ARCustomer>();
    for (const order of orders) {
        const balance = cents(order.Balance);
        if (balance === 0) continue;
        const key = lower(order.BillToOrganizationID ?? order.BillToPersonID) || 'unknown';
        let customer = byCustomer.get(key);
        if (!customer) {
            customer = {
                Key: key,
                Name: order.BillToOrganization ?? order.BillToPerson ?? 'Unknown customer',
                IsOrganization: !!order.BillToOrganizationID,
                Owed: 0,
                PastDue: 0,
                Scheduled: 0,
                Credit: 0,
                Buckets: EmptyAgingBuckets(),
                OldestDaysPastDue: 0,
                ReadyToInvoice: 0,
                NextDueDate: null,
                NextDueAmount: 0,
                NextDueIsScheduled: false,
                OrderCount: 0,
                Items: [],
                Credits: [],
            };
            byCustomer.set(key, customer);
        }
        if (balance < 0) {
            customer.Credits.push({ ID: order.ID, OrderNumber: order.OrderNumber ?? '', Amount: money(-balance) });
            continue;
        }
        customer.OrderCount += 1;
        customer.Items.push(...OpenItemsOf(order, instalmentsByOrder.get(lower(order.ID)), today));
    }
    return [...byCustomer.values()].map((c) => finish(c, today)).sort((a, b) => b.Owed - a.Owed || b.Scheduled - a.Scheduled || a.Name.localeCompare(b.Name));
}

/** Totals from the items, in cents so the sums are exact, plus the next-due pair. */
function finish(customer: ARCustomer, today: Date | string): ARCustomer {
    const buckets = { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };
    let scheduled = 0;
    let ready = 0;
    let oldest = 0;
    // Days until due of the nearest date that has not passed, and what falls due on it.
    let nextIn: number | null = null;
    let nextCents = 0;
    let nextDate: DateCell = null;
    let nextScheduled = false;
    for (const item of customer.Items) {
        const c = cents(item.Balance);
        if (item.State === 'Scheduled') scheduled += c;
        else if (item.Bucket) buckets[item.Bucket] += c;
        if (item.ReadyToInvoice) ready += c;
        oldest = Math.max(oldest, item.DaysPastDue);
        if (!item.DueDate) continue;
        const until = -DaysSince(item.DueDate, today);
        if (until < 0) continue;
        if (nextIn === null || until < nextIn) {
            nextIn = until;
            nextCents = c;
            nextDate = item.DueDate;
            nextScheduled = item.State === 'Scheduled';
        } else if (until === nextIn) {
            nextCents += c;
            nextScheduled = nextScheduled || item.State === 'Scheduled';
        }
    }
    const pastDue = buckets.Days1To30 + buckets.Days31To60 + buckets.Days61Plus;
    const sortedItems = customer.Items.slice().sort(CompareItems);
    return {
        ...customer,
        Owed: money(buckets.Current + pastDue),
        PastDue: money(pastDue),
        Scheduled: money(scheduled),
        Credit: round(customer.Credits.reduce((sum, c) => sum + c.Amount, 0)),
        Buckets: { Current: money(buckets.Current), Days1To30: money(buckets.Days1To30), Days31To60: money(buckets.Days31To60), Days61Plus: money(buckets.Days61Plus) },
        OldestDaysPastDue: oldest,
        ReadyToInvoice: money(ready),
        NextDueDate: nextDate,
        NextDueAmount: money(nextCents),
        NextDueIsScheduled: nextScheduled,
        Items: sortedItems,
    };
}

/** A date cell as a sortable day; a day past any real one when there is none, so undated sorts last. */
const dayKey = (value: DateCell): string => ToISODate(value) ?? '9999-12-31';

/** Invoiced before scheduled, then earliest due first; undated last. */
export function CompareItems(a: AROpenItem, b: AROpenItem): number {
    if (a.State !== b.State) return a.State === 'Invoiced' ? -1 : 1;
    return dayKey(a.DueDate).localeCompare(dayKey(b.DueDate)) || a.OrderNumber.localeCompare(b.OrderNumber) || a.Label.localeCompare(b.Label, undefined, { numeric: true });
}

/** An item's state in the words the page and the exports use. */
export type ARItemStatus = 'Current' | 'Past due' | 'Scheduled' | 'Ready to invoice';

export function ItemStatus(item: AROpenItem): ARItemStatus {
    if (item.State === 'Scheduled') return item.ReadyToInvoice ? 'Ready to invoice' : 'Scheduled';
    return item.DaysPastDue > 0 ? 'Past due' : 'Current';
}

/** The newest payment that actually brought money in: captured, and for more than nothing (applying credit records a zero payment). */
export function LastReceived<T extends { Status?: string | null; Amount?: number | null }>(paymentsNewestFirst: ReadonlyArray<T>): T | null {
    return paymentsNewestFirst.find((p) => p.Status === 'Captured' && Number(p.Amount ?? 0) > 0) ?? null;
}

/* ── Ordering one customer's items ────────────────────────────────────────── */

export type ARItemSortKey = 'OrderNumber' | 'Label' | 'DocumentNumber' | 'InvoicedOn' | 'DueDate' | 'DaysPastDue' | 'Status' | 'Amount' | 'Paid' | 'Balance' | 'Company';

function itemSortValue(item: AROpenItem, key: ARItemSortKey): number | string | null {
    switch (key) {
        case 'InvoicedOn':
        case 'DueDate':
            return ToISODate(item[key]);
        case 'Status':
            return ItemStatus(item);
        case 'DocumentNumber':
            return item.DocumentNumber ? item.DocumentNumber.toLowerCase() : null;
        case 'OrderNumber':
        case 'Label':
        case 'Company':
            return item[key].toLowerCase();
        default:
            return item[key];
    }
}

/**
 * A customer's items ordered on one column; with no column, in the order they arrive (invoiced
 * first, then by due date). Blanks go last whichever way the column runs, and ties keep that
 * arrival order.
 */
export function SortItems(items: ReadonlyArray<AROpenItem>, key: ARItemSortKey | null, descending: boolean): AROpenItem[] {
    if (!key) return items.slice();
    const direction = descending ? -1 : 1;
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const x = itemSortValue(a.item, key);
            const y = itemSortValue(b.item, key);
            if (x === null || y === null) {
                if (x !== y) return x === null ? 1 : -1;
            } else if (x !== y) {
                // Text compares with its numbers as numbers, so "Installment 10" follows "Installment 9".
                const order = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, undefined, { numeric: true }) : x < y ? -1 : 1;
                if (order !== 0) return order * direction;
            }
            return a.index - b.index;
        })
        .map((entry) => entry.item);
}

/* ── Narrowing one customer's items ───────────────────────────────────────── */

/** Which of a customer's open items to list: everything, one aging bucket, all that is late, or what is scheduled. */
export type ARItemFilter = 'all' | 'pastdue' | 'scheduled' | keyof MJOAgingBuckets;

export function MatchesItemFilter(item: AROpenItem, filter: ARItemFilter): boolean {
    switch (filter) {
        case 'all':
            return true;
        case 'scheduled':
            return item.State === 'Scheduled';
        case 'pastdue':
            return item.State === 'Invoiced' && item.DaysPastDue > 0;
        default:
            return item.Bucket === filter;
    }
}

/** A choice above the open items, with what it would show. Only choices that show something are offered, plus "All". */
export interface ARItemFilterOption {
    Key: ARItemFilter;
    Label: string;
    Count: number;
    Amount: number;
}

const ITEM_FILTERS: ReadonlyArray<{ Key: ARItemFilter; Label: string }> = [
    { Key: 'all', Label: 'All' },
    { Key: 'pastdue', Label: 'Past due' },
    { Key: 'Current', Label: 'Current' },
    { Key: 'Days1To30', Label: '1–30 days' },
    { Key: 'Days31To60', Label: '31–60 days' },
    { Key: 'Days61Plus', Label: '61+ days' },
    { Key: 'scheduled', Label: 'Scheduled' },
];

export function ItemFilterOptions(items: ReadonlyArray<AROpenItem>): ARItemFilterOption[] {
    return ITEM_FILTERS.map((f) => {
        const matching = items.filter((i) => MatchesItemFilter(i, f.Key));
        return { ...f, Count: matching.length, Amount: money(matching.reduce((sum, i) => sum + cents(i.Balance), 0)) };
    }).filter((o) => o.Key === 'all' || o.Count > 0);
}

const ISSUABLE_ORDER_STATUSES: ReadonlyArray<string> = ['Confirmed', 'Posted', 'Fulfilled'];

/**
 * Whether an item can be issued as an invoice from here: a scheduled installment on a live order
 * whose date has arrived. Issuing ahead of the date is left to the Billing worklist, which is built
 * for looking ahead; here the button sits in a row beside the customer's other figures, and an
 * irreversible step that early should not be one stray click away.
 */
export function CanIssue(item: AROpenItem): boolean {
    return item.State === 'Scheduled' && item.ReadyToInvoice && !!item.ScheduleID && ISSUABLE_ORDER_STATUSES.includes(item.OrderStatus);
}

/** The key of the customer one step up or down the list from `key`; the same key at either end, or the first when none is open. */
export function NeighbourKey(customers: ReadonlyArray<{ Key: string }>, key: string | null, step: 1 | -1): string | null {
    if (!customers.length) return null;
    const index = customers.findIndex((c) => c.Key === key);
    if (index < 0) return customers[0].Key;
    return customers[Math.min(customers.length - 1, Math.max(0, index + step))].Key;
}

/** "Updated just now", "Updated 4 minutes ago", "Updated at 9:15 AM" once it is over an hour old. */
export function UpdatedLabel(loadedAt: Date | null, now: Date): string {
    if (!loadedAt) return '';
    const minutes = Math.floor((now.getTime() - loadedAt.getTime()) / 60000);
    if (minutes < 1) return 'Updated just now';
    if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const at = loadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    // Left open overnight, a bare time would read as today's.
    const sameDay = loadedAt.toDateString() === now.toDateString();
    return sameDay ? `Updated at ${at}` : `Updated ${loadedAt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} at ${at}`;
}

/* ── Totals ───────────────────────────────────────────────────────────────── */

/** The book, or whatever part of it the filters leave. */
export interface ARTotals {
    Customers: number;
    /** Customers with a receivable, which is fewer than `Customers` when some only have scheduled amounts or credit. */
    OwingCustomers: number;
    ReadyToInvoice: number;
    Owed: number;
    PastDue: number;
    PastDueCustomers: number;
    Scheduled: number;
    Credit: number;
    Buckets: MJOAgingBuckets;
}

export function SumCustomers(customers: ReadonlyArray<ARCustomer>): ARTotals {
    const total = { Owed: 0, PastDue: 0, Scheduled: 0, Ready: 0, Credit: 0, Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };
    let late = 0;
    let owing = 0;
    for (const c of customers) {
        total.Owed += cents(c.Owed);
        total.PastDue += cents(c.PastDue);
        total.Scheduled += cents(c.Scheduled);
        total.Ready += cents(c.ReadyToInvoice);
        if (c.Owed > 0) owing += 1;
        total.Credit += cents(c.Credit);
        total.Current += cents(c.Buckets.Current);
        total.Days1To30 += cents(c.Buckets.Days1To30);
        total.Days31To60 += cents(c.Buckets.Days31To60);
        total.Days61Plus += cents(c.Buckets.Days61Plus);
        if (c.PastDue > 0) late += 1;
    }
    return {
        Customers: customers.length,
        OwingCustomers: owing,
        ReadyToInvoice: money(total.Ready),
        Owed: money(total.Owed),
        PastDue: money(total.PastDue),
        PastDueCustomers: late,
        Scheduled: money(total.Scheduled),
        Credit: money(total.Credit),
        Buckets: { Current: money(total.Current), Days1To30: money(total.Days1To30), Days31To60: money(total.Days31To60), Days61Plus: money(total.Days61Plus) },
    };
}

/* ── Company filter and search ────────────────────────────────────────────── */

/** A choice in the Company filter, with how many open orders it has. Matches `MJOMultiSelectOption`. */
export interface ARCompanyOption {
    Value: string;
    Text: string;
    Count: number;
}

/** The companies that have an open order, by name, each with its open-order count. */
export function CompanyOptions(orders: ReadonlyArray<ARSourceOrder>): ARCompanyOption[] {
    const byCompany = new Map<string, ARCompanyOption>();
    for (const order of orders) {
        if (cents(order.Balance) === 0) continue;
        const id = lower(order.CompanyID);
        if (!id) continue;
        const option = byCompany.get(id);
        if (option) option.Count += 1;
        else byCompany.set(id, { Value: id, Text: order.Company ?? '(no company)', Count: 1 });
    }
    return [...byCompany.values()].sort((a, b) => a.Text.localeCompare(b.Text));
}

/** The orders of the chosen companies; every order when none is chosen. */
export function FilterByCompany<T extends ARSourceOrder>(orders: ReadonlyArray<T>, companyIDs: ReadonlyArray<string>): T[] {
    if (!companyIDs.length) return orders.slice();
    const chosen = new Set(companyIDs.map(lower));
    return orders.filter((o) => chosen.has(lower(o.CompanyID)));
}

/** The chosen companies that are still offered. */
export function PruneCompanyPicks(picks: ReadonlyArray<string>, offered: ReadonlyArray<ARCompanyOption>): string[] {
    const ids = new Set(offered.map((o) => o.Value));
    return picks.map(lower).filter((id) => ids.has(id));
}

/** Whether a customer matches what was typed: their name, or one of their order or invoice numbers. */
export function MatchesSearch(customer: ARCustomer, text: string): boolean {
    const needle = text.trim().toLowerCase();
    if (!needle) return true;
    if (customer.Name.toLowerCase().includes(needle)) return true;
    return customer.Items.some((i) => i.OrderNumber.toLowerCase().includes(needle) || (i.DocumentNumber ?? '').toLowerCase().includes(needle));
}

/* ── Quick filters ────────────────────────────────────────────────────────── */

export type ARPreset = 'all' | 'pastdue' | 'scheduled' | 'credit';

export function MatchesPreset(customer: ARCustomer, preset: ARPreset): boolean {
    switch (preset) {
        case 'pastdue':
            return customer.PastDue > 0;
        case 'scheduled':
            return customer.Scheduled > 0;
        case 'credit':
            return customer.Credit > 0;
        default:
            return true;
    }
}

/* ── Sorting ──────────────────────────────────────────────────────────────── */

export type ARSortKey = 'Name' | 'Owed' | 'PastDue' | 'Current' | 'Days1To30' | 'Days31To60' | 'Days61Plus' | 'Scheduled' | 'NextDueDate' | 'NextDueAmount';

/** A customer's value in one column, for sorting. Null where the column is empty for them. */
function sortValue(c: ARCustomer, key: ARSortKey): number | string | null {
    switch (key) {
        case 'Name':
            return c.Name.toLowerCase();
        case 'NextDueDate':
            return ToISODate(c.NextDueDate);
        case 'NextDueAmount':
            return c.NextDueDate ? c.NextDueAmount : null;
        case 'Current':
        case 'Days1To30':
        case 'Days31To60':
        case 'Days61Plus':
            return c.Buckets[key];
        default:
            return c[key];
    }
}

/**
 * Customers ordered on one column.
 *
 * The direction applies to the column only. Ties always fall back to the name A to Z, and a customer
 * with nothing in a date column goes last whichever way the column runs: reversing a sorted list
 * would put the blanks first and the tied names backwards.
 */
export function SortCustomers(customers: ReadonlyArray<ARCustomer>, key: ARSortKey, descending: boolean): ARCustomer[] {
    const direction = descending ? -1 : 1;
    return customers.slice().sort((a, b) => {
        const x = sortValue(a, key);
        const y = sortValue(b, key);
        if (x === null || y === null) {
            if (x !== y) return x === null ? 1 : -1;
        } else if (x !== y) {
            return (x < y ? -1 : 1) * direction;
        }
        return a.Name.localeCompare(b.Name);
    });
}

/* ── Saved view ───────────────────────────────────────────────────────────── */

export interface ARPageState {
    Companies: string[];
    SortKey: ARSortKey;
    SortDescending: boolean;
}

export const AR_STATE_KEY = 'mjOrders.customerAR.view';

const SORT_KEYS: ReadonlyArray<ARSortKey> = ['Name', 'Owed', 'PastDue', 'Current', 'Days1To30', 'Days31To60', 'Days61Plus', 'Scheduled', 'NextDueDate', 'NextDueAmount'];

/** The saved view, or null when there is none or it cannot be read. Anything malformed falls back field by field. */
export function ReadPageState(storage: { getItem(key: string): string | null } | null | undefined, key = AR_STATE_KEY): ARPageState | null {
    try {
        const raw = storage?.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<ARPageState>;
        const companies = Array.isArray(parsed.Companies) ? parsed.Companies.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
        const sortKey = SORT_KEYS.includes(parsed.SortKey as ARSortKey) ? (parsed.SortKey as ARSortKey) : 'Owed';
        return { Companies: companies, SortKey: sortKey, SortDescending: parsed.SortDescending !== false };
    } catch {
        return null;
    }
}

/** Save the view. Storage that is missing or refuses is not an error: the page starts fresh next time. */
export function WritePageState(storage: { setItem(key: string, value: string): void } | null | undefined, state: ARPageState, key = AR_STATE_KEY): void {
    try {
        storage?.setItem(key, JSON.stringify(state));
    } catch {
        /* the view simply does not persist */
    }
}

/* ── Export ───────────────────────────────────────────────────────────────── */

/** A column of an export. Matches MJ's `ExportColumn`, so it goes to the export service as is. */
export interface ARExportColumn {
    name: string;
    displayName: string;
    dataType: 'string' | 'number' | 'dateonly';
    numberFormat?: string;
}

export type ARExportRow = Record<string, string | number | null>;

export interface ARExport {
    Columns: ARExportColumn[];
    Rows: ARExportRow[];
}

const MONEY_FORMAT = '#,##0.00';
const DATE_FORMAT = 'mm/dd/yyyy';
const amount = (name: string, displayName: string): ARExportColumn => ({ name, displayName, dataType: 'number', numberFormat: MONEY_FORMAT });

/** What an export is for: Excel takes real dates and shows them `MM/DD/YYYY`; CSV has no formats, so the dates are written that way. */
export type ARExportFormat = 'excel' | 'csv';

/** A calendar day as `YYYY-MM-DD`; null when there is none. */
export function ExportDay(value: DateCell): string | null {
    return ToISODate(value);
}

/** A day as an export cell: a date for Excel to format, or `MM/DD/YYYY` text for CSV. */
function dayCell(value: DateCell, format: ARExportFormat): string | null {
    const day = ToISODate(value);
    if (!day || format === 'excel') return day;
    return `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`;
}

const dateColumn = (name: string, displayName: string, format: ARExportFormat): ARExportColumn =>
    format === 'excel' ? { name, displayName, dataType: 'dateonly', numberFormat: DATE_FORMAT } : { name, displayName, dataType: 'string' };

/** The aging summary: one row per customer, the overview's columns in the overview's order, each row stamped with the as-of day. */
export function BuildSummaryExport(customers: ReadonlyArray<ARCustomer>, asOf: DateCell = null, format: ARExportFormat = 'excel'): ARExport {
    const Columns: ARExportColumn[] = [
        dateColumn('AsOf', 'As of', format),
        { name: 'Customer', displayName: 'Customer', dataType: 'string' },
        amount('Owed', 'A/R'),
        amount('PastDue', 'Past due'),
        amount('Current', 'Current'),
        amount('Days1To30', '1-30 days past due'),
        amount('Days31To60', '31-60 days past due'),
        amount('Days61Plus', '61+ days past due'),
        { name: 'OldestDays', displayName: 'Oldest days past due', dataType: 'number' },
        amount('Scheduled', 'Scheduled, not yet invoiced'),
        amount('ReadyToInvoice', 'Of which ready to invoice'),
        dateColumn('NextDue', 'Next due date', format),
        amount('NextDueAmount', 'Next amount'),
        amount('Credit', 'Credit on account'),
        { name: 'Orders', displayName: 'Orders with a balance', dataType: 'number' },
    ];
    const Rows = customers.map((c) => ({
        AsOf: dayCell(asOf, format),
        Customer: c.Name,
        Owed: c.Owed,
        PastDue: c.PastDue,
        Current: c.Buckets.Current,
        Days1To30: c.Buckets.Days1To30,
        Days31To60: c.Buckets.Days31To60,
        Days61Plus: c.Buckets.Days61Plus,
        OldestDays: c.OldestDaysPastDue,
        Scheduled: c.Scheduled,
        ReadyToInvoice: c.ReadyToInvoice,
        NextDue: dayCell(c.NextDueDate, format),
        NextDueAmount: c.NextDueDate ? c.NextDueAmount : null,
        Credit: c.Credit,
        Orders: c.OrderCount,
    }));
    return { Columns, Rows };
}

/**
 * The detail: one row per invoice or installment.
 *
 * A/R AND SCHEDULED GO IN SEPARATE COLUMNS. In one "Balance" column, summing the sheet would add
 * money that has not been invoiced to the receivable, which is the mistake the page exists to prevent.
 */
export function BuildItemsExport(customers: ReadonlyArray<ARCustomer>, asOf: DateCell = null, format: ARExportFormat = 'excel'): ARExport {
    const Columns: ARExportColumn[] = [
        dateColumn('AsOf', 'As of', format),
        { name: 'Customer', displayName: 'Customer', dataType: 'string' },
        { name: 'Company', displayName: 'Company', dataType: 'string' },
        { name: 'Order', displayName: 'Order', dataType: 'string' },
        { name: 'Item', displayName: 'Type', dataType: 'string' },
        { name: 'Status', displayName: 'Status', dataType: 'string' },
        { name: 'InvoiceNumber', displayName: 'Invoice number', dataType: 'string' },
        dateColumn('InvoiceDate', 'Invoice date', format),
        dateColumn('DueDate', 'Due date', format),
        { name: 'DaysPastDue', displayName: 'Days past due', dataType: 'number' },
        amount('Amount', 'Amount'),
        amount('Paid', 'Paid'),
        amount('Receivable', 'A/R balance'),
        amount('Scheduled', 'Scheduled, not yet invoiced'),
    ];
    const Rows = customers.flatMap((c) =>
        c.Items.map((i) => ({
            AsOf: dayCell(asOf, format),
            Customer: c.Name,
            Company: i.Company,
            Order: i.OrderNumber,
            Item: i.Label,
            Status: ItemStatus(i),
            InvoiceNumber: i.DocumentNumber,
            InvoiceDate: dayCell(i.InvoicedOn, format),
            DueDate: dayCell(i.DueDate, format),
            DaysPastDue: i.State === 'Scheduled' ? null : i.DaysPastDue,
            Amount: i.Amount,
            Paid: i.Paid,
            Receivable: i.State === 'Invoiced' ? i.Balance : null,
            Scheduled: i.State === 'Scheduled' ? i.Balance : null,
        })),
    );
    return { Columns, Rows };
}

/** A file-name fragment from free text: lower case, hyphenated. */
export function Slug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
