/**
 * MJ entity names, in one place.
 *
 * WHY A MODULE AND NOT A LITERAL AT EACH CALL SITE. These strings are resolved at RUNTIME by
 * `Metadata.GetEntityObject`, so a typo compiles, type-checks, and fails only when that code path
 * executes — and `RunView` against an unknown entity returns an empty result rather than throwing,
 * which is indistinguishable from "the table is genuinely empty". The UX agent lost a full live run
 * to exactly this: a dashboard queried `Orders` and `Payments`, the real names being `Order Headers`
 * and `Payment Headers`, and every tile rendered a healthy-looking 0 and $0.00. Naming each entity
 * once means a typo is wrong in one place instead of silently wrong in fifteen.
 *
 * THE SEPARATOR IS NOT UNIFORM AND THAT IS NOT A MISTAKE. Orders and Accounting use underscores
 * (`MJ_BizApps_Orders:`), Common uses dots (`MJ.BizApps.Common:`). It reads like a typo every time,
 * so it is asserted in registry-parity so nobody "fixes" it into a runtime failure.
 */

// ── Orders: catalog ──────────────────────────────────────────────────────────────────────────────
export const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
export const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
export const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
export const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
export const EVENT_PRODUCT_ENTITY = 'MJ_BizApps_Orders: Event Products';
export const PRODUCT_PRICE_ENTITY = 'MJ_BizApps_Orders: Product Prices';
export const PRODUCT_BUNDLE_ITEM_ENTITY = 'MJ_BizApps_Orders: Product Bundle Items';
export const PROMOTION_ENTITY = 'MJ_BizApps_Orders: Promotions';
export const PROMOTION_CODE_ENTITY = 'MJ_BizApps_Orders: Promotion Codes';
export const PROMOTION_TARGET_ENTITY = 'MJ_BizApps_Orders: Promotion Targets';

// ── Orders ───────────────────────────────────────────────────────────────────────────────────────
export const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
export const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
export const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
export const ORDER_COMPANY_POLICY_ENTITY = 'MJ_BizApps_Orders: Order Company Policies';
export const EVENT_ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Event Order Lines';

export const PRICE_TIER_ENTITY = 'MJ_BizApps_Orders: Price Tiers';
export const PRICE_LIST_ENTITY = 'MJ_BizApps_Orders: Price Lists';
export const PRICE_LIST_ASSIGNMENT_ENTITY = 'MJ_BizApps_Orders: Price List Assignments';

export const SALES_AUTHORITY_ENTITY = 'MJ_BizApps_Orders: Sales Authorities';
export const SALES_RULE_ENTITY = 'MJ_BizApps_Orders: Sales Rules';

export const CUSTOMER_TAX_EXEMPTION_ENTITY = 'MJ_BizApps_Orders: Customer Tax Exemptions';

export const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
export const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
export const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
export const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';
export const PAYMENT_PROVIDER_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Types';
export const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';

// ── Accounting (peer app; we resolve THROUGH these, so we build them properly) ────────────────────
export const GL_ACCOUNT_ENTITY = 'MJ_BizApps_Accounting: GL Accounts';
export const GL_ACCOUNT_ROLE_ENTITY = 'MJ_BizApps_Accounting: GL Account Roles';
export const GL_ACCOUNT_LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';
export const INTERCOMPANY_ACCOUNT_MATCH_ENTITY = 'MJ_BizApps_Accounting: Intercompany Account Matches';
export const COMPANY_TAX_NEXUS_ENTITY = 'MJ_BizApps_Accounting: Company Tax Nexus';

// ── Common (dots, not underscores — see the header) ───────────────────────────────────────────────
export const PERSON_ENTITY = 'MJ.BizApps.Common: People';
export const RELATIONSHIP_ENTITY = 'MJ.BizApps.Common: Relationships';

/**
 * Every name above, for the parity check that asserts each one resolves against live metadata.
 * A name that no longer exists is a silent empty-result bug in waiting, so the suite proves the
 * whole set rather than only the ones a given run happens to touch.
 */
export const ALL_ENTITY_NAMES: readonly string[] = [
    PRODUCT_TYPE_ENTITY,
    PRODUCT_CATEGORY_ENTITY,
    PRODUCT_ENTITY,
    PRODUCT_ENTITLEMENT_ENTITY,
    EVENT_PRODUCT_ENTITY,
    PRODUCT_PRICE_ENTITY,
    PRODUCT_BUNDLE_ITEM_ENTITY,
    PROMOTION_ENTITY,
    PROMOTION_CODE_ENTITY,
    PROMOTION_TARGET_ENTITY,
    ORDER_HEADER_ENTITY,
    ORDER_LINE_ENTITY,
    SUBSCRIPTION_TERM_ENTITY,
    ORDER_COMPANY_POLICY_ENTITY,
    EVENT_ORDER_LINE_ENTITY,
    PRICE_TIER_ENTITY,
    PRICE_LIST_ENTITY,
    PRICE_LIST_ASSIGNMENT_ENTITY,
    SALES_AUTHORITY_ENTITY,
    SALES_RULE_ENTITY,
    CUSTOMER_TAX_EXEMPTION_ENTITY,
    PAYMENT_HEADER_ENTITY,
    PAYMENT_LINE_ENTITY,
    PAYMENT_DETAIL_ENTITY,
    PAYMENT_PROVIDER_ENTITY,
    PAYMENT_PROVIDER_TYPE_ENTITY,
    PAYMENT_INTENT_ENTITY,
    GL_ACCOUNT_ENTITY,
    GL_ACCOUNT_ROLE_ENTITY,
    GL_ACCOUNT_LINK_ENTITY,
    INTERCOMPANY_ACCOUNT_MATCH_ENTITY,
    COMPANY_TAX_NEXUS_ENTITY,
    PERSON_ENTITY,
    RELATIONSHIP_ENTITY,
];
