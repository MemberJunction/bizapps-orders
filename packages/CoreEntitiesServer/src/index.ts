/**
 * @mj-biz-apps/orders-core-entities-server — server-side Orders logic.
 *
 * Exports ONLY what this package defines (MJ rule 5 — no re-exports from other packages):
 *   - OrdersEngine        — thin server wrapper over OrdersEngineBase (@mj-biz-apps/orders-engine-base)
 *   - OrderEntityServer    — books the balanced JE into accounting on first Confirmed
 *   - ConfirmOrderOperation + orderBooking — the F1.2b Confirm unit of work
 *
 * The catalog cache, GL resolution, and the pure order→JE draft builder now live in the browser-safe
 * @mj-biz-apps/orders-engine-base (F0); import those from there, not from here.
 *
 * LoadBizAppsOrdersEntitiesServer is the tree-shaking anchor the server bootstrap calls; the
 * static re-export of OrderEntityServer below is what fires its @RegisterClass decorator.
 */
export { OrdersEngine } from './OrdersEngine.js';
export { OrderEntityServer, LoadBizAppsOrdersOrderServer } from './OrderEntityServer.js';
export { OrderLineEntityServer, LoadBizAppsOrdersOrderLineServer } from './OrderLineEntityServer.js';
export { ConfirmOrderOperation, LoadConfirmOrderOperation } from './ConfirmOrderOperation.js';
export type { ConfirmOrderInput, ConfirmOrderOutput } from './ConfirmOrderOperation.js';
export { queueOrderBooking, loadOrderLines } from './orderBooking.js';
export type { OrderBookingResult } from './orderBooking.js';

import { LoadBizAppsOrdersOrderServer } from './OrderEntityServer.js';
import { LoadBizAppsOrdersOrderLineServer } from './OrderLineEntityServer.js';
import { LoadConfirmOrderOperation } from './ConfirmOrderOperation.js';

export function LoadBizAppsOrdersEntitiesServer(): void {
  // Importing this module registered OrderEntityServer + OrderLineEntityServer + ConfirmOrderOperation
  // (via the exports above); these calls are the tree-shaking anchors the bootstrap invokes so
  // bundlers can't drop the @RegisterClass side effects.
  LoadBizAppsOrdersOrderServer();
  LoadBizAppsOrdersOrderLineServer();
  LoadConfirmOrderOperation();
}
