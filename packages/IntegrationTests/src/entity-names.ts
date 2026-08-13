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
 * THE SEPARATOR IS UNIFORM: every app uses UNDERSCORES — `MJ_BizApps_Orders:`,
 * `MJ_BizApps_Accounting:`, `MJ_BizApps_Common:`. The prefix is not folklore; each app DECLARES it
 * in its own committed `metadata/schema-info/.schema-info.json`, and bizapps-common declares
 * `EntityNamePrefix: 'MJ_BizApps_Common: '`. That declaration is what CodeGen registers, so it is
 * the authority.
 *
 * This file previously said Common used DOTS and registry-parity asserted it. That was wrong, and
 * it cost a real bug: `OrderEntityServer` resolved `MJ.BizApps.Common: Relationships`, which does
 * not exist, so the D64 organization inference threw `Entity ... not found in metadata` and took
 * ORDER CONFIRM down with it whenever an order named a person. Two things hid it — the assertion
 * pinned the mistake as intentional, and registry-parity itself fails to COLLECT in CI (it cannot
 * resolve `@mj-biz-apps/orders-core-entities-server`), so the suite never ran. Corrected 2026-08-03.
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
export const CUSTOMER_PAYMENT_TERMS_ENTITY = 'MJ_BizApps_Orders: Customer Payment Terms';

export const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
export const PAYMENT_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Types';
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
export const COMPANY_PROFILE_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
export const TAX_AUTHORITY_ENTITY = 'MJ_BizApps_Accounting: Tax Authorities';
export const TAX_JURISDICTION_ENTITY = 'MJ_BizApps_Accounting: Tax Jurisdictions';
export const TAX_RATE_ENTITY = 'MJ_BizApps_Accounting: Tax Rates';

// ── Common ───────────────────────────────────────────────────────────────────────────────────────
export const PERSON_ENTITY = 'MJ_BizApps_Common: People';
export const ORGANIZATION_ENTITY = 'MJ_BizApps_Common: Organizations';
export const ORGANIZATION_TYPE_ENTITY = 'MJ_BizApps_Common: Organization Types';
export const RELATIONSHIP_ENTITY = 'MJ_BizApps_Common: Relationships';
export const RELATIONSHIP_TYPE_ENTITY = 'MJ_BizApps_Common: Relationship Types';
export const ADDRESS_ENTITY = 'MJ_BizApps_Common: Addresses';

export const COMPANY_ENTITY = 'MJ: Companies';

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
    CUSTOMER_PAYMENT_TERMS_ENTITY,
    PAYMENT_HEADER_ENTITY,
    PAYMENT_TYPE_ENTITY,
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
    COMPANY_PROFILE_ENTITY,
    TAX_AUTHORITY_ENTITY,
    TAX_JURISDICTION_ENTITY,
    TAX_RATE_ENTITY,
    PERSON_ENTITY,
    ORGANIZATION_ENTITY,
    ORGANIZATION_TYPE_ENTITY,
    RELATIONSHIP_ENTITY,
    RELATIONSHIP_TYPE_ENTITY,
    ADDRESS_ENTITY,
    COMPANY_ENTITY,
];
