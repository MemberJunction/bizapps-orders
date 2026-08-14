/**
 * @fileoverview MJ entity names, in one place so a rename is one edit.
 *
 * WHY THIS IS ITS OWN FILE. These are looked up by STRING at runtime. A wrong name does not fail to
 * compile and does not throw where it is written — `RunView` rejects it deep in the provider with
 * "Entity ... not found in metadata", which surfaces as an empty list. Every screen then renders its
 * empty state, which is indistinguishable from a database that genuinely has no rows.
 *
 * `Order Headers` and `Payment Headers` were `Orders` and `Payments` here until a run against a live
 * database showed every dashboard tile reading zero. The names are verified against MJ's entity list
 * by `entity-names.test.ts`.
 *
 * @module @mj-biz-apps/orders-ng
 */

/** Entities this app owns. */
export const MJO_ENTITIES = {
    OrderHeader: 'MJ_BizApps_Orders: Order Headers',
    OrderLine: 'MJ_BizApps_Orders: Order Lines',
    OrderCharge: 'MJ_BizApps_Orders: Order Charges',
    PaymentHeader: 'MJ_BizApps_Orders: Payment Headers',
    PaymentDetail: 'MJ_BizApps_Orders: Payment Details',
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
 * Entities read from the COMMON app — the shared party model.
 *
 * Note the separator: Common uses DOTS where Orders and Accounting use underscores. It reads like a
 * typo every time and is not one.
 */
export const MJO_COMMON_ENTITIES = {
    Organization: 'MJ_BizApps_Common: Organizations',
    Person: 'MJ_BizApps_Common: People',
    Address: 'MJ_BizApps_Common: Addresses',
} as const;

/**
 * Entities this app READS from the accounting app.
 *
 * Kept apart so the boundary is visible at the call site: these are somebody else's records, and a
 * change to them is a change in another repository. The dependency points UP the graph (D44) —
 * Orders knows about Accounting, never the reverse.
 */
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
