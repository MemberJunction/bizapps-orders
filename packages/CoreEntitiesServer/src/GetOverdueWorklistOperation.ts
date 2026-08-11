/**
 * @fileoverview `Orders.GetOverdueWorklist` — the collections worklist.
 *
 * WHY THIS IS AN OPERATION AND NOT A VIEW. Overdue is a COMPUTED surface: a
 * balance above zero whose due date has passed. It changes as the clock moves,
 * not as anything is written. Storing it as a column would need a nightly job
 * whose only purpose is keeping that column honest, and the day the job fails the
 * worklist quietly goes stale. So it is derived at read time, server-side —
 * a client cannot filter a column that does not exist.
 *
 * The rows carry more than the aging: each one includes the credit the customer
 * is already holding, because spending that comes before chasing cash, and a
 * collector should not need a second round trip to find out.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import {
    BaseRemotableOperation,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { OverdueFilter } from '@mj-biz-apps/orders-entities';
import {
    OrdersGetOverdueWorklistOperation as OrdersGetOverdueWorklistOperationBase,
    type OrdersGetOverdueWorklistInput,
    type OrdersGetOverdueWorklistOutput,
    type OverdueWorklistRow,
} from '@mj-biz-apps/orders-entities';

import { ORDER_HEADER_ENTITY } from './entity-names.js';
import { RequireDate, RequireUUID } from './sql-guards.js';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/**
 * A calendar date as `YYYY-MM-DD`, whatever the data layer handed over.
 *
 * `RunView` returns SQL `date` columns as **Date objects**, not strings. Everything here used to
 * assume a string and split on `-`, which turns `Thu Jul 31 2026 00:00:00 GMT-0400` into a year of
 * `NaN` and a day count measured from the epoch — an order one month overdue was reported as 46,264
 * days overdue, and the aging buckets put it in `Days61Plus`.
 *
 * Nothing caught it because `DueDate` was null on every order until D83 landed, so this function
 * never ran on real data. The same bug was found and fixed in `InvoiceBuilder`; this is its twin.
 */
function toISODate(value: unknown): string | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        // UTC components: a `date` column has no time and the driver materialises it at midnight UTC,
        // so reading the local ones gives the day before anywhere west of Greenwich.
        return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
    }
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates, rounded so a DST transition does not drift it. */
function daysBetween(from: string, to: string): number {
    const parse = (s: string): number => {
        const [y, m, d] = String(s).split('T')[0].split('-').map(Number);
        return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
    };
    return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** A row as it comes back from the order view. */
interface OrderShape extends Record<string, unknown> {
    ID: string;
    OrderNumber: string;
    OrderDate: string;
    DueDate: string | null;
    Status: string;
    CompanyID: string;
    Company?: string;
    TotalGross: number;
    AmountPaid: number;
    Balance: number;
    Description?: string | null;
    SalesRepUserID?: string | null;
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    BillToOrganization?: string | null;
    BillToPerson?: string | null;
}

/**
 * Assemble the collections worklist.
 *
 * Rows come back OLDEST FIRST — the order a person should work them in, rather
 * than by size. The biggest debt is not always the one most at risk, and sorting
 * by amount buries the small invoice that has been ignored for four months.
 */
@RegisterClass(BaseRemotableOperation, 'Orders.GetOverdueWorklist')
export class GetOverdueWorklistOperation extends OrdersGetOverdueWorklistOperationBase {
    protected async InternalExecute(
        input: OrdersGetOverdueWorklistInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersGetOverdueWorklistOutput> {
        const asOf = RequireDate(input?.AsOfDate ?? new Date().toISOString().slice(0, 10), 'AsOfDate');
        const maxCount = input?.MaxCount ?? 500;

        // ONE definition, shared with the layered base view's `IsOverdue` column. Retyping the
        // predicate here is how this repo ended up with three statements of it that disagreed about
        // voided orders — see the header of `overdue.ts`.
        const filters: string[] = [OverdueFilter(asOf)];

        if (input?.CompanyIDs?.length) {
            const list = input.CompanyIDs.map((id) => `'${RequireUUID(id, 'CompanyIDs')}'`).join(',');
            filters.push(`CompanyID IN (${list})`);
        }
        if (input?.BillToOrganizationID)
            filters.push(`BillToOrganizationID = '${RequireUUID(input.BillToOrganizationID, 'BillToOrganizationID')}'`);
        if (input?.BillToPersonID)
            filters.push(`BillToPersonID = '${RequireUUID(input.BillToPersonID, 'BillToPersonID')}'`);
        if (input?.SalesRepUserID)
            filters.push(`SalesRepUserID = '${RequireUUID(input.SalesRepUserID, 'SalesRepUserID')}'`);
        if (input?.MinBalance != null) filters.push(`Balance >= ${Number(input.MinBalance)}`);

        const rv = RunView.FromMetadataProvider(provider);

        const overdue = await rv.RunView<OrderShape>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: filters.join(' AND '),
                OrderBy: 'DueDate',
                // One more than the cap, so truncation can be reported honestly
                // rather than silently presenting a partial list as complete.
                MaxRows: maxCount + 1,
                ResultType: 'simple',
            },
            user,
        );

        if (!overdue.Success) {
            return this.empty(`Could not read overdue orders: ${overdue.ErrorMessage ?? 'unknown error'}`);
        }

        let rows = overdue.Results ?? [];
        const truncated = rows.length > maxCount;
        if (truncated) rows = rows.slice(0, maxCount);

        // The MinDaysOverdue filter is applied here rather than in SQL: the
        // threshold is relative to `asOf`, and expressing that as a date predicate
        // per row is less clear than one comparison.
        const minDays = input?.MinDaysOverdue ?? 0;
        const aged = rows
            .map((row) => ({ row, days: daysBetween(toISODate(row.DueDate) ?? asOf, asOf) }))
            .filter(({ days }) => days >= minDays);

        const credits = await this.creditsByCustomer(aged.map((a) => a.row), provider, user);

        const worklist: OverdueWorklistRow[] = aged.map(({ row, days }) => {
            const customerKey = row.BillToOrganizationID ?? row.BillToPersonID ?? '';
            return {
                OrderHeaderID: row.ID,
                OrderNumber: row.OrderNumber,
                OrderDate: toISODate(row.OrderDate) ?? '',
                DueDate: toISODate(row.DueDate) ?? '',
                DaysOverdue: days,
                CompanyID: row.CompanyID,
                CompanyName: row.Company ?? '',
                CustomerName: row.BillToOrganization ?? row.BillToPerson ?? '—',
                BillToOrganizationID: row.BillToOrganizationID ?? null,
                BillToPersonID: row.BillToPersonID ?? null,
                TotalGross: money(row.TotalGross),
                AmountPaid: money(row.AmountPaid),
                Balance: money(row.Balance),
                Description: row.Description ?? null,
                SalesRepUserID: row.SalesRepUserID ?? null,
                SalesRepName: null,
                OriginChannel: (row['OriginChannel'] as string) ?? null,
                AvailableCredit: credits.get(customerKey) ?? 0,
            };
        });

        const buckets = { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };
        for (const row of worklist) {
            if (row.DaysOverdue <= 0) buckets.Current += row.Balance;
            else if (row.DaysOverdue <= 30) buckets.Days1To30 += row.Balance;
            else if (row.DaysOverdue <= 60) buckets.Days31To60 += row.Balance;
            else buckets.Days61Plus += row.Balance;
        }
        (Object.keys(buckets) as Array<keyof typeof buckets>).forEach((k) => (buckets[k] = money(buckets[k])));

        return {
            Success: true,
            Rows: worklist,
            TotalOverdue: money(worklist.reduce((s, r) => s + r.Balance, 0)),
            RowCount: worklist.length,
            Truncated: truncated,
            Buckets: buckets,
        };
    }

    /**
     * Credit each customer already holds, as a positive magnitude.
     *
     * A credit is an order with a NEGATIVE balance — there is no separate
     * instrument to look up. Fetched in ONE query across every customer on the
     * worklist rather than per row, because a fifty-row worklist should not cost
     * fifty round trips.
     */
    private async creditsByCustomer(
        rows: OrderShape[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<Map<string, number>> {
        const credits = new Map<string, number>();
        const keys = [
            ...new Set(rows.map((r) => r.BillToOrganizationID ?? r.BillToPersonID).filter(Boolean)),
        ] as string[];
        if (!keys.length) return credits;

        const list = keys.map((k) => `'${RequireUUID(k, 'customer id')}'`).join(',');
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<OrderShape>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter:
                    `Balance < 0 AND Status NOT IN ('Draft','Quoted','Voided') ` +
                    `AND (BillToOrganizationID IN (${list}) OR BillToPersonID IN (${list}))`,
                ResultType: 'simple',
            },
            user,
        );

        for (const row of result.Results ?? []) {
            const key = row.BillToOrganizationID ?? row.BillToPersonID ?? '';
            credits.set(key, money((credits.get(key) ?? 0) + Math.abs(row.Balance)));
        }
        return credits;
    }

    private empty(message: string): OrdersGetOverdueWorklistOutput {
        return {
            Success: false,
            Message: message,
            Rows: [],
            TotalOverdue: 0,
            RowCount: 0,
            Truncated: false,
            Buckets: { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 },
        };
    }
}

/** Registers {@link GetOverdueWorklistOperation}. Called from the server bootstrap. */
export function LoadGetOverdueWorklistOperation(): void {
    void GetOverdueWorklistOperation;
}
