/**
 * `Orders.GetBillingWorklist` — the due-with-no-invoice control (plan §6.3; W6).
 *
 * Jeremy's team relies on this today, by memory and spreadsheet: which instalments have entered
 * their billing window and have no invoice behind them yet. Shipped as an operation with a screen
 * rather than a report somebody remembers to run, next to `Orders.GetOverdueWorklist`, and built
 * the same way — "inside the window" moves with the calendar, not with a write, so it is computed
 * here, per request, from the schedule rows.
 *
 * Every date that crosses the boundary is `YYYY-MM-DD`. `RunView` hands back `Date` objects for a
 * SQL `date` column, and stringifying one of those is how the overdue worklist once reported an
 * order 46,264 days late.
 */
import { BaseRemotableOperation, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersGetBillingWorklistOperation as OrdersGetBillingWorklistOperationBase,
    type BillingWorklistRow,
    type OrdersGetBillingWorklistInput,
    type OrdersGetBillingWorklistOutput,
    ToISODate,
} from '@mj-biz-apps/orders-entities';

import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from './entity-names.js';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import { RequireDate, RequireUUID } from './sql-guards.js';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** Whole days from one ISO day to another, rounded so a DST transition cannot drift it. */
function daysBetween(from: string, to: string): number {
    const parse = (s: string): number => {
        const [y, m, d] = s.split('-').map(Number);
        return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
    };
    return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** `YYYY-MM-DD` plus a number of days. */
function addDays(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

interface ScheduleShape extends Record<string, unknown> {
    ID: string;
    OrderHeaderID: string;
    CompanyID: string;
    Company?: string;
    InstallmentNumber: number;
    DueDate: string;
    Amount: number;
    Status: string;
    Description?: string | null;
}

interface OrderShape extends Record<string, unknown> {
    ID: string;
    OrderNumber: string;
    Status: string;
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    BillToOrganization?: string | null;
    BillToPerson?: string | null;
}

@RegisterClass(BaseRemotableOperation, 'Orders.GetBillingWorklist')
export class GetBillingWorklistOperation extends OrdersGetBillingWorklistOperationBase {
    protected async InternalExecute(
        input: OrdersGetBillingWorklistInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersGetBillingWorklistOutput> {
        // The BUSINESS day, not the UTC one (#209) — `toISOString()` is already tomorrow for the
        // whole American evening, so an evening run would bill against a window starting a day
        // late. The same correction `GetOverdueWorklistOperation` took, for the same reason: the
        // two worklists must answer for the same day or they disagree about which orders are due.
        await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
        const asOf = RequireDate(input?.AsOfDate ?? BusinessTimeZoneEngine.Instance.Today(), 'AsOfDate');
        const windowDays = Math.max(0, Math.floor(Number(input?.WindowDays ?? 30)));
        const windowEnd = addDays(asOf, windowDays);
        const maxCount = input?.MaxCount ?? 500;

        const filters = [`Status = 'Scheduled'`, `DueDate <= '${windowEnd}'`];
        if (input?.CompanyIDs?.length) {
            filters.push(`CompanyID IN (${input.CompanyIDs.map((id) => `'${RequireUUID(id, 'CompanyIDs')}'`).join(',')})`);
        }

        const rv = RunView.FromMetadataProvider(provider);
        const due = await rv.RunView<ScheduleShape>(
            {
                EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
                ExtraFilter: filters.join(' AND '),
                OrderBy: 'DueDate, InstallmentNumber',
                // One more than the cap, so truncation is reported rather than a partial list
                // presented as complete.
                MaxRows: maxCount + 1,
                ResultType: 'simple',
            },
            user,
        );
        if (!due.Success) return this.empty(`Could not read the payment schedule: ${due.ErrorMessage ?? 'unknown error'}`, asOf, windowEnd);

        let rows = due.Results ?? [];
        const truncated = rows.length > maxCount;
        if (truncated) rows = rows.slice(0, maxCount);
        if (!rows.length) return { ...this.empty('', asOf, windowEnd), Success: true, Message: undefined };

        const orderIDs = [...new Set(rows.map((r) => `'${RequireUUID(r.OrderHeaderID, 'OrderHeaderID')}'`))].join(',');
        const [orders, siblings] = await Promise.all([
            rv.RunView<OrderShape>(
                {
                    EntityName: ORDER_HEADER_ENTITY,
                    ExtraFilter: `ID IN (${orderIDs})`,
                    Fields: ['ID', 'OrderNumber', 'Status', 'BillToOrganizationID', 'BillToPersonID', 'BillToOrganization', 'BillToPerson'],
                    ResultType: 'simple',
                },
                user,
            ),
            // Every live instalment on those orders, so "2 of 4" can be said.
            rv.RunView<ScheduleShape>(
                {
                    EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
                    ExtraFilter: `OrderHeaderID IN (${orderIDs}) AND Status <> 'Canceled'`,
                    Fields: ['ID', 'OrderHeaderID', 'CompanyID'],
                    ResultType: 'simple',
                },
                user,
            ),
        ]);
        if (!orders.Success || !siblings.Success) {
            return this.empty(`Could not read the orders behind the schedule: ${orders.ErrorMessage ?? siblings.ErrorMessage ?? 'unknown error'}`, asOf, windowEnd);
        }

        const orderByID = new Map((orders.Results ?? []).map((o) => [String(o.ID).toLowerCase(), o]));
        const countKey = (orderID: string, companyID: string): string => `${String(orderID).toLowerCase()}|${String(companyID).toLowerCase()}`;
        const counts = new Map<string, number>();
        for (const s of siblings.Results ?? []) {
            const k = countKey(s.OrderHeaderID, s.CompanyID);
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }

        const worklist: BillingWorklistRow[] = rows.map((r) => {
            const order = orderByID.get(String(r.OrderHeaderID).toLowerCase());
            const dueDate = ToISODate(r.DueDate) ?? asOf;
            return {
                OrderHeaderPaymentScheduleID: r.ID,
                OrderHeaderID: r.OrderHeaderID,
                OrderNumber: order?.OrderNumber ?? '—',
                InstallmentNumber: Number(r.InstallmentNumber),
                InstallmentCount: counts.get(countKey(r.OrderHeaderID, r.CompanyID)) ?? 1,
                DueDate: dueDate,
                DaysUntilDue: daysBetween(asOf, dueDate),
                Amount: money(r.Amount),
                CompanyID: r.CompanyID,
                CompanyName: r.Company ?? '',
                CustomerName: order?.BillToOrganization ?? order?.BillToPerson ?? '—',
                BillToOrganizationID: order?.BillToOrganizationID ?? null,
                BillToPersonID: order?.BillToPersonID ?? null,
                Description: r.Description ?? null,
                OrderStatus: order?.Status ?? '—',
            };
        });

        return {
            Success: true,
            Rows: worklist,
            TotalDue: money(worklist.reduce((s, r) => s + r.Amount, 0)),
            RowCount: worklist.length,
            Truncated: truncated,
            AsOfDate: asOf,
            WindowEnd: windowEnd,
        };
    }

    private empty(message: string, asOf: string, windowEnd: string): OrdersGetBillingWorklistOutput {
        return { Success: false, Message: message, Rows: [], TotalDue: 0, RowCount: 0, Truncated: false, AsOfDate: asOf, WindowEnd: windowEnd };
    }
}

/** Registers {@link GetBillingWorklistOperation}. Called from the server bootstrap. */
export function LoadGetBillingWorklistOperation(): void {
    void GetBillingWorklistOperation;
}
