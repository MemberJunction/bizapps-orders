/**
 * @mj-biz-apps/orders-engine-base — browser-safe Orders catalog engine + pure order→JE assembly.
 * Exports ONLY what this package defines (MJ rule 5 — no re-exports from other packages).
 */
export { OrdersEngineBase } from './OrdersEngineBase.js';
export type { ResolvedAccount, OrderDraftBuildResult } from './OrdersEngineBase.js';
export { buildOrderJournalDrafts, OrderDraftError } from './orderJournalDraft.js';
export type { ResolvedOrderLine, OrderJournalContext, OrderDraftInputs } from './orderJournalDraft.js';
export { buildPaymentJournalDraft, PaymentDraftError } from './paymentJournalDraft.js';
export type { PaymentDraftInputs } from './paymentJournalDraft.js';
export { resolveProductPrice } from './pricing.js';
export type {
  ProductPriceRow,
  PriceTierRow,
  PriceListRow,
  PriceSource,
  ResolvePriceResult,
  ResolvePriceInput,
} from './pricing.js';
export {
  AllowedTransitions,
  BOOKED_STATUSES,
  isBookedStatus,
  validateTransition,
  computeLineNet,
  computeLineGross,
  computeOrderTotalGross,
  computeBalance,
  derivePaymentStatus,
  deriveDueDate,
  orderTotalGrossFromLines,
} from './orderLifecycle.js';
export type { OrderStatus, OrderPaymentStatus, TransitionCheck } from './orderLifecycle.js';
