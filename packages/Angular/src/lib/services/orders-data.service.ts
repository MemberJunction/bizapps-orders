import { Injectable } from '@angular/core';
import { Metadata, RunView, type UserInfo } from '@memberjunction/core';

/** MJ entity names, in one place so a rename is one edit. */
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
