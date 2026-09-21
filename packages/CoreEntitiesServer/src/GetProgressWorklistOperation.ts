/**
 * `Orders.GetProgressWorklist` — the monthly attestation list (plan §9.4, version 1; W11).
 *
 * Every booked percentage-of-completion line, its last posted observation, and what has been
 * recognised so far — so the delivery lead can state this period's percent. That is the whole
 * feedback loop Jeremy said was missing; it needs an owner and a cadence, not automation.
 *
 * Built like `Orders.GetBillingWorklist`: the set is computed per request from the rows, because
 * "open" moves as observations post. POC-ness is decided the way booking decides it — the product's
 * revenue recognition type, else its product type's default — so this list and the ledger agree.
 */
import { BaseRemotableOperation, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    LoadOrdersEngine,
    OrdersEngine,
    OrdersGetProgressWorklistOperation as OrdersGetProgressWorklistOperationBase,
    ToISODate,
    type OrdersGetProgressWorklistInput,
    type OrdersGetProgressWorklistOutput,
    type ProgressWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY, ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';
import { ResolveRevenueRecognitionTypeID } from './SubscriptionBehavior.js';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

interface LineShape extends Record<string, unknown> {
    ID: string;
    OrderHeaderID: string;
    ProductID: string;
    Product?: string | null;
    CompanyID: string;
    Company?: string | null;
    LineNumber: number;
    LineTotalNet: number | null;
    ServicePeriodStart?: unknown;
    ServicePeriodEnd?: unknown;
}

interface OrderShape extends Record<string, unknown> {
    ID: string;
    OrderNumber: string;
    Status: string;
    BillToOrganization?: string | null;
    BillToPerson?: string | null;
}

interface MeasurementShape extends Record<string, unknown> {
    OrderLineID: string;
    MeasurementDate: unknown;
    PercentComplete: number;
    RecognitionAmount: number | null;
    AttestedByUser?: string | null;
}

@RegisterClass(BaseRemotableOperation, 'Orders.GetProgressWorklist')
export class GetProgressWorklistOperation extends OrdersGetProgressWorklistOperationBase {
    protected async InternalExecute(
        input: OrdersGetProgressWorklistInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersGetProgressWorklistOutput> {
        const maxCount = Math.max(1, Math.floor(Number(input?.MaxCount ?? 500)));
        const pocProductIDs = await this.pocProductIDs(provider, user);
        if (pocProductIDs.length === 0) return { Success: true, Rows: [], RowCount: 0, Truncated: false };

        const filters = [`ProductID IN (${pocProductIDs.map((id) => `'${id}'`).join(',')})`, `JournalEntryID IS NOT NULL`];
        if (input?.CompanyIDs?.length) {
            filters.push(`CompanyID IN (${input.CompanyIDs.map((id) => `'${RequireUUID(id, 'CompanyIDs')}'`).join(',')})`);
        }
        const rv = RunView.FromMetadataProvider(provider);
        const lines = await rv.RunView<LineShape>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: filters.join(' AND '),
                Fields: ['ID', 'OrderHeaderID', 'ProductID', 'Product', 'CompanyID', 'Company', 'LineNumber', 'LineTotalNet', 'ServicePeriodStart', 'ServicePeriodEnd'],
                OrderBy: 'OrderHeaderID, LineNumber',
                ResultType: 'simple',
            },
            user,
        );
        if (!lines.Success) return { Success: false, Message: `Could not read the order lines: ${lines.ErrorMessage ?? 'unknown error'}`, Rows: [], RowCount: 0, Truncated: false };
        const lineRows = lines.Results ?? [];
        if (lineRows.length === 0) return { Success: true, Rows: [], RowCount: 0, Truncated: false };

        const lineIDs = lineRows.map((l) => `'${RequireUUID(l.ID, 'ID')}'`).join(',');
        const orderIDs = [...new Set(lineRows.map((l) => `'${RequireUUID(l.OrderHeaderID, 'OrderHeaderID')}'`))].join(',');
        const [orders, measurements] = await Promise.all([
            rv.RunView<OrderShape>(
                { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID IN (${orderIDs})`, Fields: ['ID', 'OrderNumber', 'Status', 'BillToOrganization', 'BillToPerson'], ResultType: 'simple' },
                user,
            ),
            rv.RunView<MeasurementShape>(
                {
                    EntityName: ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY,
                    ExtraFilter: `OrderLineID IN (${lineIDs}) AND Status = 'Posted'`,
                    Fields: ['OrderLineID', 'MeasurementDate', 'PercentComplete', 'RecognitionAmount', 'AttestedByUser'],
                    OrderBy: 'MeasurementDate',
                    ResultType: 'simple',
                    BypassCache: true,
                },
                user,
            ),
        ]);
        if (!orders.Success || !measurements.Success) {
            return { Success: false, Message: `Could not read the orders or observations: ${orders.ErrorMessage ?? measurements.ErrorMessage ?? 'unknown error'}`, Rows: [], RowCount: 0, Truncated: false };
        }

        const orderByID = new Map((orders.Results ?? []).map((o) => [String(o.ID).toLowerCase(), o]));
        // Observations arrive oldest first, so the last write per line wins and the sum accumulates.
        const lastByLine = new Map<string, MeasurementShape>();
        const recognizedByLine = new Map<string, number>();
        for (const m of measurements.Results ?? []) {
            const key = String(m.OrderLineID).toLowerCase();
            lastByLine.set(key, m);
            recognizedByLine.set(key, money((recognizedByLine.get(key) ?? 0) + Number(m.RecognitionAmount ?? 0)));
        }

        const all: ProgressWorklistRow[] = lineRows.map((l) => {
            const key = String(l.ID).toLowerCase();
            const order = orderByID.get(String(l.OrderHeaderID).toLowerCase());
            const last = lastByLine.get(key);
            return {
                OrderLineID: l.ID,
                OrderHeaderID: l.OrderHeaderID,
                OrderNumber: order?.OrderNumber ?? '—',
                LineNumber: Number(l.LineNumber),
                ProductName: l.Product ?? '—',
                CompanyID: l.CompanyID,
                CompanyName: l.Company ?? '',
                CustomerName: order?.BillToOrganization ?? order?.BillToPerson ?? '—',
                LineAmount: money(Math.abs(Number(l.LineTotalNet ?? 0))),
                ServicePeriodStart: ToISODate(l.ServicePeriodStart),
                ServicePeriodEnd: ToISODate(l.ServicePeriodEnd),
                LastMeasurementDate: last ? ToISODate(last.MeasurementDate) : null,
                LastPercentComplete: last ? Number(last.PercentComplete) : 0,
                RecognizedToDate: recognizedByLine.get(key) ?? 0,
                LastAttestedBy: last?.AttestedByUser ?? null,
                OrderStatus: order?.Status ?? '—',
            };
        });
        const open = input?.IncludeComplete ? all : all.filter((r) => r.LastPercentComplete < 1);
        const truncated = open.length > maxCount;
        const rows = truncated ? open.slice(0, maxCount) : open;
        return { Success: true, Rows: rows, RowCount: rows.length, Truncated: truncated };
    }

    /** Products whose EFFECTIVE revenue recognition type is OnMeasurement — the product's own, else its type's default. */
    private async pocProductIDs(provider: IMetadataProvider, user: UserInfo): Promise<string[]> {
        await LoadOrdersEngine(provider, user);
        const engine = OrdersEngine.Instance;
        const pocTypeIDs = new Set(engine.RevenueRecognitionTypes.filter((t) => t.ScheduleBasis === 'OnMeasurement').map((t) => t.ID.toLowerCase()));
        if (pocTypeIDs.size === 0) return [];
        return engine.Products
            .filter((p) => {
                const id = ResolveRevenueRecognitionTypeID(p.RevenueRecognitionTypeID, engine.ProductTypeByID(p.ProductTypeID)?.DefaultRevenueRecognitionTypeID);
                return !!id && pocTypeIDs.has(id.toLowerCase());
            })
            .map((p) => RequireUUID(p.ID, 'ProductID'));
    }
}

/** Registers {@link GetProgressWorklistOperation}. Called from the server bootstrap. */
export function LoadGetProgressWorklistOperation(): void {
    void GetProgressWorklistOperation;
}
