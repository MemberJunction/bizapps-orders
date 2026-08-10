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
