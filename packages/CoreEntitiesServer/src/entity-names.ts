/**
 * @fileoverview Entity names shared across this package.
 *
 * These lived in `OrderDraftHydrator`, which is gone — the hydrator existed only to turn a
 * client-side `OrderDraft` back into entities, and MJ 6.1's entity-graph save removed the reason for
 * a draft to exist at all. Three files imported nothing from it but this constant, so it moved
 * somewhere that is about naming rather than about a translation layer.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

/** The order header entity, as MJ names it. */
export const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

/** The order line entity. */
export const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

/** The order line's accounting dimension tags (D31). */
export const ORDER_LINE_DIMENSION_ENTITY = 'MJ_BizApps_Orders: Order Line Dimensions';

/** Payment provider configuration rows — one per (company, provider type). */
export const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';

/** Payment provider types — the `Code` is the ClassFactory key for drivers and invoice rails. */
export const PAYMENT_PROVIDER_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Types';

/** External invoices — the authoritative unit ↔ rail invoice mapping (Bill.com). */
export const EXTERNAL_INVOICE_ENTITY = 'MJ_BizApps_Orders: External Invoices';

/** External customers — bill-to party ↔ rail customer id, per provider row. */
export const EXTERNAL_CUSTOMER_ENTITY = 'MJ_BizApps_Orders: External Customers';

/** External payments — every rail payment the poller has seen, and what it did with it. */
export const EXTERNAL_PAYMENT_ENTITY = 'MJ_BizApps_Orders: External Payments';

/** Poll watermark per provider row per rail object. */
export const PAYMENT_PROVIDER_SYNC_STATE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Sync States';

/** Payment headers and lines — read by the poller for "has money been applied to this unit". */
export const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
export const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';

/** Instalment rows (PR #220). Absent on a database that predates it — check `provider.EntityByName` before reading. */
export const ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY = 'MJ_BizApps_Orders: Order Header Payment Schedules';

/** bizapps-common parties, as the recipient resolver already names them. */
export const ORGANIZATION_ENTITY = 'MJ_BizApps_Common: Organizations';
export const PERSON_ENTITY = 'MJ_BizApps_Common: People';
export const ADDRESS_ENTITY = 'MJ_BizApps_Common: Addresses';
