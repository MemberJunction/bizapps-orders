import { Injectable } from '@angular/core';
import { Metadata, RunView, type RunViewParams, type UserInfo } from '@memberjunction/core';

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

/**
 * Entity names, exactly as MJ's metadata registers them.
 *
 * These are looked up by STRING at runtime. A wrong name does not fail to
 * compile and does not throw where it is written — `RunView` rejects it deep in
 * the provider with "Entity ... not found in metadata", which surfaces as an
 * empty list. Every screen then renders its empty state, which is
 * indistinguishable from a database that genuinely has no rows.
 *
 * `Order Headers` and `Payment Headers` were `Orders` and `Payments` here until a
 * run against a live database showed every dashboard tile reading zero. The names
 * are verified by orders-data.service.test.ts against the entity list.
 */
export const MJO_ENTITIES = {
    OrderHeader: 'MJ_BizApps_Orders: Order Headers',
    OrderLine: 'MJ_BizApps_Orders: Order Lines',
    PaymentHeader: 'MJ_BizApps_Orders: Payment Headers',
    PaymentLine: 'MJ_BizApps_Orders: Payment Lines',
    Product: 'MJ_BizApps_Orders: Products',
    ProductType: 'MJ_BizApps_Orders: Product Types',
    ProductCategory: 'MJ_BizApps_Orders: Product Categories',
    Subscription: 'MJ_BizApps_Orders: Subscriptions',
    PriceList: 'MJ_BizApps_Orders: Price Lists',
    ProductPrice: 'MJ_BizApps_Orders: Product Prices',
    Promotion: 'MJ_BizApps_Orders: Promotions',
    PriceTier: 'MJ_BizApps_Orders: Price Tiers',
    OrderLineDimension: 'MJ_BizApps_Orders: Order Line Dimensions',
    PaymentType: 'MJ_BizApps_Orders: Payment Types',
    SubscriptionTerm: 'MJ_BizApps_Orders: Subscription Terms',
    SubscriptionEvent: 'MJ_BizApps_Orders: Subscription Events',
    ChargeType: 'MJ_BizApps_Orders: Charge Types',
    TaxExemption: 'MJ_BizApps_Orders: Customer Tax Exemptions',
} as const;

/**
 * Entities this app READS from the accounting app.
 *
 * Kept apart from MJO_ENTITIES so the boundary is visible at the call site: these
 * are somebody else's records, and a change to them is a change in another
 * repository. The dependency points UP the graph (D44) — Orders knows about
 * Accounting, never the reverse.
 *
 * Note the separator: Orders and Accounting use UNDERSCORES in the prefix, while
 * Common uses DOTS. It reads like a typo every time and is not one.
 */
/**
 * Entities read from the COMMON app — the shared party model.
 *
 * Note the separator: Common uses DOTS where Orders and Accounting use
 * underscores. It reads like a typo every time and is not one.
 */
export const MJO_COMMON_ENTITIES = {
    Organization: 'MJ_BizApps_Common: Organizations',
    Person: 'MJ_BizApps_Common: People',
} as const;

export const MJO_ACCOUNTING_ENTITIES = {
    TaxJurisdiction: 'MJ_BizApps_Accounting: Tax Jurisdictions',
    TaxRate: 'MJ_BizApps_Accounting: Tax Rates',
    // SINGULAR — CodeGen leaves 'Nexus' alone rather than forming 'Nexuses'.
    CompanyTaxNexus: 'MJ_BizApps_Accounting: Company Tax Nexus',
    /**
     * The ledger an order books into. READ-ONLY here, always: orders creates Pending entries and
     * owns nothing in the ledger, and the UI role's permissions say the same (CanRead, and neither
     * CanCreate nor CanUpdate).
     */
    JournalEntry: 'MJ_BizApps_Accounting: Journal Entries',
} as const;

/** A company an order can be raised under. */
export interface MJOCompanyOption {
    ID: string;
    Name: string;
}

/** A row as the order list renders it. */
/** Canonical 8-4-4-4-12 hex form. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

/** Counts and totals for the orders list header. */
export interface MJOOrderSummary {
    Total: number;
    TotalValue: number;
    OpenBalance: number;
    /** A positive magnitude — the strip renders the direction, not the sign. */
    CreditsHeld: number;
    /** Keyed by preset, for the chip pills. */
    Counts: Record<string, number>;
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
     * Entities whose last read came back capped.
     *
     * Deliberately NOT a UI element — the fix for a truncated total is a
     * server-side aggregate, not a disclaimer next to a wrong number. This exists
     * so the condition is *detectable* (by a test, by a caller that wants to
     * refuse to render a total, or by anyone reading the console) instead of
     * being invisible until someone reconciles by hand.
     */
    private readonly truncated = new Set<string>();

    /** True when the last read of `entityName` was capped by `MaxRows`. */
    public WasTruncated(entityName: string): boolean {
        return this.truncated.has(entityName);
    }

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
            /** One specific order. Cheaper and exact where a caller already has the ID. */
            OrderHeaderID?: string;
            Search?: string;
            CompanyID?: string;
            BillToOrganizationID?: string;
            /**
             * Filter to ONE person's orders, server-side.
             *
             * Its absence was a real performance bug, not an omission: fast entry's `ChooseCustomer`
             * called `GetOrders({})` for a person — every order in the database — and filtered in the
             * browser. That is invisible on a fresh instance and gets steadily worse with every order
             * taken, which is exactly how it presented: "selecting a customer started getting slow".
             */
            BillToPersonID?: string;
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

        // Guarded rather than interpolated raw. The server package has `RequireUUID` for exactly
        // this, but it does not ship to the browser, so this is the same idea locally: an id that
        // is not a UUID never reaches the filter string.
        if (options.OrderHeaderID) {
            if (!UUID_RE.test(options.OrderHeaderID)) throw new Error(`OrderHeaderID is not a UUID: ${options.OrderHeaderID}`);
            filters.push(`ID = '${options.OrderHeaderID}'`);
        }
        if (options.CompanyID) filters.push(`CompanyID = '${options.CompanyID}'`);
        if (options.BillToPersonID) filters.push(`BillToPersonID = '${options.BillToPersonID}'`);
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

    /**
     * The counts and totals the orders list shows above its table.
     *
     * ONE query, not one per preset. The presets partition the same population
     * six different ways, so six COUNT round trips would ask the database the
     * same question repeatedly to fill one strip. This reads the few columns the
     * arithmetic needs and derives every figure from them.
     *
     * The filters mirror `GetOrders` exactly. They are stated once here as the
     * same expressions rather than re-queried, because a count that disagrees
     * with the list it labels is worse than no count.
     */
    public async GetOrderSummary(user?: UserInfo): Promise<MJOOrderSummary> {
        const rows = await this.run<MJOOrderRow>(
            MJO_ENTITIES.OrderHeader,
            [`Status <> 'Voided'`],
            'OrderDate DESC',
            5000,
            user,
        );
        const today = new Date().toISOString().slice(0, 10);
        const settleable = (o: MJOOrderRow): boolean =>
            !['Draft', 'Quoted', 'Voided'].includes(o.Status);

        const credits = rows.filter((o) => settleable(o) && o.Balance < 0);
        const owing = rows.filter((o) => settleable(o) && o.Balance > 0);

        return {
            Total: rows.length,
            TotalValue: rows.reduce((sum, o) => sum + Number(o.TotalGross ?? 0), 0),
            OpenBalance: owing.reduce((sum, o) => sum + Number(o.Balance ?? 0), 0),
            CreditsHeld: Math.abs(credits.reduce((sum, o) => sum + Number(o.Balance ?? 0), 0)),
            Counts: {
                all: rows.length,
                overdue: owing.filter((o) => o.DueDate && o.DueDate < today).length,
                unpaid: owing.length,
                notposted: rows.filter((o) => o.Status === 'Confirmed').length,
                drafts: rows.filter((o) => ['Draft', 'Quoted'].includes(o.Status)).length,
                credits: credits.length,
            },
        };
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
            // The window columns are EffectiveFrom/EffectiveTo. `StartDate` does not
            // exist on this entity, and ordering by it made SQL Server reject the
            // whole query — so the promotions screen showed "No promotions", which
            // reads as an empty catalog rather than a broken one.
            'EffectiveFrom DESC',
            undefined,
            user,
        );
    }

    /**
     * One customer's payments and subscriptions, in one round trip each.
     *
     * The A/R screen shows a customer at a time, so these are fetched for the
     * SELECTED customer rather than for everyone up front — a hundred customers'
     * payment histories to render one is work with no answer attached to it.
     */
    public async GetPaymentsForCustomer(
        customer: { OrganizationID?: string | null; PersonID?: string | null },
        user?: UserInfo,
    ) {
        const filters: string[] = [];
        if (customer.OrganizationID && UUID_PATTERN.test(customer.OrganizationID)) {
            filters.push(`BillToOrganizationID = '${customer.OrganizationID}'`);
        } else if (customer.PersonID && UUID_PATTERN.test(customer.PersonID)) {
            filters.push(`BillToPersonID = '${customer.PersonID}'`);
        } else {
            return [];
        }
        return this.run<MJOPaymentRow>(
            MJO_ENTITIES.PaymentHeader,
            filters,
            'PaymentDate DESC',
            50,
            user,
        );
    }

    /**
     * Subscriptions a customer holds or benefits from.
     *
     * Both sides are checked because they are genuinely different roles — an
     * employer HOLDS a seat that an employee BENEFITS from, and the A/R screen
     * wants either to count as "theirs".
     */
    public async GetSubscriptionsForCustomer(
        customer: { OrganizationID?: string | null; PersonID?: string | null },
        user?: UserInfo,
    ) {
        const clauses: string[] = [];
        if (customer.OrganizationID && UUID_PATTERN.test(customer.OrganizationID)) {
            clauses.push(`HolderOrganizationID = '${customer.OrganizationID}'`);
        }
        if (customer.PersonID && UUID_PATTERN.test(customer.PersonID)) {
            clauses.push(`BeneficiaryPersonID = '${customer.PersonID}'`);
        }
        if (!clauses.length) return [];
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.Subscription,
            [`(${clauses.join(' OR ')})`],
            'EndDate DESC',
            50,
            user,
        );
    }

    /**
     * Payments that have landed on one order.
     *
     * An allocation LINE, not a payment header: one payment can settle several
     * orders, so the amount that matters here is what reached THIS order rather
     * than what the customer handed over.
     */
    public async GetPaymentLinesForOrder(orderHeaderID: string, user?: UserInfo) {
        if (!UUID_PATTERN.test(orderHeaderID)) return [];
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.PaymentLine,
            [`OrderHeaderID = '${orderHeaderID}'`],
            'AllocatedAt DESC',
            undefined,
            user,
        );
    }

    /** Dimension tags on an order's lines — the analysis axes a line was filed under. */
    public async GetLineDimensionsForOrder(orderLineIDs: string[], user?: UserInfo) {
        const ids = [...new Set(orderLineIDs)].filter((id) => UUID_PATTERN.test(id));
        if (!ids.length) return [];
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.OrderLineDimension,
            [`OrderLineID IN (${ids.map((id) => `'${id}'`).join(',')})`],
            'Dimension',
            undefined,
            user,
        );
    }

    /**
     * Customers matching a query — organizations and people together.
     *
     * BOTH are searched because an order can be billed to either, and making the
     * user choose which KIND of party they are looking for before they have found
     * it is a question the screen can answer itself.
     */
    public async SearchCustomers(
        query: string,
        user?: UserInfo,
    ): Promise<Array<{ ID: string; Name: string; IsOrganization: boolean; Email: string | null }>> {
        const text = query.trim();
        if (text.length < 2) return [];
        const escaped = text.replace(/'/g, "''");

        const [orgs, people] = await Promise.all([
            this.run<Record<string, unknown>>(
                MJO_COMMON_ENTITIES.Organization,
                [`Name LIKE '%${escaped}%'`],
                'Name',
                20,
                user,
            ),
            this.run<Record<string, unknown>>(
                MJO_COMMON_ENTITIES.Person,
                [`(FirstName LIKE '%${escaped}%' OR LastName LIKE '%${escaped}%' OR Email LIKE '%${escaped}%')`],
                'LastName',
                20,
                user,
            ),
        ]);

        return [
            ...orgs.map((o) => ({
                ID: String(o['ID']),
                Name: String(o['Name'] ?? ''),
                IsOrganization: true,
                Email: (o['Email'] as string) ?? null,
            })),
            ...people.map((p) => ({
                ID: String(p['ID']),
                Name: [p['FirstName'], p['LastName']].filter(Boolean).join(' ').trim() || String(p['Email'] ?? ''),
                IsOrganization: false,
                Email: (p['Email'] as string) ?? null,
            })),
        ];
    }

    /**
     * The customers this desk has billed most recently, newest first.
     *
     * WHY THIS EXISTS. The customer field only searched, and only from two
     * characters in — so an order taker facing an empty box had to already know a
     * name to type. On seeded data that is close to unusable (you have to guess
     * something like "IT-ORD-13242799 Buyer Org"), and even on real data it makes
     * the commonest case — the customer you billed an hour ago — the slowest one.
     *
     * RECENCY, not alphabetical: a desk bills the same handful of accounts over
     * and over, so the last few orders predict the next one far better than the
     * top of the alphabet does. Derived from recent orders rather than stored,
     * because "who we deal with" is already recorded there and a second list
     * would be one more thing to keep true.
     *
     * Returns the same shape as {@link SearchCustomers} so the picker renders
     * both through one template and selection behaves identically.
     */
    public async RecentCustomers(
        limit = 8,
        user?: UserInfo,
    ): Promise<Array<{ ID: string; Name: string; IsOrganization: boolean; Email: string | null }>> {
        const orders = await this.run<Record<string, unknown>>(
            MJO_ENTITIES.OrderHeader,
            [],
            'OrderDate DESC',
            80,
            user,
        );

        const seen = new Set<string>();
        const out: Array<{ ID: string; Name: string; IsOrganization: boolean; Email: string | null }> = [];
        for (const order of orders) {
            // An order can carry BOTH a bill-to organization and a bill-to person
            // (an employee ordering against their employer's account), and either
            // is a legitimate thing to start the next order from — so consider both.
            const candidates: Array<{ id: string; name: string; isOrg: boolean }> = [
                { id: String(order['BillToOrganizationID'] ?? ''), name: String(order['BillToOrganization'] ?? ''), isOrg: true },
                { id: String(order['BillToPersonID'] ?? ''), name: String(order['BillToPerson'] ?? ''), isOrg: false },
            ];
            for (const c of candidates) {
                if (!c.id || !c.name || seen.has(c.id)) continue;
                seen.add(c.id);
                out.push({ ID: c.id, Name: c.name, IsOrganization: c.isOrg, Email: null });
                if (out.length >= limit) return out;
            }
        }
        return out;
    }

    /**
     * Tenders a payment can be taken on, in the order they should be offered.
     *
     * Reversal types are excluded because they are not something a person CHOOSES
     * — a refund creates one, and offering it here would let someone record a
     * reversal with nothing to reverse.
     */
    public async GetPaymentTypes(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.PaymentType,
            [`IsActive = 1`, `IsReversal = 0`],
            'Sequence',
            undefined,
            user,
        );
    }

    /** Categories, which supply a product's defaults when it states none. */
    public async GetProductCategories(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.ProductCategory,
            [`IsActive = 1`],
            'Name',
            undefined,
            user,
        );
    }

    /**
     * Product types — the behaviour root.
     *
     * A type decides recognition, taxability, fulfilment and recurrence, and every
     * order line inherits those answers. That is why an order screen never asks.
     */
    public async GetProductTypes(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.ProductType,
            [`IsActive = 1`],
            'Name',
            undefined,
            user,
        );
    }

    /**
     * Coverage terms for one subscription, oldest first.
     *
     * A term is a PERIOD of coverage, and renewals APPEND one rather than moving a
     * pointer. That is why "current" is not a field: it is the term whose window
     * covers today, which cannot go stale.
     */
    public async GetSubscriptionTerms(subscriptionID: string, user?: UserInfo) {
        if (!UUID_PATTERN.test(subscriptionID)) return [];
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.SubscriptionTerm,
            [`SubscriptionID = '${subscriptionID}'`],
            'TermNumber',
            undefined,
            user,
        );
    }

    /** What happened to a subscription, newest first. */
    public async GetSubscriptionEvents(subscriptionID: string, user?: UserInfo) {
        if (!UUID_PATTERN.test(subscriptionID)) return [];
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.SubscriptionEvent,
            [`SubscriptionID = '${subscriptionID}'`],
            'OccurredAt DESC',
            undefined,
            user,
        );
    }

    /** Price lists — the named sets a customer can be assigned to. */
    public async GetPriceLists(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.PriceList,
            [],
            'Name',
            undefined,
            user,
        );
    }

    /**
     * Quantity bands, in the order they are read.
     *
     * A band belongs to a PRICE, not a product: the same product can be banded
     * differently on two price lists, which is the point of having price lists.
     */
    public async GetPriceTiers(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.PriceTier,
            [],
            'SortOrder',
            undefined,
            user,
        );
    }

    /**
     * Tax jurisdictions with their current rates.
     *
     * READ FROM ACCOUNTING, not Orders. Jurisdictions, rates and nexus belong to
     * the accounting app; Orders consumes them. That direction is deliberate
     * (D44) — cross-app references point UP the graph, so tax can be reasoned
     * about without knowing anything about orders.
     */
    public async GetTaxJurisdictions(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ACCOUNTING_ENTITIES.TaxJurisdiction,
            [`IsActive = 1`],
            'Name',
            undefined,
            user,
        );
    }

    /** Rates, newest effective window first. */
    public async GetTaxRates(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ACCOUNTING_ENTITIES.TaxRate,
            [],
            'EffectiveFrom DESC',
            undefined,
            user,
        );
    }

    /**
     * Where each company is registered to collect.
     *
     * Nexus is the question that decides whether tax applies at all — a rate
     * without a registration is a rate we must NOT charge.
     */
    public async GetTaxNexus(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ACCOUNTING_ENTITIES.CompanyTaxNexus,
            [],
            'RegisteredFrom DESC',
            undefined,
            user,
        );
    }

    /** Customer exemption certificates, newest first. */
    public async GetTaxExemptions(user?: UserInfo) {
        return this.run<Record<string, unknown>>(
            MJO_ENTITIES.TaxExemption,
            [],
            'StartedAt DESC',
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

    /* ── The order's consequences: what it booked, and what it started ──────────
     *
     * Both tabs render through `mj-entity-data-grid` (@memberjunction/ng-entity-viewer, already a
     * dependency), which takes a `RunViewParams` and does its own loading, paging and column
     * generation from entity metadata. So this service's job is NOT to fetch and reshape rows — it
     * is to hand the grid the right question. Two builders and one lookup, rather than a
     * view-model the grid would only have to be talked out of.
     *
     * BOTH ARE KEYED ON THE ORDER'S LINES, not the order:
     *   · a journal entry points at the ORDER LINE that caused it (`LinkedRecordID`, D25) — one
     *     entry per line, per company;
     *   · a subscription records the line that brought it into existence (`OrderLineID`, D39/D40).
     * There is no column on either that names the order header, which is why the line ids come
     * first and why an order with no lines can have neither.
     */

    /**
     * The ids of an order's lines — the key both consequence grids filter on.
     *
     * @returns Line ids in line-number order. Empty when the order has no lines or the id is not
     *          a UUID; callers must treat empty as "there is nothing to show", never as a filter.
     */
    public async GetOrderLineIDs(orderHeaderID: string, user?: UserInfo): Promise<string[]> {
        if (!UUID_PATTERN.test(orderHeaderID)) return [];
        const lines = await this.GetOrderLines(orderHeaderID, user);
        return lines.map((line) => String(line['ID'] ?? '')).filter((id) => UUID_PATTERN.test(id));
    }

    /**
     * What this order booked into the ledger, as grid params.
     *
     * Newest first: a corrected or reversed order accumulates entries, and the one that explains
     * the current state is the most recent.
     *
     * @param orderLineIDs From {@link GetOrderLineIDs}. Every id is re-checked before it reaches
     *        the filter — this is SQL text, and an `IN` list is the classic way a caller's value
     *        becomes a query.
     * @returns Params for `mj-entity-data-grid`, or **null** when the order has no lines. Null
     *          means "do not load": an `IN ()` with nothing in it is not valid SQL, and a filter
     *          that matches everything would show another order's ledger.
     */
    public JournalEntryViewParams(orderLineIDs: string[]): RunViewParams | null {
        const list = this.uuidList(orderLineIDs);
        if (!list) return null;
        return {
            EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
            ExtraFilter: `LinkedRecordID IN (${list})`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        };
    }

    /**
     * What this order started, as grid params.
     *
     * @param orderLineIDs From {@link GetOrderLineIDs}.
     * @returns Params for `mj-entity-data-grid`, or **null** when the order has no lines.
     */
    public SubscriptionViewParams(orderLineIDs: string[]): RunViewParams | null {
        const list = this.uuidList(orderLineIDs);
        if (!list) return null;
        return {
            EntityName: MJO_ENTITIES.Subscription,
            ExtraFilter: `OrderLineID IN (${list})`,
            OrderBy: 'StartDate DESC',
            ResultType: 'entity_object',
        };
    }

    /** Quoted, comma-separated ids, or null when none survive validation. */
    private uuidList(ids: string[]): string | null {
        const safe = [...new Set(ids)].filter((id) => UUID_PATTERN.test(id));
        return safe.length ? safe.map((id) => `'${id}'`).join(',') : null;
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
     * The companies this instance can SELL as, ordered by name.
     *
     * Derived from which companies own PRODUCTS rather than from the Company table: a company with
     * nothing to sell cannot raise an order, and the Company table is MJ-core-wide, so it carries
     * every company any app ever created. Note this does NOT exclude integration-test fixture
     * companies — those own products too, so they appear here until the fixture data is purged
     * (`test-harnesses/purge-fixture-data.mjs`).
     */
    public async GetSellingCompanies(user?: UserInfo): Promise<MJOCompanyOption[]> {
        const products = await this.GetProducts({ MaxRows: 500, User: user });
        const byID = new Map<string, string>();
        for (const p of products) {
            const id = String(p['CompanyID'] ?? '');
            if (!id) continue;
            if (!byID.has(id)) byID.set(id, String(p['Company'] ?? ''));
        }
        return [...byID]
            .map(([ID, Name]) => ({ ID, Name }))
            .sort((a, b) => a.Name.localeCompare(b.Name));
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
        if (!result.Success) {
            // NEVER fail silently into an empty list. Every caller renders an
            // empty state, and an empty state is the most reassuring thing on the
            // screen — "no orders", "nothing overdue", "no payments". A failed
            // query that reads as good news is the worst outcome available.
            //
            // This is not theoretical: two entity names in MJO_ENTITIES were wrong
            // for the entire build, and the only symptom was dashboards reporting
            // zero against a database with 73 orders. Logging the entity and the
            // filter makes the next one findable in seconds rather than by
            // noticing a number looks too calm.
            console.error(
                `[MJOOrdersDataService] Query failed for "${entityName}" — the screen ` +
                    `will render an empty state that does NOT mean "no data".\n` +
                    `  Filter: ${filters.filter(Boolean).join(' AND ') || '(none)'}\n` +
                    `  Reason: ${result.ErrorMessage ?? 'no error message supplied'}`,
            );
            return [];
        }

        // A TRUNCATED read is not an error, so nothing above catches it — and a
        // truncated read that feeds a TOTAL is a wrong number rather than a short
        // list. `TotalOpen` on Customer A/R reduces over these rows, so past the
        // cap the headline A/R figure silently understates with nothing on screen
        // to say so. That is the same class of failure as the empty-state case
        // above: a plausible number is more dangerous than an obvious blank.
        //
        // MJ hands us the signal for free — `TotalRowCount` is "total rows that
        // match the view criteria, not just the number returned" — so detecting
        // this costs nothing. We were discarding both counts.
        //
        // ONLY the implicit default is reported. A caller that passed its own
        // `maxRows` chose a short list on purpose — the typeahead asks for a
        // handful of products out of hundreds and is right to. Flagging those
        // buried the real signal under noise the first time this ran (Products,
        // 1 of 22, entirely deliberate). The accidental case is precisely the one
        // where nobody chose a number.
        if (maxRows === undefined && result.TotalRowCount > result.RowCount) {
            this.truncated.add(entityName);
            console.error(
                `[MJOOrdersDataService] TRUNCATED read of "${entityName}" — returned ` +
                    `${result.RowCount} of ${result.TotalRowCount} matching rows.\n` +
                    `  Any TOTAL derived from this read is UNDERSTATED by the remainder.\n` +
                    `  Filter: ${filters.filter(Boolean).join(' AND ') || '(none)'}\n` +
                    `  Fix: pass an explicit MaxRows for a worklist, or aggregate server-side ` +
                    `(RunQuery) for a figure. See BACKLOG.md task 11d.`,
            );
        }
        return result.Results ?? [];
    }

    private get currentUser(): UserInfo | undefined {
        // The browser session supplies the acting user; on the server a caller
        // passes one explicitly. Reading it lazily keeps this service usable in
        // both places without a constructor dependency.
        return new Metadata().CurrentUser;
    }
}
