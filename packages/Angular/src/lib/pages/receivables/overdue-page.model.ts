/**
 * @fileoverview What the Overdue worklist counts as overdue, stated the way Customer A/R states it.
 *
 * `Orders.GetOverdueWorklist` lists an order once its next unpaid installment's date has passed, and
 * reports the order's whole balance. Two things follow that Customer A/R does not agree with
 * (bc-aidp-next-golive#481): an installment that was never invoiced makes the order "overdue" although
 * the customer has been asked for nothing, and one late installment makes money not due for months
 * look late.
 *
 * So the page reads the unpaid installments too and restates each row here: only invoiced amounts
 * past their own due date are past due, each aged from its own date. An order whose only late
 * installments were never invoiced is not a collections matter; it is listed apart, for the Billing
 * worklist. An order with no schedule reads exactly as the operation returned it.
 *
 * @module @mj-biz-apps/orders-ng
 */
import { type DateCell, type OverdueWorklistRow } from '@mj-biz-apps/orders-entities';
import { DaysSince } from '../../panels/money-format';
import { type MJOAgingBuckets } from '../../panels/aging-bar.component';

/** An unpaid installment as this page reads it. `Scheduled` has no invoice yet. */
export interface OverdueInstalment {
    OrderHeaderID: string;
    DueDate: DateCell;
    Balance: number | null;
    Status?: string | null;
}

/** A worklist row with its invoiced, past-due part worked out. */
export interface OverdueRow extends OverdueWorklistRow {
    /** Invoiced and past its due date. Never more than `Balance`, the order's whole open balance. */
    PastDue: number;
    /** `PastDue` by age, each installment in the band of its own due date. */
    Aged: MJOAgingBuckets;
}

export interface OverdueBook {
    /** Orders with an invoiced amount past due, most overdue first. */
    Rows: OverdueRow[];
    /** Orders whose only late installments were never invoiced: work for the Billing worklist, not for collections. */
    NeverInvoiced: OverdueWorklistRow[];
}

const cents = (n: number | null | undefined): number => Math.round(Number(n ?? 0) * 100);

function band(days: number): keyof MJOAgingBuckets {
    if (days <= 0) return 'Current';
    if (days <= 30) return 'Days1To30';
    if (days <= 60) return 'Days31To60';
    return 'Days61Plus';
}

const iso = (value: DateCell): string | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

/**
 * Restate the operation's rows by installment.
 *
 * @param rows - `Orders.GetOverdueWorklist` rows.
 * @param instalmentsByOrder - Unpaid installments by order ID in lower case, earliest due first
 *   (`GroupInstalmentsByOrder`). Null when they could not be read: the rows are then kept as returned.
 * @param today - The business day, `YYYY-MM-DD`.
 */
export function RestateOverdue(rows: ReadonlyArray<OverdueWorklistRow>, instalmentsByOrder: ReadonlyMap<string, ReadonlyArray<OverdueInstalment>> | null, today: string): OverdueBook {
    const book: OverdueBook = { Rows: [], NeverInvoiced: [] };
    for (const row of rows) {
        const instalments = instalmentsByOrder?.get(String(row.OrderHeaderID).toLowerCase()) ?? [];
        const aged: MJOAgingBuckets = { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };

        if (!instalments.length) {
            // No schedule: the order was invoiced whole, so its balance is past due from its own date.
            aged[band(row.DaysOverdue)] = row.Balance;
            book.Rows.push({ ...row, PastDue: row.DaysOverdue > 0 ? row.Balance : 0, Aged: aged });
            continue;
        }

        let remaining = cents(row.Balance);
        let pastDue = 0;
        let oldest: string | null = null;
        let lateUninvoiced = false;
        for (const instalment of instalments) {
            const take = Math.min(cents(instalment.Balance), remaining);
            if (take <= 0) continue;
            remaining -= take;
            const days = instalment.DueDate ? DaysSince(instalment.DueDate, today) : 0;
            if (days <= 0) continue;
            if (instalment.Status === 'Scheduled') {
                lateUninvoiced = true;
                continue;
            }
            pastDue += take;
            aged[band(days)] += take / 100;
            const due = iso(instalment.DueDate);
            if (due && (!oldest || due < oldest)) oldest = due;
        }
        // What no installment accounts for was invoiced with the order, as Customer A/R reads it, so it
        // is owed whatever the installments' state. It has no date of its own here, so it keeps the
        // date the operation gave the order; that keeps the order in collections, where dropping it
        // because another installment was never invoiced would hide money that is owed.
        if (remaining > 0 && row.DaysOverdue > 0) {
            pastDue += remaining;
            aged[band(row.DaysOverdue)] += remaining / 100;
            if (row.DueDate && (!oldest || row.DueDate < oldest)) oldest = row.DueDate;
        }

        if (pastDue > 0) {
            const due = oldest ?? row.DueDate;
            book.Rows.push({ ...row, DueDate: due, DaysOverdue: Math.max(0, DaysSince(due, today)), PastDue: pastDue / 100, Aged: roundBuckets(aged) });
        } else if (lateUninvoiced) {
            book.NeverInvoiced.push(row);
        } else {
            // Nothing explains why the operation listed it. Keep it: a row that vanishes is worse than one to look into.
            aged[band(row.DaysOverdue)] = row.Balance;
            book.Rows.push({ ...row, PastDue: row.Balance, Aged: aged });
        }
    }
    book.Rows.sort((a, b) => b.DaysOverdue - a.DaysOverdue);
    return book;
}

function roundBuckets(b: MJOAgingBuckets): MJOAgingBuckets {
    const r = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
    return { Current: r(b.Current), Days1To30: r(b.Days1To30), Days31To60: r(b.Days31To60), Days61Plus: r(b.Days61Plus) };
}

/** The rows' past-due amounts by age. */
export function SumAged(rows: ReadonlyArray<OverdueRow>): MJOAgingBuckets {
    const total: MJOAgingBuckets = { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };
    for (const row of rows) {
        total.Days1To30 += row.Aged.Days1To30;
        total.Days31To60 += row.Aged.Days31To60;
        total.Days61Plus += row.Aged.Days61Plus;
    }
    return roundBuckets(total);
}

/**
 * Credit the listed customers hold, each customer counted once. The operation repeats a customer's
 * credit on every one of their orders, so adding the rows up counts it once per order.
 */
export function CreditHeld(rows: ReadonlyArray<OverdueWorklistRow>): number {
    const byCustomer = new Map<string, number>();
    for (const row of rows) {
        const key = (row.BillToOrganizationID ?? row.BillToPersonID ?? row.CustomerName ?? '').toLowerCase();
        byCustomer.set(key, Math.max(byCustomer.get(key) ?? 0, row.AvailableCredit ?? 0));
    }
    return Math.round([...byCustomer.values()].reduce((s, n) => s + n, 0) * 100) / 100;
}
