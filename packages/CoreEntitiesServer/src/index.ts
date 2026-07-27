/**
 * @mj-biz-apps/orders-core-entities-server
 *
 * Server-only entity subclasses and booking machinery for BizApps Orders. Imported by the orders
 * server bootstrap AFTER `@mj-biz-apps/orders-entities`, so @RegisterClass auto-increment gives
 * these subclasses higher priority than the generated ones.
 */
export { GLAccountResolver, GLAccountResolutionError, GL_ROLE } from './GLAccountResolver.js';
export type { GLRole, ResolverEntityIDs } from './GLAccountResolver.js';

export { OrderJournalEntryFactory } from './OrderJournalEntryFactory.js';
export type { JEDraft, JELineDraft, OrderLineDraft } from './OrderJournalEntryFactory.js';

export {
    RevenueRecognitionDriver,
    UpFrontDriver,
    EvenOverTimeDriver,
    AllBackEndDriver,
    LoadRevenueRecognitionDrivers,
} from './RevenueRecognition.js';
export type { RevRecContext, RevRecEntry, RevRecSchedule } from './RevenueRecognition.js';

export { SubscriptionBehavior, LoadSubscriptionBehavior } from './SubscriptionBehavior.js';
export type {
    SubscriptionTypeRules,
    SubscriptionPurchaseContext,
    SubscriptionDecision,
    ExistingSubscription,
    CancellableTerm,
    CancellationContext,
    CancellationDecision,
} from './SubscriptionBehavior.js';

export { CancelSubscriptionOperation, LoadCancelSubscriptionOperation } from './CancelSubscriptionOperation.js';
export type { CancelSubscriptionInput, CancelSubscriptionOutput } from './CancelSubscriptionOperation.js';

export { SpawnRenewalsOperation, LoadSpawnRenewalsOperation } from './SpawnRenewalsOperation.js';
export type { SpawnRenewalsInput, SpawnRenewalsOutput, RenewalCandidate } from './SpawnRenewalsOperation.js';

export {
    BuildGLAccountResolver,
    EntityIDFor,
    LoadAccountingEngine,
    ResolverEntities,
} from './AccountingBridge.js';
export type { AccountingEngineSurface } from './AccountingBridge.js';

export { PaymentJournalEntryFactory } from './PaymentJournalEntryFactory.js';
export type {
    PaymentJEDraft,
    PaymentJELine,
    PaymentCaptureContext,
    PaymentCaptureResult,
} from './PaymentJournalEntryFactory.js';

// The intercompany half of D13 — one journal entry per (payment line × company).
export {
    PaymentAllocationFactory,
    AllocateByCompany,
    IntercompanyPairMissingError,
} from './PaymentAllocationFactory.js';
export type {
    OrderLineShare,
    CompanyShare,
    IntercompanyPair,
    IntercompanyLookup,
    PaymentLineAllocationContext,
    PaymentAllocationResult,
} from './PaymentAllocationFactory.js';

export { PaymentHeaderEntityServer, LoadPaymentHeaderEntityServer } from './PaymentHeaderEntityServer.js';
export { PaymentLineEntityServer, LoadPaymentLineEntityServer } from './PaymentLineEntityServer.js';

export { RefundPaymentOperation, LoadRefundPaymentOperation } from './RefundPaymentOperation.js';
export type { RefundPaymentInput, RefundPaymentOutput } from './RefundPaymentOperation.js';
export { ApplyAccountCreditOperation, LoadApplyAccountCreditOperation } from './ApplyAccountCreditOperation.js';
// Pricing (D69): the pure engine, the resolver walk + its plugin seam, the dry run, and the
// write-time guard that stops an ambiguous rule set reaching an order.
export { PreviewPriceOperation, LoadPreviewPriceOperation } from './PreviewPriceOperation.js';
export type { PreviewPriceInput, PreviewPriceOutput, PreviewComponent } from './PreviewPriceOperation.js';
export { ProductPriceEntityServer } from './ProductPriceEntityServer.js';
export {
    BasePriceResolver,
    DefaultPriceResolver,
    LoadDefaultPriceResolver,
    PriceResolutionError,
    ResolvePrice,
    ResolvePriceListForCustomer,
} from './PriceResolver.js';
export type { PriceResolutionContext, ResolvedPrice, PriceComponentDraft } from './PriceResolver.js';
export {
    AllocateProRata,
    ComputeAmount,
    IsRuleApplicable,
    Money,
    PickPriceRule,
} from './PricingBehavior.js';
export type { PriceRule, PriceTierRule, PriceContext, PricingModel, InapplicableReason, RulePick } from './PricingBehavior.js';

// Promotions (D70): the pure engine, the DB-backed resolution, and the qualifier plugin seam.
export { ApplyPromotions, ScreenPromotion, ValuePromotion } from './PromotionBehavior.js';
export type {
    PromotionRule,
    PromotionContext,
    PromotionOutcome,
    RejectedPromotion,
    ApplyPromotionsResult,
    PromotionRejection,
    PromotionValueKind,
    StackingMode,
} from './PromotionBehavior.js';
export {
    AuthorizeManualDiscount,
    BasePromotionQualifier,
    LoadPromotionEngine,
    PromotionError,
    RunPromotions,
    WriteAdjustments,
} from './PromotionEngine.js';
export type {
    ManualDiscountRequest,
    PromotableLine,
    PromotionApplication,
    PromotionQualificationContext,
    PromotionRunResult,
    RunPromotionsInput,
} from './PromotionEngine.js';
export type { ApplyAccountCreditInput, ApplyAccountCreditOutput } from './ApplyAccountCreditOperation.js';

export { OrdersSettings, ORDERS_SETTING } from './OrdersSettings.js';

export { OrderEntityServer, LoadOrderEntityServer } from './OrderEntityServer.js';
export { OrderLineEntityServer, LoadOrderLineEntityServer } from './OrderLineEntityServer.js';
