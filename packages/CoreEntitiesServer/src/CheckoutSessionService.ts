/**
 * @fileoverview CheckoutSessionService
 *
 * Provides generic server-side orchestration for anonymous checkout sessions, widget token
 * initialization, draft order graph composition with polymorphic product extensions,
 * and payment completion handling.
 *
 * @module @mj-biz-apps/orders-core-entities-server/CheckoutSessionService
 */

import { BaseEntity, EntityFieldInfo, IMetadataProvider, IRunViewProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    BusinessTimeZoneEngine,
    mjBizAppsCommonAddressEntity,
    mjBizAppsCommonAddressLinkEntity
} from '@mj-biz-apps/common-entities';
import { IdentityClaimEngineServer } from '@memberjunction/core-entities-server';
import { CalendarDayOrToday } from './calendar-day.js';
import {
    CheckBillingLocation,
    LoadOrdersEngine,
    OrderHeaderEntity,
    OrderLineEntity,
    OrderPricingService,
    OrdersEngine,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersCheckoutSessionEntity,
    mjBizAppsOrdersCheckoutWidgetDistributionEntity,
    mjBizAppsOrdersCheckoutWidgetEntity,
    mjBizAppsOrdersPaymentIntentEntity,
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductTypeEntity,
    TodayAsDateValue,
    type BillingLocation,
    type CheckoutWidgetConfiguration,
    type ProductTypeConfiguration,
    type TaxAddress,
    CheckAnswersAgainstQuestions,
    CheckCheckoutAnswers,
    ReadCheckoutQuestions,
    type CheckoutAnswersCheck,
    type CheckoutAnswersInput,
    type ResolvedCheckoutAnswer,
    NormalizeCheckoutAttribution,
    type CheckoutAttribution,
    CheckCheckoutChoices,
    ChoicesForStorage,
    ReadCheckoutChoiceGroups,
    CheckChoicesAgainstGroups,
    type CheckoutChoicesCheck,
    type CheckoutChoicesInput
} from '@mj-biz-apps/orders-entities';
import { EscapeText, IsUUID, RequireUUID } from './sql-guards.js';
import type { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import { RunPrePurchaseChecks, type CheckoutRefusal, type PrePurchaseRefusal } from './CheckoutPrePurchaseCheck.js';
import { ExplainMissingCheckoutAttendees, LoadProductsRequiringAttendees } from './AttendeeRequirement.js';
import { ResolvePersonByEmail } from './PersonByEmail.js';
import { OpenPaymentIntent, SUPPORTED_PAYMENT_CURRENCY } from './PaymentIntentService.js';
import { ResolvePaymentProvider } from './PaymentProviderResolver.js';
import { ResolveCheckoutPublishableKey } from './CheckoutPublishableKey.js';
import {
    FindReusableProviderCustomerRef,
    SnapshotSellsSubscription,
    SaveCheckoutInstrumentForRenewals,
} from './CheckoutSavedInstrument.js';
import { EnsureProviderSubscriptionsOnOwnProvider } from './ProviderSubscriptions.js';
import {
    CheckoutMemberDiscountNotConfiguredError,
    DEFAULT_TYPED_CODE_PRECEDENCE,
    IsRegisteredMemberPromotionCode,
    ResolveCheckoutMemberDiscountResolver,
    type CheckoutTypedCodePrecedence,
} from './CheckoutMemberDiscountResolver.js';
import { CapturePaymentOperation } from './CapturePaymentOperation.js';
import { WithIsolatedProvider } from './isolatedProvider.js';
import { ToIsoCountryCode, type CheckoutLocationEvidence } from './VatLocationEvidence.js';
import type { RetrieveIntentResult } from './BasePaymentProvider.js';
import { raiseCheckoutCaptureTerminalAlert, raiseCheckoutSettledNotBookedAlert } from './checkoutCaptureAlert.js';
import { CheckoutStepLog, type CheckoutStepAttempt, type CheckoutStepSource } from './CheckoutStepLog.js';
import {
    isCaptureRefusalRetryable,
    isTerminalCapturePrecheck,
} from './checkoutCaptureRetry.js';
import { DescribeCheckoutSnapshot, SendOrderDescriptionToGateway } from './IntentDescription.js';
import { SetSystemOrderOrigin } from './SystemOrderOrigin.js';
import {
    LoadRenewalPaymentOrder,
    PayerOwnsRenewalCustomer,
    RenewalPaymentAlreadyConfirmed,
    RenewalPaymentLinkSecret,
    RenewalPaymentRefusal,
    RenewalPaymentTokenMessage,
    VerifyRenewalPaymentToken,
    type RenewalPaymentOrder,
} from './CheckoutRenewalPayment.js';

const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';
const CHECKOUT_DISTRIBUTION_ENTITY = 'MJ_BizApps_Orders: Checkout Widget Distributions';
const CHECKOUT_SESSION_ENTITY = 'MJ_BizApps_Orders: Checkout Sessions';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';
const ADDRESS_ENTITY = 'MJ_BizApps_Common: Addresses';

/** Shown when no checkout session could be created or resumed for a widget and client key. */
const SESSION_START_RETRY_MESSAGE = 'Checkout could not start just now. Please try again in a minute.';
const ADDRESS_LINK_ENTITY = 'MJ_BizApps_Common: Address Links';
const ADDRESS_TYPE_ENTITY = 'MJ_BizApps_Common: Address Types';
const BILLING_ADDRESS_TYPE = 'Billing';

const MISSING_LOCATION_MESSAGE =
    'A billing country is required before payment — and, for the United States, Canada and Australia, a state or province and a postal code.';

/**
 * Server-side quantity ceiling applied when neither `Product.MaxQuantityPerLine` nor
 * `ProductType.Configuration.maxQuantity` is configured. Without it, quantity — and the
 * per-unit line expansion driven by attendee arrays — is unbounded from an anonymous caller.
 */
const DEFAULT_MAX_QUANTITY_PER_LINE = 100;
/** Ceiling on the number of input lines a single checkout may carry. */
const MAX_LINES_PER_CHECKOUT = 50;

/** PaymentIntent statuses that satisfy the paid-order gate at completion. */
const SETTLED_INTENT_STATUSES: ReadonlyArray<string> = ['Succeeded'];

export interface InitSessionResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID?: string;
    ClientSessionKey?: string;
    WidgetID?: string;
    WidgetName?: string;
    CompanyID?: string;
    DistributionSlug?: string;
    Configuration?: CheckoutWidgetConfiguration;
    CustomCSS?: string | null;
    CustomJS?: string | null;
    ExpiresAt?: string;
    /** Set when the session pays an open renewal order through the update-card link (#289). */
    RenewalPayment?: RenewalPaymentSummary;
}

/** What the pay-renewal page shows: the order being paid, never anything about the buyer. */
export interface RenewalPaymentSummary {
    OrderNumber: string;
    /** The amount due, in major units. */
    Amount: number;
    /** What the order renews: its renewal lines' product names. */
    Description: string;
    SubscriptionNumber: string | null;
    /** `YYYY-MM-DD`. */
    DueDate: string | null;
}

export interface CheckoutAttendeeInput {
    FirstName: string;
    LastName: string;
    Email: string;
    Company?: string;
    PersonID?: string;
    DietaryPreferences?: string;
    Comments?: string;
}

export type AttendeeInput = CheckoutAttendeeInput;

export interface CheckoutLineExtensionData {
    /** Target extension entity name (e.g. 'MJ_BizApps_Orders: Event Order Lines') */
    EntityName?: string;
    /** Key-value dictionary of extension fields */
    Fields?: Record<string, unknown>;
    /** For multi-unit items (e.g. 3 tickets), array of per-unit field dictionaries */
    Units?: Array<Record<string, unknown>>;
}

export interface CheckoutLineInput {
    ProductID: string;
    Quantity: number;
    /** Generic polymorphic extension payload */
    ExtensionData?: CheckoutLineExtensionData;
    /** Generic field dictionary directly on line input */
    ExtensionFields?: Record<string, unknown>;
    /** Per-unit field dictionaries */
    Units?: Array<Record<string, unknown>>;
    /** Legacy attendee input compatibility */
    Attendees?: CheckoutAttendeeInput[];
}

/**
 * The buyer's billing location as the widget sends it. Codes only: Country is ISO 3166-1 alpha-2
 * and StateProvince an ISO 3166-2 subdivision code — see `CheckBillingLocation`.
 */
export interface CheckoutBillingAddressInput {
    Country?: string;
    StateProvince?: string;
    PostalCode?: string;
}

/** What a session's MetadataJSON holds between draft and completion. */
interface CheckoutSnapshot {
    Lines?: CheckoutLineInput[];
    PricedLines?: CheckoutLineSummary[];
    TotalGross?: number;
    BillingAddress?: BillingLocation;
    Answers?: CheckoutAnswersInput;
    Attribution?: CheckoutAttribution;
    Choices?: CheckoutChoicesInput;
    /**
     * Promotion code a verified member token earned. The token itself is never stored. A draft
     * snapshots this or `PromotionCodes`, not both, unless the resolver chose `'Stack'` (#358).
     */
    MemberPromotionCode?: string | null;
    /** Codes the buyer entered that the draft priced with. */
    PromotionCodes?: string[];
    UpdatedAt?: string;
}

export interface CheckoutLineSummary {
    ID: string;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    ExtendedPrice: number;
    Description?: string;
}

export interface UpdateDraftResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID: string;
    OrderID?: string;
    OrderNumber?: string;
    Subtotal: number;
    Tax: number;
    Adjustments: number;
    TotalGross: number;
    RequiresPayment: boolean;
    Lines: CheckoutLineSummary[];
    /** Set when a pre-purchase check refused the draft; `ErrorMessage` carries the buyer's message. */
    Refusal?: CheckoutRefusal;
    /** The promotion code the draft was priced with, when it was usable. */
    AppliedPromotionCodes?: string[];
    /** Codes the buyer entered that did nothing, and why — shown to the buyer, never silently dropped. */
    UnusablePromotionCodes?: Array<{ Code: string; Reason: string }>;
    /** What the applied promotion took off, in major units (0 when none). */
    Discount?: number;
    /** True when a member token earned a discount that this draft is priced with. */
    MemberDiscountApplied?: boolean;
    /** Why a member token earned no discount, for the buyer. Absent when no token was sent. */
    MemberDiscountMessage?: string;
}

/** Outcome of resolving a draft's member token. */
interface MemberDiscountResolution {
    PromotionCode: string | null;
    Message?: string;
    /** Whether the member code replaces a typed code or yields to it. */
    TypedCode?: CheckoutTypedCodePrecedence;
    /** Set when the widget cannot verify tokens at all — the draft is refused. */
    Refusal?: string;
}

/** Most codes a buyer can present on one checkout. One, as a hosted card checkout allows. */
export const MAX_PROMOTION_CODES_PER_CHECKOUT = 1;
/** Longest code accepted — `PromotionCode.Code` is NVARCHAR(60). */
const MAX_PROMOTION_CODE_LENGTH = 60;

/**
 * Normalise the codes an anonymous caller sent: strings only, trimmed, empties dropped, de-duplicated
 * case-insensitively. Refuses more than {@link MAX_PROMOTION_CODES_PER_CHECKOUT} or an over-long code
 * rather than truncating — a code that was cut short is a different code.
 */
export function NormalizeCheckoutPromotionCodes(input: unknown): { Codes: string[] } | { Error: string } {
    if (input == null) return { Codes: [] };
    if (!Array.isArray(input)) return { Error: 'Promotion codes must be a list.' };
    const seen = new Set<string>();
    const codes: string[] = [];
    for (const raw of input) {
        if (typeof raw !== 'string') return { Error: 'Promotion codes must be text.' };
        const code = raw.trim();
        if (!code) continue;
        if (code.length > MAX_PROMOTION_CODE_LENGTH) return { Error: 'That promotion code is too long.' };
        const key = code.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        codes.push(code);
    }
    if (codes.length > MAX_PROMOTION_CODES_PER_CHECKOUT) {
        return { Error: `Only ${MAX_PROMOTION_CODES_PER_CHECKOUT} promotion code can be used per order.` };
    }
    return { Codes: codes };
}

/**
 * The codes a checkout prices with: the buyer's own codes plus the code a verified member token
 * earned, de-duplicated case-insensitively. A draft snapshots both only when the resolver chose
 * `'Stack'` (see {@link PlanCheckoutPromotionCodes}), so at `/complete` this usually passes one side
 * through; a session drafted before that rule may still carry both, and is priced as it was drafted.
 */
export function CombineCheckoutPromotionCodes(buyerCodes: string[], memberCode: string | null | undefined): string[] {
    if (!memberCode || buyerCodes.some((c) => c.toLowerCase() === memberCode.toLowerCase())) {
        return [...buyerCodes];
    }
    return [...buyerCodes, memberCode];
}

/** One set of codes to price a draft with: the buyer's typed codes and the member code. */
export interface CheckoutPromotionCodeAttempt {
    Buyer: string[];
    Member: string | null;
}

/**
 * The code sets a draft tries, in order, when a member code and a typed code may both be present (#358).
 * They do not stack: the precedence picks which is priced first, and the other is the fallback when the
 * engine declines every code in the first. `'Stack'` prices both in one attempt. With only one side
 * present, or the same code on both, there is a single attempt.
 */
export function PlanCheckoutPromotionCodes(
    buyerCodes: string[],
    memberCode: string | null | undefined,
    precedence: CheckoutTypedCodePrecedence | undefined,
): CheckoutPromotionCodeAttempt[] {
    const member = memberCode || null;
    const contested = !!member && buyerCodes.some((c) => c.toLowerCase() !== member.toLowerCase());
    if (!contested || precedence === 'Stack') {
        return [{ Buyer: [...buyerCodes], Member: member }];
    }
    const memberOnly: CheckoutPromotionCodeAttempt = { Buyer: [], Member: member };
    const typedOnly: CheckoutPromotionCodeAttempt = { Buyer: [...buyerCodes], Member: null };
    return (precedence ?? DEFAULT_TYPED_CODE_PRECEDENCE) === 'Yield' ? [typedOnly, memberOnly] : [memberOnly, typedOnly];
}

/** Why a typed code did nothing when the member code replaced it. Shown as "<code> can't be used: <reason>." */
const TYPED_CODE_REPLACED_BY_MEMBER = 'your member discount applies instead, and the two cannot be combined';
/** Why a member code was set aside for the buyer's typed code. */
const MEMBER_CODE_YIELDED_TO_TYPED = 'Your member discount cannot be combined with a promotion code, so the code you entered is used instead.';

const MEMBER_DISCOUNT_UNAVAILABLE = 'Your member discount could not be verified, so this checkout is priced at the standard rate.';
/**
 * Shown when the payment settled but the order, re-priced at completion, now costs more than was paid:
 * a member discount or a typed promotion code stopped applying, or the price changed some other way.
 * The buyer has been charged and staff are alerted, so every case gets the refund wording.
 */
function SettledButShortMessage(cause: 'member' | 'code' | 'price'): string {
    const what = {
        member: 'Your member discount no longer applies to this order',
        code: 'Your promotion code no longer applies to this order',
        price: 'The price of this order changed after you paid',
    }[cause];
    return `${what}, so your payment does not cover the total and the order was not placed. `
        + 'Our team has been notified and will arrange a refund.';
}

/** Outcome of booking CapturePayment after a checkout order is already confirmed. */
export interface BookCheckoutPaymentResult {
    /** True when CapturePayment was invoked (or would have been, but a pre-check failed). */
    Attempted: boolean;
    /** True when the order is paid (already, or as a result of this call). */
    Booked: boolean;
    ErrorMessage?: string;
    /**
     * When Attempted && !Booked: a later attempt might succeed. Unclassified defaults
     * true. The webhook 500s only when this is true (and the event is still inside
     * the retry window).
     */
    Retryable?: boolean;
}

export interface CompleteCheckoutResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID: string;
    Status: string;
    OrderID?: string;
    OrderNumber?: string;
    TotalGross?: number;
    PaymentIntentID?: string;
    ClientSecret?: string;
    /**
     * The IdentityClaim row id minted for the buyer's email. The verification token is never
     * returned through the checkout path; it would only travel in the claim e-mail, which is off.
     */
    ClaimToken?: string;
}

/**
 * How long a caller that finds a session Processing waits for the other completion to finish. The
 * browser's complete call and the payment webhook can both arrive for one payment (#724); the one
 * that loses the latch waits for the winner and answers with its order.
 */
const PROCESSING_WAIT_MS = 30_000;
const PROCESSING_POLL_MS = 1_000;

/** Who is completing a session, and what happened that the result does not carry. */
interface CompletionTrigger {
    Source: CheckoutStepSource;
    Evidence?: CheckoutLocationEvidence;
    /** Filled in by the completion. */
    Report: {
        /** The capture booked after Confirm, when one ran. */
        Capture?: BookCheckoutPaymentResult;
        /** The "settled with no order" alert was already raised. */
        Alerted?: boolean;
        /** The refusal may pass on a later attempt: another caller held the latch, or a save threw. */
        Retryable?: boolean;
    };
}

export interface OpenSessionPaymentIntentResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID: string;
    PaymentIntentID?: string;
    /** Returned to the caller for Stripe.js confirmation — never persisted. */
    ClientSecret?: string;
    Status?: string;
    Amount?: number;
    /** Set when a pre-purchase check refused the purchase; `ErrorMessage` carries the buyer's message. */
    Refusal?: CheckoutRefusal;
}

export class CheckoutSessionService {
    /**
     * Resolves a public distribution slug, validates widget status, and mints an active CheckoutSession.
     */
    public static async InitializeSession(
        slug: string,
        clientSessionKey: string,
        contextUser?: UserInfo
    ): Promise<InitSessionResult> {
        if (!slug) {
            return { Success: false, ErrorMessage: 'Widget distribution slug is required' };
        }
        if (!clientSessionKey) {
            return { Success: false, ErrorMessage: 'ClientSessionKey is required' };
        }

        const rv = new RunView();
        const escapedSlug = EscapeText(slug.trim());
        const distRes = await rv.RunView<mjBizAppsOrdersCheckoutWidgetDistributionEntity>({
            EntityName: CHECKOUT_DISTRIBUTION_ENTITY,
            ExtraFilter: `Slug = '${escapedSlug}' AND Status = 'Active'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!distRes.Success || !distRes.Results || distRes.Results.length === 0) {
            return { Success: false, ErrorMessage: `Active checkout distribution not found for slug '${slug}'` };
        }

        const distribution = distRes.Results[0];
        const md = new Metadata();
        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        const loadedWidget = await widget.Load(distribution.CheckoutWidgetID);
        if (!loadedWidget || widget.Status !== 'Active') {
            return { Success: false, ErrorMessage: 'The requested checkout widget is currently unavailable' };
        }

        // One open sale session per widget and client key: a unique index holds it (#782), so an
        // overlapping second call's insert fails and that call resumes the first call's session.
        let session = await this.findOpenSaleSession(widget.ID, clientSessionKey, contextUser);
        if (!session) {
            session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
            session.NewRecord();
            session.CheckoutWidgetID = widget.ID;
            session.DistributionID = distribution.ID;
            session.ClientSessionKey = clientSessionKey;
            session.Status = 'Open';

            const expires = new Date();
            expires.setHours(expires.getHours() + 2); // 2 hour checkout session TTL
            session.ExpiresAt = expires;

            let saved = false;
            try {
                saved = await session.Save();
            } catch (err) {
                LogError(`[CheckoutSessionService] Checkout session insert failed: ${err instanceof Error ? err.message : String(err)}`);
            }
            if (!saved) {
                const concurrent = await this.findOpenSaleSession(widget.ID, clientSessionKey, contextUser);
                if (!concurrent) {
                    // Most likely an expired session that could not be marked Expired still holds
                    // the index; ReapExpiredOpenSessions clears it within a minute.
                    return { Success: false, ErrorMessage: SESSION_START_RETRY_MESSAGE };
                }
                session = concurrent;
            }
        }

        let configObj: CheckoutWidgetConfiguration = {};
        if (widget.Configuration) {
            try {
                const parsed = JSON.parse(widget.Configuration);
                if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                    throw new Error('Widget Configuration must be a JSON object');
                }
                configObj = parsed as CheckoutWidgetConfiguration;
            } catch (err) {
                return {
                    Success: false,
                    ErrorMessage: `Invalid widget configuration: ${err instanceof Error ? err.message : String(err)}`
                };
            }
        }

        // Ensure customUI section is populated, cascading from entity fields if needed
        if (!configObj.customUI) {
            configObj.customUI = {};
        }
        if (widget.CustomCSS && !configObj.customUI.css) {
            configObj.customUI.css = widget.CustomCSS;
        }
        // Auto-discover extension fields from product type metadata if not explicitly provided
        await this.discoverExtensionFields(configObj, md, contextUser);

        return {
            Success: true,
            SessionID: session.ID,
            ClientSessionKey: session.ClientSessionKey,
            WidgetID: widget.ID,
            WidgetName: widget.Name,
            CompanyID: widget.CompanyID,
            Configuration: await this.clientConfiguration(configObj, widget.Name, contextUser),
            CustomCSS: configObj.customUI.css || widget.CustomCSS,
            CustomJS: configObj.customUI.js || widget.CustomJS,
            ExpiresAt: session.ExpiresAt.toISOString()
        };
    }

    /**
     * The open, unexpired sale session for this widget and client key, or null. A sale session has
     * no DraftOrderID while open; a pay-renewal session for the same key is not resumed here. An
     * open session past its expiry is marked Expired on the way, so it no longer holds the
     * one-open-session index against the new session the caller is about to create.
     */
    private static async findOpenSaleSession(
        widgetID: string,
        clientSessionKey: string,
        contextUser?: UserInfo
    ): Promise<mjBizAppsOrdersCheckoutSessionEntity | null> {
        const res = await new RunView().RunView<mjBizAppsOrdersCheckoutSessionEntity>({
            EntityName: CHECKOUT_SESSION_ENTITY,
            ExtraFilter: `CheckoutWidgetID = '${EscapeText(widgetID)}' AND ClientSessionKey = '${EscapeText(clientSessionKey.trim())}' AND Status = 'Open' AND DraftOrderID IS NULL`,
            OrderBy: 'ExpiresAt DESC',
            ResultType: 'entity_object'
        }, contextUser);
        if (!res.Success) {
            return null;
        }
        let open: mjBizAppsOrdersCheckoutSessionEntity | null = null;
        for (const candidate of res.Results ?? []) {
            if (await this.enforceSessionExpiry(candidate)) {
                open ??= candidate;
            }
        }
        return open;
    }

    /**
     * Mint a session that pays an open renewal order — the update-card link (#289).
     *
     * The token is the credential: signed by this server, naming the renewal order and the
     * subscription, and expiring with the access cutoff plus a grace. The session is shown in the
     * checkout widget that sold the subscription, and its `DraftOrderID` is the renewal order, which
     * is what puts every later call (`OpenPaymentIntentForSession`, `CompleteCheckout`) in the
     * pay-renewal mode. Refused once the order is paid or a session has already paid it.
     */
    public static async InitializeRenewalPaymentSession(
        token: string,
        clientSessionKey: string,
        contextUser?: UserInfo
    ): Promise<InitSessionResult> {
        if (!clientSessionKey) {
            return { Success: false, ErrorMessage: 'ClientSessionKey is required' };
        }
        const provider = Metadata.Provider as IMetadataProvider | undefined;
        if (!contextUser || !provider) {
            return { Success: false, ErrorMessage: 'Renewal payment is not available at the moment.' };
        }
        const check = await VerifyRenewalPaymentToken(token, RenewalPaymentLinkSecret());
        if (check.Valid === false) {
            return { Success: false, ErrorMessage: RenewalPaymentTokenMessage(check.Reason) };
        }

        const order = await LoadRenewalPaymentOrder(check.OrderID, provider, contextUser);
        const refusal = RenewalPaymentRefusal(
            order,
            check.SubscriptionID,
            order ? await RenewalPaymentAlreadyConfirmed(order.OrderID, provider, contextUser) : false
        );
        if (refusal || !order) {
            return { Success: false, ErrorMessage: refusal ?? 'This renewal could not be found.' };
        }
        if (!order.SourceCheckoutWidgetID) {
            return { Success: false, ErrorMessage: 'This renewal was not sold through a checkout, so it cannot be paid here.' };
        }

        const md = new Metadata();
        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        if (!(await widget.Load(order.SourceCheckoutWidgetID)) || widget.Status !== 'Active') {
            return { Success: false, ErrorMessage: 'The checkout for this renewal is currently unavailable' };
        }

        const rv = new RunView();
        const escapedKey = EscapeText(clientSessionKey.trim());
        const nowUtc = new Date().toISOString();
        const existing = await rv.RunView<mjBizAppsOrdersCheckoutSessionEntity>({
            EntityName: CHECKOUT_SESSION_ENTITY,
            ExtraFilter:
                `CheckoutWidgetID = '${widget.ID}' AND ClientSessionKey = '${escapedKey}' AND Status = 'Open' ` +
                `AND DraftOrderID = '${RequireUUID(order.OrderID, 'OrderHeaderID')}' AND ExpiresAt > '${nowUtc}'`,
            ResultType: 'entity_object'
        }, contextUser);

        let session: mjBizAppsOrdersCheckoutSessionEntity;
        if (existing.Success && existing.Results?.length) {
            session = existing.Results[0];
        } else {
            session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
            session.NewRecord();
            session.CheckoutWidgetID = widget.ID;
            session.ClientSessionKey = clientSessionKey;
            session.Status = 'Open';
            session.DraftOrderID = order.OrderID;
            // The payer, not the beneficiary a gift renewal bills (#683).
            if (order.PayerPersonID) {
                session.PersonID = order.PayerPersonID;
                const person = await md.GetEntityObject<mjBizAppsCommonPersonEntity>(PERSON_ENTITY, contextUser);
                if ((await person.Load(order.PayerPersonID)) && person.Email?.trim()) {
                    session.Email = person.Email.trim();
                }
            }
            // The same two-hour window as any checkout, never past the link's own expiry.
            const expires = new Date();
            expires.setHours(expires.getHours() + 2);
            session.ExpiresAt = expires.getTime() < check.ExpiresAt.getTime() ? expires : check.ExpiresAt;
            if (!(await session.Save())) {
                return { Success: false, ErrorMessage: 'Failed to initialize checkout session record' };
            }
        }

        let configObj: CheckoutWidgetConfiguration = {};
        try {
            const parsed: unknown = widget.Configuration ? JSON.parse(widget.Configuration) : {};
            configObj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as CheckoutWidgetConfiguration) : {};
        } catch {
            configObj = {};
        }
        if (!configObj.customUI) configObj.customUI = {};
        if (widget.CustomCSS && !configObj.customUI.css) configObj.customUI.css = widget.CustomCSS;

        return {
            Success: true,
            SessionID: session.ID,
            ClientSessionKey: session.ClientSessionKey,
            WidgetID: widget.ID,
            WidgetName: widget.Name,
            CompanyID: widget.CompanyID,
            Configuration: await this.clientConfiguration(configObj, widget.Name, contextUser),
            CustomCSS: configObj.customUI.css || widget.CustomCSS,
            CustomJS: configObj.customUI.js || widget.CustomJS,
            ExpiresAt: session.ExpiresAt.toISOString(),
            RenewalPayment: {
                OrderNumber: order.OrderNumber,
                Amount: Math.round(order.Balance * 100) / 100,
                Description: order.Description,
                SubscriptionNumber: order.SubscriptionNumber,
                DueDate: order.NextDueDate,
            },
        };
    }

    /**
     * The renewal order a pay-renewal session pays, or null when the session is an ordinary checkout.
     * The mode is read from the order: only a renewal order has a line naming the subscription it
     * renews, and a checkout never writes one.
     */
    private static async renewalOrderFor(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        contextUser: UserInfo | undefined
    ): Promise<RenewalPaymentOrder | null> {
        const provider = Metadata.Provider as IMetadataProvider | undefined;
        if (!session.DraftOrderID || !contextUser || !provider) return null;
        try {
            const order = await LoadRenewalPaymentOrder(session.DraftOrderID, provider, contextUser);
            return order && order.SubscriptionIDs.length > 0 ? order : null;
        } catch (err) {
            // Unreadable reads as "not a renewal": an ordinary checkout's capture must not fail on it.
            LogError(
                `[CheckoutSessionService] Session ${session.ID}: could not read order ${session.DraftOrderID} as a renewal: ` +
                    `${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    /**
     * Strips obviously sensitive keys from a widget Configuration before it ships to an
     * anonymous caller. `Configuration` is admin-authored JSON with an open index signature,
     * so a future secret-shaped key (a webhook secret, an API credential, a server-side
     * payment provider ref) must never ride along to the browser. `stripePublishableKey`
     * is publishable by definition and survives — but its VALUE is decided by
     * `ResolveCheckoutPublishableKey` (see `clientConfiguration`), not taken from here as is.
     */
    /**
     * Keys that may cross to an unauthenticated browser. Anything else in the
     * admin-authored Configuration JSON stays on the server (allowlist, not denylist).
     */
    private static readonly PUBLIC_CONFIGURATION_KEYS: ReadonlySet<string> = new Set([
        'title',
        'description',
        'productId',
        'productSku',
        'productName',
        'unitPrice',
        'currency',
        'unitMode',
        'allowQuantity',
        'maxQuantity',
        'stripePublishableKey',
        'autoRenewConsentText',
        'successMessage',
        'accessMessages',
        'redirectUrl',
        'extensionEntityName',
        'extensionFields',
        'allowedOrigins',
        'requireTurnstile',
        'customUI',
        'isEvent',
        'theme',
        'allowCoupons',
        'questions',
        'choiceGroups',
    ]);

    /**
     * The Configuration an anonymous browser receives: the allowlisted keys, with
     * `stripePublishableKey` replaced by the resolved key — the payment provider's
     * `<CredentialsRef>_PUBLISHABLE_KEY` when the server has one, else the widget's own value.
     * Every path that hands a browser a widget Configuration goes through here, so the session API
     * and the server-rendered host page cannot disagree about which key to load Stripe.js with.
     */
    private static async clientConfiguration(
        configObj: CheckoutWidgetConfiguration,
        widgetName: string,
        contextUser: UserInfo | undefined
    ): Promise<CheckoutWidgetConfiguration> {
        const client = this.sanitizeConfigurationForClient(configObj);
        const publishable = await ResolveCheckoutPublishableKey(configObj, widgetName, contextUser);
        if (publishable.Key) {
            client.stripePublishableKey = publishable.Key;
        } else {
            delete client.stripePublishableKey;
        }
        return client;
    }

    private static sanitizeConfigurationForClient(configObj: CheckoutWidgetConfiguration): CheckoutWidgetConfiguration {
        const sanitized: CheckoutWidgetConfiguration = {};
        for (const [key, value] of Object.entries(configObj)) {
            if (CheckoutSessionService.PUBLIC_CONFIGURATION_KEYS.has(key)) {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    private static idsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
        if (!a || !b) {
            return false;
        }
        return a.replace(/[{}]/g, '').toLowerCase() === b.replace(/[{}]/g, '').toLowerCase();
    }

    /**
     * Catalog this anonymous session is allowed to sell. Explicit `productId` /
     * `allowedProductIds` / SKU-resolved id. An empty result is a misconfigured
     * anonymous widget unless `allowAnyProduct` is set (open catalog still
     * requires a company match).
     */
    private static async resolveAllowedProductIds(
        configObj: CheckoutWidgetConfiguration,
        contextUser?: UserInfo
    ): Promise<Set<string>> {
        const allowed = new Set<string>();
        if (typeof configObj.productId === 'string' && configObj.productId.trim()) {
            allowed.add(configObj.productId.trim());
        }
        if (Array.isArray(configObj.allowedProductIds)) {
            for (const id of configObj.allowedProductIds) {
                if (typeof id === 'string' && id.trim()) {
                    allowed.add(id.trim());
                }
            }
        }
        if (allowed.size === 0 && typeof configObj.productSku === 'string' && configObj.productSku.trim()) {
            const md = new Metadata();
            await LoadOrdersEngine(Metadata.Provider, contextUser ?? md.CurrentUser);
            const hit = OrdersEngine.Instance.ProductBySKU(configObj.productSku);
            if (hit) allowed.add(hit.ID);
        }
        return allowed;
    }

    /**
     * Marks expired-but-still-Open sessions Expired. Bounded; best-effort.
     *
     * A session whose payment settled has charged the buyer with no order, so expiring it raises the
     * "settled with no order" alert: otherwise it would leave nothing for staff to see (#724).
     */
    public static async ReapExpiredOpenSessions(contextUser?: UserInfo, limit = 50): Promise<number> {
        const rv = new RunView();
        const nowUtc = new Date().toISOString();
        const res = await rv.RunView<{ ID: string }>({
            EntityName: CHECKOUT_SESSION_ENTITY,
            Fields: ['ID'],
            ExtraFilter: `Status = 'Open' AND ExpiresAt <= '${nowUtc}'`,
            MaxRows: limit,
            ResultType: 'simple',
        }, contextUser);
        if (!res?.Success || !res.Results?.length) {
            return 0;
        }
        const md = new Metadata();
        let n = 0;
        for (const row of res.Results.slice(0, limit)) {
            try {
                const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
                if (!(await session.Load(row.ID))) {
                    continue;
                }
                if (session.Status !== 'Open') {
                    continue;
                }
                session.Status = 'Expired';
                if (await session.Save()) {
                    n++;
                    if (await this.sessionPaymentSettled(session, md, contextUser)) {
                        void raiseCheckoutSettledNotBookedAlert(
                            session.ID,
                            session.PaymentIntentID,
                            'The checkout expired after its payment settled, and no order was created.',
                            contextUser,
                        );
                    }
                }
            } catch (err) {
                LogError(`[CheckoutSessionService] ReapExpiredOpenSessions failed for ${row.ID}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return n;
    }

    /** True when the session's payment intent is recorded as settled. Reads our row, not the gateway. */
    private static async sessionPaymentSettled(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<boolean> {
        if (!session.PaymentIntentID) {
            return false;
        }
        const intent = await md.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, contextUser);
        return (await intent.Load(session.PaymentIntentID)) && SETTLED_INTENT_STATUSES.includes(intent.Status);
    }

    /**
     * Waits, up to `PROCESSING_WAIT_MS`, for a session another caller latched to Processing to leave
     * that state, reloading it in place. Returns at once when it is not Processing.
     */
    private static async awaitProcessingFinished(session: mjBizAppsOrdersCheckoutSessionEntity): Promise<void> {
        const deadline = Date.now() + PROCESSING_WAIT_MS;
        while (session.Status === 'Processing' && Date.now() < deadline) {
            await new Promise<void>((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
            if (!(await session.Load(session.ID))) {
                return;
            }
        }
    }

    /**
     * Verifies a caller-presented client session key against the session row's stored key.
     * The session GUID alone must never be sufficient to drive a session — both values are
     * required on every mutating call. Constant-time comparison over char codes (this package
     * deliberately avoids Node globals, so no crypto.timingSafeEqual); a length mismatch is a
     * plain refusal — it leaks only the length, which the caller already knows from their own key.
     */
    private static verifyClientSessionKey(session: mjBizAppsOrdersCheckoutSessionEntity, clientSessionKey: string | null | undefined): boolean {
        const stored = session.ClientSessionKey ?? '';
        const presented = (clientSessionKey ?? '').trim();
        if (!stored || !presented || stored.length !== presented.length) {
            return false;
        }
        let diff = 0;
        for (let i = 0; i < stored.length; i++) {
            diff |= stored.charCodeAt(i) ^ presented.charCodeAt(i);
        }
        return diff === 0;
    }

    /**
     * Enforces the session TTL on mutating calls (it was previously only enforced at
     * session reuse). An expired-but-Open session is transitioned to 'Expired' (best-effort)
     * and refused.
     */
    private static async enforceSessionExpiry(session: mjBizAppsOrdersCheckoutSessionEntity): Promise<boolean> {
        if (session.ExpiresAt && new Date(session.ExpiresAt).getTime() <= Date.now()) {
            if (session.Status === 'Open') {
                session.Status = 'Expired';
                // Retried once: a session left Open holds the one-open-session index (#782), so
                // a new session for the same key cannot start until the reaper expires it.
                const saved = (await session.Save()) || (await session.Save());
                if (!saved) {
                    LogError(`[CheckoutSessionService] Failed to mark session ${session.ID} Expired: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
            return false;
        }
        return true;
    }

    /**
     * Discovers extension field definitions from metadata for the target product's extension entity.
     */
    /**
     * ProductType.Configuration is the reusable presentation layer (customUI CSS/JS/theme,
     * unitMode, quantity). Widget Configuration overlays it; widget wins on conflict.
     */
    private static mergeProductTypePresentation(
        configObj: CheckoutWidgetConfiguration,
        productType: mjBizAppsOrdersProductTypeEntity
    ): void {
        if (!productType.Configuration) {
            return;
        }
        let pTypeConfig: ProductTypeConfiguration;
        try {
            const parsed = JSON.parse(productType.Configuration);
            if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return;
            }
            pTypeConfig = parsed as ProductTypeConfiguration;
        } catch {
            return;
        }
        if (!configObj.unitMode && pTypeConfig.unitMode) {
            configObj.unitMode = pTypeConfig.unitMode;
        }
        if (configObj.allowQuantity === undefined && pTypeConfig.allowQuantity !== undefined) {
            configObj.allowQuantity = pTypeConfig.allowQuantity;
        }
        if (!configObj.maxQuantity && pTypeConfig.maxQuantity) {
            configObj.maxQuantity = pTypeConfig.maxQuantity;
        }
        const typeUI = pTypeConfig.customUI;
        if (!typeUI) {
            return;
        }
        const widgetUI = configObj.customUI ?? {};
        configObj.customUI = {
            ...typeUI,
            ...widgetUI,
            theme: { ...(typeUI.theme ?? {}), ...(widgetUI.theme ?? {}) },
            css: widgetUI.css || typeUI.css,
            js: widgetUI.js || typeUI.js,
        };
    }

    private static async discoverExtensionFields(
        configObj: CheckoutWidgetConfiguration,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<void> {
        let productId = typeof configObj.productId === 'string' ? configObj.productId.trim() || undefined : undefined;
        const productSku = typeof configObj.productSku === 'string' ? configObj.productSku : undefined;

        if (!productId && productSku) {
            await LoadOrdersEngine(Metadata.Provider, contextUser ?? md.CurrentUser);
            productId = OrdersEngine.Instance.ProductBySKU(productSku)?.ID;
        }

        // Always write the resolved id back so a SKU-only widget still gives the
        // public host page a ProductID it can draft a line with.
        if (productId && !String(configObj.productId ?? '').trim()) {
            configObj.productId = productId;
        }

        if (!productId) return;

        const product = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, contextUser);
        const prodLoaded = await product.Load(productId);
        if (!prodLoaded) return;
        if (!configObj.productName && product.Name) {
            configObj.productName = product.Name;
        }

        if (!product.ProductTypeID) return;

        const productType = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, contextUser);
        const typeLoaded = await productType.Load(product.ProductTypeID);
        if (!typeLoaded) return;

        this.mergeProductTypePresentation(configObj, productType);

        if (Array.isArray(configObj.extensionFields) && configObj.extensionFields.length > 0) {
            return;
        }
        if (!productType.OrderLineExtensionEntity) return;

        const extEntityName = productType.OrderLineExtensionEntity;
        configObj.extensionEntityName = extEntityName;

        const extEntityInfo = md.EntityByName(extEntityName);
        if (!extEntityInfo) return;

        const discoveredFields: Array<{
            name: string;
            label: string;
            type: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select';
            required: boolean;
            placeholder?: string;
            options?: Array<{ label: string; value: string }>;
        }> = [];

        // Check if extension links to a Person
        const hasPerson = extEntityInfo.Fields.some(f => f.Name.toLowerCase() === 'personid');
        if (hasPerson) {
            discoveredFields.push(
                { name: 'firstName', label: 'First Name', type: 'text', required: true, placeholder: 'Jane' },
                { name: 'lastName', label: 'Last Name', type: 'text', required: true, placeholder: 'Doe' },
                { name: 'email', label: 'Email Address', type: 'text', required: true, placeholder: 'jane.doe@example.com' },
                { name: 'company', label: 'Company / Organization', type: 'text', required: false, placeholder: 'Acme Corp' },
                { name: 'title', label: 'Job Title', type: 'text', required: false, placeholder: 'Director' }
            );
        }

        for (const f of this.buyerExtensionFields(extEntityInfo)) {
            let fieldType: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' = 'text';
            const sqlType = (f.Type || '').toLowerCase();
            const valList = (f.ValueListType || '').toLowerCase();

            if (valList === 'list' || valList === 'listoruserentry') {
                fieldType = 'select';
            } else if (sqlType === 'bit') {
                fieldType = 'boolean';
            } else if (['date', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime'].includes(sqlType)) {
                fieldType = 'date';
            } else if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'].includes(sqlType)) {
                fieldType = 'number';
            } else if (['ntext', 'text'].includes(sqlType) || f.Length === -1 || f.MaxLength > 255) {
                // MJ stores NVARCHAR(MAX) as Type 'nvarchar' with Length -1. Length is bytes;
                // MaxLength is characters, which is what the 255 threshold means.
                fieldType = 'textarea';
            }
            const options = fieldType === 'select'
                ? [...(f.EntityFieldValues ?? [])]
                    .sort((a, b) => a.Sequence - b.Sequence)
                    .map(v => ({ label: v.Value, value: v.Value }))
                : undefined;

            const camelName = f.Name.charAt(0).toLowerCase() + f.Name.slice(1);
            const label = f.DisplayName?.trim() || f.Name.replace(/([a-z])([A-Z])/g, '$1 $2');

            discoveredFields.push({
                name: camelName,
                label,
                type: fieldType,
                // A column with a default is filled by the database when the buyer leaves it blank.
                required: !f.AllowsNull && !f.HasDefaultValue,
                placeholder: f.Description || label,
                ...(options ? { options } : {})
            });
        }

        configObj.extensionFields = discoveredFields;
    }

    /**
     * The extension columns a buyer may fill: what discovery shows when the widget names no fields
     * of its own. Not the key, not virtual, updatable through the API, not inherited from the
     * parent entity, not an `__mj_` audit column, and not one the checkout sets itself.
     */
    private static buyerExtensionFields(extEntityInfo: { Fields: EntityFieldInfo[]; ParentEntityFieldNames?: Iterable<string> | null }): EntityFieldInfo[] {
        const excluded = new Set(['id', 'personid', 'checkinat']);
        const parentFields = new Set([...(extEntityInfo.ParentEntityFieldNames ?? [])].map((n) => n.toLowerCase()));
        return (extEntityInfo.Fields ?? []).filter((f) => {
            const lower = f.Name.toLowerCase();
            return !excluded.has(lower) && !parentFields.has(lower) && !lower.startsWith('__mj_') && !f.IsPrimaryKey && !f.IsVirtual && f.AllowUpdateAPI;
        });
    }

    /** The widget's own `extensionFields`, or undefined when it names none or its JSON does not parse. */
    private static configuredExtensionFields(widget: { Configuration?: string | null }): CheckoutWidgetConfiguration['extensionFields'] | undefined {
        if (!widget.Configuration) return undefined;
        try {
            const parsed: unknown = JSON.parse(widget.Configuration);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
            return (parsed as CheckoutWidgetConfiguration).extensionFields;
        } catch {
            return undefined;
        }
    }

    /**
     * Lower-cased names of the extension columns a checkout writes from the buyer's input: the
     * fields the widget presents (#781). A widget that lists its own `extensionFields` presents only
     * those; otherwise it presents what discovery finds. Any other column (a staff-only flag, a
     * column the widget does not list) is never written from a request.
     */
    private static writableExtensionFieldNames(
        extEntityInfo: { Fields: EntityFieldInfo[]; ParentEntityFieldNames?: Iterable<string> | null },
        configuredFields: CheckoutWidgetConfiguration['extensionFields'] | undefined
    ): Set<string> {
        const discovered = new Set(this.buyerExtensionFields(extEntityInfo).map((f) => f.Name.toLowerCase()));
        if (!Array.isArray(configuredFields) || configuredFields.length === 0) {
            return discovered;
        }
        const shown = new Set(configuredFields.map((f) => String(f?.name ?? '').toLowerCase()).filter(Boolean));
        return new Set([...discovered].filter((n) => shown.has(n)));
    }

    /**
     * Resolves — and optionally creates — a Person entity record based on provided fields.
     * Lookup is by normalized email. Creation only happens when `createIfMissing` is true:
     * draft updates resolve-only (so abandoned checkouts never mint Person rows), while
     * completion creates the payer/attendee records it genuinely needs.
     */
    private static async resolveOrEnsurePerson(
        fields: Record<string, unknown>,
        contextUser?: UserInfo,
        createIfMissing = true
    ): Promise<string | null> {
        const email = this.attendeeEmail(fields);
        if (!email || !email.trim()) {
            return null;
        }

        const normalized = email.trim().toLowerCase();
        const rv = new RunView();
        try {
            // Several Persons can share an e-mail; the shared rule picks the same one every time
            // (the one with Orders history, then the oldest), and the one CheckEntitlement answers for.
            const found = await ResolvePersonByEmail(normalized, rv, contextUser);
            if (found.PersonID) {
                return found.PersonID;
            }
            if (!found.Success) {
                console.warn('[CheckoutSessionService] Person lookup error:', found.ErrorMessage);
            }
        } catch (err) {
            console.warn('[CheckoutSessionService] RunView Person lookup error:', err);
        }

        if (!createIfMissing) {
            return null;
        }

        let firstName = (fields['FirstName'] || fields['firstName'] || '') as string;
        let lastName = (fields['LastName'] || fields['lastName'] || '') as string;

        if (!firstName && !lastName && (fields['AttendeeName'] || fields['Name'] || fields['name'])) {
            const fullName = String(fields['AttendeeName'] || fields['Name'] || fields['name']).trim();
            const parts = fullName.split(/\s+/);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || '';
        }

        if (firstName || lastName) {
            try {
                const md = new Metadata();
                const person = await md.GetEntityObject<BaseEntity>(PERSON_ENTITY, contextUser);
                if (person) {
                    person.NewRecord();
                    person.Set('FirstName', firstName);
                    person.Set('LastName', lastName || firstName);
                    person.Set('Email', normalized);
                    if (fields['Title'] || fields['title']) {
                        person.Set('Title', String(fields['Title'] || fields['title']));
                    }
                    if (fields['Phone'] || fields['phone']) {
                        person.Set('Phone', String(fields['Phone'] || fields['phone']));
                    }
                    const saved = await person.Save();
                    if (saved) {
                        return person.Get('ID') as string;
                    } else {
                        console.error('[CheckoutSessionService] Person save error:', person.LatestResult?.CompleteMessage);
                    }
                }
            } catch (err) {
                console.error('[CheckoutSessionService] Person creation exception:', err);
            }
        }
        return null;
    }

    /** Resolved answers as the session metadata stores them, keyed by question. */
    private static answersForStorage(answers: ResolvedCheckoutAnswer[]): CheckoutAnswersInput {
        const stored: CheckoutAnswersInput = {};
        for (const a of answers) {
            stored[a.QuestionKey] = a.OtherText === null ? { Value: a.Answer } : { Value: a.Answer, OtherText: a.OtherText };
        }
        return stored;
    }

    /**
     * The session's stored answers, checked in full against the widget's CURRENT questions:
     * required answers present, choices valid. Run where money moves or the order books.
     */
    private static checkSessionAnswers(
        widget: mjBizAppsOrdersCheckoutWidgetEntity,
        session: mjBizAppsOrdersCheckoutSessionEntity
    ): CheckoutAnswersCheck {
        let questions: unknown;
        if (widget.Configuration) {
            try {
                questions = (JSON.parse(widget.Configuration) as CheckoutWidgetConfiguration).questions;
            } catch {
                return { Answers: [], Error: 'Invalid widget configuration' };
            }
        }
        let stored: unknown;
        if (session.MetadataJSON) {
            try {
                stored = (JSON.parse(session.MetadataJSON) as { Answers?: unknown }).Answers;
            } catch {
                stored = undefined;
            }
        }
        return CheckCheckoutAnswers(questions, stored);
    }

    /** Whether a line can hold Order Line Choices. An extension-type line (IS-A) does not. */
    private static canRecordChoices(line: unknown): line is mjBizAppsOrdersOrderLineEntity {
        return !!(line as { Choices?: unknown }).Choices;
    }

    /**
     * The session's stored choices, checked in full against the widget's CURRENT choice groups:
     * every group within its min and max, every option one of the group's. Run where money moves
     * or the order books.
     */
    private static checkSessionChoices(
        widget: mjBizAppsOrdersCheckoutWidgetEntity,
        session: mjBizAppsOrdersCheckoutSessionEntity
    ): CheckoutChoicesCheck {
        let groups: unknown;
        if (widget.Configuration) {
            try {
                groups = (JSON.parse(widget.Configuration) as CheckoutWidgetConfiguration).choiceGroups;
            } catch {
                return { Choices: [], Error: 'Invalid widget configuration' };
            }
        }
        let stored: unknown;
        if (session.MetadataJSON) {
            try {
                stored = (JSON.parse(session.MetadataJSON) as { Choices?: unknown }).Choices;
            } catch {
                stored = undefined;
            }
        }
        return CheckCheckoutChoices(groups, stored);
    }

    /**
     * Creates an order line entity instance attached to the order's Lines collection.
     */
    /**
     * Turns a draft's member token into the promotion code it earns (#324). No token prices at
     * full rate with no message; a rejected token, or a verifier that throws, prices at full rate
     * with a message. A token sent to a widget that cannot verify one is refused — a host that
     * expects member pricing must not silently charge full price.
     */
    private static async resolveMemberDiscount(
        memberToken: string | undefined,
        widgetConfig: CheckoutWidgetConfiguration,
        widget: mjBizAppsOrdersCheckoutWidgetEntity,
        session: mjBizAppsOrdersCheckoutSessionEntity,
        email: string,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<MemberDiscountResolution> {
        const token = typeof memberToken === 'string' ? memberToken.trim() : '';
        if (!token) {
            return { PromotionCode: null };
        }
        const key = typeof widgetConfig.memberDiscountResolver === 'string' ? widgetConfig.memberDiscountResolver.trim() : '';
        if (!key) {
            return { PromotionCode: null, Refusal: 'This checkout is not configured to verify member tokens.' };
        }

        let resolver;
        try {
            resolver = ResolveCheckoutMemberDiscountResolver(key);
        } catch (err) {
            if (err instanceof CheckoutMemberDiscountNotConfiguredError) {
                LogError(`[CheckoutSessionService] ${err.message}`);
                return { PromotionCode: null, Refusal: 'This checkout is not configured to verify member tokens.' };
            }
            throw err;
        }

        try {
            const decision = await resolver.Resolve(
                {
                    MemberToken: token,
                    CheckoutWidgetID: widget.ID,
                    CompanyID: widget.CompanyID,
                    SessionID: session.ID,
                    Email: email || null,
                },
                md as unknown as IMetadataProvider,
                contextUser
            );
            const code = typeof decision?.PromotionCode === 'string' ? decision.PromotionCode.trim() : '';
            if (code) {
                // Anything but an explicit 'Yield' or 'Stack' takes the default, so a misspelt value
                // cannot hand the price to a typed code the host meant to override.
                const precedence = decision.TypedCode === 'Yield' || decision.TypedCode === 'Stack' ? decision.TypedCode : DEFAULT_TYPED_CODE_PRECEDENCE;
                return { PromotionCode: code, TypedCode: precedence };
            }
            return { PromotionCode: null, Message: decision?.Message || MEMBER_DISCOUNT_UNAVAILABLE };
        } catch (err) {
            LogError(`[CheckoutSessionService] Member discount resolver '${key}' failed: ${err instanceof Error ? err.message : String(err)}`);
            return { PromotionCode: null, Message: MEMBER_DISCOUNT_UNAVAILABLE };
        }
    }

    /**
     * Computes each line's totals the way its save would, so a discount the pricing walk wrote to
     * `DiscountAmount` reaches the checkout total. Same hoisted call `OrderEntityServer` makes
     * before companion validation; idempotent.
     */
    private static async settleLineTotals(order: OrderHeaderEntity): Promise<void> {
        for (const line of order.Lines.Items) {
            const serverLine = line as unknown as { PrepareForSave?: () => Promise<void> };
            if (typeof serverLine.PrepareForSave === 'function') {
                await serverLine.PrepareForSave();
            }
        }
    }

    private static async createOrderLine(
        order: OrderHeaderEntity,
        targetExtensionEntity: string | null,
        _md: Metadata,
        _contextUser?: UserInfo
    ): Promise<OrderLineEntity> {
        const line = (await order.Lines.Create()) as OrderLineEntity;
        if (targetExtensionEntity) {
            await line.EnsureISAChild(targetExtensionEntity);
        } else {
            await line.EnsureISAChild();
        }
        return line;
    }

    /**
     * Dynamically populates and coerces extension companion properties from a field map.
     * Returns the Person it resolved (null when none) and the extension row, so a caller that
     * resolved without creating can create the Person later and set it with `setExtensionPerson`.
     */
    private static async hydrateLineExtension(
        line: OrderLineEntity,
        extensionEntityName: string | null | undefined,
        fieldValues: Record<string, unknown>,
        contextUser?: UserInfo,
        createPersons = true,
        configuredFields?: CheckoutWidgetConfiguration['extensionFields']
    ): Promise<{ PersonID: string | null; Extension: BaseEntity | null }> {
        if (!fieldValues || Object.keys(fieldValues).length === 0) {
            return { PersonID: null, Extension: null };
        }

        // Build descriptive summary for the line card if names/email are present
        const firstName = fieldValues['FirstName'] || fieldValues['firstName'];
        const lastName = fieldValues['LastName'] || fieldValues['lastName'];
        const email = fieldValues['Email'] || fieldValues['email'];
        const nameOrEmail = [
            firstName,
            lastName,
            email ? `(${email})` : ''
        ].filter(Boolean).join(' ');

        if (nameOrEmail) {
            line.Description = String(nameOrEmail);
        }

        // Auto-resolve PersonID if person fields exist on the entity or extension. Neither draft
        // pricing nor completion creates here (createPersons=false): completion creates a missing
        // attendee only once payment has checked out (#583).
        const resolvedPersonID = await this.resolveOrEnsurePerson(fieldValues, contextUser, createPersons);

        const excludedClientFields = new Set([
            'id',
            'orderlineid',
            'personid',
            'attendeepersonid',
            'checkinat',
            'checkedin',
            '__mj_createdat',
            '__mj_updatedat'
        ]);

        const ext = await line.EnsureISAChild(extensionEntityName ?? undefined);
        if (ext) {
                const extFieldsByName = new Map<string, EntityFieldInfo>(
                    (ext.EntityInfo?.Fields ?? []).map((f: EntityFieldInfo) => [f.Name.toLowerCase(), f])
                );
                const writable = this.writableExtensionFieldNames(
                    { Fields: ext.EntityInfo?.Fields ?? [], ParentEntityFieldNames: ext.EntityInfo?.ParentEntityFieldNames },
                    configuredFields
                );
                if (resolvedPersonID) {
                    this.setExtensionPerson(ext, resolvedPersonID);
                }
                for (const [key, rawValue] of Object.entries(fieldValues)) {
                    const lowerKey = key.toLowerCase();
                    // The deny list stays as a second guard behind the writable set.
                    if (excludedClientFields.has(lowerKey) || lowerKey.startsWith('__mj_') || !writable.has(lowerKey)) {
                        continue;
                    }
                    const field = extFieldsByName.get(lowerKey);
                    if (field && !field.IsPrimaryKey && !field.IsVirtual && field.AllowUpdateAPI) {
                        // A blank answer to an optional field is left out, so the column keeps its
                        // database default (or stays null) instead of holding '' (#877).
                        const blank = rawValue == null || (typeof rawValue === 'string' && rawValue.trim() === '');
                        if (blank && (field.HasDefaultValue || field.AllowsNull)) {
                            continue;
                        }
                        let coerced = rawValue;
                        if (field.Type.toLowerCase().includes('int') && typeof rawValue === 'string') {
                            coerced = parseInt(rawValue, 10);
                        } else if ((field.Type.toLowerCase().includes('decimal') || field.Type.toLowerCase().includes('money')) && typeof rawValue === 'string') {
                            coerced = parseFloat(rawValue);
                        } else if (field.Type.toLowerCase() === 'bit' && typeof rawValue === 'string') {
                            coerced = rawValue === 'true' || rawValue === '1';
                        }
                        // An unparseable number is not an answer; writing NaN fails the save after payment.
                        if (typeof coerced === 'number' && Number.isNaN(coerced)) {
                            continue;
                        }
                        ext.Set(field.Name, coerced);
                    }
                }
            }
        return { PersonID: resolvedPersonID, Extension: ext };
    }

    /** Sets an extension row's attendee Person, when it has an updatable PersonID / AttendeePersonID column. */
    private static setExtensionPerson(ext: BaseEntity, personID: string): void {
        const fields = ext.EntityInfo?.Fields ?? [];
        const field = fields.find((f) => f.Name.toLowerCase() === 'personid') ?? fields.find((f) => f.Name.toLowerCase() === 'attendeepersonid');
        if (field && !field.IsPrimaryKey && !field.IsVirtual && field.AllowUpdateAPI) {
            ext.Set(field.Name, personID);
        }
    }

    /**
     * A per-unit product books one line per unit, so it needs one set of unit details per unit. A
     * widget that sends fewer or more sets than the quantity (a per-line widget sends one) would
     * otherwise book a different number of units than the buyer chose (#583).
     */
    private static unitDetailsMismatch(
        unitMode: 'perUnit' | 'perLine',
        quantity: number,
        unitPayloads: Array<Record<string, unknown>>
    ): string | null {
        if (unitMode !== 'perUnit' || unitPayloads.length === 0 || unitPayloads.length === quantity) {
            return null;
        }
        return `Enter details for each of the ${quantity} items (details were given for ${unitPayloads.length}).`;
    }

    /**
     * Extracts unit field maps from an input line across all polymorphic formats.
     */
    private static extractUnitPayloads(inputLine: CheckoutLineInput): Array<Record<string, unknown>> {
        if (inputLine.ExtensionData?.Units && inputLine.ExtensionData.Units.length > 0) {
            return inputLine.ExtensionData.Units;
        }
        if (inputLine.Units && inputLine.Units.length > 0) {
            return inputLine.Units;
        }
        if (inputLine.Attendees && inputLine.Attendees.length > 0) {
            return inputLine.Attendees.map(a => ({
                FirstName: a.FirstName,
                LastName: a.LastName,
                Email: a.Email,
                Company: a.Company,
                PersonID: a.PersonID,
                DietaryPreferences: a.DietaryPreferences,
                Comments: a.Comments
            }));
        }
        if (inputLine.ExtensionData?.Fields && Object.keys(inputLine.ExtensionData.Fields).length > 0) {
            return [inputLine.ExtensionData.Fields];
        }
        if (inputLine.ExtensionFields && Object.keys(inputLine.ExtensionFields).length > 0) {
            return [inputLine.ExtensionFields];
        }
        return [];
    }

    /**
     * Builds and prices draft order lines in memory, persisting the checkout state to the
     * CheckoutSession without creating premature draft rows in the OrderHeader database table.
     *
     * The billing location is required: tax is priced from it here, and completion records it as
     * the order's address. Nothing is saved for it until completion, so an abandoned draft leaves
     * no Address row behind.
     */
    public static async UpdateDraft(
        sessionID: string,
        clientSessionKey: string,
        email: string,
        lines: CheckoutLineInput[],
        billingAddress: CheckoutBillingAddressInput | null | undefined,
        contextUser?: UserInfo,
        options?: { Attribution?: unknown; Answers?: CheckoutAnswersInput; Choices?: CheckoutChoicesInput; MemberToken?: string; PromotionCodes?: unknown }
    ): Promise<UpdateDraftResult> {
        const failed = (message: string): UpdateDraftResult => ({
            Success: false,
            ErrorMessage: message,
            SessionID: sessionID ?? '',
            Subtotal: 0,
            Tax: 0,
            Adjustments: 0,
            TotalGross: 0,
            RequiresPayment: false,
            Lines: []
        });

        if (!sessionID) {
            return failed('Session ID is required.');
        }
        if (!Array.isArray(lines) || lines.length > MAX_LINES_PER_CHECKOUT) {
            return failed(`A checkout may carry at most ${MAX_LINES_PER_CHECKOUT} lines.`);
        }

        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const sessionLoaded = await session.Load(sessionID);
        if (!sessionLoaded || session.Status !== 'Open') {
            return failed('Checkout session is not valid or has expired.');
        }
        if (!this.verifyClientSessionKey(session, clientSessionKey)) {
            return failed('Checkout session key does not match.');
        }
        if (!(await this.enforceSessionExpiry(session))) {
            return failed('Checkout session has expired.');
        }
        // A session that pays an existing renewal order has nothing to draft: the order is already
        // priced and booked, and paying it must not re-price it (#289).
        if (session.DraftOrderID) {
            return failed('This checkout pays an existing renewal order and cannot be changed.');
        }

        const locationCheck = CheckBillingLocation(billingAddress);
        if (locationCheck.Valid === false) {
            return failed(locationCheck.Reason);
        }
        const location = locationCheck.Location;

        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        await widget.Load(session.CheckoutWidgetID);

        let widgetConfig: CheckoutWidgetConfiguration = {};
        if (widget.Configuration) {
            try {
                const parsed = JSON.parse(widget.Configuration);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    widgetConfig = parsed as CheckoutWidgetConfiguration;
                }
            } catch {
                return failed('Invalid widget configuration');
            }
        }

        // Answers are stored as they stand, so a buyer can price the checkout before answering;
        // a missing required answer is refused when the payment intent opens and at completion.
        // What is sent must still be a well-formed answer to a question this widget asks.
        const questions = ReadCheckoutQuestions(widgetConfig.questions);
        if (questions.Error) {
            return failed(questions.Error);
        }
        const draftAnswers = CheckAnswersAgainstQuestions(
            questions.Questions.map((q) => ({ ...q, required: false })),
            options?.Answers
        );
        if (draftAnswers.Error) {
            return failed(draftAnswers.Error);
        }

        // Choices likewise: a draft may hold fewer than a group's minimum, never more than its
        // maximum or an option it does not offer. The choice is the buyer's for the one item the
        // widget sells, so a widget with choice groups takes a single line.
        const choiceGroups = ReadCheckoutChoiceGroups(widgetConfig.choiceGroups);
        if (choiceGroups.Error) {
            return failed(choiceGroups.Error);
        }
        if (choiceGroups.Groups.length > 0 && Array.isArray(lines) && lines.length > 1) {
            return failed('This checkout sells one item at a time.');
        }
        const draftChoices = CheckChoicesAgainstGroups(choiceGroups.Groups, options?.Choices, { partial: true });
        if (draftChoices.Error) {
            return failed(draftChoices.Error);
        }

        // Promotion codes are an anonymous input, so they are taken only when the widget's own
        // configuration invites them, and only in the bounded shape NormalizeCheckoutPromotionCodes allows.
        const normalizedCodes = NormalizeCheckoutPromotionCodes(options?.PromotionCodes);
        if ('Error' in normalizedCodes) {
            return failed(normalizedCodes.Error);
        }
        const promotionCodes = normalizedCodes.Codes;
        if (promotionCodes.length > 0 && widgetConfig.allowCoupons !== true) {
            return failed('This checkout does not take promotion codes.');
        }
        // A member promotion's code is earned through a verified token, never typed (#358).
        for (const code of promotionCodes) {
            const isMemberCode = await IsRegisteredMemberPromotionCode(
                { Code: code, CheckoutWidgetID: widget.ID, CompanyID: widget.CompanyID, SessionID: session.ID },
                md as unknown as IMetadataProvider,
                contextUser
            );
            if (isMemberCode) {
                return failed(`The code ${code} cannot be entered at this checkout.`);
            }
        }

        const allowedProductIds = await this.resolveAllowedProductIds(widgetConfig, contextUser);
        const allowAnyProduct = widgetConfig.allowAnyProduct === true;
        if (!allowAnyProduct && allowedProductIds.size === 0) {
            return failed('This checkout is not configured with a product');
        }
        // Open catalog is company-scoped. A widget with no CompanyID must not accept an
        // arbitrary ProductID from an anonymous caller (the remaining company check used
        // to skip when CompanyID was unset).
        if (allowAnyProduct && !widget.CompanyID) {
            return failed('This checkout is not configured for open-catalog sale');
        }

        // Build in-memory Order graph for accurate pricing calculation without DB pollution
        const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        order.NewRecord();
        order.CompanyID = widget.CompanyID;
        order.Status = 'Draft';
        SetSystemOrderOrigin(order, 'Widget');
        order.SourceCheckoutWidgetID = widget.ID;
        // Defence-in-depth: the server pre-warms this engine at startup (@RegisterForStartup),
        // but that pre-warm only reaches modules already evaluated when Startup() runs, which
        // this checkout cannot prove. Config() is a no-op once loaded.
        await BusinessTimeZoneEngine.Instance.Config(false, contextUser ?? md.CurrentUser, Metadata.Provider);
        order.OrderDate = TodayAsDateValue();

        const normalizedEmail = (email || '').trim().toLowerCase();
        const previousEmail = (session.Email || '').trim().toLowerCase();
        // The resolved payer belongs to the e-mail it was resolved from. A changed e-mail drops it
        // so the resolve below runs again for the new address — or, when the new address matches
        // no Person, CompleteCheckout resolves or creates the payer (#393).
        if (previousEmail && previousEmail !== normalizedEmail) {
            session.PersonID = null;
        }
        session.Email = normalizedEmail;

        // Resolve (never create) the payer Person by email so person-specific pricing applies
        // to the draft. Creation is deferred to completion — abandoned drafts must not mint
        // Person rows.
        if (!session.PersonID && normalizedEmail) {
            const resolvedPersonID = await this.resolveOrEnsurePerson({ Email: normalizedEmail }, contextUser, false);
            if (resolvedPersonID) {
                session.PersonID = resolvedPersonID;
            }
        }

        if (session.PersonID) {
            order.BillToPersonID = session.PersonID;
            order.ShipToPersonID = session.PersonID;
        }

        let sequence = 1;
        for (const inputLine of lines) {
            // Validate quantity: must be positive integer >= 1
            if (!Number.isInteger(inputLine.Quantity) || inputLine.Quantity < 1) {
                return failed(`Invalid quantity: quantity must be a positive integer (received ${inputLine.Quantity})`);
            }

            let targetExtensionEntity: string | null = null;
            let maxQuantityPerLine: number | null = null;
            let unitMode: 'perUnit' | 'perLine' = 'perLine';

            if (!inputLine.ProductID) {
                return failed('ProductID is required on every checkout line');
            }
            if (!allowAnyProduct && ![...allowedProductIds].some((id) => this.idsEqual(id, inputLine.ProductID))) {
                return failed('This checkout does not sell that product');
            }
            try {
                const product = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, contextUser);
                const prodLoaded = await product.Load(inputLine.ProductID);
                if (!prodLoaded) {
                    return failed('The requested product is not available');
                }
                if (!this.idsEqual(widget.CompanyID, String(product.CompanyID ?? ''))) {
                    return failed('This checkout does not sell that product');
                }
                maxQuantityPerLine = product.MaxQuantityPerLine ?? null;
                if (product.ProductTypeID) {
                    const pType = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, contextUser);
                    const pTypeLoaded = await pType.Load(product.ProductTypeID);
                    if (pTypeLoaded) {
                        targetExtensionEntity = pType.OrderLineExtensionEntity ?? null;
                        if (pType.Configuration) {
                            try {
                                const pTypeConfig = JSON.parse(pType.Configuration) as ProductTypeConfiguration;
                                if (pTypeConfig.unitMode) {
                                    unitMode = pTypeConfig.unitMode;
                                }
                                if (pTypeConfig.maxQuantity && !maxQuantityPerLine) {
                                    maxQuantityPerLine = pTypeConfig.maxQuantity;
                                }
                            } catch {
                                // Ignore malformed JSON in Configuration
                            }
                        }
                    }
                }
            } catch (err) {
                LogError(`[CheckoutSessionService] Product load failed for ${inputLine.ProductID}: ${err instanceof Error ? err.message : String(err)}`);
                return failed('The requested product is not available');
            }

            const effectiveMax = maxQuantityPerLine ?? DEFAULT_MAX_QUANTITY_PER_LINE;
            if (inputLine.Quantity > effectiveMax) {
                return failed(`Quantity ${inputLine.Quantity} exceeds maximum allowed quantity of ${effectiveMax} for this item`);
            }

            const unitPayloads = this.extractUnitPayloads(inputLine);
            if (unitPayloads.length > effectiveMax) {
                return failed(`Unit payload count ${unitPayloads.length} exceeds maximum allowed quantity of ${effectiveMax} for this item`);
            }
            const unitMismatch = this.unitDetailsMismatch(unitMode, inputLine.Quantity, unitPayloads);
            if (unitMismatch) {
                return failed(unitMismatch);
            }

            if ((unitMode === 'perUnit' || unitPayloads.length > 1) && unitPayloads.length > 0) {
                for (const unitData of unitPayloads) {
                    const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                    line.ProductID = inputLine.ProductID;
                    line.Quantity = 1;
                    line.LineNumber = sequence++;

                    await this.hydrateLineExtension(line, targetExtensionEntity, unitData, contextUser, false, widgetConfig.extensionFields);
                }
            } else {
                const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                line.ProductID = inputLine.ProductID;
                line.Quantity = inputLine.Quantity;
                line.LineNumber = sequence++;

                if (unitPayloads.length > 0) {
                    await this.hydrateLineExtension(line, targetExtensionEntity, unitPayloads[0], contextUser, false, widgetConfig.extensionFields);
                }
            }
        }

        // A choice is recorded on the order line itself. A line of an extension type (an event
        // line) has no collection for it, so refuse here, before the buyer pays, rather than at
        // completion.
        if (choiceGroups.Groups.length > 0 && order.Lines.Items.some((l) => !CheckoutSessionService.canRecordChoices(l))) {
            return failed('This checkout is not configured correctly (its choices cannot be recorded on this item).');
        }

        const refused = await RunPrePurchaseChecks({
            Email: normalizedEmail,
            PersonID: session.PersonID ?? null,
            CompanyID: widget.CompanyID,
            Lines: lines.map((l) => ({ ProductID: l.ProductID, Quantity: l.Quantity })),
            ProviderBilledSubscriptionMessage: CheckoutSessionService.providerBilledSubscriptionMessage(widgetConfig),
            ContextUser: contextUser,
        });
        if (refused) {
            return { ...failed(refused.Message), Refusal: refused.Refusal };
        }

        const memberDiscount = await this.resolveMemberDiscount(
            options?.MemberToken, widgetConfig, widget, session, normalizedEmail, md, contextUser
        );
        if (memberDiscount.Refusal) {
            return failed(memberDiscount.Refusal);
        }

        // Price the draft order in memory
        let unusableCodes: Array<{ Code: string; Reason: string }> = [];
        try {
            const pricingService = new OrderPricingService({
                Provider: (order.ProviderToUse ?? md) as unknown as IMetadataProvider,
                User: contextUser ?? (order.ContextCurrentUser as UserInfo),
            });

            // Nothing is saved yet, so the location is priced inline; completion prices the same
            // location from the Address row it records.
            const priceWith = async (codes: string[]) => pricingService.Price({
                OrderHeaderID: order.ID || null,
                CompanyID: widget.CompanyID,
                BillToPersonID: order.BillToPersonID ?? null,
                BillToOrganizationID: order.BillToOrganizationID ?? null,
                // Set to the business day a few lines above; the fallback stays a day rather than
                // an instant so the price rules this prices against (EffectiveFrom/To are `date`
                // columns) are never judged against tomorrow (#209).
                //
                // The ORDER's provider and user, matching the pricing service built two lines up:
                // a widget checkout may run against a provider that is not the global one, and a
                // warm-up read through `Metadata.Provider` would then be configured from a
                // different instance than the order it is dating.
                OrderDate: await CalendarDayOrToday(
                    order.OrderDate,
                    (order.ProviderToUse ?? md) as unknown as IMetadataProvider,
                    contextUser ?? (order.ContextCurrentUser as UserInfo),
                ),
                ShipToAddressID: null,
                ShipToAddress: this.toTaxAddress(location),
                Lines: [...order.Lines.Items],
                PromotionCodes: codes,
                ManualDiscounts: [],
                Charges: [],
            });

            // A member code and a typed code do not stack unless the resolver says 'Stack' (#358): the
            // resolver's precedence picks which is priced, and the other is priced only when the engine
            // declines the first.
            const attempts = PlanCheckoutPromotionCodes(promotionCodes, memberDiscount.PromotionCode, memberDiscount.TypedCode);
            // Every code the engine declined on any attempt, with its reason.
            const declinedCodes = new Map<string, { Code: string; Reason: string }>();
            let chosen = attempts[0];
            for (let i = 0; i < attempts.length; i++) {
                if (i > 0) {
                    // The pricing walk keeps a discount a line already carries, so clear the previous
                    // attempt's before re-pricing. Draft lines carry no other discount.
                    for (const l of order.Lines.Items as OrderLineEntity[]) l.DiscountAmount = 0;
                }
                chosen = attempts[i];
                const codes = CombineCheckoutPromotionCodes(chosen.Buyer, chosen.Member);
                const priced = await priceWith(codes);
                const declinedNow = new Set((priced?.UnusableCodes ?? []).map((u) => u.Code.toLowerCase()));
                for (const u of priced?.UnusableCodes ?? []) declinedCodes.set(u.Code.toLowerCase(), u);
                if (codes.some((c) => !declinedNow.has(c.toLowerCase()))) break;
            }

            // Only the buyer's own codes are reported as unusable; a declined or set-aside member code
            // is explained through MemberDiscountMessage below.
            const pricedBuyerKeys = new Set(chosen.Buyer.map((c) => c.toLowerCase()));
            unusableCodes = promotionCodes.flatMap((c) => {
                const declined = declinedCodes.get(c.toLowerCase());
                if (declined) return [declined];
                return pricedBuyerKeys.has(c.toLowerCase()) ? [] : [{ Code: c, Reason: TYPED_CODE_REPLACED_BY_MEMBER }];
            });

            // The engine may still decline the code (dates, limits, qualifier). Price at full rate
            // and say why, rather than snapshotting a code `/complete` would also decline.
            const memberCode = memberDiscount.PromotionCode;
            const declined = memberCode ? declinedCodes.get(memberCode.toLowerCase()) : undefined;
            if (declined) {
                memberDiscount.PromotionCode = null;
                memberDiscount.Message = `Your member discount does not apply to this order: ${declined.Reason}.`;
            } else if (memberCode && !chosen.Member) {
                memberDiscount.PromotionCode = null;
                memberDiscount.Message = MEMBER_CODE_YIELDED_TO_TYPED;
            }

            await this.settleLineTotals(order);
            order.TotalGross = this.sumLineTotals(order.Lines.Items);
        } catch (pricingErr) {
            console.warn('[CheckoutSessionService] Pricing walk error on draft:', pricingErr);
            // A pricing failure with a code in play must not quote the undiscounted price as if the
            // code had been considered.
            if (promotionCodes.length > 0) {
                return failed('This promotion code could not be applied right now. Please try again.');
            }
        }
        const unusableKeys = new Set(unusableCodes.map((u) => u.Code.toLowerCase()));
        const appliedCodes = promotionCodes.filter((c) => !unusableKeys.has(c.toLowerCase()));
        const discount =
            Math.round((order.Lines.Items as OrderLineEntity[]).reduce((sum, l) => sum + Number(l.DiscountAmount ?? 0), 0) * 100) / 100;

        // Build line summaries from the in-memory priced order graph
        const lineSummaries: CheckoutLineSummary[] = (order.Lines.Items as OrderLineEntity[]).map(l => ({
            ID: l.ID || `line-${l.LineNumber}`,
            ProductID: l.ProductID,
            Quantity: l.Quantity,
            UnitPrice: l.UnitPrice ?? 0,
            ExtendedPrice: l.LineTotalGross ?? ((l.UnitPrice ?? 0) * (l.Quantity ?? 1)),
            Description: l.Description ?? undefined
        }));

        // A previously opened payment intent was priced against the OLD snapshot. If the total
        // changed, detach it so the completion gate can't accept a stale (higher OR lower)
        // authorized amount — the caller must reopen the intent against the new total.
        let previousTotal: number | undefined;
        if (session.MetadataJSON) {
            try {
                previousTotal = (JSON.parse(session.MetadataJSON) as { TotalGross?: number }).TotalGross;
            } catch {
                previousTotal = undefined;
            }
        }
        if (session.PaymentIntentID && previousTotal !== order.TotalGross) {
            session.PaymentIntentID = null;
        }

        // Where the checkout came from, as the embedding host states it. Kept from an earlier draft
        // when this one names none; dropped, never refused, when it cannot be read.
        let attribution = NormalizeCheckoutAttribution(options?.Attribution);
        if (!attribution && session.MetadataJSON) {
            try {
                // Written by an earlier draft of this session, so already normalised.
                const stored = (JSON.parse(session.MetadataJSON) as { Attribution?: { Source?: unknown; Reference?: unknown } }).Attribution;
                attribution = typeof stored?.Source === 'string'
                    ? { Source: stored.Source, Reference: typeof stored.Reference === 'string' ? stored.Reference : null }
                    : null;
            } catch {
                attribution = null;
            }
        }

        // Store checkout state in session metadata JSON — no orphan OrderHeader rows
        // The applied code rides the snapshot so completion prices — and books — the same order the
        // buyer was shown and the payment intent was opened for. An unusable code is not kept.
        const snapshot: CheckoutSnapshot = {
            Lines: lines,
            PricedLines: lineSummaries,
            TotalGross: order.TotalGross,
            BillingAddress: location,
            Answers: this.answersForStorage(draftAnswers.Answers),
            ...(attribution ? { Attribution: attribution } : {}),
            Choices: ChoicesForStorage(draftChoices.Choices),
            MemberPromotionCode: memberDiscount.PromotionCode,
            PromotionCodes: appliedCodes,
            UpdatedAt: new Date().toISOString()
        };
        session.MetadataJSON = JSON.stringify(snapshot);
        const sessionSaved = await session.Save();
        if (!sessionSaved) {
            return failed(`Failed to persist checkout state: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        const tax = this.sumLineTax(order.Lines.Items);
        return {
            Success: true,
            SessionID: sessionID,
            OrderID: session.DraftOrderID || '',
            OrderNumber: '',
            Subtotal: Math.round(((order.TotalGross ?? 0) - tax + discount) * 100) / 100,
            Tax: tax,
            Adjustments: -discount,
            TotalGross: order.TotalGross ?? 0,
            RequiresPayment: (order.TotalGross ?? 0) > 0,
            Lines: lineSummaries,
            AppliedPromotionCodes: appliedCodes,
            UnusablePromotionCodes: unusableCodes,
            Discount: discount,
            ...(options?.MemberToken ? { MemberDiscountApplied: !!memberDiscount.PromotionCode } : {}),
            ...(memberDiscount.Message ? { MemberDiscountMessage: memberDiscount.Message } : {})
        };
    }

    /**
     * Opens (or idempotently re-opens) a payment intent for a session's CURRENT server-priced
     * total. This is the only way a checkout session acquires a `PaymentIntentID`.
     *
     * Everything money-shaped is resolved server-side, per the checkout pricing-input rule:
     * the amount comes from the session's own priced snapshot (never the client), and the
     * payment provider comes from the widget's admin-authored Configuration
     * (`paymentProviderId`) — the client supplies only its session id + key. The gateway
     * client secret is returned for Stripe.js confirmation and never persisted.
     */
    public static async OpenPaymentIntentForSession(
        sessionID: string,
        clientSessionKey: string,
        contextUser?: UserInfo,
        options?: { AutoRenewConsent?: boolean }
    ): Promise<OpenSessionPaymentIntentResult> {
        const failed = (message: string): OpenSessionPaymentIntentResult => ({
            Success: false,
            ErrorMessage: message,
            SessionID: sessionID ?? ''
        });

        if (!sessionID) {
            return failed('Session ID is required.');
        }
        if (!contextUser) {
            return failed('A context user is required to open a payment intent.');
        }

        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const loaded = await session.Load(sessionID);
        if (!loaded || session.Status !== 'Open') {
            return failed('Checkout session is not valid or has expired.');
        }
        if (!this.verifyClientSessionKey(session, clientSessionKey)) {
            return failed('Checkout session key does not match.');
        }
        if (!(await this.enforceSessionExpiry(session))) {
            return failed('Checkout session has expired.');
        }
        if (session.DraftOrderID) {
            return this.openRenewalPaymentIntent(session, contextUser);
        }

        // The amount is the session's own server-priced snapshot — never a caller input.
        let snapshotTotal = 0;
        if (session.MetadataJSON) {
            try {
                const parsed = JSON.parse(session.MetadataJSON) as { TotalGross?: number };
                snapshotTotal = typeof parsed.TotalGross === 'number' ? parsed.TotalGross : 0;
            } catch {
                snapshotTotal = 0;
            }
        }
        if (!(snapshotTotal > 0)) {
            return failed('This checkout has no balance due — complete it directly without a payment intent.');
        }
        if (!this.snapshotBillingLocation(session)) {
            return failed(MISSING_LOCATION_MESSAGE);
        }

        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        const widgetLoaded = await widget.Load(session.CheckoutWidgetID);
        if (!widgetLoaded) {
            return failed('The checkout widget for this session could not be loaded.');
        }

        const answersCheck = this.checkSessionAnswers(widget, session);
        if (answersCheck.Error) {
            return failed(answersCheck.Error);
        }
        const choicesCheck = this.checkSessionChoices(widget, session);
        if (choicesCheck.Error) {
            return failed(choicesCheck.Error);
        }

        // Again here, not only at the draft: this is the last step before money moves, and a
        // host's own records can change between the two calls.
        const widgetConfig = this.readWidgetConfiguration(widget);
        const refused = await this.recheckDraftedPurchase(session, widget.CompanyID, widgetConfig, contextUser);
        if (refused) {
            return { ...failed(refused.Message), Refusal: refused.Refusal };
        }

        // An event that requires attendee information needs one attendee per ticket. Refused here,
        // before the intent opens: completion takes the money before it confirms, so the order's
        // own refusal at confirm would leave a paid checkout with no order.
        const missingAttendees = await this.checkDraftedAttendees(session, contextUser);
        if (missingAttendees) {
            return failed(missingAttendees);
        }

        // Malformed configuration already fails InitializeSession; it reads as unset here.
        const paymentProviderId = typeof widgetConfig.paymentProviderId === 'string' ? widgetConfig.paymentProviderId : undefined;
        const currencyCode = typeof widgetConfig.currency === 'string' ? widgetConfig.currency : undefined;
        const autoRenewConsentText =
            typeof widgetConfig.autoRenewConsentText === 'string' && widgetConfig.autoRenewConsentText.trim()
                ? widgetConfig.autoRenewConsentText.trim()
                : undefined;
        const sendReceipt = widgetConfig.sendReceipt === true;
        if (!paymentProviderId) {
            return failed(`Checkout widget '${widget.Name}' has no paymentProviderId configured — a paid checkout requires one.`);
        }

        // The automatic-renewal agreement. The buyer's tick is the only client input; the wording
        // recorded is the widget's own server-side text, so what the session says was agreed to is
        // what the widget displayed, not something a caller supplied.
        if (autoRenewConsentText) {
            if (options?.AutoRenewConsent !== true) {
                return failed('Please agree to the automatic renewal terms to continue.');
            }
            session.AutoRenewConsentText = autoRenewConsentText;
            session.AutoRenewConsentAt = new Date();
        }

        const mdProvider = Metadata.Provider;
        if (!mdProvider) {
            return failed('No metadata provider is available to open a payment intent.');
        }

        // Products only: the order, and so its number, does not exist until completion.
        const description = await DescribeCheckoutSnapshot(session.MetadataJSON, mdProvider, contextUser);

        // A subscription that renews on its own needs the card kept at THIS payment — see
        // CheckoutSavedInstrument. Fail-soft: a card that cannot be kept must not block the sale.
        const saveForRenewal = await this.resolveCustomerForRenewal(session, paymentProviderId, mdProvider, contextUser);

        // The gateway's own receipt, when the widget asks for one, goes to the e-mail the buyer
        // entered. It is part of the request, and a gateway refuses a repeated idempotency key sent
        // with different parameters, so a changed e-mail must not reuse the key: a short hash of the
        // address goes into it.
        const receiptEmail = sendReceipt && session.Email ? session.Email.trim().toLowerCase() : null;
        const receiptKey = receiptEmail ? `-r${await this.keyDigest(receiptEmail)}` : '';
        // Likewise the customer the card is kept for: a changed e-mail can mean a different customer.
        const keepKey = saveForRenewal ? `-k${await this.keyDigest(saveForRenewal)}` : '';

        const openResult = await OpenPaymentIntent({
            PaymentProviderID: paymentProviderId,
            Amount: snapshotTotal,
            // Unset means USD; anything else is refused by OpenPaymentIntent until orders record a currency.
            CurrencyCode: currencyCode ?? SUPPORTED_PAYMENT_CURRENCY,
            BillToPersonID: session.PersonID ?? undefined,
            ProviderCustomerRef: saveForRenewal ?? undefined,
            SaveInstrumentForReuse: !!saveForRenewal,
            // Stable per-session idempotency key: reopening for the same session+amount
            // returns the SAME gateway intent instead of minting a fresh one per retry. A
            // card-keeping intent, and a receipt to a given e-mail, each get their own key, because the
            // gateway refuses a repeated key whose request parameters differ.
            IdempotencyKey: `checkout-${sessionID}-${Math.round(snapshotTotal * 100)}${keepKey}${receiptKey}`,
            Metadata: { CheckoutSessionID: sessionID },
            Description: description,
            ReceiptEmail: receiptEmail
        }, mdProvider, contextUser);

        if (!openResult.Success || !openResult.PaymentIntentID) {
            return failed(openResult.Reason ?? 'The payment provider refused to open an intent.');
        }

        session.PaymentIntentID = openResult.PaymentIntentID;
        const saved = await session.Save();
        if (!saved) {
            return failed(`Failed to attach the payment intent to the session: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        return {
            Success: true,
            SessionID: sessionID,
            PaymentIntentID: openResult.PaymentIntentID,
            ClientSecret: openResult.ClientSecret,
            Status: openResult.Status,
            Amount: snapshotTotal
        };
    }

    /** The lines the session's draft stored, as the buyer sent them; empty when there are none. */
    private static readDraftedLines(session: mjBizAppsOrdersCheckoutSessionEntity): CheckoutLineInput[] {
        try {
            const parsed = JSON.parse(session.MetadataJSON ?? '{}') as { Lines?: CheckoutLineInput[] };
            return Array.isArray(parsed.Lines) ? parsed.Lines : [];
        } catch {
            return [];
        }
    }

    /**
     * The buyer-facing refusal when an event ticket in the session's draft has no attendee; null when
     * every ticket has one. Counts the per-unit payloads completion turns into attendee rows, so what
     * passes here is what completion can write.
     */
    private static async checkDraftedAttendees(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        contextUser: UserInfo,
    ): Promise<string | null> {
        const lines = this.readDraftedLines(session);
        if (lines.length === 0) return null;
        // An id that is not a UUID names no product, so it names no event either.
        const requiring = await LoadProductsRequiringAttendees(
            lines.map((l) => l.ProductID).filter(IsUUID),
            Metadata.Provider as unknown as IRunViewProvider,
            contextUser,
        );
        if (requiring.size === 0) return null;
        return ExplainMissingCheckoutAttendees(
            lines.map((line) => ({
                ProductID: line.ProductID,
                Quantity: line.Quantity,
                AttendeeEmails: this.extractUnitPayloads(line).map((unit) => this.attendeeEmail(unit)),
            })),
            requiring,
        );
    }

    /** The e-mail an attendee payload carries, under any of the names completion reads it from. */
    private static attendeeEmail(fields: Record<string, unknown>): string | null {
        const email = fields['Email'] || fields['email'] || fields['AttendeeEmail'] || fields['attendeeEmail'];
        return typeof email === 'string' ? email : null;
    }

    /**
     * The intent for a pay-renewal session (#289): the open balance of the renewal order, on the
     * widget's provider, keeping the card the buyer enters. The new card joins the gateway customer
     * the old renewal card belongs to when it is the same provider, else the buyer's own; no new
     * order, no re-pricing.
     */
    private static async openRenewalPaymentIntent(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        contextUser: UserInfo
    ): Promise<OpenSessionPaymentIntentResult> {
        const failed = (message: string): OpenSessionPaymentIntentResult => ({ Success: false, ErrorMessage: message, SessionID: session.ID });
        const mdProvider = Metadata.Provider as IMetadataProvider | undefined;
        if (!mdProvider) {
            return failed('No metadata provider is available to open a payment intent.');
        }
        const order = await this.renewalOrderFor(session, contextUser);
        const refusal = RenewalPaymentRefusal(
            order,
            order?.SubscriptionIDs[0] ?? '',
            order ? await RenewalPaymentAlreadyConfirmed(order.OrderID, mdProvider, contextUser) : false
        );
        if (refusal || !order) {
            return failed(refusal ?? 'This renewal could not be found.');
        }

        const md = new Metadata();
        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        if (!(await widget.Load(session.CheckoutWidgetID))) {
            return failed('The checkout widget for this session could not be loaded.');
        }
        let paymentProviderId: string | undefined;
        let currencyCode: string | undefined;
        try {
            const configObj = JSON.parse(widget.Configuration ?? '{}') as CheckoutWidgetConfiguration;
            paymentProviderId = typeof configObj.paymentProviderId === 'string' ? configObj.paymentProviderId : undefined;
            currencyCode = typeof configObj.currency === 'string' ? configObj.currency : undefined;
        } catch {
            paymentProviderId = undefined;
        }
        if (!paymentProviderId) {
            return failed(`Checkout widget '${widget.Name}' has no paymentProviderId configured — a paid checkout requires one.`);
        }

        const amount = Math.round(order.Balance * 100) / 100;
        const customer = await this.renewalPaymentCustomer(session, order, paymentProviderId, mdProvider, contextUser);
        const keepKey = customer ? `-k${await this.keyDigest(customer)}` : '';
        const openResult = await OpenPaymentIntent({
            PaymentProviderID: paymentProviderId,
            Amount: amount,
            CurrencyCode: currencyCode ?? SUPPORTED_PAYMENT_CURRENCY,
            OrderHeaderID: order.OrderID,
            BillToPersonID: order.PayerPersonID ?? undefined,
            BillToOrganizationID: order.PayerOrganizationID ?? undefined,
            ProviderCustomerRef: customer ?? undefined,
            SaveInstrumentForReuse: !!customer,
            IdempotencyKey: `renewal-pay-${session.ID}-${Math.round(amount * 100)}${keepKey}`,
            Metadata: { CheckoutSessionID: session.ID, Purpose: 'RenewalPayment' },
        }, mdProvider, contextUser);
        if (!openResult.Success || !openResult.PaymentIntentID) {
            return failed(openResult.Reason ?? 'The payment provider refused to open an intent.');
        }

        session.PaymentIntentID = openResult.PaymentIntentID;
        if (!(await session.Save())) {
            return failed(`Failed to attach the payment intent to the session: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return {
            Success: true,
            SessionID: session.ID,
            PaymentIntentID: openResult.PaymentIntentID,
            ClientSecret: openResult.ClientSecret,
            Status: openResult.Status,
            Amount: amount,
        };
    }

    /**
     * The gateway customer the new renewal card is kept under: the old renewal card's, when it is on
     * the same provider and belongs to the payer; otherwise the payer's existing customer, or a new
     * one, so a card never joins someone else's customer (#683). Null when none can be had — logged,
     * and the renewal is still paid, only without keeping the card.
     */
    private static async renewalPaymentCustomer(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        order: RenewalPaymentOrder,
        paymentProviderId: string,
        mdProvider: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<string | null> {
        if (
            order.RenewalCardProviderCustomerRef &&
            this.idsEqual(order.RenewalCardPaymentProviderID, paymentProviderId) &&
            PayerOwnsRenewalCustomer(order)
        ) {
            return order.RenewalCardProviderCustomerRef;
        }
        try {
            const driver = await ResolvePaymentProvider(paymentProviderId, mdProvider, contextUser);
            const owner = order.PayerPersonID ?? order.PayerOrganizationID;
            if (!owner) return null;
            const customer = await driver.EnsureCustomer({
                ExistingProviderCustomerRef: order.PayerPersonID
                    ? await FindReusableProviderCustomerRef(order.PayerPersonID, paymentProviderId, contextUser)
                    : null,
                Email: session.Email?.trim().toLowerCase() || null,
                BillToPersonID: order.PayerPersonID,
                BillToOrganizationID: order.PayerOrganizationID,
                IdempotencyKey: `customer-${owner}-${paymentProviderId}`,
            });
            return customer.Success && customer.ProviderCustomerRef ? customer.ProviderCustomerRef : null;
        } catch (err) {
            LogError(
                `[CheckoutSessionService] Session ${session.ID}: no gateway customer for the new renewal card: ` +
                    `${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    /** Re-runs the pre-purchase checks against the lines the session's draft stored. */
    private static async recheckDraftedPurchase(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        companyID: string,
        widgetConfig: CheckoutWidgetConfiguration,
        contextUser: UserInfo,
    ): Promise<PrePurchaseRefusal | null> {
        const lines = this.readDraftedLines(session);
        return RunPrePurchaseChecks({
            Email: session.Email ?? '',
            PersonID: session.PersonID ?? null,
            CompanyID: companyID,
            Lines: lines.map((l) => ({ ProductID: l.ProductID, Quantity: l.Quantity })),
            ProviderBilledSubscriptionMessage: this.providerBilledSubscriptionMessage(widgetConfig),
            ContextUser: contextUser,
        });
    }

    /** The widget's configuration as an object; empty when it is unset or malformed. */
    private static readWidgetConfiguration(widget: mjBizAppsOrdersCheckoutWidgetEntity): CheckoutWidgetConfiguration {
        try {
            const parsed: unknown = widget.Configuration ? JSON.parse(widget.Configuration) : {};
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as CheckoutWidgetConfiguration) : {};
        } catch {
            return {};
        }
    }

    /** The widget's wording for a buyer who already holds a gateway-billed subscription, or null for the default. */
    private static providerBilledSubscriptionMessage(config: CheckoutWidgetConfiguration | null | undefined): string | null {
        const text = config?.providerBilledSubscriptionMessage;
        return typeof text === 'string' && text.trim() ? text.trim() : null;
    }

    /**
     * The gateway customer a renewal card will belong to, when this checkout sells a subscription:
     * the one the buyer already has with this provider, or a new one. A buyer with no person record
     * yet — completion creates it — gets a customer opened for this checkout, keyed on the session and
     * the e-mail; the card is filed under the person once the order is booked. Null when nothing
     * renews or the customer cannot be had — logged, and the sale goes ahead without keeping the card.
     */
    private static async resolveCustomerForRenewal(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        paymentProviderId: string,
        mdProvider: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<string | null> {
        const email = session.Email?.trim().toLowerCase() || null;
        if (!session.PersonID && !email) {
            return null;
        }
        try {
            if (!(await SnapshotSellsSubscription(session.MetadataJSON, contextUser))) {
                return null;
            }
            const driver = await ResolvePaymentProvider(paymentProviderId, mdProvider, contextUser);
            const customer = session.PersonID
                ? await driver.EnsureCustomer({
                      ExistingProviderCustomerRef: await FindReusableProviderCustomerRef(session.PersonID, paymentProviderId, contextUser),
                      Email: email,
                      BillToPersonID: session.PersonID,
                      IdempotencyKey: `customer-${session.PersonID}-${paymentProviderId}`,
                  })
                : await driver.EnsureCustomer({
                      ExistingProviderCustomerRef: null,
                      Email: email,
                      CheckoutSessionID: session.ID,
                      IdempotencyKey: `customer-checkout-${session.ID}-${paymentProviderId}-${await this.keyDigest(email!)}`,
                  });
            if (!customer.Success || !customer.ProviderCustomerRef) {
                LogError(
                    `[CheckoutSessionService] Session ${session.ID}: no gateway customer for the renewal card ` +
                        `(${customer.Reason ?? 'no reason given'}); the subscription will not auto-charge.`
                );
                return null;
            }
            return customer.ProviderCustomerRef;
        } catch (err) {
            LogError(
                `[CheckoutSessionService] Session ${session.ID}: could not prepare a renewal card: ` +
                    `${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    /**
     * Twelve hex characters of a SHA-256, for idempotency keys that must change with a value — an
     * e-mail, a gateway customer — without carrying it.
     */
    private static async keyDigest(value: string): Promise<string> {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
        return Array.from(digest.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Completes an existing CheckoutSession, constructing the final Order,
     * executing lifecycle confirmation (with accounting GL bookings and deferred revenue),
     * and generating a claim token if unauthenticated.
     *
     * `evidence` is what the edge observed about where the buyer is. Its IP country is recorded on
     * the order as VAT location evidence when it is a country code, and null otherwise; it never
     * refuses a sale (#480).
     */
    public static async CompleteCheckout(
        sessionID: string,
        clientSessionKey: string,
        contextUser?: UserInfo,
        evidence?: CheckoutLocationEvidence
    ): Promise<CompleteCheckoutResult> {
        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const loaded = await session.Load(sessionID);
        if (!loaded) {
            return {
                Success: false,
                ErrorMessage: 'Checkout session not found',
                SessionID: sessionID,
                Status: 'Unknown'
            };
        }
        if (!this.verifyClientSessionKey(session, clientSessionKey)) {
            return {
                Success: false,
                ErrorMessage: 'Checkout session key does not match',
                SessionID: sessionID,
                Status: session.Status
            };
        }

        // The payment webhook may be completing this session right now (#724): answer with its order.
        await this.awaitProcessingFinished(session);

        // Replay safety: a session that already completed returns its existing order rather
        // than an error — a network retry after a successful booking must never double-book
        // and must never strand the buyer without their order id.
        if (session.Status === 'Confirmed' && session.DraftOrderID) {
            return this.replayConfirmedSession(session, md, contextUser, { Source: 'Checkout', Report: {} });
        }

        if (session.Status !== 'Open') {
            return {
                Success: false,
                ErrorMessage: 'Session is not in an Open status',
                SessionID: sessionID,
                Status: session.Status
            };
        }
        if (!(await this.enforceSessionExpiry(session))) {
            return {
                Success: false,
                ErrorMessage: 'Checkout session has expired',
                SessionID: sessionID,
                Status: 'Expired'
            };
        }
        return this.completeOpenSession(session, md, contextUser, { Source: 'Checkout', Evidence: evidence, Report: {} });
    }

    /**
     * Completes a session paid for at the gateway whose browser never asked (#724): the buyer closed
     * the tab, or lost the page, after the payment succeeded. Reached from the payment webhook, so there
     * is no client session key: the signature-verified event is the proof, and the completion checks
     * the intent's state and amount against the re-priced order exactly as the browser's call does.
     *
     * The session expiry is not enforced: the buyer paid inside it, and expiry stops a session from
     * being driven further, not a paid one from being booked.
     *
     * Any refusal raises the "settled with no order" alert, since nobody is on the page to see it.
     */
    private static async completeFromWebhook(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        md: Metadata,
        contextUser: UserInfo
    ): Promise<BookCheckoutPaymentResult> {
        const trigger: CompletionTrigger = { Source: 'Webhook', Report: {} };
        const result = await this.completeOpenSession(session, md, contextUser, trigger);
        if (result.Success) {
            return trigger.Report.Capture ?? { Attempted: true, Booked: true };
        }
        const reason = result.ErrorMessage ?? 'the checkout could not be completed';
        if (trigger.Report.Retryable) {
            return { Attempted: true, Booked: false, Retryable: true, ErrorMessage: reason };
        }
        if (!trigger.Report.Alerted) {
            void raiseCheckoutSettledNotBookedAlert(session.ID, session.PaymentIntentID, reason, contextUser);
        }
        return { Attempted: true, Booked: false, Retryable: false, ErrorMessage: reason };
    }

    /**
     * The existing order of a Confirmed session, booking its payment if the first completion did
     * not. CapturePayment is idempotent on `checkout-complete:${session.ID}`, so this is one of the
     * retries; `payment_intent.succeeded` is the other (BookSettledCheckoutPaymentIfNeeded, including
     * on AlreadyApplied webhook deliveries so a 500 after applyEvent still converges).
     */
    private static async replayConfirmedSession(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        md: Metadata,
        contextUser: UserInfo | undefined,
        trigger: CompletionTrigger
    ): Promise<CompleteCheckoutResult> {
        const orderID = session.DraftOrderID ?? '';
        const existingOrder = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        const orderLoaded = await existingOrder.Load(orderID);
        if (orderLoaded) {
            trigger.Report.Capture = await this.applySettledPaymentToOrder(session, existingOrder, contextUser, { Source: trigger.Source });
        }
        return {
            Success: true,
            SessionID: session.ID,
            Status: 'Confirmed',
            OrderID: orderID,
            OrderNumber: orderLoaded ? (existingOrder.OrderNumber || orderID) : orderID,
            TotalGross: orderLoaded ? (existingOrder.TotalGross ?? undefined) : undefined
        };
    }

    /**
     * Builds and confirms the order for an Open session — the work behind both the browser's
     * complete call and the payment webhook. The caller has checked the session may be completed.
     */
    private static async completeOpenSession(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        md: Metadata,
        contextUser: UserInfo | undefined,
        trigger: CompletionTrigger
    ): Promise<CompleteCheckoutResult> {
        const sessionID = session.ID;
        const evidence = trigger.Evidence;
        if (session.DraftOrderID) {
            return this.completeRenewalPayment(session, md, contextUser, trigger);
        }

        // Atomically latch status to Processing to prevent concurrent duplicate checkout processing
        const latched = await this.latchSessionProcessingAtomic(sessionID, md, contextUser);
        if (!latched) {
            // The other caller for this payment (browser or webhook) holds the latch: wait for it.
            if (await session.Load(sessionID)) {
                await this.awaitProcessingFinished(session);
                if (session.Status === 'Confirmed' && session.DraftOrderID) {
                    return this.replayConfirmedSession(session, md, contextUser, trigger);
                }
            }
            trigger.Report.Retryable = true;
            return {
                Success: false,
                ErrorMessage: 'Session is not in an Open status or was concurrently processed',
                SessionID: sessionID,
                Status: session?.Status ?? 'Unknown'
            };
        }
        session.Status = 'Processing';

        // Set the moment order.Confirm() commits; controls the catch's no-revert posture.
        let confirmedOrderID: string | null = null;
        // The Confirm step's record, begun once payment has checked out (#326).
        let confirmStep: CheckoutStepAttempt | null = null;

        try {
            const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
            await widget.Load(session.CheckoutWidgetID);
            const configuredExtensionFields = this.configuredExtensionFields(widget);

            const snapshot = this.readSnapshot(session);
            const linesInput: CheckoutLineInput[] = Array.isArray(snapshot.Lines) ? snapshot.Lines : [];
            const memberPromotionCode =
                typeof snapshot.MemberPromotionCode === 'string' && snapshot.MemberPromotionCode ? snapshot.MemberPromotionCode : null;
            // Written by UpdateDraft, re-normalised anyway: the snapshot is ours, but the rule for
            // what a code may look like belongs in one place.
            const normalizedSnapshotCodes = NormalizeCheckoutPromotionCodes(snapshot.PromotionCodes);
            const snapshotCodes = 'Codes' in normalizedSnapshotCodes ? normalizedSnapshotCodes.Codes : [];

            // A sale with no location can never be placed in a jurisdiction afterwards. A session
            // drafted without one (or before the location was collected) must be drafted again.
            const location = this.snapshotBillingLocation(session);
            if (!location) {
                await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                session.Status = 'Open';
                return {
                    Success: false,
                    ErrorMessage: MISSING_LOCATION_MESSAGE,
                    SessionID: sessionID,
                    Status: 'Open'
                };
            }

            // Refused before anything is written, so an unanswered checkout creates no Person.
            const answersCheck = this.checkSessionAnswers(widget, session);
            const choicesCheck = this.checkSessionChoices(widget, session);
            const unanswered = answersCheck.Error ?? choicesCheck.Error;
            if (unanswered) {
                await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                session.Status = 'Open';
                return {
                    Success: false,
                    ErrorMessage: unanswered,
                    SessionID: sessionID,
                    Status: 'Open'
                };
            }

            // Resolve the payer Person; a new buyer's Person is created only once payment has
            // checked out (below), so a refused payment leaves none behind (#583). Confirm()
            // refuses an order without a customer, so a payer that can never be created (no
            // e-mail) must fail HERE with a clear message. Contact fields come from the first unit
            // payload (name etc.); the email is the session's captured email.
            let newPayerFields: Record<string, unknown> | null = null;
            if (!session.PersonID) {
                const firstPayload = linesInput.length > 0 ? this.extractUnitPayloads(linesInput[0])[0] ?? {} : {};
                const payerFields: Record<string, unknown> = { ...firstPayload, Email: session.Email ?? '' };
                // A simple-product guest checkout collects only an email — derive a name from
                // the local part so the payer Person can be created. The GuestOrder identity
                // claim later re-parents the order to the buyer's real account identity.
                const hasName = payerFields['FirstName'] || payerFields['firstName'] || payerFields['LastName'] || payerFields['lastName'] || payerFields['Name'] || payerFields['name'] || payerFields['AttendeeName'];
                if (!hasName && session.Email) {
                    const localPart = session.Email.split('@')[0]?.trim();
                    if (localPart) {
                        payerFields['Name'] = localPart;
                    }
                }
                const payerPersonID = await this.resolveOrEnsurePerson(payerFields, contextUser, false);
                if (payerPersonID) {
                    session.PersonID = payerPersonID;
                } else if (session.Email?.trim()) {
                    newPayerFields = payerFields;
                }
            }
            if (!session.PersonID && !newPayerFields) {
                await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                session.Status = 'Open';
                return {
                    Success: false,
                    ErrorMessage: 'A buyer email (and name for a new customer) is required to complete checkout',
                    SessionID: sessionID,
                    Status: 'Open'
                };
            }

            // Atomically create the OrderHeaderEntity
            const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
            order.NewRecord();
            order.CompanyID = widget.CompanyID;
            order.BillToPersonID = session.PersonID ?? null;
            order.ShipToPersonID = session.PersonID ?? null;
            SetSystemOrderOrigin(order, 'Widget');
            order.OrderType = 'Sale';
            order.SourceCheckoutWidgetID = widget.ID;
            // VAT location evidence beside the billing address (#480). Null when the edge has no
            // country for the buyer's IP: the sale completes either way.
            order.IPCountry = ToIsoCountryCode(evidence?.IPCountry);
            // Defence-in-depth: the server pre-warms this engine at startup (@RegisterForStartup),
            // but that pre-warm only reaches modules already evaluated when Startup() runs, which
            // this checkout cannot prove. Config() is a no-op once loaded.
            await BusinessTimeZoneEngine.Instance.Config(false, contextUser ?? md.CurrentUser, Metadata.Provider);
            order.OrderDate = TodayAsDateValue();

            // Attendees whose e-mail matches no Person yet: created after payment checks out.
            const newAttendees: Array<{ Fields: Record<string, unknown>; Extension: BaseEntity }> = [];
            let sequence = 1;
            for (const inputLine of linesInput) {
                // Validate quantity: must be positive integer >= 1
                if (!Number.isInteger(inputLine.Quantity) || inputLine.Quantity < 1) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    return {
                        Success: false,
                        ErrorMessage: `Invalid quantity: quantity must be a positive integer (received ${inputLine.Quantity})`,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }

                let targetExtensionEntity: string | null = null;
                let maxQuantityPerLine: number | null = null;
                let unitMode: 'perUnit' | 'perLine' = 'perLine';

                if (inputLine.ProductID) {
                    try {
                        const product = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, contextUser);
                        if (await product.Load(inputLine.ProductID)) {
                            maxQuantityPerLine = product.MaxQuantityPerLine ?? null;
                            if (product.ProductTypeID) {
                                const pType = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, contextUser);
                                if (await pType.Load(product.ProductTypeID)) {
                                    targetExtensionEntity = pType.OrderLineExtensionEntity ?? null;
                                    if (pType.Configuration) {
                                        try {
                                            const pTypeConfig = JSON.parse(pType.Configuration) as ProductTypeConfiguration;
                                            if (pTypeConfig.unitMode) unitMode = pTypeConfig.unitMode;
                                            if (pTypeConfig.maxQuantity && !maxQuantityPerLine) maxQuantityPerLine = pTypeConfig.maxQuantity;
                                        } catch {
                                            // Ignore malformed JSON
                                        }
                                    }
                                }
                            }
                        }
                    } catch {
                        // Fallback
                    }
                }

                const effectiveMax = maxQuantityPerLine ?? DEFAULT_MAX_QUANTITY_PER_LINE;
                if (inputLine.Quantity > effectiveMax) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    return {
                        Success: false,
                        ErrorMessage: `Quantity ${inputLine.Quantity} exceeds maximum allowed quantity of ${effectiveMax} for this item`,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }

                const unitPayloads = this.extractUnitPayloads(inputLine);
                if (unitPayloads.length > effectiveMax) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    return {
                        Success: false,
                        ErrorMessage: `Unit payload count ${unitPayloads.length} exceeds maximum allowed quantity of ${effectiveMax} for this item`,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }
                const unitMismatch = this.unitDetailsMismatch(unitMode, inputLine.Quantity, unitPayloads);
                if (unitMismatch) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    return {
                        Success: false,
                        ErrorMessage: unitMismatch,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }

                const hydrate = async (line: OrderLineEntity, unitData: Record<string, unknown>): Promise<void> => {
                    const hydrated = await this.hydrateLineExtension(line, targetExtensionEntity, unitData, contextUser, false, configuredExtensionFields);
                    if (!hydrated.PersonID && hydrated.Extension) {
                        newAttendees.push({ Fields: unitData, Extension: hydrated.Extension });
                    }
                };
                if ((unitMode === 'perUnit' || unitPayloads.length > 1) && unitPayloads.length > 0) {
                    for (const unitData of unitPayloads) {
                        const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                        line.ProductID = inputLine.ProductID;
                        line.Quantity = 1;
                        line.LineNumber = sequence++;

                        await hydrate(line, unitData);
                    }
                } else {
                    const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                    line.ProductID = inputLine.ProductID;
                    line.Quantity = inputLine.Quantity;
                    line.LineNumber = sequence++;

                    if (unitPayloads.length > 0) {
                        await hydrate(line, unitPayloads[0]);
                    }
                }
            }

            // The answers ride in the order's graph, so Confirm() writes them in the booking
            // transaction: a refused confirm leaves none behind for a retry to duplicate.
            for (const answer of answersCheck.Answers) {
                const row = await order.CheckoutAnswers.Create();
                row.QuestionKey = answer.QuestionKey;
                row.QuestionLabel = answer.QuestionLabel;
                row.Answer = answer.Answer;
                row.OtherText = answer.OtherText;
            }

            // The choices ride on each line the checkout sold (every seat, in per-unit mode), in the
            // same graph: the entitlement walk reads them from the line to decide which conditional
            // entitlements to grant, and a refused confirm leaves none behind.
            for (const line of order.Lines.Items) {
                if (choicesCheck.Choices.length > 0 && !CheckoutSessionService.canRecordChoices(line)) {
                    throw new Error('This checkout is not configured correctly (its choices cannot be recorded on this item).');
                }
                for (const choice of choicesCheck.Choices) {
                    const row = await line.Choices.Create();
                    row.GroupKey = choice.GroupKey;
                    row.GroupLabel = choice.GroupLabel;
                    row.OptionValue = choice.OptionValue;
                    row.OptionLabel = choice.OptionLabel;
                }
            }

            // The codes the draft was priced with — the buyer's and the member discount's. Set on the
            // order's companion so the booking walk in OrderEntityServer re-prices with them and writes
            // the promotions' adjustment rows: that records the redemption, and the re-price inside
            // Confirm()'s save applies the same codes this pre-check does, so the charged total and the
            // booked total match.
            order.PromotionCodes.Codes = CombineCheckoutPromotionCodes(snapshotCodes, memberPromotionCode);

            // Price lines before confirmation
            const pricingService = new OrderPricingService({
                Provider: (order.ProviderToUse ?? md) as unknown as IMetadataProvider,
                User: contextUser ?? (order.ContextCurrentUser as UserInfo),
            });

            // Priced inline, exactly as the draft was: the Address row and any new Person are
            // recorded only once payment checks out, so a refused payment leaves no row behind.
            // A new buyer is priced with no BillToPersonID, as the draft was; a Person created
            // moments later holds no price list, membership, exemption or order history, so
            // pricing it would not change the price.
            const priced = await pricingService.Price({
                OrderHeaderID: order.ID || null,
                CompanyID: widget.CompanyID,
                BillToPersonID: order.BillToPersonID ?? null,
                BillToOrganizationID: order.BillToOrganizationID ?? null,
                // Set to the business day a few lines above; the fallback stays a day rather than
                // an instant so the price rules this prices against (EffectiveFrom/To are `date`
                // columns) are never judged against tomorrow (#209).
                //
                // The ORDER's provider and user, matching the pricing service built two lines up:
                // a widget checkout may run against a provider that is not the global one, and a
                // warm-up read through `Metadata.Provider` would then be configured from a
                // different instance than the order it is dating.
                OrderDate: await CalendarDayOrToday(
                    order.OrderDate,
                    (order.ProviderToUse ?? md) as unknown as IMetadataProvider,
                    contextUser ?? (order.ContextCurrentUser as UserInfo),
                ),
                ShipToAddressID: null,
                ShipToAddress: this.toTaxAddress(location),
                Lines: [...order.Lines.Items],
                PromotionCodes: order.PromotionCodes.Codes,
                ManualDiscounts: [],
                Charges: [],
            });

            // The draft priced with this code, but the engine can decline it now (the promotion
            // ended or hit its redemption limit since), which raises the total above what was paid.
            const memberCodeDeclined = memberPromotionCode
                ? (priced?.UnusableCodes ?? []).find((u) => u.Code.toLowerCase() === memberPromotionCode!.toLowerCase())
                : undefined;
            const typedCodeDeclined = (priced?.UnusableCodes ?? []).find((u) =>
                snapshotCodes.some((c) => c.toLowerCase() === u.Code.toLowerCase())
            );

            await this.settleLineTotals(order);
            const sumGross = this.sumLineTotals(order.Lines.Items);
            order.TotalGross = sumGross;

            // Money-path safety: a paid order confirms only against a payment intent whose
            // STATE and AMOUNT check out server-side. Mere existence of an intent id is not
            // payment — an opened-but-unpaid intent must never book an order. Intent status is
            // driven by the signature-verified payment webhook (PaymentWebhookHandler), never
            // by anything the client asserts.
            if (order.TotalGross > 0) {
                const paymentCheck = await this.verifySessionPayment(session, order.TotalGross, md, contextUser);
                const paymentFailure = paymentCheck.Refusal;
                if (paymentFailure) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    // The buyer has been charged and no order will book: staff must refund. This
                    // covers a declined member code and any other re-price that raised the total.
                    if (paymentFailure.SettledButShort) {
                        const reason = memberCodeDeclined
                            ? `Member promotion code ${memberPromotionCode} was declined on re-price (${memberCodeDeclined.Reason}). ${paymentFailure.Message}`
                            : typedCodeDeclined
                              ? `Promotion code ${typedCodeDeclined.Code} was declined on re-price (${typedCodeDeclined.Reason}). ${paymentFailure.Message}`
                              : paymentFailure.Message;
                        void raiseCheckoutSettledNotBookedAlert(sessionID, session.PaymentIntentID, reason, contextUser);
                        trigger.Report.Alerted = true;
                    }
                    return {
                        Success: false,
                        ErrorMessage: paymentFailure.SettledButShort
                            ? SettledButShortMessage(memberCodeDeclined ? 'member' : typedCodeDeclined ? 'code' : 'price')
                            : paymentFailure.Message,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }
                // VAT location evidence beside the billing address (#480): the issuing country of the
                // card that paid, null for any other instrument or when the gateway did not say.
                order.CardIssuingCountry = paymentCheck.CardIssuingCountry;
                // Payment has checked out, so from here a failure leaves a paid checkout without
                // an order. Record the attempt; Confirm rolls back on failure, the record does not.
                confirmStep = await CheckoutStepLog.Begin(sessionID, 'Confirm', trigger.Source, contextUser);
            }

            // Payment has checked out (or none was due): create the Persons the checkout needs.
            if (newPayerFields) {
                const payerPersonID = await this.resolveOrEnsurePerson(newPayerFields, contextUser, true);
                if (!payerPersonID) {
                    throw new Error(`Could not create the buyer's Person record for ${session.Email}`);
                }
                session.PersonID = payerPersonID;
                order.BillToPersonID = payerPersonID;
                order.ShipToPersonID = payerPersonID;
            }
            for (const attendee of newAttendees) {
                const attendeePersonID = await this.resolveOrEnsurePerson(attendee.Fields, contextUser, true);
                if (attendeePersonID) {
                    this.setExtensionPerson(attendee.Extension, attendeePersonID);
                }
            }

            // The billing location is the only location a self-serve sale has, so it is both the
            // bill-to and the ship-to — the ship-to is what tax is resolved from when Confirm()
            // re-prices the order.
            const billingAddressID = await this.recordBillingAddress(location, session.PersonID, md, contextUser);
            order.BillToAddressID = billingAddressID;
            order.ShipToAddressID = billingAddressID;

            // Confirm order via BaseEntity lifecycle (executes GL booking, entitlement issuance, status latching)
            await order.Confirm();
            confirmedOrderID = order.ID;
            if (confirmStep) {
                await CheckoutStepLog.Succeed(confirmStep);
            }

            // The order is now COMMITTED — from this point nothing may revert the session to
            // Open, or a retry would book a second order for the same purchase. Session
            // stamping failures are logged and repaired atomically, never surfaced as a
            // checkout failure.
            session.Status = 'Confirmed';
            session.DraftOrderID = order.ID;
            const stamped = await session.Save();
            if (!stamped) {
                LogError(`[CheckoutSessionService] Session ${sessionID} completed order ${order.ID} but the entity save failed (${session.LatestResult?.CompleteMessage ?? 'unknown error'}) — falling back to atomic stamp`);
                await CheckoutSessionService.stampSessionConfirmedAtomic(sessionID, order.ID, md, contextUser);
            }

            // Book the PaymentHeader + allocation now that the order exists. retrieve-on-complete
            // only stamps PaymentIntent.Status = Succeeded; AmountPaid stays 0 until CapturePayment.
            trigger.Report.Capture = await this.applySettledPaymentToOrder(session, order, contextUser, { Source: trigger.Source });

            // Mint the GuestOrder identity claim for the buyer's email so a later account
            // (MJ core's IdentityClaimEngineServer) can attach the order + its entitlement
            // grants on redemption or claim-on-login. Best-effort: a claim failure must never
            // fail a booked order — but it is logged, never swallowed silently.
            let claimToken: string | undefined;
            if (session.Email) {
                try {
                    // Claim types are cached at startup; Config() is a no-op once loaded.
                    await IdentityClaimEngineServer.Instance.Config(false, contextUser);
                    const claim = await IdentityClaimEngineServer.Instance.CreateClaim({
                        ClaimTypeName: 'GuestOrder',
                        RecordID: order.ID,
                        EntityID: md.EntityByName(ORDER_HEADER_ENTITY)?.ID ?? null,
                        NormalizedEmail: session.Email,
                        Payload: { OrderID: order.ID, OrderNumber: order.OrderNumber || order.ID },
                        // Claim e-mails stay off until a claim e-mail template and the portal base
                        // URL are configured; without them MJ sends a generic message linking to
                        // its default host.
                        SendEmail: false
                    }, contextUser);
                    claimToken = claim?.ID;
                } catch (claimErr) {
                    const claimMsg = claimErr instanceof Error ? claimErr.message : String(claimErr);
                    LogError(`[CheckoutSessionService] GuestOrder claim minting failed for order ${order.ID} (${session.Email}): ${claimMsg}`);
                }
            }

            return {
                Success: true,
                OrderID: order.ID,
                OrderNumber: order.OrderNumber || order.ID,
                TotalGross: order.TotalGross ?? sumGross,
                SessionID: sessionID,
                Status: 'Confirmed',
                ClaimToken: claimToken
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (confirmedOrderID) {
                // Post-commit failure: the order EXISTS. Do not revert the latch (a retry would
                // double-book); stamp the session Confirmed atomically and report success.
                LogError(`[CheckoutSessionService] CompleteCheckout post-confirm failure for session ${sessionID} (order ${confirmedOrderID}): ${msg}`);
                await CheckoutSessionService.stampSessionConfirmedAtomic(sessionID, confirmedOrderID, md, contextUser);
                return {
                    Success: true,
                    OrderID: confirmedOrderID,
                    SessionID: sessionID,
                    Status: 'Confirmed'
                };
            }
            if (confirmStep) {
                await CheckoutStepLog.Fail(confirmStep, msg);
            }
            await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
            session.Status = 'Open';
            // A thrown save or read may pass on a later attempt; a refusal above would not.
            trigger.Report.Retryable = true;
            LogError(`[CheckoutSessionService] CompleteCheckout failed for session ${sessionID}: ${msg}`);
            return {
                Success: false,
                ErrorMessage: `Failed to complete checkout: ${msg}`,
                SessionID: sessionID,
                Status: 'Open'
            };
        }
    }

    /** The session's MetadataJSON, or an empty snapshot when it is absent or unreadable. */
    private static readSnapshot(session: mjBizAppsOrdersCheckoutSessionEntity): CheckoutSnapshot {
        if (!session.MetadataJSON) return {};
        try {
            const parsed = JSON.parse(session.MetadataJSON) as unknown;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as CheckoutSnapshot) : {};
        } catch {
            return {};
        }
    }

    /** The billing location the draft stored, re-checked — null when it is missing or no longer valid. */
    private static snapshotBillingLocation(session: mjBizAppsOrdersCheckoutSessionEntity): BillingLocation | null {
        const check = CheckBillingLocation(this.readSnapshot(session).BillingAddress);
        return check.Valid ? check.Location : null;
    }

    private static toTaxAddress(location: BillingLocation): TaxAddress {
        return {
            Country: location.Country,
            StateProvince: location.StateProvince,
            City: null,
            PostalCode: location.PostalCode
        };
    }

    /**
     * What the buyer pays: each line's gross including the tax pricing resolved onto it. A line
     * that has not been saved has no stored `LineTotalGross`, so its tax is added explicitly —
     * otherwise the intent would be opened for less than the confirmed order's total.
     */
    private static sumLineTotals(lines: ReadonlyArray<mjBizAppsOrdersOrderLineEntity>): number {
        let sum = 0;
        for (const line of lines) {
            sum += line.LineTotalGross ?? ((line.UnitPrice ?? 0) * (line.Quantity ?? 1) + (line.LineTax ?? 0));
        }
        return Math.round(sum * 100) / 100;
    }

    private static sumLineTax(lines: ReadonlyArray<mjBizAppsOrdersOrderLineEntity>): number {
        const sum = lines.reduce((total, line) => total + (line.LineTax ?? 0), 0);
        return Math.round(sum * 100) / 100;
    }

    /**
     * Records the billing location as a Common Address and links it to the buyer as their
     * Billing address. Street and city are not collected by checkout and stay empty.
     *
     * A failed Address save throws: the order must not confirm without its location. A failed
     * link is logged and tolerated — the order still references the Address; only the buyer's
     * address book misses it.
     */
    /**
     * Complete a pay-renewal session (#289): the payment must have settled and cover the open
     * balance; then the session is stamped Confirmed against the renewal order and the payment is
     * booked through the ordinary checkout capture, which also replaces the renewal card. No order is
     * created or confirmed here — the renewal order already is.
     */
    private static async completeRenewalPayment(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        md: Metadata,
        contextUser: UserInfo | undefined,
        trigger: CompletionTrigger
    ): Promise<CompleteCheckoutResult> {
        const refuse = (message: string, status: string = session.Status): CompleteCheckoutResult => ({
            Success: false,
            ErrorMessage: message,
            SessionID: session.ID,
            Status: status,
        });
        const renewal = await this.renewalOrderFor(session, contextUser);
        if (!renewal) {
            return refuse('This renewal could not be found.');
        }
        if (renewal.Status !== 'Confirmed') {
            return refuse('This renewal can no longer be paid here.');
        }
        const { Refusal: paymentProblem } = await this.verifySessionPayment(session, renewal.Balance, md, contextUser);
        if (paymentProblem) {
            return refuse(paymentProblem.Message);
        }
        if (!(await this.latchSessionProcessingAtomic(session.ID, md, contextUser))) {
            trigger.Report.Retryable = true;
            return refuse('Session is not in an Open status or was concurrently processed', 'Unknown');
        }
        if (!(await this.stampSessionConfirmedAtomic(session.ID, renewal.OrderID, md, contextUser))) {
            await this.revertSessionOpenAtomic(session.ID, md, contextUser);
            trigger.Report.Retryable = true;
            return refuse('The renewal payment could not be recorded. Please try again.', 'Open');
        }
        session.Status = 'Confirmed';

        const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        if (await order.Load(renewal.OrderID)) {
            trigger.Report.Capture = await this.applySettledPaymentToOrder(session, order, contextUser, { Source: trigger.Source });
        }
        return {
            Success: true,
            SessionID: session.ID,
            Status: 'Confirmed',
            OrderID: renewal.OrderID,
            OrderNumber: renewal.OrderNumber,
            TotalGross: renewal.TotalGross,
        };
    }

    /**
     * The buyer's Billing address for this location. Reuses a Billing-linked Address of the
     * person's with the same country, state and postal code and no street lines, so a retried
     * completion (a confirm that failed after the address was saved) does not add a second
     * address and link for the same location (#817). Otherwise records a new one and links it.
     */
    private static async recordBillingAddress(
        location: BillingLocation,
        personID: string,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<string> {
        let existing: string | null = null;
        try {
            existing = await this.findBillingAddress(location, personID, md, contextUser);
        } catch (err) {
            LogError(`[CheckoutSessionService] Billing address lookup for person ${personID} failed; recording a new one: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (existing) {
            return existing;
        }
        const address = await md.GetEntityObject<mjBizAppsCommonAddressEntity>(ADDRESS_ENTITY, contextUser);
        address.NewRecord();
        address.Country = location.Country;
        address.StateProvince = location.StateProvince;
        address.PostalCode = location.PostalCode;
        if (!(await address.Save())) {
            throw new Error(`Could not record the billing address: ${address.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        await this.linkBillingAddress(address.ID, personID, md, contextUser);
        return address.ID;
    }

    /** The ID of the Billing address type, or null when it is not defined. */
    private static async billingAddressTypeID(contextUser?: UserInfo): Promise<string | null> {
        const typeRes = await new RunView().RunView<{ ID: string }>({
            EntityName: ADDRESS_TYPE_ENTITY,
            ExtraFilter: `Name = '${EscapeText(BILLING_ADDRESS_TYPE)}'`,
            Fields: ['ID'],
            ResultType: 'simple'
        }, contextUser);
        return (typeRes?.Success ? typeRes.Results?.[0]?.ID : undefined) ?? null;
    }

    /**
     * A location-only Address already linked to the person as Billing that matches this location,
     * or null. Fail-soft: a failed read means a new address is recorded, as before.
     */
    private static async findBillingAddress(
        location: BillingLocation,
        personID: string,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<string | null> {
        const personEntityID = md.EntityByName(PERSON_ENTITY)?.ID;
        const addressTypeID = await this.billingAddressTypeID(contextUser);
        if (!personEntityID || !addressTypeID) {
            return null;
        }
        const rv = new RunView();
        const links = await rv.RunView<{ AddressID: string }>({
            EntityName: ADDRESS_LINK_ENTITY,
            ExtraFilter: `EntityID = '${EscapeText(personEntityID)}' AND RecordID = '${EscapeText(personID)}' AND AddressTypeID = '${EscapeText(addressTypeID)}'`,
            Fields: ['AddressID'],
            ResultType: 'simple'
        }, contextUser);
        const addressIDs = links?.Success ? (links.Results ?? []).map((l) => l.AddressID).filter(Boolean) : [];
        if (addressIDs.length === 0) {
            return null;
        }
        const matches = (column: string, value: string | null) =>
            value == null || value === '' ? `(${column} IS NULL OR ${column} = '')` : `${column} = '${EscapeText(value)}'`;
        const addresses = await rv.RunView<{ ID: string }>({
            EntityName: ADDRESS_ENTITY,
            ExtraFilter: [
                `ID IN (${addressIDs.map((id) => `'${EscapeText(id)}'`).join(',')})`,
                matches('Country', location.Country),
                matches('StateProvince', location.StateProvince),
                matches('PostalCode', location.PostalCode),
                matches('Line1', null),
            ].join(' AND '),
            Fields: ['ID'],
            OrderBy: '__mj_CreatedAt ASC',
            ResultType: 'simple'
        }, contextUser);
        return (addresses?.Success ? addresses.Results?.[0]?.ID : undefined) ?? null;
    }

    private static async linkBillingAddress(
        addressID: string,
        personID: string,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<void> {
        const personEntityID = md.EntityByName(PERSON_ENTITY)?.ID;
        const addressTypeID = await this.billingAddressTypeID(contextUser);
        if (!personEntityID || !addressTypeID) {
            LogError(`[CheckoutSessionService] Billing address ${addressID} not linked to person ${personID}: ${personEntityID ? `no '${BILLING_ADDRESS_TYPE}' address type` : 'Person entity not in metadata'}`);
            return;
        }
        const link = await md.GetEntityObject<mjBizAppsCommonAddressLinkEntity>(ADDRESS_LINK_ENTITY, contextUser);
        link.NewRecord();
        link.AddressID = addressID;
        link.EntityID = personEntityID;
        link.RecordID = personID;
        link.AddressTypeID = addressTypeID;
        if (!(await link.Save())) {
            LogError(`[CheckoutSessionService] Billing address ${addressID} not linked to person ${personID}: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Verifies the paid-order gate for a session against a server-computed total. `Refusal` is
     * null when payment checks out. The intent must exist, belong to this session, be in a
     * settled state, and cover the freshly re-priced total. `SettledButShort` marks the one
     * refusal where money has already moved.
     *
     * When payment checks out, `CardIssuingCountry` is the issuing country of the card that paid,
     * read from the gateway (#480). Fail-soft: null when the instrument is not a card, the gateway
     * does not report a country, or the read fails.
     */
    private static async verifySessionPayment(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        totalGross: number,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<{ Refusal: { Message: string; SettledButShort: boolean } | null; CardIssuingCountry: string | null }> {
        const refused = (Message: string, SettledButShort = false) => ({
            Refusal: { Message, SettledButShort },
            CardIssuingCountry: null,
        });
        if (!session.PaymentIntentID) {
            return refused('Cannot confirm paid order (TotalGross > 0) without a payment intent for this session');
        }
        const intent = await md.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, contextUser);
        const intentLoaded = await intent.Load(session.PaymentIntentID);
        if (!intentLoaded) {
            return refused('The payment intent attached to this session could not be found');
        }
        let retrieved: RetrieveIntentResult | null = null;
        if (!SETTLED_INTENT_STATUSES.includes(intent.Status)) {
            // The browser has already confirmCardPayment'd (4242 succeeds at Stripe immediately).
            // The signature-verified webhook is what normally stamps Succeeded, but it often
            // has not landed yet — especially on localhost, which Stripe cannot POST to.
            // Retrieve from the gateway with OUR key (never a client claim) and adopt that status.
            retrieved = await this.refreshIntentFromGateway(intent, contextUser);
        }
        if (!SETTLED_INTENT_STATUSES.includes(intent.Status)) {
            return refused(`Payment has not settled (intent status: ${intent.Status}). Complete payment and try again.`);
        }
        // Half-cent tolerance absorbs decimal rounding between the priced total and the
        // cents-rounded intent amount.
        if ((intent.Amount ?? 0) + 0.005 < totalGross) {
            return refused(`The settled payment amount (${intent.Amount}) does not cover the order total (${totalGross})`, true);
        }
        // An intent the webhook already settled was not read above; read it once for the card.
        retrieved ??= await this.retrieveIntentFromGateway(intent, contextUser);
        return { Refusal: null, CardIssuingCountry: ToIsoCountryCode(retrieved?.Instrument?.IssuingCountry) };
    }

    /**
     * Gateway-side retry for a checkout whose order confirmed but CapturePayment did not book.
     *
     * `applyEvent` only stamps PaymentIntent status — it does not write a PaymentHeader (D19).
     * Card checkout books via CapturePayment after Confirm. If that fails, two things retry
     * the same idempotent CapturePayment (`checkout-complete:${session.ID}`):
     *   1. POST /checkout/complete against a Confirmed session (client replay)
     *   2. This method, from `payment_intent.succeeded` — including AlreadyApplied deliveries,
     *      so a 500 after the intent row is stamped still converges on the next Stripe retry.
     *
     * A session the payment settled for that is still Open was never completed: the buyer's page
     * closed before it asked (#724). This method completes it, as the browser would have. One that
     * expired first is past completing, and raises the "settled with no order" alert.
     *
     * No-ops when no checkout session owns the intent (back-office captures).
     */
    public static async BookSettledCheckoutPaymentIfNeeded(
        paymentIntentID: string,
        contextUser: UserInfo
    ): Promise<BookCheckoutPaymentResult> {
        if (!paymentIntentID) {
            return { Attempted: false, Booked: false };
        }
        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const sessionID =
            (await this.sessionIDForIntent(paymentIntentID, `Status = 'Confirmed'`, contextUser)) ??
            (await this.sessionIDForIntent(paymentIntentID, `Status IN ('Open', 'Processing', 'Expired')`, contextUser));
        if (!sessionID || !(await session.Load(sessionID))) {
            return { Attempted: false, Booked: false };
        }
        await this.awaitProcessingFinished(session);
        if (session.Status === 'Open') {
            return this.completeFromWebhook(session, md, contextUser);
        }
        if (session.Status === 'Processing') {
            return { Attempted: true, Booked: false, Retryable: true, ErrorMessage: 'the checkout is still being completed' };
        }
        if (session.Status === 'Expired') {
            const reason = 'The checkout expired before it was completed, so its settled payment has no order.';
            void raiseCheckoutSettledNotBookedAlert(session.ID, session.PaymentIntentID, reason, contextUser);
            return { Attempted: true, Booked: false, Retryable: false, ErrorMessage: reason };
        }
        if (session.Status !== 'Confirmed' || !session.DraftOrderID) {
            return { Attempted: false, Booked: false };
        }
        const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        if (!(await order.Load(session.DraftOrderID))) {
            return { Attempted: false, Booked: false };
        }
        return this.applySettledPaymentToOrder(session, order, contextUser, { Source: 'Webhook' });
    }

    /** The checkout session that opened this payment intent, among those `statusFilter` admits. */
    private static async sessionIDForIntent(
        paymentIntentID: string,
        statusFilter: string,
        contextUser: UserInfo
    ): Promise<string | undefined> {
        const rv = new RunView();
        const found = await rv.RunView<{ ID: string }>(
            {
                EntityName: CHECKOUT_SESSION_ENTITY,
                ExtraFilter: `PaymentIntentID = '${EscapeText(paymentIntentID)}' AND ${statusFilter}`,
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser
        );
        return found?.Results?.[0]?.ID;
    }

    /**
     * Operator replay of the Capture step (`Orders.ReplayCheckoutStep`, #326). The same idempotent
     * CapturePayment as the complete call and the webhook, recorded as a Replay by the operator.
     * Returns a refusal message instead when the session has no confirmed order to capture against.
     */
    public static async ReplayCapture(
        sessionID: string,
        contextUser: UserInfo,
        replayedByUserID: string,
    ): Promise<BookCheckoutPaymentResult | string> {
        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        if (!(await session.Load(sessionID))) {
            return `Checkout session ${sessionID} not found.`;
        }
        if (session.Status !== 'Confirmed' || !session.DraftOrderID) {
            return `Checkout session ${sessionID} has no confirmed order (status ${session.Status}); there is nothing to capture against.`;
        }
        const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        if (!(await order.Load(session.DraftOrderID))) {
            return `The order on checkout session ${sessionID} could not be read.`;
        }
        return this.applySettledPaymentToOrder(session, order, contextUser, { Source: 'Replay', ReplayedByUserID: replayedByUserID });
    }

    /**
     * After the order is committed, book `Orders.CapturePayment` against the session's
     * settled PaymentIntent and stamp PaymentIntent.OrderHeaderID.
     *
     * Fail-soft and post-commit: a capture problem must not un-confirm the order.
     * Retries are CompleteCheckout replay and `BookSettledCheckoutPaymentIfNeeded`
     * from the payment_intent.succeeded webhook (including AlreadyApplied).
     */
    private static async applySettledPaymentToOrder(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        order: OrderHeaderEntity,
        contextUser: UserInfo | undefined,
        trigger: { Source: CheckoutStepSource; ReplayedByUserID?: string },
    ): Promise<BookCheckoutPaymentResult> {
        if (!session.PaymentIntentID) {
            return { Attempted: false, Booked: false };
        }
        // What is still owed: the whole order for a checkout's own new order, and the open balance for
        // a renewal order paid through the update-card link (#289), which may be part-paid.
        const total = Number(order.TotalGross ?? 0);
        if (!(total > 0)) {
            return { Attempted: false, Booked: false };
        }
        const due = Math.round((total - Number(order.AmountPaid ?? 0)) * 100) / 100;
        // A renewal order paid through the update-card link (#289). Null for a checkout's own order.
        const renewal = await this.renewalOrderFor(session, contextUser);
        if (!(due > 0.005)) {
            // A link payment can land on a renewal another payment already settled: a retry charge
            // on the old card, or the same link paid from a second tab. The gateway has the money and
            // nothing books it, so a person must refund it or apply it.
            if (renewal && contextUser) {
                const unbooked = await this.unbookedSettledIntentAmount(session.PaymentIntentID, contextUser);
                if (unbooked > 0.005) {
                    return this.captureFailed(
                        order.ID,
                        `the gateway took ${unbooked.toFixed(2)} through the update-card link, but renewal ${order.OrderNumber} was already paid; refund it or apply it as credit`,
                        false,
                        contextUser,
                        session.ID,
                        null,
                    );
                }
            }
            // Paid, possibly by another path after an earlier capture attempt failed. A record
            // left Failed or Running would keep the session in the review queue.
            await CheckoutStepLog.CloseIfOpen(session.ID, 'Capture', contextUser);
            return { Attempted: false, Booked: true };
        }
        if (!contextUser) {
            return this.captureFailed(order.ID, 'no context user', undefined, undefined, session.ID, null);
        }
        const step = await CheckoutStepLog.Begin(session.ID, 'Capture', trigger.Source, contextUser, trigger.ReplayedByUserID);
        if (!order.BillToPersonID && !order.BillToOrganizationID) {
            return this.captureFailed(order.ID, 'no bill-to party', undefined, contextUser, session.ID, step);
        }

        const md = new Metadata();
        const intent = await md.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, contextUser);
        if (!(await intent.Load(session.PaymentIntentID))) {
            return this.captureFailed(order.ID, 'payment intent not found', undefined, contextUser, session.ID, step);
        }
        if (!SETTLED_INTENT_STATUSES.includes(intent.Status)) {
            await this.refreshIntentFromGateway(intent, contextUser);
        }
        if (!SETTLED_INTENT_STATUSES.includes(intent.Status)) {
            return this.captureFailed(order.ID, `intent status is ${intent.Status}`, undefined, contextUser, session.ID, step);
        }

        if (!intent.OrderHeaderID) {
            // Second step of the gateway description: the intent was opened before the order existed.
            const mdForGateway = Metadata.Provider as IMetadataProvider | undefined;
            if (mdForGateway) {
                await SendOrderDescriptionToGateway(intent, order.ID, mdForGateway, contextUser);
            }
            // Re-read after the gateway call, before the save below (#939). The save writes every
            // field of this object, and a webhook event can land on the same row while the
            // description is on its way, so a copy read before the call would put its stamp back.
            if (!(await intent.Load(intent.ID))) {
                LogError(`[CheckoutSessionService] Could not re-read intent ${intent.ID} before stamping order ${order.ID}; saving the copy read before the gateway call`);
            }
            if (!intent.OrderHeaderID) {
                intent.OrderHeaderID = order.ID;
            }
        }
        // The order's bill-to is authoritative. The intent can carry an earlier payer: one opened
        // before the buyer changed e-mail is returned again by the gateway for the same idempotency
        // key, still naming the person it was first opened for (#393). A renewal paid through the
        // link is the exception: its payer is the card's owner, not the beneficiary it bills (#683).
        const payerPersonID = renewal ? renewal.PayerPersonID : order.BillToPersonID;
        const payerOrganizationID = renewal ? renewal.PayerOrganizationID : order.BillToOrganizationID;
        if (payerPersonID && !this.idsEqual(intent.BillToPersonID, payerPersonID)) {
            intent.BillToPersonID = payerPersonID;
        }
        if (!intent.BillToOrganizationID && payerOrganizationID) {
            intent.BillToOrganizationID = payerOrganizationID;
        }
        if (!(await intent.Save())) {
            LogError(`[CheckoutSessionService] Could not stamp OrderHeaderID on intent ${intent.ID} for order ${order.ID}: ${intent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        let tenderCode = 'CreditCard';
        try {
            const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
            if (await widget.Load(session.CheckoutWidgetID) && widget.Configuration) {
                const configObj = JSON.parse(widget.Configuration) as CheckoutWidgetConfiguration;
                if (typeof configObj.tenderCode === 'string' && configObj.tenderCode.trim()) {
                    tenderCode = configObj.tenderCode.trim();
                }
            }
        } catch {
            // Keep the CreditCard default; CapturePayment will refuse an unknown code.
        }

        const mdProvider = Metadata.Provider as IMetadataProvider | undefined;
        if (!mdProvider) {
            return this.captureFailed(order.ID, 'no metadata provider', undefined, contextUser, session.ID, step);
        }

        try {
            const op = new CapturePaymentOperation();
            // On its own transaction, never the shared provider's (#927): the page and the webhook
            // capture the same session within a second of each other, and on one provider their
            // transactions nest, so a rollback on one side undid the other's payment.
            const result = await WithIsolatedProvider((captureProvider) => op.ExecuteServer(
                {
                    PaymentIntentID: intent.ID,
                    Amount: due,
                    ReceivingCompanyID: order.CompanyID,
                    // A renewal order names its subscription's holder organization and beneficiary
                    // person both, and a capture with two payers is refused as ambiguous. The link's
                    // payer paid — the card's owner, on a gift the buyer — so the payment is theirs,
                    // as the renewal charge does.
                    BillToPersonID: renewal ? renewal.PayerPersonID : order.BillToPersonID ?? null,
                    BillToOrganizationID: renewal ? renewal.PayerOrganizationID : order.BillToOrganizationID ?? null,
                    TenderCode: tenderCode,
                    Allocations: [{ OrderHeaderID: order.ID, Amount: due }],
                    PaymentDetail: intent.PaymentProviderID
                        ? { PaymentProviderID: intent.PaymentProviderID }
                        : null,
                    IdempotencyKey: `checkout-complete:${session.ID}`,
                },
                {
                    provider: captureProvider,
                    user: contextUser,
                    emitProgress: () => undefined,
                }
            ), mdProvider);
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                const detail = result.ErrorMessage
                    ?? output?.Message
                    ?? output?.Blockers?.map((b) => b.Message).join('; ')
                    ?? 'unknown error';
                const codes = (output?.Blockers ?? []).map((b) => b.Code).filter((c): c is string => Boolean(c));
                return this.captureFailed(order.ID, detail, isCaptureRefusalRetryable(codes), contextUser, session.ID, step);
            }
            await CheckoutStepLog.Succeed(step);
            // A link payment opened for more than is now owed (part-paid since): the excess has
            // moved too, and only a person can refund or apply it.
            const excess = Math.round((Number(intent.Amount ?? 0) - due) * 100) / 100;
            if (renewal && excess > 0.005) {
                void raiseCheckoutCaptureTerminalAlert(
                    order.ID,
                    session.ID,
                    `the update-card link took ${excess.toFixed(2)} more than renewal ${order.OrderNumber} owed; refund it or apply it as credit`,
                    contextUser,
                );
            }
            // The money has moved; now keep the card for any subscription that renews on its own.
            // Fail-soft by contract, so this cannot turn a booked capture into a failed one.
            if (intent.PaymentProviderID && intent.ProviderIntentID) {
                // A renewal order paid through the update-card link replaces the subscription's
                // renewal card with the one just used (#289); a checkout's own order fills new
                // subscriptions that have none.
                await SaveCheckoutInstrumentForRenewals(
                    {
                        OrderHeaderID: order.ID,
                        CompanyID: order.CompanyID,
                        // The payer's wallet: on a gift, the buyer's, never the beneficiary's (#683).
                        OwnerPersonID: renewal ? renewal.PayerPersonID : order.BillToPersonID ?? null,
                        OwnerOrganizationID: renewal ? renewal.PayerOrganizationID : order.BillToOrganizationID ?? null,
                        PaymentProviderID: intent.PaymentProviderID,
                        ProviderIntentID: intent.ProviderIntentID,
                        TenderCode: tenderCode,
                        ReplaceCardOnSubscriptionIDs: renewal?.SubscriptionIDs,
                    },
                    mdProvider,
                    contextUser
                );
                // On an account whose gateway bills renewals itself, hand the order's new subscriptions
                // to it now that their card is kept (option E, E2). Never on an update-card renewal:
                // that order creates no subscription. Never throws, and a problem raises an alert
                // Task; this is the only call a checkout makes, since a replay of a booked payment
                // returns before here, so the daily Create Provider Subscriptions action retries it.
                // On its own provider, like the capture above: the write that records the gateway id
                // must not be rolled back with another request's transaction (#927). On an account
                // that does not bill subscriptions it costs one read of the account, on this shared
                // provider, and returns before making a provider of its own.
                if (!renewal) {
                    try {
                        await EnsureProviderSubscriptionsOnOwnProvider(
                            { OrderHeaderID: order.ID, CheckoutPaymentProviderID: intent.PaymentProviderID },
                            mdProvider,
                            contextUser,
                        );
                    } catch (err) {
                        // Contractually unreachable; kept so a defect there can never report a booked capture as failed.
                        LogError(`[CheckoutSessionService] Order ${order.ID}: handing subscriptions to the gateway threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }
            }
            return { Attempted: true, Booked: true };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return this.captureFailed(order.ID, msg, true, contextUser, session.ID, step);
        }
    }

    /**
     * The amount of a settled intent no payment books, or 0. Read when a renewal order is already
     * paid, to tell money the link took twice from a replay of a payment already booked.
     */
    private static async unbookedSettledIntentAmount(paymentIntentID: string, contextUser: UserInfo): Promise<number> {
        const md = new Metadata();
        const intent = await md.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, contextUser);
        if (!(await intent.Load(paymentIntentID))) return 0;
        if (!SETTLED_INTENT_STATUSES.includes(intent.Status)) await this.refreshIntentFromGateway(intent, contextUser);
        if (intent.Status !== 'Succeeded') return 0;
        const payments = await new RunView().RunView<{ ID: string }>(
            {
                EntityName: PAYMENT_HEADER_ENTITY,
                ExtraFilter: `PaymentIntentID = '${RequireUUID(intent.ID, 'PaymentIntentID')}' AND Status <> 'Failed'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            contextUser,
        );
        if (!payments.Success) throw new Error(`Could not read the payments of intent ${intent.ID}: ${payments.ErrorMessage}`);
        return (payments.Results ?? []).length ? 0 : Number(intent.Amount ?? 0);
    }

    private static async captureFailed(
        orderID: string,
        message: string,
        retryable: boolean | undefined,
        contextUser: UserInfo | undefined,
        sessionID: string,
        step: CheckoutStepAttempt | null,
    ): Promise<BookCheckoutPaymentResult> {
        const Retryable = retryable ?? !isTerminalCapturePrecheck(message);
        LogError(`[CheckoutSessionService] CapturePayment failed for order ${orderID}: ${message}`);
        // One Task per terminal failure, not one per replay of it: the step record says whether
        // the last attempt already ended the same way.
        if (!Retryable && (!step || CheckoutStepLog.IsNewTerminalFailure(step))) {
            void raiseCheckoutCaptureTerminalAlert(orderID, sessionID, message, contextUser);
        }
        if (step) {
            await CheckoutStepLog.Fail(step, message, Retryable);
        }
        return { Attempted: true, Booked: false, ErrorMessage: message, Retryable };
    }

    /**
     * Pull the gateway's current intent status onto our row, and return what the gateway said.
     * Fail-soft: a retrieve error leaves the local status unchanged and the paid gate still
     * refuses.
     *
     * The row is re-read after the gateway call and before it is written (#939). MJ's `Save()`
     * sends every field of the object, not only the changed ones, and the webhook writes the same
     * row while the page waits on the gateway: saving the copy read before the call put the
     * webhook's `ProviderEventID` back to null, which is the stamp its duplicate check reads. When
     * the fresh row already holds what the gateway said, the webhook recorded it first, and the row
     * is left as it wrote it, event time included. The re-read narrows the window to milliseconds;
     * it does not lock the row (#943). MJ #4339 tracks the every-field save upstream.
     */
    private static async refreshIntentFromGateway(
        intent: mjBizAppsOrdersPaymentIntentEntity,
        contextUser?: UserInfo
    ): Promise<RetrieveIntentResult | null> {
        const retrieved = await this.retrieveIntentFromGateway(intent, contextUser);
        if (!retrieved || !retrieved.Status) {
            return retrieved;
        }
        if (retrieved.Status === intent.Status && retrieved.Amount == null) {
            return retrieved;
        }
        if (!(await intent.Load(intent.ID))) {
            // Deliberate: this call then refuses (the status stays unsettled), and the caller can retry
            // while the webhook still books the payment. Setting `Status` from `retrieved` on this copy
            // instead would let a later save in capture write the stale copy back, the overwrite #939 fixes.
            LogError(`[CheckoutSessionService] Could not re-read intent ${intent.ID} to stamp retrieved status ${retrieved.Status}`);
            return retrieved;
        }
        const amount = typeof retrieved.Amount === 'number' && retrieved.Amount > 0 ? retrieved.Amount : null;
        if (retrieved.Status === intent.Status && (amount === null || amount === intent.Amount)) {
            return retrieved;
        }
        intent.Status = retrieved.Status;
        // The gateway's state as of this read, so any webhook event created before now is older
        // than this status and is not allowed to move it backwards (#475).
        intent.LastEventAt = new Date();
        if (amount !== null) {
            intent.Amount = amount;
        }
        try {
            if (!(await intent.Save())) {
                LogError(`[CheckoutSessionService] Could not stamp retrieved intent status ${retrieved.Status} on ${intent.ID}`);
            }
        } catch (err) {
            LogError(
                `[CheckoutSessionService] Stamping retrieved status on intent ${intent.ID} failed: ${err instanceof Error ? err.message : String(err)}`
            );
        }
        return retrieved;
    }

    /**
     * The gateway's view of an intent, read with our key. Null when the intent has no gateway
     * reference, the read is refused, or it throws: callers treat that as "nothing learned".
     */
    private static async retrieveIntentFromGateway(
        intent: mjBizAppsOrdersPaymentIntentEntity,
        contextUser?: UserInfo
    ): Promise<RetrieveIntentResult | null> {
        if (!intent.PaymentProviderID || !intent.ProviderIntentID || !contextUser) {
            return null;
        }
        const mdProvider = Metadata.Provider as IMetadataProvider | undefined;
        if (!mdProvider) {
            return null;
        }
        try {
            const driver = await ResolvePaymentProvider(intent.PaymentProviderID, mdProvider, contextUser);
            const retrieved = await driver.RetrieveIntent({ ProviderIntentID: intent.ProviderIntentID });
            return retrieved.Success ? retrieved : null;
        } catch (err) {
            LogError(
                `[CheckoutSessionService] Gateway retrieve for intent ${intent.ID} failed: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    /**
     * Atomically stamps a Processing session as Confirmed with its completed order id — the
     * repair path when the entity-level save cannot run after the order has committed.
     */
    private static async stampSessionConfirmedAtomic(sessionID: string, orderID: string, md: Metadata, contextUser?: UserInfo): Promise<boolean> {
        try {
            const provider = (Metadata.Provider || (Metadata as unknown as { Provider: unknown }).Provider) as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                return false;
            }

            const entityInfo = md.Entities?.find(e => e.Name === CHECKOUT_SESSION_ENTITY);
            const schemaName = entityInfo?.SchemaName ?? '__mj_BizAppsOrders';
            const tableName = entityInfo?.BaseTable ?? 'CheckoutSession';

            const isPg = provider.PlatformKey === 'postgresql';
            const table = isPg ? `${schemaName}.${tableName}` : `[${schemaName}].[${tableName}]`;

            const sql = isPg
                ? `UPDATE ${table} SET "Status" = 'Confirmed', "DraftOrderID" = $2 WHERE "ID" = $1 AND "Status" = 'Processing' RETURNING "ID";`
                : `DECLARE @stamped TABLE (ID UNIQUEIDENTIFIER); UPDATE ${table} SET [Status] = 'Confirmed', [DraftOrderID] = @p1 OUTPUT INSERTED.ID INTO @stamped WHERE [ID] = @p0 AND [Status] = 'Processing'; SELECT ID FROM @stamped;`;

            const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [sessionID, orderID], { isMutation: true }, contextUser);
            return Array.isArray(rows) && rows.length === 1;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[CheckoutSessionService] stampSessionConfirmedAtomic failed for session ${sessionID}: ${msg}`);
            return false;
        }
    }

    /**
     * Executes atomic single-use Compare-And-Swap (CAS) state transition on CheckoutSession
     * from 'Open' to 'Processing'. Returns true iff this execution successfully transitioned the record.
     */
    private static async latchSessionProcessingAtomic(sessionID: string, md: Metadata, contextUser?: UserInfo): Promise<boolean> {
        try {
            const provider = (Metadata.Provider || (Metadata as unknown as { Provider: unknown }).Provider) as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                LogError('latchSessionProcessingAtomic: provider or ExecuteSQL not available for atomic CAS');
                return false;
            }

            const entityInfo = md.Entities?.find(e => e.Name === CHECKOUT_SESSION_ENTITY);
            const schemaName = entityInfo?.SchemaName ?? '__mj_BizAppsOrders';
            const tableName = entityInfo?.BaseTable ?? 'CheckoutSession';

            const isPg = provider.PlatformKey === 'postgresql';
            const table = isPg ? `${schemaName}.${tableName}` : `[${schemaName}].[${tableName}]`;

            const sql = isPg
                ? `UPDATE ${table} SET "Status" = 'Processing' WHERE "ID" = $1 AND "Status" = 'Open' RETURNING "ID";`
                : `DECLARE @latched TABLE (ID UNIQUEIDENTIFIER); UPDATE ${table} SET [Status] = 'Processing' OUTPUT INSERTED.ID INTO @latched WHERE [ID] = @p0 AND [Status] = 'Open'; SELECT ID FROM @latched;`;

            const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [sessionID], { isMutation: true }, contextUser);
            return Array.isArray(rows) && rows.length === 1;
        } catch {
            return false;
        }
    }

    /**
     * Reverts atomic CAS state from 'Processing' back to 'Open' if order confirmation fails.
     */
    private static async revertSessionOpenAtomic(sessionID: string, md: Metadata, contextUser?: UserInfo): Promise<boolean> {
        try {
            const provider = (Metadata.Provider || (Metadata as unknown as { Provider: unknown }).Provider) as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                return false;
            }

            const entityInfo = md.Entities?.find(e => e.Name === CHECKOUT_SESSION_ENTITY);
            const schemaName = entityInfo?.SchemaName ?? '__mj_BizAppsOrders';
            const tableName = entityInfo?.BaseTable ?? 'CheckoutSession';

            const isPg = provider.PlatformKey === 'postgresql';
            const table = isPg ? `${schemaName}.${tableName}` : `[${schemaName}].[${tableName}]`;

            const sql = isPg
                ? `UPDATE ${table} SET "Status" = 'Open' WHERE "ID" = $1 AND "Status" = 'Processing' RETURNING "ID";`
                : `DECLARE @reverted TABLE (ID UNIQUEIDENTIFIER); UPDATE ${table} SET [Status] = 'Open' OUTPUT INSERTED.ID INTO @reverted WHERE [ID] = @p0 AND [Status] = 'Processing'; SELECT ID FROM @reverted;`;

            const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [sessionID], { isMutation: true }, contextUser);
            return Array.isArray(rows) && rows.length === 1;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[CheckoutSessionService] revertSessionOpenAtomic failed for session ${sessionID}: ${msg}`);
            return false;
        }
    }
}
