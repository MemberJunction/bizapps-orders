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
export { ReversalOrderOperation, LoadReversalOrderOperation } from './ReversalOrderOperation.js';
export type { CreateReversalOrderInput, CreateReversalOrderOutput } from './ReversalOrderOperation.js';
export { PaymentEntityServer, LoadBizAppsOrdersPaymentServer } from './PaymentEntityServer.js';
export { PaymentLineEntityServer, LoadBizAppsOrdersPaymentLineServer, recomputeOrderPaid } from './PaymentLineEntityServer.js';
export { BasePaymentProvider, ManualPaymentProvider, StripePaymentProvider, LoadPaymentProviders } from './PaymentProviderBase.js';
export type { PaymentProviderType, PaymentCaptureRequest, PaymentCaptureResult } from './PaymentProviderBase.js';
export { CapturePaymentOperation, LoadCapturePaymentOperation } from './CapturePaymentOperation.js';
export type { CapturePaymentInput, CapturePaymentOutput } from './CapturePaymentOperation.js';
export { CreateRevRecScheduleOperation, LoadCreateRevRecScheduleOperation } from './CreateRevRecScheduleOperation.js';
export type { CreateRevRecScheduleInput, CreateRevRecScheduleOutput } from './CreateRevRecScheduleOperation.js';
export { GrantEntitlementsOperation, LoadGrantEntitlementsOperation } from './GrantEntitlementsOperation.js';
export type { GrantEntitlementsInput, GrantEntitlementsOutput } from './GrantEntitlementsOperation.js';
export { OverdueWorklistOperation, LoadOverdueWorklistOperation } from './OverdueWorklistOperation.js';
export type { OverdueWorklistInput, OverdueWorklistOutput, OverdueOrder } from './OverdueWorklistOperation.js';
export { queueOrderBooking, loadOrderLines } from './orderBooking.js';
export type { OrderBookingResult } from './orderBooking.js';

import { LoadBizAppsOrdersOrderServer } from './OrderEntityServer.js';
import { LoadBizAppsOrdersOrderLineServer } from './OrderLineEntityServer.js';
import { LoadConfirmOrderOperation } from './ConfirmOrderOperation.js';
import { LoadReversalOrderOperation } from './ReversalOrderOperation.js';
import { LoadBizAppsOrdersPaymentServer } from './PaymentEntityServer.js';
import { LoadBizAppsOrdersPaymentLineServer } from './PaymentLineEntityServer.js';
import { LoadPaymentProviders } from './PaymentProviderBase.js';
import { LoadCapturePaymentOperation } from './CapturePaymentOperation.js';
import { LoadCreateRevRecScheduleOperation } from './CreateRevRecScheduleOperation.js';
import { LoadGrantEntitlementsOperation } from './GrantEntitlementsOperation.js';
import { LoadOverdueWorklistOperation } from './OverdueWorklistOperation.js';

export function LoadBizAppsOrdersEntitiesServer(): void {
  // Tree-shaking anchors — the bootstrap invokes these so bundlers can't drop the @RegisterClass side effects.
  LoadBizAppsOrdersOrderServer();
  LoadBizAppsOrdersOrderLineServer();
  LoadConfirmOrderOperation();
  LoadReversalOrderOperation();
  LoadBizAppsOrdersPaymentServer();
  LoadBizAppsOrdersPaymentLineServer();
  LoadPaymentProviders();
  LoadCapturePaymentOperation();
  LoadCreateRevRecScheduleOperation();
  LoadGrantEntitlementsOperation();
  LoadOverdueWorklistOperation();
}
