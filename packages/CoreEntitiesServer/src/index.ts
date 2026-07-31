/**
 * @mj-biz-apps/orders-core-entities-server
 *
 * Server-only entity subclasses and booking machinery for BizApps Orders. Imported by the orders
 * server bootstrap AFTER `@mj-biz-apps/orders-entities`, so @RegisterClass auto-increment gives
 * these subclasses higher priority than the generated ones.
 */
export { GLAccountResolver, GLAccountResolutionError, GL_ROLE } from './GLAccountResolver.js';
export type { GLRole, ResolverEntityIDs } from './GLAccountResolver.js';

export {
    SaveOrderOperation,
    LoadSaveOrderOperation,
    PreviewOrderOperation,
    LoadPreviewOrderOperation,
    ConfirmOrderOperation,
    LoadConfirmOrderOperation,
} from './SaveOrderOperation.js';

export { PreviewConfirmOperation, LoadPreviewConfirmOperation } from './PreviewConfirmOperation.js';
export { GetOverdueWorklistOperation, LoadGetOverdueWorklistOperation } from './GetOverdueWorklistOperation.js';

// Fulfilment (D15) — a logistics fact, deliberately disconnected from revenue.
export {
    AutoAdvances,
    AwaitingFulfillment,
    ExplainRefusal,
    GroupForQueue,
    InitialFulfillmentStatus,
    IsAwaitingFulfillment,
    RefuseFlip,
    ShouldAdvanceToFulfilled,
} from './FulfillmentBehavior.js';
export type { FulfillableLine, FulfillmentStatus, FlipRefusal, QueueGrouping } from './FulfillmentBehavior.js';
export { GetFulfillmentQueueOperation, LoadGetFulfillmentQueueOperation } from './GetFulfillmentQueueOperation.js';
export { FulfillOrderLinesOperation, LoadFulfillOrderLinesOperation } from './FulfillOrderLinesOperation.js';

export {
    HydrateOrderDraft,
    ORDER_HEADER_ENTITY,
    ORDER_LINE_ENTITY,
} from './OrderDraftHydrator.js';
export type {
    HydratableDraft,
    HydratableHeader,
    HydratableLine,
    HydratedOrder,
} from './OrderDraftHydrator.js';

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
export { CapturePaymentOperation, LoadCapturePaymentOperation } from './CapturePaymentOperation.js';
export { CreateOrderInStateOperation, LoadCreateOrderInStateOperation } from './CreateOrderInStateOperation.js';
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

// Reversals (D16) — the pure judgement and the lookups it needs. Same split as pricing.
export { RemainingReturnable, ValidateReversal, InheritedTerms } from './ReversalBehavior.js';
export type { ReversalOrigin, ReversalRequest } from './ReversalBehavior.js';
export { LoadReversalContext } from './ReversalResolver.js';
export type { ReversalContext } from './ReversalResolver.js';

// Entitlements (D27/D76) — the pure policy resolution and the engine that applies it.
export {
    ResolveEntitlementPolicy,
    ResolveGrantQuantity,
    ResolveValidityWindow,
    InitialGrantStatus,
    ReduceGrantForReturn,
} from './EntitlementBehavior.js';
export type {
    GrantTiming,
    QuantityMode,
    ValidityMode,
    PolicyLevel,
    EntitlementPolicySource,
    PolicyCategoryLevel,
    PolicyTypeDefaults,
    ResolvedEntitlementPolicy,
    ValidityContext,
    ResolvedValidity,
} from './EntitlementBehavior.js';
export { CreateEntitlementGrants, RevokeGrantsForReturn } from './EntitlementEngine.js';
export type { GrantableLine, GrantableOrder, TermForLine, GrantOutcome } from './EntitlementEngine.js';

export {
    FormatGiftCardCode,
    GIFT_CARD_ALPHABET,
    GIFT_CARD_PRODUCT_TYPE_CODE,
    GiftCardLiability,
    IsGiftCardCode,
    IsGiftCardLine,
    PlanGiftCardIssuance,
    PlanGiftCardVoid,
} from './GiftCardBehavior.js';
export type {
    GiftCardLineFacts,
    GiftCardOrderFacts,
    GiftCardPlan,
    GiftCardRefusal,
    PlannedGiftCard,
} from './GiftCardBehavior.js';
export { IssueGiftCards } from './GiftCardEngine.js';

export {
    AllocateBundlePrice,
    ChildQuantity,
    PlanBundleExpansion,
    PlanQuantityRipple,
    RollupTotal,
    SplitExactly,
} from './BundleBehavior.js';
export type {
    BundleComponent,
    BundleLineFacts,
    BundlePlan,
    BundlePricingMode,
    BundleRefusal,
    PlannedBundleChild,
    RippleChange,
    RippleChild,
} from './BundleBehavior.js';
export { ExpandBundleLines, RippleBundleQuantity } from './BundleEngine.js';
export type { BundleExpansionOutcome, ExpandableLine } from './BundleEngine.js';
export type { GiftCardOrder, GiftCardOrderLine, GiftCardOutcome } from './GiftCardEngine.js';

// Payment providers (D19/D37) — the pure edge arithmetic, the driver seam, and the drivers.
export {
    CurrencyExponent,
    ToMinorUnits,
    FromMinorUnits,
    VerifyWebhookSignature,
    HmacSha256Hex,
    SignaturesMatch,
    MapStripeIntentStatus,
    DecideWebhookAction,
    SplitCapturedAmount,
} from './PaymentProviderBehavior.js';
export type {
    IntentStatus,
    SignatureVerification,
    WebhookAction,
    WebhookDecision,
} from './PaymentProviderBehavior.js';

export { BasePaymentProvider, LoadBasePaymentProvider } from './BasePaymentProvider.js';
export type {
    PaymentProviderConfig,
    PaymentCredentials,
    CreateIntentRequest,
    CreateIntentResult,
    CaptureRequest,
    CaptureResult,
    RefundRequest,
    RefundResult,
    WebhookEvent,
} from './BasePaymentProvider.js';

export { StripePaymentProvider, LoadStripePaymentProvider, ToFormBody } from './StripePaymentProvider.js';
export { ManualPaymentProvider, LoadManualPaymentProvider } from './ManualPaymentProvider.js';
export {
    StoredValuePaymentProvider,
    LoadStoredValuePaymentProvider,
} from './StoredValuePaymentProvider.js';
export type { StoredValueTarget } from './StoredValuePaymentProvider.js';

export {
    BaseSecretResolver,
    EnvironmentSecretResolver,
    LoadEnvironmentSecretResolver,
    PaymentProviderNotConfiguredError,
    ResolvePaymentProvider,
    LoadPaymentProviderConfig,
    BuildPaymentProvider,
} from './PaymentProviderResolver.js';

export { HandlePaymentWebhook, MountPaymentWebhook } from './PaymentWebhookHandler.js';
export type {
    WebhookRequest,
    WebhookResponse,
    WebhookHttpRequest,
    WebhookHttpResponse,
} from './PaymentWebhookHandler.js';

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
// Charges (D71): the pure engine and the DB-backed resolution. Tax is a CHARGE, which is what
// makes multi-layer tax several rows rather than a special case.
export { ComputeCharges } from './ChargeBehavior.js';
export type {
    ChargeBasis,
    ChargeCategory,
    ChargeRequest,
    ChargeAllocation,
    ComputedCharge,
    ChargeableLine,
    ComputeChargesResult,
} from './ChargeBehavior.js';
export { ChargeError, RunCharges, SplitChargesByLine, WriteCharges } from './ChargeEngine.js';
export type { RequestedCharge } from './ChargeEngine.js';

// Tax resolution (D72): address -> jurisdictions -> rates, minus the buyer's exemptions. The
// jurisdiction step is a SEAM — postal/city matching is enough for many deployments and is not
// rooftop-accurate, which is where a commercial provider earns its money.
export { BaseTaxJurisdictionResolver, DefaultTaxJurisdictionResolver, LoadTaxResolver, ResolveTax } from './TaxResolver.js';
export type { TaxAddress, ResolvedTaxLayer, TaxResolutionResult } from './TaxResolver.js';

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

// Invoicing (D-INV): an invoice is a PRESENTATION of an order, never a record. The decisions are in
// InvoiceBehavior, the reads in InvoiceBuilder, the strings in InvoiceDisplay, and the markup lives
// in an MJ Template so it can be changed without a deploy.
export {
    AttributeByLine,
    BuildDocuments,
    BuildLadder,
    BuildRows,
    CanRender,
    DaysBetween,
    DeriveDocumentKind,
    DiscountTotalOf,
    DocumentNumber,
    DueDateFor,
    LineDiscountOf,
    ListAmountOf,
    ListSubtotalOf,
    PaymentStatusLabel,
    SpreadAcrossCompanies,
    TermsLabel,
} from './InvoiceBehavior.js';
export type {
    DocumentKind,
    InvoiceAdjustmentFacts,
    InvoiceChargeFacts,
    InvoiceDocument,
    InvoiceIssuerFacts,
    InvoiceLineFacts,
    InvoiceOrderFacts,
    InvoicePartyFacts,
    InvoicePaymentFacts,
    InvoiceRow,
    LadderRow,
} from './InvoiceBehavior.js';

export { BuildInvoiceDocuments } from './InvoiceBuilder.js';
export type { InvoiceBuildResult } from './InvoiceBuilder.js';

export { DecorateInvoice, DuePhrase, FormatDate, FormatMoney, FormatQuantity } from './InvoiceDisplay.js';
export type { DisplayInvoice, DisplayLadderRow, DisplayOptions, DisplayRow } from './InvoiceDisplay.js';
export { ToISODate } from './InvoiceBuilder.js';
