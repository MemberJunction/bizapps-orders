/**
 * @mj-biz-apps/orders-core-entities-server
 *
 * Server-only entity subclasses and booking machinery for BizApps Orders. Imported by the orders
 * server bootstrap AFTER `@mj-biz-apps/orders-entities`, so @RegisterClass auto-increment gives
 * these subclasses higher priority than the generated ones.
 */
export { GLAccountResolver, GLAccountResolutionError, GL_ROLE } from './GLAccountResolver.js';
export type { GLRole, ResolverEntityIDs } from './GLAccountResolver.js';

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

export { ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';

export { MergeOrderRollups, ORDER_ROLLUP_FIELDS } from './OrderRollupBehavior.js';
export type { OrderRollupField, OrderRollups, ResolvedOrderRollups } from './OrderRollupBehavior.js';

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
export { AdvanceOrderStateOperation, LoadAdvanceOrderStateOperation } from './AdvanceOrderStateOperation.js';
export type { RefundPaymentInput, RefundPaymentOutput } from './RefundPaymentOperation.js';
export { ApplyAccountCreditOperation, LoadApplyAccountCreditOperation } from './ApplyAccountCreditOperation.js';
// Pricing (D69): the pure engine, the resolver walk + its plugin seam, the dry run, and the
// write-time guard that stops an ambiguous rule set reaching an order.
export { PreviewPriceOperation, LoadPreviewPriceOperation } from './PreviewPriceOperation.js';
export { PriceOrderOperation, LoadPriceOrderOperation } from './PriceOrderOperation.js';
export type { PreviewPriceInput, PreviewPriceOutput, PreviewComponent } from './PreviewPriceOperation.js';
export { ProductPriceEntityServer } from './ProductPriceEntityServer.js';
export {
    BasePriceResolver,
    DefaultPriceResolver,
    LoadDefaultPriceResolver,
    PriceResolutionError,
    ResolvePrice,
    ResolvePriceListForCustomer,
    ResolvePriceListsForCustomer,
} from '@mj-biz-apps/orders-entities';
export type { PriceResolutionContext, ResolvedPrice, PriceComponentDraft } from '@mj-biz-apps/orders-entities';
export {
    AllocateProRata,
    ComputeAmount,
    IsRuleApplicable,
    Money,
    PickPriceRule,
} from '@mj-biz-apps/orders-entities';
export type { PriceRule, PriceTierRule, PriceContext, PricingModel, InapplicableReason, RulePick } from '@mj-biz-apps/orders-entities';

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
    EvaluateGrantAccess,
    PickWinningAccess,
    CacheUntilFor,
    ShouldRevokeGrantsOnCancel,
    ENTITLEMENT_CHECK_TTL_MS,
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
    EntitlementDecision,
    GrantAccessFacts,
    SubscriptionAccessFacts,
    TermAccessFacts,
    GrantAccessEvaluation,
    RankableAccess,
} from './EntitlementBehavior.js';
export {
    CreateEntitlementGrants,
    RevokeGrantsForReturn,
    RevokeGrantsForCanceledSubscription,
} from './EntitlementEngine.js';
export type { GrantableLine, GrantableOrder, TermForLine, GrantOutcome } from './EntitlementEngine.js';
export { CheckEntitlementOperation, LoadCheckEntitlementOperation } from './CheckEntitlementOperation.js';
export { ListEntitlementsOperation, LoadListEntitlementsOperation } from './ListEntitlementsOperation.js';
export { CheckPersonEntitlement, ListPersonEntitlements, ASOF_FUTURE_TOLERANCE_MS } from './EntitlementRead.js';
export type {
    CheckEntitlementInput,
    CheckEntitlementOutput,
    ListEntitlementsInput,
    ListEntitlementsOutput,
    ListedEntitlement,
} from './EntitlementRead.js';

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
    AchFeeEstimate,
    DecideSettlement,
} from './PaymentProviderBehavior.js';
export type {
    IntentStatus,
    SignatureVerification,
    WebhookAction,
    WebhookDecision,
    SettlementAction,
    SettlementDecision,
} from './PaymentProviderBehavior.js';

export { BasePaymentProvider, LoadBasePaymentProvider } from './BasePaymentProvider.js';
export type {
    PaymentProviderConfig,
    PaymentCredentials,
    CreateIntentRequest,
    CreateIntentResult,
    CaptureRequest,
    CaptureResult,
    RetrieveIntentRequest,
    RetrieveIntentResult,
    RefundRequest,
    RefundResult,
    WebhookEvent,
} from './BasePaymentProvider.js';

export { StripePaymentProvider, LoadStripePaymentProvider, ToFormBody } from './StripePaymentProvider.js';
export { StripeACHPaymentProvider, LoadStripeACHPaymentProvider } from './StripeACHPaymentProvider.js';
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

// Document delivery (§4.4) — the pure decisions, the channel seam, and the one shipped channel.
// Document-AGNOSTIC: nothing below knows what an invoice is, which is what makes it reusable for
// statements, dunning notices, order confirmations and receipts.
export { DecideDelivery, ResolveRecipients, BuildSubject, DeliveryIdempotencyKey } from './DeliveryBehavior.js';
export type {
    DeliveryChannelCode,
    DeliveryContact,
    DeliverableFacts,
    DeliveryVerdict,
    DeliveryDecision,
} from './DeliveryBehavior.js';
export { BaseDeliveryChannel, LoadBaseDeliveryChannel } from './BaseDeliveryChannel.js';
export type {
    DeliverableDocument,
    DeliveryAddressing,
    DeliveryResult,
    DeliveryContext,
} from './BaseDeliveryChannel.js';
export { EmailDeliveryChannel, LoadEmailDeliveryChannel } from './EmailDeliveryChannel.js';
export { ResolveDeliveryChannel, DeliveryChannelNotConfiguredError } from './DeliveryResolver.js';
export { LoadOrderDeliveryContacts, LoadOrderStatus } from './DeliveryRecipientResolver.js';

export { HandlePaymentWebhook, MountPaymentWebhook } from './PaymentWebhookHandler.js';
export { OpenPaymentIntent } from './PaymentIntentService.js';
export type { OpenIntentRequest, OpenIntentResult } from './PaymentIntentService.js';
export { SettlePaymentForEvent } from './PaymentSettlement.js';
export type { SettlementOutcome } from './PaymentSettlement.js';
export {
    LoadAppliedAllocations,
    BuildUnapplyLines,
    CopyPaymentDetail,
    NextPaymentNumber,
    CreateReversingPayment,
} from './PaymentReversalFactory.js';
export type {
    ReversiblePayment,
    AppliedAllocation,
    PaymentReversalRequest,
    PaymentReversalResult,
} from './PaymentReversalFactory.js';
export type {
    WebhookRequest,
    WebhookResponse,
    WebhookHttpRequest,
    WebhookHttpResponse,
} from './PaymentWebhookHandler.js';

// Promotions (D70): the pure engine, the DB-backed resolution, and the qualifier plugin seam.
export { ApplyPromotions, ScreenPromotion, ValuePromotion } from '@mj-biz-apps/orders-entities';
export type {
    PromotionRule,
    PromotionContext,
    PromotionOutcome,
    RejectedPromotion,
    ApplyPromotionsResult,
    PromotionRejection,
    PromotionValueKind,
    StackingMode,
} from '@mj-biz-apps/orders-entities';
export {
    AuthorizeManualDiscount,
    BasePromotionQualifier,
    LoadPromotionEngine,
    PromotionError,
    RunPromotions,
    WriteAdjustments,
} from '@mj-biz-apps/orders-entities';
// Charges (D71): the pure engine and the DB-backed resolution. Tax is a CHARGE, which is what
// makes multi-layer tax several rows rather than a special case.
export { ComputeCharges } from '@mj-biz-apps/orders-entities';
export type {
    ChargeBasis,
    ChargeCategory,
    ChargeRequest,
    ChargeAllocation,
    ComputedCharge,
    ChargeableLine,
    ComputeChargesResult,
} from '@mj-biz-apps/orders-entities';
export { ChargeError, RunCharges, SplitChargesByLine, WriteCharges } from '@mj-biz-apps/orders-entities';
export type { RequestedCharge } from '@mj-biz-apps/orders-entities';

// Tax resolution (D72): address -> jurisdictions -> rates, minus the buyer's exemptions. The
// jurisdiction step is a SEAM — postal/city matching is enough for many deployments and is not
// rooftop-accurate, which is where a commercial provider earns its money.
export { BaseTaxJurisdictionResolver, DefaultTaxJurisdictionResolver, LoadTaxResolver, ResolveTax } from '@mj-biz-apps/orders-entities';
export type { TaxAddress, ResolvedTaxLayer, TaxResolutionResult } from '@mj-biz-apps/orders-entities';

export type {
    ManualDiscountRequest,
    PromotableLine,
    PromotionApplication,
    PromotionQualificationContext,
    PromotionRunResult,
    RunPromotionsInput,
} from '@mj-biz-apps/orders-entities';
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

// The app's lookup cache (D36/D37). Payment types, provider types, terms and charge types are read
// on nearly every write path and change a few times a year — a per-call RunView naming one column
// looks careful and is really a silent dependency on CodeGen having run.
export { OrdersEngine, LoadOrdersEngine } from '@mj-biz-apps/orders-entities';

// The order lifecycle (D8/D53): the legal statuses, the legal MOVES between them, and what each one
// permits. The DB CHECK enforces the set and never enforced the moves.
// The lifecycle table moved DOWN to @mj-biz-apps/orders-entities so the browser enforces the same
// moves the server does — it is pure logic with no database and no provider, and a hand-copied
// approximation in the UI is exactly how the two ends drift. Re-exported here unchanged so every
// existing server-side importer keeps working.
export {
    CanTransition,
    CountsTowardReceivable,
    IsBooked,
    IsDeliverable,
    IsEditable,
    IsOrderStatus,
    IsTerminal,
    NextStatuses,
    ORDER_STATUSES,
} from '@mj-biz-apps/orders-entities';
export type { OrderStatus, TransitionVerdict } from '@mj-biz-apps/orders-entities';

// Payment terms (D83): when an order is due, resolved once at confirm and STORED — nothing
// populated OrderHeader.DueDate before, so the collections worklist returned nothing, ever.
export { AddDays, BestCustomerTerms, CustomerTermsApply, ResolveDueDate } from './PaymentTermsBehavior.js';
export type { CustomerTermsFacts, TermsFacts, TermsResolution, TermsResolutionInput, TermsSource } from './PaymentTermsBehavior.js';

export { EntitlementGrantClaimDriver, LoadEntitlementGrantClaimDriver } from './EntitlementGrantClaimDriver.js';
export { GuestOrderClaimDriver, LoadGuestOrderClaimDriver } from './GuestOrderClaimDriver.js';
export { resolvePersonID } from './claimDriverHelpers.js';
export { CheckoutSessionService } from './CheckoutSessionService.js';
export {
    CHECKOUT_CAPTURE_RETRY_WINDOW_MS,
    CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER,
    isCaptureRefusalRetryable,
    isTerminalCapturePrecheck,
    webhookEventExceedsRetryWindow,
} from './checkoutCaptureRetry.js';
export { raiseCheckoutCaptureTerminalAlert } from './checkoutCaptureAlert.js';
export type {
    AttendeeInput,
    CheckoutAttendeeInput,
    CheckoutLineExtensionData,
    CheckoutLineInput,
    CheckoutLineSummary,
    InitSessionResult,
    UpdateDraftResult,
    CompleteCheckoutResult,
    OpenSessionPaymentIntentResult,
    BookCheckoutPaymentResult,
} from './CheckoutSessionService.js';

// SQL boundary guards — the sanctioned escaping/validation helpers for remote-caller input
// (see the repo CLAUDE.md "SQL Safety" rule). Exported so the Server package's edge can use
// the same audited helpers rather than hand-rolling its own.
export { EscapeText, InvalidOperationInputError, RequireDate, RequireOptionalUUID, RequireUUID, RequireUUIDs } from './sql-guards.js';
