/**
 * `Orders.GetExternalInvoicingWorklist` — what is invoiceable on a rail and not yet sent.
 *
 * Two sources, one list:
 *   · orders billed as a whole: Confirmed, Balance > 0, no schedule rows, selling company has an
 *     active rail, and NO `ExternalInvoice` history for the unit (a cancelled or failed unit is a
 *     person's call — design D-B7 — and appears only under `IncludeFailed`);
 *   · instalments: `Invoiced` with `SentAt IS NULL`, company has a rail, same history rule.
 *
 * Built like `GetBillingWorklist`: computed per request from the rows, never stored, because "unsent"
 * moves with sends and cancels, not with a nightly write.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersGetExternalInvoicingWorklistOperation as OrdersGetExternalInvoicingWorklistOperationBase,
    type ExternalInvoicingWorklistRow,
    type OrdersGetExternalInvoicingWorklistInput,
    type OrdersGetExternalInvoicingWorklistOutput,
} from '@mj-biz-apps/orders-entities';

import { EXTERNAL_INVOICE_ENTITY, ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { money } from './ExternalInvoiceBehavior.js';
import { DocumentNumber as CompanyDocumentNumber } from './InvoiceBehavior.js';
import { ListInvoiceRailProviderIDs } from './InvoiceRailResolver.js';
import { ScheduleSupported, type ExternalInvoiceRow } from './IssueExternalInvoiceOperation.js';
import { RequireUUID } from './sql-guards.js';

const DEFAULT_MAX = 200;
const isoDate = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString().slice(0, 10));
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());

interface OrderRow extends Record<string, unknown> {
    ID: string;
    OrderNumber: string;
    Status: string;
    CompanyID: string;
    Balance: number;
    DueDate: unknown;
    ConfirmedAt: unknown;
    BillToOrganization: string | null;
    BillToPerson: string | null;
    Company: string | null;
}

interface ScheduleRow extends Record<string, unknown> {
    ID: string;
    OrderHeaderID: string;
    CompanyID: string;
    Company?: string | null;
    InstallmentNumber: number;
    DueDate: unknown;
    Amount: number;
    Status: string;
    DocumentNumber: string | null;
    InvoicedAt: unknown;
    SentAt: unknown;
}

@RegisterClass(BaseRemotableOperation, 'Orders.GetExternalInvoicingWorklist')
export class GetExternalInvoicingWorklistOperation extends OrdersGetExternalInvoicingWorklistOperationBase {
    protected async InternalExecute(
        input: OrdersGetExternalInvoicingWorklistInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersGetExternalInvoicingWorklistOutput> {
        try {
            const rows = await BuildExternalInvoicingWorklist(
                { CompanyIDs: input?.CompanyIDs ?? null, IncludeFailed: !!input?.IncludeFailed },
                provider,
                user,
            );
            const maxCount = Math.max(1, Math.floor(Number(input?.MaxCount ?? DEFAULT_MAX)));
            const truncated = rows.length > maxCount;
            const kept = truncated ? rows.slice(0, maxCount) : rows;
            return { Success: true, Rows: kept, RowCount: kept.length, Truncated: truncated };
        } catch (err) {
            LogError(`Orders.GetExternalInvoicingWorklist failed: ${err}`);
            return { Success: false, Message: err instanceof Error ? err.message : String(err), Rows: [], RowCount: 0, Truncated: false };
        }
    }
}

/** Registers {@link GetExternalInvoicingWorklistOperation}. Called from the server bootstrap. */
export function LoadGetExternalInvoicingWorklistOperation(): void {
    void GetExternalInvoicingWorklistOperation;
}

/** The worklist as rows, oldest-invoiceable first. Shared with the sweep. */
export async function BuildExternalInvoicingWorklist(
    opts: { CompanyIDs: string[] | null; IncludeFailed: boolean },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ExternalInvoicingWorklistRow[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);

    // Companies with a rail, optionally narrowed.
    const providers = await ListInvoiceRailProviderIDs(provider, user);
    const wanted = opts.CompanyIDs?.map((c) => RequireUUID(c, 'CompanyIDs').toLowerCase()) ?? null;
    const railCompanies = new Map<string, string>(); // companyID → providerID
    for (const p of providers) {
        const c = String(p.CompanyID).toLowerCase();
        if (!wanted || wanted.includes(c)) railCompanies.set(c, p.ID);
    }
    if (!railCompanies.size) return [];
    const companyList = [...railCompanies.keys()].map((c) => `'${c}'`).join(',');

    // Every external-invoice row for those providers: history and state come from here.
    const history = await rv.RunView<ExternalInvoiceRow>(
        { EntityName: EXTERNAL_INVOICE_ENTITY, ExtraFilter: `PaymentProviderID IN (${[...railCompanies.values()].map((id) => `'${id}'`).join(',')})`, ResultType: 'simple' },
        user,
    );
    const byUnit = new Map<string, ExternalInvoiceRow[]>();
    const unitKey = (orderID: string, companyID: string, scheduleID: string | null) => `${orderID}|${companyID}|${scheduleID ?? ''}`.toLowerCase();
    for (const h of history.Results ?? []) {
        const k = unitKey(String(h.OrderHeaderID), String(h.CompanyID), h.OrderHeaderPaymentScheduleID ? String(h.OrderHeaderPaymentScheduleID) : null);
        byUnit.set(k, [...(byUnit.get(k) ?? []), h]);
    }
    const stateOf = (rows: ExternalInvoiceRow[] | undefined): { State: ExternalInvoicingWorklistRow['State'] | 'Sent' | 'Skip'; Row: ExternalInvoiceRow | null } => {
        if (!rows?.length) return { State: 'Unsent', Row: null };
        const live = rows.find((r) => r.Status === 'Sent');
        if (live) return { State: 'Sent', Row: live };
        const inflight = rows.find((r) => r.Status === 'Sending');
        if (inflight) return { State: 'InFlight', Row: inflight };
        const failed = rows.find((r) => r.Status === 'Failed');
        if (failed && !rows.some((r) => r.Status === 'Canceled')) return { State: 'Failed', Row: failed };
        return { State: 'Skip', Row: rows[0] }; // cancelled: a person's call (D-B7)
    };

    const out: ExternalInvoicingWorklistRow[] = [];

    // Instalments first, when the table exists.
    const scheduledOrderIDs = new Set<string>();
    if (ScheduleSupported(provider)) {
        const all = await rv.RunView<ScheduleRow>(
            { EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ExtraFilter: `CompanyID IN (${companyList}) AND Status <> 'Canceled'`, ResultType: 'simple' },
            user,
        );
        const rows = all.Results ?? [];
        for (const s of rows) scheduledOrderIDs.add(String(s.OrderHeaderID).toLowerCase());
        const due = rows.filter((s) => s.Status === 'Invoiced' && s.SentAt == null);
        if (due.length) {
            const orders = await loadOrders(rv, user, [...new Set(due.map((s) => String(s.OrderHeaderID)))]);
            for (const s of due) {
                const order = orders.get(String(s.OrderHeaderID).toLowerCase());
                if (!order) continue;
                const st = stateOf(byUnit.get(unitKey(String(s.OrderHeaderID), String(s.CompanyID), String(s.ID))));
                if (st.State === 'Sent' || st.State === 'Skip') continue;
                if (st.State !== 'Unsent' && !opts.IncludeFailed) continue;
                out.push({
                    OrderHeaderID: String(s.OrderHeaderID),
                    OrderNumber: order.OrderNumber,
                    CompanyID: String(s.CompanyID),
                    CompanyName: s.Company ?? order.Company ?? '',
                    OrderHeaderPaymentScheduleID: String(s.ID),
                    InstallmentNumber: Number(s.InstallmentNumber),
                    DocumentNumber: s.DocumentNumber ?? `${order.OrderNumber}-${s.InstallmentNumber}`,
                    Amount: money(Number(s.Amount)),
                    DueDate: isoDate(s.DueDate),
                    CustomerName: order.BillToOrganization ?? order.BillToPerson ?? '—',
                    State: st.State,
                    ExternalInvoiceID: st.Row?.ID ?? null,
                    LastError: st.Row?.LastError ?? null,
                    SinceAt: iso(s.InvoicedAt),
                });
            }
        }
    }

    // Orders billed as a whole.
    const confirmed = await rv.RunView<OrderRow>(
        { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `Status = 'Confirmed' AND Balance > 0`, OrderBy: 'ConfirmedAt', ResultType: 'simple' },
        user,
    );
    const candidates = (confirmed.Results ?? []).filter((o) => !scheduledOrderIDs.has(String(o.ID).toLowerCase()));
    if (candidates.length) {
        const lines = await rv.RunView<{ OrderHeaderID: string; CompanyID: string }>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID IN (${candidates.map((o) => `'${RequireUUID(o.ID, 'OrderHeaderID')}'`).join(',')})`, Fields: ['OrderHeaderID', 'CompanyID'], ResultType: 'simple' },
            user,
        );
        const companiesByOrder = new Map<string, string[]>();
        for (const l of lines.Results ?? []) {
            const k = String(l.OrderHeaderID).toLowerCase();
            const set = companiesByOrder.get(k) ?? [];
            const c = String(l.CompanyID).toLowerCase();
            if (!set.includes(c)) set.push(c);
            companiesByOrder.set(k, set);
        }
        for (const o of candidates) {
            const companies = (companiesByOrder.get(String(o.ID).toLowerCase()) ?? [String(o.CompanyID).toLowerCase()]).sort();
            companies.forEach((c, idx) => {
                if (!railCompanies.has(c)) return;
                const st = stateOf(byUnit.get(unitKey(String(o.ID), c, null)));
                if (st.State === 'Sent' || st.State === 'Skip') return;
                if (st.State !== 'Unsent' && !opts.IncludeFailed) return;
                out.push({
                    OrderHeaderID: String(o.ID),
                    OrderNumber: o.OrderNumber,
                    CompanyID: c,
                    CompanyName: String(o.CompanyID).toLowerCase() === c ? (o.Company ?? '') : '',
                    OrderHeaderPaymentScheduleID: null,
                    InstallmentNumber: null,
                    DocumentNumber: st.Row?.DocumentNumber ?? CompanyDocumentNumber(o.OrderNumber, idx, companies.length),
                    Amount: st.Row ? money(Number(st.Row.Amount)) : companies.length === 1 ? money(Number(o.Balance)) : 0,
                    DueDate: isoDate(o.DueDate),
                    CustomerName: o.BillToOrganization ?? o.BillToPerson ?? '—',
                    State: st.State,
                    ExternalInvoiceID: st.Row?.ID ?? null,
                    LastError: st.Row?.LastError ?? null,
                    SinceAt: iso(o.ConfirmedAt),
                });
            });
        }
    }

    out.sort((a, b) => (a.SinceAt ?? '').localeCompare(b.SinceAt ?? ''));
    return out;
}

async function loadOrders(rv: RunView, user: UserInfo, ids: string[]): Promise<Map<string, OrderRow>> {
    const map = new Map<string, OrderRow>();
    if (!ids.length) return map;
    const r = await rv.RunView<OrderRow>(
        { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID IN (${ids.map((id) => `'${RequireUUID(id, 'OrderHeaderID')}'`).join(',')})`, ResultType: 'simple' },
        user,
    );
    for (const o of r.Results ?? []) map.set(String(o.ID).toLowerCase(), o);
    return map;
}
