import { Injectable } from '@angular/core';
import { Metadata, RunView, type UserInfo } from '@memberjunction/core';

/** MJ entity names, in one place so a rename is one edit. */
/**
 * Whether `OrderHeader.OriginChannel` exists yet.
 *
 * IT DOES NOT. The column is a planned schema wave — the value that records
 * whether an order was keyed by staff or arrived from LXP through the engine.
 * Every affordance that reads it is written and gated behind this ONE flag, so
 * turning the feature on is a single edit here rather than a hunt through pages.
 *
 * WHY A FLAG RATHER THAN DELETED CODE. A filter on a column that does not exist
 * does not degrade — SQL Server rejects the whole statement, so the orders list
 * would fail to load entirely rather than just missing a facet. Gating keeps the
 * intent visible and the list working; deleting would lose the design, and
 * shipping it as-is would break the most-used screen in the app.
 */
export const MJO_ORIGIN_CHANNEL_AVAILABLE = false;

/** Ids reach filter strings as SQL text, so they are shape-checked first. */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const MJO_ENTITIES = {
    OrderHeader: 'MJ_BizApps_Orders: Orders',
    OrderLine: 'MJ_BizApps_Orders: Order Lines',
    PaymentHeader: 'MJ_BizApps_Orders: Payments',
    PaymentLine: 'MJ_BizApps_Orders: Payment Lines',
    Product: 'MJ_BizApps_Orders: Products',
    ProductType: 'MJ_BizApps_Orders: Product Types',
    Subscription: 'MJ_BizApps_Orders: Subscriptions',
    PriceList: 'MJ_BizApps_Orders: Price Lists',
    ProductPrice: 'MJ_BizApps_Orders: Product Prices',
    Promotion: 'MJ_BizApps_Orders: Promotions',
    ChargeType: 'MJ_BizApps_Orders: Charge Types',
} as const;

/** A row as the order list renders it. */
export interface MJOOrderRow extends Record<string, unknown> {
    ID: string;
    OrderNumber: string;
    OrderDate: string;
    Status: string;
    PaymentStatus: string;
    OrderType: string;
    CompanyID: string;
    Company?: string;
    TotalGross: number;
    AmountPaid: number;
    Balance: number;
    DueDate: string | null;
    Description: string | null;
    BillToOrganization?: string | null;
    BillToPerson?: string | null;
    OriginChannel?: string | null;
    OriginExternalID?: string | null;
}

/** A row as the payment list renders it. */
export interface MJOPaymentRow extends Record<string, unknown> {
    ID: string;
    PaymentNumber: string;
    PaymentDate: string;
    Status: string;
    Amount: number;
    ProcessingFeeAmount: number;
    NetAmount: number;
    ReceivingCompanyID: string;
    Company?: string;
    PaymentType?: string | null;
    BillToOrganization?: string | null;
    BillToPerson?: string | null;
}

/**
 * `MJOOrdersDataService` — reads for the list and detail surfaces.
 *
 * A thin, typed layer over `RunView`. It exists so the entity names, the filters
 * that encode real business rules, and the field lists live in one place rather
 * than being restated by every screen that happens to need orders.
 *
 * NOT AN ABSTRACTION OVER MJ. Callers still get plain rows and can still use
 * `RunView` directly for anything unusual — the goal is to stop four screens
 * independently deciding what "open" means, not to hide the framework.
 *
 * ## Example
 *
 * ```typescript
 * const rows = await this.data.GetOrders({ Preset: 'overdue' });
 * ```
 */
@Injectable({ providedIn: 'root' })
export class MJOOrdersDataService {
    /**
     * Orders matching a preset.
     *
     * The presets are the business rules, and each is a filter rather than a
     * stored flag because every one of them changes with the clock or with a
     * rollup:
     *
     * - `overdue` — a balance past its due date. Never a column: it changes as
     *   time passes, not as anything is written, so storing it would need a
     *   nightly job whose only purpose is keeping it honest.
     * - `unpaid` — a balance owing on an order that has confirmed. Drafts are
     *   excluded because a draft owes nothing yet.
     * - `notposted` — confirmed but not yet posted. Normally a matter of seconds;
     *   a row lingering here is worth investigating.
     * - `credits` — a NEGATIVE balance, which IS the customer's credit. There is
     *   no separate instrument to look up.
     */
    public async GetOrders(
        options: {
            Preset?: 'all' | 'overdue' | 'unpaid' | 'notposted' | 'drafts' | 'credits' | 'lxp';
            Search?: string;
            CompanyID?: string;
            BillToOrganizationID?: string;
            MaxRows?: number;
            User?: UserInfo;
        } = {},
    ): Promise<MJOOrderRow[]> {
        const filters: string[] = [];
        const today = new Date().toISOString().slice(0, 10);

        switch (options.Preset) {
            case 'overdue':
                filters.push(`Balance > 0 AND DueDate IS NOT NULL AND DueDate < '${today}'`);
                filters.push(`Status NOT IN ('Draft','Quoted','Voided')`);
                break;
            case 'unpaid':
                filters.push(`Balance > 0 AND Status NOT IN ('Draft','Quoted','Voided')`);
                break;
            case 'notposted':
                filters.push(`Status = 'Confirmed'`);
                break;
            case 'drafts':
                filters.push(`Status IN ('Draft','Quoted')`);
                break;
            case 'credits':
                filters.push(`Balance < 0`);
                break;
            case 'lxp':
                // Guarded rather than silently widened: a preset that quietly
                // returns every order would misreport LXP volume as total volume.
                if (!MJO_ORIGIN_CHANNEL_AVAILABLE) {
                    throw new Error(
                        'The "From LXP" filter needs OrderHeader.OriginChannel, which is not in the schema yet.',
                    );
                }
                filters.push(`OriginChannel = 'LXP'`);
                break;
            default:
                filters.push(`Status <> 'Voided'`);
                break;
        }

        if (options.CompanyID) filters.push(`CompanyID = '${options.CompanyID}'`);
        if (options.BillToOrganizationID) {
            filters.push(`BillToOrganizationID = '${options.BillToOrganizationID}'`);
        }
        if (options.Search?.trim()) {
            const escaped = options.Search.replace(/'/g, "''");
            filters.push(
                `(OrderNumber LIKE '%${escaped}%' OR Description LIKE '%${escaped}%' ` +
                    `OR ExternalDocumentNumber LIKE '%${escaped}%')`,
            );
        }

        return this.run<MJOOrderRow>(MJO_ENTITIES.OrderHeader, filters, 'OrderDate DESC', options.MaxRows, options.User);
    }

    /** Payments, newest first. */
    public async GetPayments(
        options: {
            Preset?: 'all' | 'captured' | 'pending' | 'refunds';
            Search?: string;
            MaxRows?: number;
            User?: UserInfo;
        } = {},
    ): Promise<MJOPaymentRow[]> {
        const filters: string[] = [];
        switch (options.Preset) {
            case 'captured':
                filters.push(`Status = 'Captured'`);
                break;
            case 'pending':
                filters.push(`Status = 'Pending'`);
                break;
            case 'refunds':
                filters.push(`Status = 'Refunded'`);
                break;
            default:
                break;
        }
        if (options.Search?.trim()) {
            const escaped = options.Search.replace(/'/g, "''");
            filters.push(`(PaymentNumber LIKE '%${escaped}%' OR Description LIKE '%${escaped}%')`);
        }
        return this.run<MJOPaymentRow>(
            MJO_ENTITIES.PaymentHeader,
            filters,
            'PaymentDate DESC',
            options.MaxRows,
            options.User,
        );
    }

    /** Active products, for a picker. */
    public async GetProducts(options: { Search?: string; MaxRows?: number; User?: UserInfo } = {}) {
        const filters = [`Status = 'Active'`];
        if (options.Search?.trim()) {
            const escaped = options.Search.replace(/'/g, "''");
            filters.push(`(Name LIKE '%${escaped}%' OR SKU LIKE '%${escaped}%')`);
        }
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.Product,
            filters,
            'Name',
            options.MaxRows ?? 200,
            options.User,
        );
    }

    /** Price rules, highest priority first — that is the order that resolves a tie. */
    public async GetProductPrices(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.ProductPrice,
            [],
            'Priority DESC',
            undefined,
            user,
        );
    }

    /** Promotions, newest window first. */
    public async GetPromotions(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.Promotion,
            [],
            'StartDate DESC',
            undefined,
            user,
        );
    }

    /** Charge types, in the sequence they compute. */
    public async GetChargeTypes(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.ChargeType,
            [],
            // Sequence, not name: the ORDER is the behaviour — non-tax charges run
            // first and enlarge the taxable base, tax charges run after.
            'Sequence',
            undefined,
            user,
        );
    }

    /** Lines belonging to one order. */
    public async GetOrderLines(orderHeaderID: string, user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.OrderLine,
            [`OrderHeaderID = '${orderHeaderID}'`],
            'LineNumber',
            undefined,
            user,
        );
    }

    /**
     * Lines for MANY orders in one query, grouped by order id.
     *
     * WHY THIS EXISTS ALONGSIDE `GetOrderLines`. The fulfillment board needs the
     * lines of every posted order, and asking per order is one round trip per
     * order — fine against a seeded fixture, visibly slow the moment a company has
     * a few hundred posted orders. The single-order method stays because the
     * editor genuinely wants one order's lines.
     *
     * Ids are validated before interpolation: they are composed into an `IN` list,
     * which is SQL text.
     *
     * @param orderHeaderIDs Order ids to fetch lines for. An empty array does no work.
     * @returns A map of order id → its lines, ordered by line number.
     */
    public async GetOrderLinesForOrders(
        orderHeaderIDs: string[],
        user?: UserInfo,
    ): Promise<Map<string, Array<Record<string, unknown>>>> {
        const grouped = new Map<string, Array<Record<string, unknown>>>();
        const ids = [...new Set(orderHeaderIDs)].filter((id) => UUID_PATTERN.test(id));
        if (!ids.length) return grouped;

        const rows = await this.run<Record<string, unknown>>(
            MJO_ENTITIES.OrderLine,
            [`OrderHeaderID IN (${ids.map((id) => `'${id}'`).join(',')})`],
            'LineNumber',
            // One cap for the whole board rather than per order, so a single
            // enormous order cannot silently crowd out every other one.
            5000,
            user,
        );

        for (const row of rows) {
            const key = String(row['OrderHeaderID'] ?? '');
            const list = grouped.get(key);
            if (list) list.push(row);
            else grouped.set(key, [row]);
        }
        return grouped;
    }

    /**
     * One `RunView`, with the provider resolved the standard way.
     *
     * `MaxRows` defaults to 500 rather than being unbounded: these are worklists,
     * and the tail of a ten-thousand-row aging list is not something anyone works
     * through in a table. A screen that needs more should say so explicitly.
     */
    private async run<T>(
        entityName: string,
        filters: string[],
        orderBy: string,
        maxRows?: number,
        user?: UserInfo,
    ): Promise<T[]> {
        const rv = new RunView();
        const result = await rv.RunView<T>(
            {
                EntityName: entityName,
                ExtraFilter: filters.filter(Boolean).join(' AND '),
                OrderBy: orderBy,
                MaxRows: maxRows ?? 500,
                ResultType: 'simple',
            },
            user ?? this.currentUser,
        );
        return result.Success ? (result.Results ?? []) : [];
    }

    private get currentUser(): UserInfo | undefined {
        // The browser session supplies the acting user; on the server a caller
        // passes one explicitly. Reading it lazily keeps this service usable in
        // both places without a constructor dependency.
        return new Metadata().CurrentUser;
    }
}
