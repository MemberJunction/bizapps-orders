/**
 * subscription-renewal.checks.ts — the `subscription-renewal` bundle (SR1–SR97).
 *
 * `Orders.SpawnRenewals` closes the subscription lifecycle: `AutoRenew` and `RenewalLeadDays` were
 * columns with no consumer, so a subscription reached the end of its term and simply stopped.
 *
 * The behaviour under test is a SCHEDULED JOB, which raises stakes ordinary code does not have —
 * it runs unattended, repeatedly, against live customers. So most of these checks are about what it
 * must NOT do: not renew a cancelled subscription, not renew one the customer opted out of, not
 * renew twice, not renew early.
 *
 * WHAT IT PROVES
 *   SR1   a subscription expiring inside its lead window gets a confirmed renewal order
 *   SR2   the renewal appends a CONTIGUOUS term N+1 to the SAME subscription
 *   SR3   the renewal order books, and the new term recognizes over its own window
 *   SR4   a subscription not yet inside its lead window is left alone
 *   SR5   AutoRenew = false is never renewed
 *   SR6   a canceled subscription is never renewed
 *   SR7   running the job twice does not renew twice (idempotency)
 *   SR8   a RejectDuplicate type still renews itself
 *   SR9   Subscription.RenewalLeadDays overrides the type's default
 *   SR10  Preview reports what is due without placing anything
 *   SR11  the renewal LINE links back via RenewsSubscriptionID and logs a lifecycle event
 *   SR12  the Action the scheduler dispatches reaches the operation and places the renewal
 *   SR13  Preview arrives from a scheduler as the STRING "true" and still writes nothing
 *   SR14  the schedule points at this Action, and ships disabled and set to preview
 *   SR15  the renewal carries one Invoiced schedule row per company, due on the invoice day plus the
 *         customer's terms capped at the term start, and AR is dated the business day it was
 *         invoiced, never on the new term's first day (#305)
 *   SR16  a renewal of a product recognised at sale books Dr Unbilled / Cr Sales, then the invoice
 *         moves it to AR (Dr AR / Cr Unbilled)
 *   SR17  the same renewal with no Unbilled Receivable account linked is skipped with the reason,
 *         and nothing is booked
 *   SR18  a subscription renews again at the end of the term its first renewal booked
 *   SR19  a renewal drafted by hand for this cycle holds the job off
 *   SR20  a voided renewal order does not hold the job off
 *   SR21  cancelling a NoRefund subscription after the renewal is booked and invoiced cancels the
 *         renewal and keeps its money: no reversal order, and the invoiced amount stays on AR (#560)
 *
 *   What a renewal is priced at (golive #304):
 *   SR22  a first-term discount lapses: the renewal is at the undiscounted price with no discount
 *   SR23  CarryDiscountOnRenewal keeps the discount
 *   SR24  the increase comes from the subscription, else the product, else the nearest category up
 *         the chain, else the company, and a preview reports it without placing anything
 *   SR25  a live renewal applies the increase and shows base, increase and price on the order notes
 *         and the renewal event
 *   SR26  a price typed below list lapses back to the prior list price
 *   SR27  a product with an Active successor renews as the successor at its list price, and the
 *         subscription moves onto the successor
 *   SR28  a successor that is not Active is not renewed onto
 *   SR29  a renewal priced below today's list books without a concession hold
 *   SR30  a monthly term that crosses no anniversary renews with no increase
 *
 *   SR31  a prorated 10-seat first term renews at 10 seats, not the line's prorated quantity (#589)
 *   Promotions that carry into renewals (#289):
 *   SR32  a promotion with AppliesToRenewals set discounts the renewal, at the renewal price the pass
 *         wrote and without a concession hold; the preview, notes and event report it
 *   SR33  a promotion without the flag does not carry: the renewal is at full price
 *   SR34  a flagged promotion that is paused, or past its EffectiveTo, is reported unusable with the
 *         reason, and the renewal is placed at full price
 *   Charging the renewal card (#289), through the Stripe stub and Stripe's own test card names:
 *   SR35  a subscription with a renewal card renews with its one schedule row due on the term start,
 *         and booking the renewal calls no gateway
 *   SR36  the card is charged on the term start and captured against the renewal order, dated the
 *         gateway's business day, with a PaymentSucceeded event naming the payment; nothing the day before
 *   SR37  running the pass twice in a day charges once, for a paid order and for a declined one
 *   SR38  a declined card is retried on days 3, 7 and 11, each its own Failed intent and PaymentFailed
 *         event naming the attempt and the next day, and is not tried on any other day or after day 11
 *   SR39  an authentication demand on the off-session charge is recorded as a failed attempt
 *   SR40  a subscription without a renewal card keeps the invoice-day due date and is never charged
 *   SR41  the Action the scheduler dispatches previews from the STRING "true", then charges on "false"
 *   SR42  the charge schedule points at its Action, and ships disabled and set to preview
 *   SR43  a later settled-payment webhook for the charged intent books nothing more
 *   SR44  one order's fault does not stop the pass: the next order is still charged
 *
 *   The update-card link (#289):
 *   SR45  an order's first failed charge sends the link through the charge Action; its second does not
 *   SR46  the link opens a session on the renewal order that pays it: no new order, the balance
 *         cleared through the ordinary capture, and the session confirmed on the renewal order
 *   SR47  the link is refused once the renewal is paid, and a tampered link is refused outright
 *   SR48  a pay-renewal session cannot be drafted, so the renewal is never re-priced
 *
 *   Edge cases of the charge pass (#683):
 *   SR49  money the gateway took but no payment booked is booked after the last retry day, with
 *         automatic renewal off, and the card is not charged again
 *   SR50  the update-card link goes out only once the failed charge is recorded, so a rerun the same
 *         day never sends it twice
 *   SR51  the update-card link is refused once the subscription is cancelled
 *   SR52  on a gift, the link's payment and new card are the buyer's who owns the declined card;
 *         the renewal still bills the beneficiary
 *
 *   Subscriptions a gateway bills itself (option E, E1): `ProviderSubscriptionID` set means the gateway
 *   named by `PaymentProviderID` renews it, so Orders' jobs leave it alone, keyed on that marker only:
 *   SR54  Spawn Renewals places no renewal for a provider-billed subscription; a sibling with no gateway
 *         id still renews, on an account whose BillsSubscriptions switch is ON
 *   SR55  Charge Renewals does not charge the renewal card of a provider-billed subscription, with the
 *         account's switch OFF; a sibling with no gateway id is charged the same day
 *   SR56  money taken but not booked is not captured either once the subscription is provider-billed
 *         (the settled-unbooked branch, which selects without AutoRenew)
 *   SR57  the database holds the marker's shape: one Orders subscription per (provider, gateway id),
 *         the same id under another provider account is allowed, and an id needs its provider
 *
 *   SR58  a subscription renewed at a price of zero books: the $0-line refusal leaves the renewal
 *         pass's own price alone (#954)
 *   SR59  a lead time changed on the subscription type is the one the job uses, and a subscription's
 *         own lead days still override it (bc-aidp-next-golive#349)
 *   SR60  a subscription moved to another type renews on that type's lead time (bc-aidp-next-golive#349)
 *
 *   Handing a subscription to the gateway that bills it (option E, E2), against a fake gateway driver
 *   (`ITGatewayBilling`) on a live account, so the database half runs for real and no gateway is called:
 *   SR61  created once, first charge 00:00 business time on the term's last day, recorded with its account;
 *         a second run and the checkout's order scope create nothing more; Spawn Renewals then skips it
 *   SR62  a gateway subscription an earlier run created (idempotency key long expired) is found by its
 *         metadata and recorded, never created twice
 *   SR63  refusals are visible and write nothing: no flagged price and a stub account each raise one
 *         Task (once, however often reported); switch off is silent; and the unlinked subscription
 *         still renews in Orders
 *   SR64  the daily pass: preview creates nothing; then it links the eligible one, defers a term that
 *         starts too late for the gateway, and leaves a subscription without automatic renewal alone
 *   SR65  Spawn Renewals, then this pass, then Charge Renewals, in the jobs' own order: the unpaid
 *         renewal term is NOT handed over; Charge Renewals collects it; the next pass hands over the
 *         term after it. No term is given away
 *   SR66  the real hook: a new buyer's checkout on an account that bills subscriptions ends with the
 *         gateway subscription created and recorded on the subscription the checkout sold, then the
 *         same buyer is refused a second subscription purchase at the draft. The checkout's capture and
 *         the hand-over run on isolated providers, which join this check's transaction through #950's
 *         `JoinCallerTransactionForTests`
 *   SR67  the returning-buyer refusal against real rows, both directions: a buyer the gateway bills is
 *         refused another subscription in that company; the same buyer in another company, someone
 *         else, a ticket, and a cancelled subscription are not
 *
 *   Once the gateway bills it, no Orders door changes it unseen:
 *   SR68  its billing columns cannot be edited through the object model (AutoRenew, Status, the gateway
 *         id); the same edit before it was linked saved, and a column the gateway does not bill on still saves
 *   SR69  cancelling stops the gateway FIRST: a gateway that refuses leaves Orders unchanged; one that
 *         confirms is told to charge nothing after coverage ends, and Orders records what it did
 *   SR70  a second order for the same product cannot extend it; once cancelled (the gateway with it), buying
 *         again is a fresh start: the old gateway id is retired and the hand-over creates a new one
 *   SR71  a return of the line that sold it, and a Duration concession on its term, are refused; an open
 *         gateway alert stops a cancel of a subscription whose gateway subscription went unrecorded
 *   SR72  every concession kind that changes the term (Duration, Shift, Seats, an amount change) is refused
 *         on a gateway-billed term, recorded through the object model as staff record them; the same four on
 *         an unlinked subscription are not refused for the gateway
 *   SR73  the gateway renews at 00:00 on the term's last day: a cancel later that day is refused with nothing
 *         changed and nothing asked of the gateway (it would keep the renewal it charged); once support ends it
 *         at the gateway, the cancel finishes in Orders, after the term too, at the coverage it sold
 *   SR74  a gateway id typed onto an existing subscription is refused, and the row stays unlinked; the
 *         hand-over's sanctioned link still records one
 *
 *   Hearing the gateway and booking what it did (E3 + E4 + E6), against the same fake gateway, which now also
 *   reports its invoices, charges and refunds and carries a staged webhook event:
 *   SR75  a renewal the gateway charged is booked once: term 2 the day after term 1, a confirmed ProviderPayment
 *         order on the subscription's product at what was charged, one payment keyed by the charge, the events
 *         and term 2's grants; a second sync does nothing; Spawn Renewals still places nothing
 *   SR76  charged on another price ($399 Foundation): the product is kept, the price is what was charged, and a
 *         person is told (RenewalAmountUnusual); a $1 renewal with a coupon is confirmed as charged, no Task, no hold
 *   SR77  a failed charge: one PaymentFailed event, no term, access kept to the end of the retry's business day
 *         (Q4); a rerun records nothing twice; the retry that collects books term 2 from the day after term 1
 *   SR78  the gateway gives up and ends it: cancelled at the end of term, the gateway asked nothing, nothing booked
 *   SR79  a portal cancel at period end turns automatic renewal off with its event (no Task); withdrawn, back on;
 *         set to end months before the coverage sold, a person is told and Orders keeps it
 *   SR80  ended now at the gateway (a dashboard cancel): an immediate cancel on the day it ended
 *   SR81  Q5: the gateway renews a subscription Orders cancelled: the SAME subscription reactivated with its
 *         gateway id, the renewal booked, one Task for support, never a second subscription
 *   SR82  the webhook: a renewal's event books it (Applied), the same event again is AlreadyApplied and books
 *         nothing; an unknown gateway subscription on a price Orders sells raises one Task however often it is
 *         reported; one on another price is not_ours with none
 *   SR83  linking: an id the gateway lacks, one it ended, another customer's, one recorded elsewhere are refused
 *         writing nothing; a preview writes nothing; the link books what the gateway charged; a second is refused
 *   SR84  controls: a subscription the gateway does not bill is not synced and Spawn Renewals still renews it; an
 *         account with its switch off changes nothing, and the first sync after it is on catches up
 *   SR85  E2b holds: an ordinary order, and a hand-made renewal line naming it, are refused; Charge Renewals
 *         charges nothing
 *   SR86  a $0 renewal is booked once at the last price 100% off, nothing owed; a refund the gateway made before
 *         the booking is booked once after the capture
 *   SR87  the nightly pass: preview reports and writes nothing; live, it books and reports
 *   SR88  the nightly sync Action and its schedule ship Disabled and in Preview; the link Action is registered
 *   SR89  an imported subscriber (Chicago): the year it already paid is never booked again, whether its payment
 *         records the charge (no intent) or nothing records it, through the link or the sanction; its next renewal is
 *   SR99  an imported FIRST-YEAR subscriber (current invoice subscription_create, its charge on the importer's
 *         payment) is in line: preview reports 0 differences for it; a creation charge nothing records, or recorded
 *         only on another subscription's payment or a Failed one, is still reported
 *   SR90  recording a cancel the gateway made is never blocked: an open RenewalNotBooked does not stop it; a
 *         refused attempt raises the non-blocking GatewayCancelNotRecorded; the next sync records it
 *   SR91  a renewal invoice with tax is not booked: urgent RenewalNotBooked, nothing written
 *   SR93  on the last day, once E4 booked term 2, a cancel is no longer refused: end of term ends with term 2 (the
 *         latest booked term) and stops the gateway there; Immediate cancels now
 *   SR94  the gateway charged the renewal and then ended it: booked, the cancel reverses only what the gateway
 *         refunded (nothing when it kept the charge), and a person is told (EndedAfterRenewal)
 *   SR95  booked, then ended at Stripe two days into term 2 with a partial or no refund: the recorded immediate
 *         cancel reverses exactly what Stripe refunded
 *   SR96  D20: a gateway refund on a renewal's charge credits that renewal order (nothing owed, access unchanged, a
 *         notice), once, whenever it lands; with a cancel before or after, the total credit is the refund; full or
 *         partial, the credit is applied ON the renewal (the credit-note model), which keeps its total
 *   SR97  two gateway renewals; the second's charge refunded and ended: each term reverses its OWN charge's
 *         refund (term 2 served: 0; term 3: 1,200), in one run and in two
 *   SR92-OT  two syncs of one paid renewal at once, each on its own provider (two workers): booked once
 *   SR98-OT  D20's two doors on one refund, committed: two refund deliveries at once on ONE provider; the refund
 *            door and the cancel door each reading the gateway before the other commits, in both orders: credited
 *            once, applied on the renewal (owes 0)
 *
 *   A line that bought several terms (golive #338):
 *   SR100  a 24-month line typed at 20,000 on a 12-month type renews for one 12-month term at 10,000, and the
 *         preview reports that term's dates, which the live renewal then books
 *
 *   Outside the harness transaction (#950):
 *   SR46-OT  SR46's payment, committed, so the capture runs on its own provider as in production
 *
 * Deterministic. Every check runs inside a rolled-back transaction, except SR46-OT and SR92-OT, which commit and
 * deletes its rows afterwards (`PurgeCheckoutRun`).
 */
import { BaseAction } from '@memberjunction/actions';
import type { RunActionParams } from '@memberjunction/actions-base';
import { BaseEntity, BaseRemotableOperation, CompositeKey, Metadata } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngine, Today, type CustomerPaymentMethodEntity } from '@mj-biz-apps/orders-entities';
import { AddDays, BusinessTimeZoneEngine, DayStartUtc } from '@mj-biz-apps/common-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    ACCT_SCHEMA,
    COMMON_SCHEMA,
    CreateOrdersFixture,
    CreateProductPrice,
    CreatePromotion,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    OutsideTransaction,
    PurgeCheckoutRun,
    SameID,
    type CheckoutRun,
    TeardownOrdersFixture,
    TxMaybeOne,
    AcknowledgeAmendmentsWith,
    createViaEntity,
    TxOne,
    TxQuery,
    upsertViaEntity,
} from '../fixture.js';
import {
    CHECKOUT_WIDGET_DISTRIBUTION_ENTITY,
    CHECKOUT_WIDGET_ENTITY,
    CUSTOMER_PAYMENT_METHOD_ENTITY,
    GL_ACCOUNT_LINK_ENTITY,
    ORDER_COMPANY_POLICY_ENTITY,
    ORDER_CONCESSION_ENTITY,
    PAYMENT_INTENT_ENTITY,
    PAYMENT_PROVIDER_ENTITY,
    PAYMENT_PROVIDER_PRICE_ENTITY,
    PAYMENT_PROVIDER_TYPE_ENTITY,
    PRODUCT_CATEGORY_ENTITY,
    PRODUCT_ENTITY,
    PROMOTION_ENTITY,
    SUBSCRIPTION_ENTITY,
    SUBSCRIPTION_TYPE_ENTITY,
    TASK_ENTITY,
} from '../entity-names.js';
import { BuildOrder, ConfirmOrder } from '../order-builder.js';
import { WithGatewayEndRecorded } from '@mj-biz-apps/orders-core-entities-server/testing';
import { grantAuthority } from './term-extension.checks.js';
import {
    BasePaymentProvider,
    ChargeRenewals,
    CheckoutSessionService,
    EnsureProviderSubscriptions,
    raiseProviderSubscriptionAlert,
    OneIntervalLaterAsStripeCounts,
    OneYearLaterAsStripeCounts,
    RunPrePurchaseChecks,
    StripePaymentProvider,
    type CancelProviderSubscriptionRequest,
    type CancelProviderSubscriptionResult,
    type CreateProviderSubscriptionRequest,
    type CreateProviderSubscriptionResult,
    type DescribeProviderPriceResult,
    type EnsureProviderSubscriptionsInput,
    type EnsureProviderSubscriptionsResult,
    type FindProviderSubscriptionsRequest,
    type FindProviderSubscriptionsResult,
    type DescribeProviderSubscriptionResult,
    type GatewayPriceInterval,
    type RetrieveIntentRequest,
    type RetrieveIntentResult,
    type GatewayRefund,
    type GatewaySubscriptionInvoice,
    type ListProviderSubscriptionInvoicesResult,
    type ListRefundsRequest,
    type ListRefundsResult,
    type RetrieveChargeRequest,
    type RetrieveChargeResult,
    type WebhookEvent,
    HandlePaymentWebhook,
    LinkProviderSubscription,
    SyncProviderSubscription,
    SyncProviderSubscriptions,
    type SyncProviderSubscriptionResult,
    BookProviderRenewal,
    BookProviderRefunds,
    CancelSubscriptionOperation,
    BuildPaymentProvider,
    LoadPaymentProviderConfig,
    type RenewalSubscription,
    ConfigureRenewalPaymentLinks,
    LoadRenewalPaymentOrder,
    OrdersSettings,
    ORDERS_SETTING,
    SanctionProviderBilledChange,
    SignRenewalPaymentToken,
    type ChargeRenewalsOutput,
} from '@mj-biz-apps/orders-core-entities-server';

/** Chart of accounts the fixture books against (same codes as payment-schedule.checks.ts). */
const AR_CODE = '11201';
const DEFERRED_CODE = '21301';
const SALES_CODE = '40100';
const UNBILLED_CODE = '11300';

/** Bought Jan 1 so an annual term ends Dec 31 — every date below reads off that. */
const JAN_1 = new Date('2026-01-01T00:00:00Z');

interface RenewalOutput {
    Success: boolean;
    Message?: string;
    Candidates: Array<{
        SubscriptionID: string;
        SubscriptionNumber: string;
        CurrentTermEnd: string;
        LeadDays: number;
        OrderID?: string;
        OrderNumber?: string;
        SkippedReason?: string;
        RenewalProductID?: string;
        BasePrice?: number;
        BasePriceSource?: string;
        IncreasePercent?: number;
        IncreaseSource?: string;
        UnitPrice?: number;
        DiscountPct?: number;
        RenewalTermStart?: string;
        RenewalTermEnd?: string;
        RenewalPromotionCodes?: string[];
        UnusableRenewalPromotionCodes?: Array<{ Code: string; Reason: string }>;
    }>;
    Placed: number;
    Skipped: number;
}

async function spawnRenewals(
    ctx: IntegrationCheckContext,
    input: Record<string, unknown>,
): Promise<RenewalOutput> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<Record<string, unknown>, RenewalOutput>
    >(BaseRemotableOperation, 'Orders.SpawnRenewals');
    Assert(op != null, "'Orders.SpawnRenewals' is not registered");

    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(
        result.Success,
        `the operation did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`,
    );
    Assert(result.Output != null, 'the operation returned no payload');
    return result.Output as RenewalOutput;
}

/** Buy a subscription on Jan 1 and return its ID and first term. */
async function buySubscription(
    ctx: IntegrationCheckContext,
    productKey: string,
    price: number,
    discountPct?: number,
    promotionCodes?: string[],
    organizationID?: string,
    billToPersonID?: string,
) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: JAN_1,
        BillToOrganizationID: organizationID ?? f.Customers.OrganizationID,
        BillToPersonID: billToPersonID,
        Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: price, DiscountPct: discountPct }],
        PromotionCodes: promotionCodes,
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);

    const term = await TxOne<{ ID: string; SubscriptionID: string; EndDate: string; TermNumber: number }>(
        ctx,
        `SELECT st.ID, st.SubscriptionID, st.EndDate, st.TermNumber
         FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
         JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
         WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
    );
    return { OrderID: result.Order.ID as string, SubscriptionID: term.SubscriptionID, Term: term };
}

/** All terms on a subscription, oldest first. */
const termsOf = (ctx: IntegrationCheckContext, subscriptionID: string) =>
    TxQuery<{ ID: string; TermNumber: number; StartDate: string; EndDate: string; Amount: number }>(
        ctx,
        `SELECT ID, TermNumber, StartDate, EndDate, Amount FROM ${ORDERS_SCHEMA}.SubscriptionTerm
         WHERE SubscriptionID = '${subscriptionID}' ORDER BY TermNumber`,
    );

const isoDate = (v: string | Date) => new Date(v).toISOString().slice(0, 10);

/** The one line of a renewal order. */
const renewalLine = (ctx: IntegrationCheckContext, orderID: string) =>
    TxOne<{ ProductID: string; UnitPrice: number; DiscountPct: number }>(
        ctx,
        `SELECT ProductID, UnitPrice, DiscountPct FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`,
    );

/** A date `days` before the given one — used to sit just inside or outside a lead window. */
function daysBefore(date: string, days: number): string {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

/** A renewal of this subscription saved as a Draft, dated the day after the term ends. */
async function draftRenewal(ctx: IntegrationCheckContext, subscriptionID: string, termEnd: string) {
    const f = Fx();
    const built = await BuildOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: new Date(daysBefore(termEnd, -1)),
        BillToOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200, RenewsSubscriptionID: subscriptionID }],
    });
    Assert(await built.Order.Save(), `saving the draft renewal failed: ${built.Order.LatestResult?.CompleteMessage}`);
    return built.Order;
}

/** `Orders.CancelSubscription`, resolved through the ClassFactory as any caller does. */
async function cancelSubscription(
    ctx: IntegrationCheckContext,
    input: Record<string, unknown>,
): Promise<{ Success: boolean; Message?: string; TotalRefundAmount?: number; ReversalOrderID?: string }> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<Record<string, unknown>, { Success: boolean; Message?: string; TotalRefundAmount?: number; ReversalOrderID?: string }>
    >(BaseRemotableOperation, 'Orders.CancelSubscription');
    Assert(op != null, "'Orders.CancelSubscription' is not registered");
    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`);
    Assert(result.Output != null, 'the operation returned no payload');
    return result.Output!;
}

/** The key both the Action metadata and the `@RegisterClass` decorator name. */
const ACTION_DRIVER_CLASS = 'Orders.SpawnRenewals';

/**
 * Run the renewal Action the way the scheduler runs it — resolved from the ClassFactory under the
 * key the metadata names, with every parameter a STRING, because that is what a `ScheduledJob`
 * Configuration stores. Importing the class instead would prove the code works and prove nothing
 * about whether the scheduler can find it or survive its own encoding.
 */
async function spawnRenewalsViaAction(
    ctx: IntegrationCheckContext,
    inputs: Record<string, string>,
): Promise<{ Success: boolean; ResultCode?: string; Message?: string; Placed: number; Skipped: number; Candidates: RenewalOutput['Candidates'] }> {
    // TryCreateInstance, not CreateInstance. `CreateInstance` does not return null for an
    // unregistered key — it hands back `new BaseAction()`, because `abstract` is erased at runtime
    // and BaseAction carries no @RequiresSubclass marker. A `!= null` assert can therefore never
    // fire, and a missing Load anchor would surface as a TypeError from `.Run()` about
    // InternalRunAction rather than as the one sentence that names the cause.
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAction>(BaseAction, ACTION_DRIVER_CLASS);
    Assert(
        resolved.Resolved && resolved.Instance != null,
        `'${ACTION_DRIVER_CLASS}' is not registered — the Load anchor is missing from the server bootstrap${resolved.Reason ? `: ${resolved.Reason}` : ''}`,
    );
    const action = resolved.Instance!;

    const params = {
        ContextUser: ctx.User,
        Provider: ctx.Provider,
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' as const })),
        Filters: [],
    } as unknown as RunActionParams;

    const result = await action.Run(params);
    const output = <T,>(name: string): T | undefined =>
        params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value as T | undefined;

    return {
        Success: result.Success,
        ResultCode: result.ResultCode,
        Message: result.Message,
        Placed: Number(output<number>('Placed') ?? 0),
        Skipped: Number(output<number>('Skipped') ?? 0),
        Candidates: output<RenewalOutput['Candidates']>('Candidates') ?? [],
    };
}

export const SubscriptionRenewalChecks: NamedCheck[] = [
    {
        Id: 'subscription-renewal.SR1',
        Name: 'SR1: a subscription inside its lead window gets a renewal order',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // AnnualRolling: 90 lead days. Term runs 2026-01-01 → 2026-12-31.
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const out = await spawnRenewals(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                AssertEqual(out.Candidates.length, 1, 'candidates');
                AssertEqual(Number(out.Candidates[0].LeadDays), 90, "lead days from the type's default");
                Assert(
                    /^ORD-\d{6}$/.test(out.Candidates[0].OrderNumber ?? ''),
                    `the renewal gets a real order number, got '${out.Candidates[0].OrderNumber}'`,
                );
            }),
    },
    {
        Id: 'subscription-renewal.SR2',
        Name: 'SR2: the renewal appends a contiguous term to the same subscription',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'the subscription now has two terms');
                AssertEqual(Number(terms[1].TermNumber), 2, 'the new term number');

                // Contiguous: coverage must not gap, or the customer is uninsured for a day.
                AssertEqual(
                    isoDate(terms[1].StartDate),
                    isoDate(daysBefore(terms[0].EndDate, -1)),
                    'term 2 starts the day after term 1 ends',
                );
                AssertEqual(isoDate(terms[1].EndDate), '2027-12-31', 'a full further year');
                AssertEqual(Number(terms[1].Amount), 1200, 'renewed at the price last paid');
            }),
    },
    {
        Id: 'subscription-renewal.SR3',
        Name: 'SR3: the renewal books and recognizes over the new term',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const renewalOrderID = out.Candidates[0].OrderID!;

                // Billed by its one-row schedule (#305, D92): the value entry is the instalment's
                // invoice, raised inside the confirm, not a booking entry on the line.
                const billing = await TxOne<{ EntryType: string; D: number }>(
                    ctx,
                    `SELECT (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType,
                            (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine WHERE JournalEntryID = je.ID) AS D
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ACCT_SCHEMA}.vwJournalEntries je ON je.ID = ps.JournalEntryID
                     WHERE ps.OrderHeaderID = '${renewalOrderID}'`,
                );
                AssertEqual(billing.EntryType, 'InstalmentInvoice', 'the renewal is billed by its instalment invoice');
                AssertEqual(Number(billing.D), 1200, 'billed amount');

                // Recognition anchors to the NEW term and is dated into its window (D14/D46) —
                // invoicing ahead of the period must not recognize ahead of it.
                const terms = await termsOf(ctx, SubscriptionID);
                const releases = await TxQuery<{ EffectiveDate: string; D: number }>(
                    ctx,
                    `SELECT je.EffectiveDate,
                            (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine WHERE JournalEntryID = je.ID) AS D
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition' AND je.LinkedRecordID = '${terms[1].ID}'`,
                );
                AssertEqual(releases.length, 12, 'monthly releases over the renewed year');
                AssertEqual(
                    Math.round(releases.reduce((t, r) => t + Number(r.D), 0) * 100) / 100,
                    1200,
                    'releases sum to the renewed term',
                );
                Assert(
                    releases.every((r) => isoDate(r.EffectiveDate) >= isoDate(terms[1].StartDate)),
                    'no release may fall before the term it earns',
                );
            }),
    },
    {
        Id: 'subscription-renewal.SR4',
        Name: 'SR4: a subscription outside its lead window is left alone',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // 150 days out, with a 90-day lead — renewing here would invoice two months early.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 150) });
                AssertEqual(out.Placed, 0, `nothing should be placed yet: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not even a candidate');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'still one term');
            }),
    },
    {
        Id: 'subscription-renewal.SR5',
        Name: 'SR5: a subscription with AutoRenew off is never renewed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET AutoRenew = 0 WHERE ID = '${SubscriptionID}'`,
                );

                // AutoRenew is the consent switch: without it the system has no standing authority
                // to bill again, so the term simply ends.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `opted out, so nothing may be placed: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not a candidate at all');
            }),
    },
    {
        Id: 'subscription-renewal.SR6',
        Name: 'SR6: a canceled subscription is never renewed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET Status = 'Canceled' WHERE ID = '${SubscriptionID}'`,
                );

                // Resurrecting a cancelled subscription by an unattended job is the single worst
                // thing this operation could do.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `a canceled subscription must not renew: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not a candidate at all');
            }),
    },
    {
        Id: 'subscription-renewal.SR7',
        Name: 'SR7: running the job twice does not renew twice',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 10);

                const first = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(first.Placed, 1, `first pass places one: ${first.Message}`);

                // A scheduled job runs every day. Double-billing a customer because yesterday's pass
                // already renewed them is the failure this guards.
                const second = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(second.Placed, 0, `second pass must place nothing: ${second.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'still exactly two terms');

                const orders = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(orders.length, 1, 'exactly one renewal line exists');
            }),
    },
    {
        Id: 'subscription-renewal.SR8',
        Name: 'SR8: a RejectDuplicate type still renews itself',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SubFiscal is ConcurrencyMode=RejectDuplicate. That rule answers "may this
                // subscriber hold a SECOND concurrent subscription?" — a renewal is not a second
                // one, it is this one continuing. Without the IsRenewal bypass the type would
                // refuse to renew itself, every cycle, silently.
                // SubFiscal's engine price, so the stated 900 is not a concession the confirm gate holds.
                await CreateProductPrice(ctx, Fx().Products.SubFiscal, 900);
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubFiscal', 900);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `a RejectDuplicate type must still renew: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'the renewal extended rather than being refused');

                const subs = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${SubscriptionID}'`,
                );
                AssertEqual(subs.length, 1, 'and did not create a second subscription');
            }),
    },
    {
        Id: 'subscription-renewal.SR9',
        Name: "SR9: the subscription's own lead days override the type's default",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                // The type says 90; this subscription says 150 — the NULL-means-inherit rule the
                // schema documents, exercised in its non-NULL direction. 120 days out is OUTSIDE
                // the type's window and INSIDE the override's, so only the override can explain a
                // renewal here.
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET RenewalLeadDays = 150 WHERE ID = '${SubscriptionID}'`,
                );

                const asOf = daysBefore(Term.EndDate, 120);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(out.Placed, 1, `120 days out is inside a 150-day window: ${out.Message}`);
                AssertEqual(Number(out.Candidates[0].LeadDays), 150, 'the override was applied, not the default');
            }),
    },
    {
        Id: 'subscription-renewal.SR59',
        Name: "SR59: a lead time changed on the subscription type is the one the job uses; the subscription's own still overrides it",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Lead time is set per subscription type, and finance edits it on the type's form, so a
                // changed value must reach the next pass with no other change. AnnualRolling ships at 90;
                // set it to 30.
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const typeID = Fx().SubscriptionTypeIDs.get('AnnualRolling');
                Assert(typeID != null, 'AnnualRolling subscription type missing');
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.SubscriptionType SET RenewalLeadDays = 30 WHERE ID = '${typeID}'`,
                );

                // 60 days out is inside the shipped 90-day window and outside the new 30-day one.
                const early = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 60), Preview: true });
                AssertEqual(early.Candidates.length, 0, "60 days out is outside the type's 30-day window");

                const due = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 20), Preview: true });
                AssertEqual(due.Candidates.length, 1, "20 days out is inside the type's 30-day window");
                AssertEqual(Number(due.Candidates[0].LeadDays), 30, "the type's changed lead time");

                // A value on the subscription still wins over the type's.
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET RenewalLeadDays = 45 WHERE ID = '${SubscriptionID}'`,
                );
                const overridden = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 40), Preview: true });
                AssertEqual(overridden.Candidates.length, 1, "40 days out is inside the subscription's 45-day window");
                AssertEqual(Number(overridden.Candidates[0].LeadDays), 45, "the subscription's lead time, not the type's");
            }),
    },
    {
        Id: 'subscription-renewal.SR60',
        Name: "SR60: a subscription moved to another subscription type renews on that type's lead time",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Products that need a different lead time get a type carrying it, and their existing
                // subscriptions are moved onto that type. The job reads the type the subscription has
                // now, not the one it was bought on. FiscalYearJul ships at 120 days; AnnualRolling at 90.
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const fiscalID = Fx().SubscriptionTypeIDs.get('FiscalYearJul');
                Assert(fiscalID != null, 'FiscalYearJul subscription type missing');
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET SubscriptionTypeID = '${fiscalID}' WHERE ID = '${SubscriptionID}'`,
                );

                // 110 days out is outside AnnualRolling's 90-day window and inside FiscalYearJul's 120.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 110), Preview: true });
                AssertEqual(out.Candidates.length, 1, "110 days out is inside the new type's 120-day window");
                AssertEqual(Number(out.Candidates[0].LeadDays), 120, "the new type's lead time");
            }),
    },
    {
        Id: 'subscription-renewal.SR10',
        Name: 'SR10: Preview reports what is due without placing anything',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const out = await spawnRenewals(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: true,
                });
                AssertEqual(out.Placed, 0, 'a preview places nothing');
                AssertEqual(out.Candidates.length, 1, 'but still reports what is due');
                Assert(out.Candidates[0].OrderID == null, 'no order id on a preview');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'no term was created');
                const orders = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(orders.length, 0, 'no order was placed');
            }),
    },
    {
        Id: 'subscription-renewal.SR11',
        Name: 'SR11: the renewal order links back to the subscription and logs an event',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);

                // A system-placed order must be traceable to what caused it — otherwise an
                // unexplained invoice appears on the customer's account with no origin.
                // The marker lives on the LINE now (D61) — renewal is a per-line act, so one order
                // could renew several subscriptions and a header-level pointer could not say so.
                const order = await TxOne<{ RenewsSubscriptionID: string; OrderType: string; Notes: string }>(
                    ctx,
                    `SELECT ol.RenewsSubscriptionID, o.OrderType, o.Notes
                     FROM ${ORDERS_SCHEMA}.OrderHeader o
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.OrderHeaderID = o.ID
                     WHERE o.ID = '${out.Candidates[0].OrderID}'`,
                );
                Assert(SameID(order.RenewsSubscriptionID, SubscriptionID), 'the line names the subscription it renews');
                AssertEqual(order.OrderType, 'Sale', 'a renewal is an ordinary sale');
                Assert(/renewal/i.test(order.Notes ?? ''), `the note explains its origin: ${order.Notes}`);

                const event = await TxOne<{ EventType: string; EventData: string; RelatedOrderHeaderID: string }>(
                    ctx,
                    `SELECT EventType, EventData, RelatedOrderHeaderID FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID = '${SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                );
                Assert(
                    SameID(event.RelatedOrderHeaderID, out.Candidates[0].OrderID),
                    'the event links to the order it spawned',
                );
                const data = JSON.parse(event.EventData) as Record<string, unknown>;
                AssertEqual(Number(data.LeadDays), 90, `the event records the lead time applied: ${event.EventData}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR12',
        Name: 'SR12: the Action the scheduler dispatches places the renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // SR1 already proves the operation renews. What is unproven until here is the only
                // thing the schedule actually depends on: that the Action reaches it. The operation
                // has been correct and uncalled since it was written — a shim that silently does
                // nothing would reproduce exactly the symptom this bundle exists to prevent.
                const out = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                });
                Assert(out.Success, `the action did not run: ${out.ResultCode} ${out.Message}`);
                AssertEqual(out.Placed, 1, `expected one renewal through the action: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'and the term it bought is on the subscription');
            }),
    },
    {
        Id: 'subscription-renewal.SR13',
        Name: 'SR13: Preview survives the scheduler storing it as the string "true"',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // A ScheduledJob stores every parameter as text, so a job configured for preview
                // hands the action the STRING "true" — and "false" is a truthy string. Read as a
                // plain boolean, a job set to preview bills real customers, and it does it on the
                // one run nobody expected to write anything.
                const out = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: 'true',
                });
                Assert(out.Success, `the action did not run: ${out.ResultCode} ${out.Message}`);
                AssertEqual(out.ResultCode, 'PREVIEWED', 'and it reports the run as a preview');
                AssertEqual(out.Placed, 0, 'a preview places nothing');
                AssertEqual(out.Candidates.length, 1, 'but still reports what is due');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'no term was created');

                // The other half of the trap: "false" must not read as truthy either.
                const live = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: 'false',
                });
                AssertEqual(live.Placed, 1, `"false" means place them: ${live.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR14',
        Name: 'SR14: the schedule points at the action, and ships disabled and set to preview',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const action = await TxMaybeOne<{ ID: string; DriverClass: string; Status: string }>(
                    ctx,
                    `SELECT ID, DriverClass, Status FROM __mj.Action WHERE Name = 'Spawn Renewals'`,
                );
                Assert(action != null, 'the action row exists — push the app metadata if not');
                AssertEqual(action!.Status, 'Active', 'and it is active');
                AssertEqual(action!.DriverClass, ACTION_DRIVER_CLASS, 'pointing at the registered key');

                const job = await TxMaybeOne<{ Configuration: string; Status: string; CronExpression: string }>(
                    ctx,
                    `SELECT Configuration, Status, CronExpression FROM __mj.ScheduledJob WHERE Name = N'Orders — Spawn Renewals (daily)'`,
                );
                Assert(job != null, 'the scheduled job row exists — push the app metadata if not');

                // The failure this catches is the expensive one: a job whose Configuration names an
                // ActionID that no longer exists runs every night, fails every night, and renews
                // nobody — which looks exactly like the subscriptions not being due yet.
                const config = JSON.parse(job!.Configuration ?? '{}') as { ActionID?: string; Params?: Array<{ ActionParamID: string; Value: string }> };
                Assert(
                    config.ActionID != null && SameID(config.ActionID, action!.ID),
                    `the job's Configuration names this action: ${job!.Configuration}`,
                );

                // Shipping it live would start billing customers on whatever day this metadata
                // reached a host, with nobody having read the list first. Going live is a decision,
                // not a deployment.
                AssertEqual(job!.Status, 'Disabled', 'and it ships disabled');

                const previewParam = await TxMaybeOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM __mj.ActionParam WHERE ActionID = '${action!.ID}' AND Name = 'Preview'`,
                );
                Assert(previewParam != null, 'the Preview parameter is declared');
                const configured = config.Params?.find((p) => SameID(p.ActionParamID, previewParam!.ID));
                AssertEqual(String(configured?.Value), 'true', `and the job is configured for preview: ${job!.Configuration}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR15',
        Name: 'SR15: the renewal is invoiced on the pass day through a one-row schedule, and AR is not dated on the term start',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Net 30 for the seller, and a pass 60 days out, so invoice day + 30 lands before
                // the term start and the cap does not decide the date (#305 review item 1).
                await setCompanyDefaultTerms(ctx, 'Net30');
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 60);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const orderID = out.Candidates[0].OrderID!;
                const header = await TxOne<{ OrderDate: string; DueDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), OrderDate, 23) AS OrderDate, CONVERT(varchar(10), DueDate, 23) AS DueDate
                     FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`,
                );
                AssertEqual(header.DueDate, daysBefore(header.OrderDate, -30), 'precondition: the order resolved Net 30');

                const companies = await TxQuery<{ CompanyID: string }>(
                    ctx,
                    `SELECT DISTINCT CompanyID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`,
                );
                const rows = await TxQuery<{ CompanyID: string; InstallmentNumber: number; DueDate: string; Amount: number; Status: string; DocumentNumber: string | null; InvoicedAt: string | null }>(
                    ctx,
                    `SELECT CompanyID, InstallmentNumber, CONVERT(varchar(10), DueDate, 23) AS DueDate, Amount, Status,
                            DocumentNumber, CONVERT(varchar(40), InvoicedAt, 127) AS InvoicedAt
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'`,
                );
                AssertEqual(rows.length, companies.length, 'exactly one schedule row per company on the renewal');
                const row = rows[0];
                Assert(SameID(row.CompanyID, companies[0].CompanyID), 'the row bills the line company');
                AssertEqual(Number(row.InstallmentNumber), 1, 'a single instalment');
                AssertEqual(Number(row.Amount), 1200, 'for the whole renewal');
                AssertEqual(row.DueDate, daysBefore(asOf, -30), 'due on the invoice day plus the customer terms');
                AssertEqual(row.Status, 'Invoiced', 'issued inside the confirm');
                Assert(!!row.DocumentNumber, 'with an invoice number');
                Assert(row.InvoicedAt != null, 'and an invoice timestamp');

                // Every AR line the order raised, from confirm (line entries) and from the instalment.
                const ar = await TxQuery<{ EffectiveDate: string; DebitAmount: number; CreditAmount: number }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), je.EffectiveDate, 23) AS EffectiveDate, jel.DebitAmount, jel.CreditAmount
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE gl.Code = '${AR_CODE}'
                       AND (je.ID IN (SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
                         OR je.ID IN (SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'))`,
                );
                // The BUSINESS day the instalment was issued (#209), which is what the entry is
                // dated by — not the UTC day of the InvoicedAt instant.
                const invoiceDay = Today();
                const orderDay = isoDate(daysBefore(Term.EndDate, -1));
                AssertEqual(
                    Math.round(ar.reduce((t, l) => t + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0) * 100) / 100,
                    1200,
                    `the renewal is a receivable of its whole value: ${JSON.stringify(ar)}`,
                );
                Assert(ar.every((l) => l.EffectiveDate === invoiceDay), `all AR is dated the invoice day ${invoiceDay}: ${JSON.stringify(ar)}`);
                Assert(invoiceDay !== orderDay, `the check needs the invoice day and the order date apart (${invoiceDay})`);
                Assert(!ar.some((l) => l.EffectiveDate === orderDay), `no AR on the order date ${orderDay}`);

                // D92 rule 1: nothing is recognised yet, so the invoice credits Deferred for all of it.
                const deferred = await TxOne<{ C: number }>(
                    ctx,
                    `SELECT SUM(ISNULL(jel.CreditAmount, 0) - ISNULL(jel.DebitAmount, 0)) AS C
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ps.JournalEntryID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE ps.OrderHeaderID = '${orderID}' AND gl.Code = '${DEFERRED_CODE}'`,
                );
                AssertEqual(Number(deferred.C), 1200, 'the invoice credits Deferred Revenue for the whole renewal');

                // THE CAP. A second subscription renewed 10 days out: invoice day + 30 would be past
                // the term start, so the row is due on the order date instead — and still issued.
                // A different product: a second SubRolling for the same buyer stacks onto the first.
                const second = await buySubscription(ctx, 'SubCalendar', 1200);
                const lateAsOf = daysBefore(second.Term.EndDate, 10);
                const late = await spawnRenewals(ctx, { SubscriptionID: second.SubscriptionID, AsOfDate: lateAsOf });
                AssertEqual(late.Placed, 1, `expected the second renewal: ${late.Message} ${late.Candidates[0]?.SkippedReason ?? ''}`);
                const capped = await TxOne<{ DueDate: string; Status: string; OrderDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), ps.DueDate, 23) AS DueDate, ps.Status, CONVERT(varchar(10), oh.OrderDate, 23) AS OrderDate
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ORDERS_SCHEMA}.OrderHeader oh ON oh.ID = ps.OrderHeaderID
                     WHERE ps.OrderHeaderID = '${late.Candidates[0].OrderID}'`,
                );
                AssertEqual(capped.DueDate, capped.OrderDate, 'capped at the order date');
                Assert(daysBefore(lateAsOf, -30) > capped.OrderDate, 'the check needs invoice day + 30 past the term start');
                AssertEqual(capped.Status, 'Invoiced', 'and confirm still issued it');
            }),
    },
    {
        Id: 'subscription-renewal.SR16',
        Name: 'SR16: a renewal of a product recognised at sale books to Unbilled, then the invoice moves it to AR',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await withUpFrontRecognition(ctx, Fx().Products.SubRolling, () =>
                    spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) }),
                );
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const orderID = out.Candidates[0].OrderID!;

                const booking = await ledgerOf(ctx, `SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`);
                AssertEqual(netOn(booking, UNBILLED_CODE), 1200, `confirm debits Unbilled 1,200: ${JSON.stringify(booking)}`);
                AssertEqual(netOn(booking, SALES_CODE), -1200, 'and credits Sales 1,200');
                AssertEqual(netOn(booking, AR_CODE), 0, 'with no AR at confirm');

                const invoice = await ledgerOf(ctx, `SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'`);
                AssertEqual(netOn(invoice, AR_CODE), 1200, `the invoice debits AR 1,200: ${JSON.stringify(invoice)}`);
                AssertEqual(netOn(invoice, UNBILLED_CODE), -1200, 'and credits Unbilled 1,200');
                AssertEqual(netOn(invoice, DEFERRED_CODE), 0, 'with nothing deferred');
            }),
    },
    {
        Id: 'subscription-renewal.SR17',
        Name: 'SR17: with no Unbilled Receivable linked, that renewal is skipped with the reason and nothing is booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await withUnbilledUnlinked(ctx, () =>
                    withUpFrontRecognition(ctx, Fx().Products.SubRolling, () =>
                        spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) }),
                    ),
                );
                AssertEqual(out.Placed, 0, `nothing is placed: ${out.Message}`);
                AssertEqual(out.Skipped, 1, 'the subscription is reported as skipped');
                const reason = out.Candidates[0].SkippedReason ?? '';
                Assert(reason.includes('Unbilled Receivable'), `the reason names the missing account: ${reason}`);
                Assert(reason.includes(out.Candidates[0].SubscriptionNumber), `and the subscription: ${reason}`);

                const renewalLines = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(Number(renewalLines.N), 0, 'no renewal order survives');
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 1, 'and no new term');
            }),
    },
    {
        Id: 'subscription-renewal.SR18',
        Name: 'SR18: a subscription renews again at the end of the term its first renewal booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const first = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(first.Placed, 1, `first cycle places one: ${first.Message}`);
                const second = (await termsOf(ctx, SubscriptionID))[1];
                Assert(second != null, 'the first renewal booked term 2');

                // The first renewal's line still names the subscription. It must not read as this
                // cycle's renewal, or every subscription stops after renewing once.
                const next = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(second.EndDate, 10) });
                AssertEqual(next.Placed, 1, `second cycle places one: ${next.Message} ${next.Candidates[0]?.SkippedReason ?? ''}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 3, 'three terms');
                AssertEqual(terms[2].TermNumber, 3, 'the new term is term 3');
                AssertEqual(
                    isoDate(terms[2].StartDate),
                    isoDate(daysBefore(second.EndDate, -1)),
                    'term 3 starts the day after term 2 ends',
                );

                const again = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(second.EndDate, 10) });
                AssertEqual(again.Placed, 0, `re-running the second cycle places nothing: ${again.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR19',
        Name: 'SR19: a renewal drafted by hand for this cycle holds the job off',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const draft = await draftRenewal(ctx, SubscriptionID, Term.EndDate);

                // A person is already renewing this cycle. A second, automatic order would bill
                // the customer twice once theirs is confirmed.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `a drafted renewal must hold the job off: ${out.Message}`);
                Assert(
                    /already exists/.test(out.Candidates[0]?.SkippedReason ?? ''),
                    `and says why: ${out.Candidates[0]?.SkippedReason}`,
                );
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 1, 'no term was added');
                Assert(draft.ID != null, 'the draft is still there');
            }),
    },
    {
        Id: 'subscription-renewal.SR20',
        Name: 'SR20: a voided renewal order does not hold the job off',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const draft = await draftRenewal(ctx, SubscriptionID, Term.EndDate);
                draft.Status = 'Voided';
                Assert(await draft.Save(), `voiding the draft failed: ${draft.LatestResult?.CompleteMessage}`);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `a voided renewal renews nothing, so the job places one: ${out.Message}`);
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 2, 'term 2 was added');
            }),
    },
    {
        Id: 'subscription-renewal.SR21',
        Name: 'SR21: a NoRefund cancel after the renewal is invoiced keeps the renewal\'s money',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // AnnualRolling: EndOfTerm, NoRefund. Term 1 rides out; term 2 never starts.
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 30) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const renewalID = out.Candidates[0].OrderID!;
                const renewalLine = await TxOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${renewalID}'`,
                );
                const invoiced = await TxOne<{ Status: string }>(
                    ctx,
                    `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${renewalID}'`,
                );
                AssertEqual(invoiced.Status, 'Invoiced', 'precondition: the renewal is billed by its one-row schedule');

                const cancelled = await cancelSubscription(ctx, { SubscriptionID, RequestDate: daysBefore(Term.EndDate, 21) });
                Assert(cancelled.Success, `the cancel must succeed: ${cancelled.Message}`);
                AssertEqual(cancelled.TotalRefundAmount, 0, 'a NoRefund type keeps the invoiced renewal');
                AssertEqual(cancelled.ReversalOrderID ?? null, null, 'nothing is reversed, so no reversal order is booked');

                const terms = await TxQuery<{ TermNumber: number; Status: string }>(
                    ctx,
                    `SELECT TermNumber, Status FROM ${ORDERS_SCHEMA}.SubscriptionTerm
                     WHERE SubscriptionID = '${SubscriptionID}' ORDER BY TermNumber`,
                );
                AssertEqual(terms.map((t) => t.Status).join(','), 'Completed,Canceled', 'term 1 rides out, term 2 is canceled');

                const reversals = await TxQuery<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE ReversesOrderLineID = '${renewalLine.ID}'`,
                );
                AssertEqual(reversals.length, 0, 'nothing reverses the renewal line');
                const billed = await TxOne<{ BilledToDate: number }>(
                    ctx,
                    `SELECT BilledToDate FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${renewalLine.ID}'`,
                );
                AssertEqual(Number(billed.BilledToDate), 1200, 'the invoiced renewal stays billed, so it stays on AR');
            }),
    },
    // ─── What a renewal is priced at (golive #304) ──────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR22',
        Name: 'SR22: a first-term discount lapses at renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200, 0.2);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const c = out.Candidates[0];
                AssertEqual(c.BasePriceSource, 'PriorPrice', 'the base is the prior unit price');

                const line = await renewalLine(ctx, c.OrderID!);
                AssertEqual(Number(line.UnitPrice), 1200, 'the undiscounted price');
                AssertEqual(Number(line.DiscountPct), 0, 'the discount lapsed');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 1200, 'term 2 at full price');
            }),
    },
    {
        Id: 'subscription-renewal.SR23',
        Name: 'SR23: CarryDiscountOnRenewal keeps the discount',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200, 0.2);
                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, SubscriptionID, { CarryDiscountOnRenewal: true });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const line = await renewalLine(ctx, out.Candidates[0].OrderID!);
                AssertEqual(Number(line.DiscountPct), 0.2, 'the discount continues');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 960, '1200 less 20%');
            }),
    },
    {
        Id: 'subscription-renewal.SR24',
        Name: 'SR24: the increase is the most specific level set, and a preview reports it',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 10);
                const preview = async () => (await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf, Preview: true })).Candidates[0];

                let c = await preview();
                AssertEqual(c.IncreaseSource, 'None', 'nothing set: no increase');
                AssertEqual(Number(c.UnitPrice), 1200, 'no increase: the prior price');

                await upsertViaEntity(ctx, ORDER_COMPANY_POLICY_ENTITY, f.CoA.ID, { RenewalIncreasePercent: 3 });
                c = await preview();
                AssertEqual(c.IncreaseSource, 'Company', 'the company default');
                AssertEqual(Number(c.UnitPrice), 1236, '1200 + 3%');

                // The product's category is Individual, under Memberships: set only the parent.
                const categories = await TxOne<{ CategoryID: string; ParentID: string }>(
                    ctx,
                    `SELECT c.ID AS CategoryID, c.ParentProductCategoryID AS ParentID
                     FROM ${ORDERS_SCHEMA}.Product p JOIN ${ORDERS_SCHEMA}.ProductCategory c ON c.ID = p.ProductCategoryID
                     WHERE p.ID = '${f.Products.SubRolling}'`,
                );
                Assert(categories.ParentID != null, 'precondition: the product category has a parent');
                await upsertViaEntity(ctx, PRODUCT_CATEGORY_ENTITY, categories.ParentID, { RenewalIncreasePercent: 4 });
                c = await preview();
                AssertEqual(c.IncreaseSource, 'Category', 'the nearest category that sets one, up the chain');
                AssertEqual(Number(c.IncreasePercent), 4, 'the parent category');

                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubRolling, { RenewalIncreasePercent: 5 });
                c = await preview();
                AssertEqual(c.IncreaseSource, 'Product', 'the product over its category');
                AssertEqual(Number(c.UnitPrice), 1260, '1200 + 5%');

                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, SubscriptionID, { RenewalIncreasePercent: 0 });
                c = await preview();
                AssertEqual(c.IncreaseSource, 'Subscription', 'the subscription over everything, 0 included');
                AssertEqual(Number(c.UnitPrice), 1200, 'a 0 on the subscription opts out of the defaults');

                const placed = await TxQuery(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`);
                AssertEqual(placed.length, 0, 'a preview places nothing');
            }),
    },
    {
        Id: 'subscription-renewal.SR25',
        Name: 'SR25: a live renewal applies the increase and shows how the price was reached',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubRolling, { RenewalIncreasePercent: 5 });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const orderID = out.Candidates[0].OrderID!;

                AssertEqual(Number((await renewalLine(ctx, orderID)).UnitPrice), 1260, '1200 + 5%');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 1260, 'term 2 at the increased price');

                const notes = (await TxOne<{ Notes: string }>(ctx, `SELECT Notes FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`)).Notes;
                Assert(/Unit price 1260\.00: prior price 1200\.00 \+ 5% annual increase \(product\)/.test(notes), `the notes show the price, got: ${notes}`);

                const event = await TxOne<{ EventData: string }>(
                    ctx,
                    `SELECT EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID = '${SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                );
                const data = JSON.parse(event.EventData);
                AssertEqual(Number(data.BasePrice), 1200, 'event: base');
                AssertEqual(Number(data.IncreasePercent), 5, 'event: increase');
                AssertEqual(data.IncreaseSource, 'Product', 'event: where the increase came from');
                AssertEqual(Number(data.UnitPrice), 1260, 'event: price');
            }),
    },
    {
        Id: 'subscription-renewal.SR26',
        Name: 'SR26: a price typed below list lapses back to the prior list price',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.SubRolling, 1000);
                const { OrderID, SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1000);

                // The line as a conversion from the previous system writes it: confirmed, typed below
                // list, with no concession on record. A booked line cannot be edited through the
                // application, so the row is written directly with the immutability trigger off.
                await TxQuery(ctx, `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`);
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.OrderLine SET UnitPrice = 800, PriceOverridden = 1, PriceOverrideReason = 'converted'
                     WHERE OrderHeaderID = '${OrderID}'`,
                );
                await TxQuery(ctx, `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                AssertEqual(out.Candidates[0].BasePriceSource, 'PriorList', 'the typed price lapsed');
                AssertEqual(Number((await renewalLine(ctx, out.Candidates[0].OrderID!)).UnitPrice), 1000, 'back to list');
            }),
    },
    {
        Id: 'subscription-renewal.SR27',
        Name: 'SR27: a product with an Active successor renews as the successor',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.SubCalendar, 1500);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubCalendar, { RenewalIncreasePercent: 5 });
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubRolling, { SuccessorProductID: f.Products.SubCalendar });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const c = out.Candidates[0];
                Assert(SameID(c.RenewalProductID, f.Products.SubCalendar), 'the candidate names the successor');
                AssertEqual(c.BasePriceSource, 'SuccessorList', "the successor's list price");

                const line = await renewalLine(ctx, c.OrderID!);
                Assert(SameID(line.ProductID, f.Products.SubCalendar), 'the renewal line is the successor');
                AssertEqual(Number(line.UnitPrice), 1575, "the successor's 1500 list + its 5%");

                const sub = await TxOne<{ ProductID: string; SubscriptionTypeID: string; ProductTypeID: string }>(
                    ctx,
                    `SELECT s.ProductID, s.SubscriptionTypeID, p.SubscriptionTypeID AS ProductTypeID
                     FROM ${ORDERS_SCHEMA}.Subscription s JOIN ${ORDERS_SCHEMA}.Product p ON p.ID = '${f.Products.SubCalendar}'
                     WHERE s.ID = '${SubscriptionID}'`,
                );
                Assert(SameID(sub.ProductID, f.Products.SubCalendar), 'the subscription moved onto the successor');
                Assert(SameID(sub.SubscriptionTypeID, sub.ProductTypeID), "and onto the successor's subscription type");

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'the same subscription continues');
                AssertEqual(isoDate(terms[1].StartDate), '2027-01-01', 'contiguous with term 1');
            }),
    },
    {
        Id: 'subscription-renewal.SR28',
        Name: 'SR28: a successor that is not Active is not renewed onto',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubCalendar, { Status: 'Draft' });
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubRolling, { SuccessorProductID: f.Products.SubCalendar });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10), Preview: true });
                const c = out.Candidates[0];
                Assert(SameID(c.RenewalProductID, f.Products.SubRolling), 'renews on its own product');
                AssertEqual(c.BasePriceSource, 'PriorPrice', 'at the prior price');
            }),
    },
    {
        Id: 'subscription-renewal.SR29',
        Name: "SR29: a renewal priced below today's list books without a concession hold",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                // The list rises past what the customer pays. The renewal keeps their price, which is
                // finance's rule, not a concession anyone typed.
                await CreateProductPrice(ctx, f.Products.SubRolling, 2000);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `the renewal books: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                const order = await TxOne<{ Status: string }>(ctx, `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${out.Candidates[0].OrderID}'`);
                AssertEqual(order.Status, 'Confirmed', 'confirmed, not held');
                AssertEqual(Number((await renewalLine(ctx, out.Candidates[0].OrderID!)).UnitPrice), 1200, 'at the prior price');
            }),
    },
    {
        Id: 'subscription-renewal.SR30',
        Name: 'SR30: a monthly term that crosses no anniversary renews with no increase',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubMonthly', 24);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubMonthly, { RenewalIncreasePercent: 5 });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: isoDate(Term.EndDate), Preview: true });
                AssertEqual(out.Candidates.length, 1, `the monthly term is due: ${out.Message}`);
                const c = out.Candidates[0];
                AssertEqual(Number(c.IncreasePercent), 0, 'February is not an anniversary');
                AssertEqual(Number(c.UnitPrice), 24, 'the prior price');
            }),
    },
    {
        Id: 'subscription-renewal.SR31',
        Name: 'SR31: a prorated 10-seat first term renews at 10 seats, not the prorated line quantity',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // Mid-year on a Jan-1-anchored type, so the first term is prorated and the line's
                // stored quantity is 10 × ~0.5. The renewal used to take its quantity from there.
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: new Date('2026-07-01T00:00:00Z'),
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [{ ProductID: f.Products.SubCalendar, Quantity: 10, UnitPrice: 1200 }],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const term = await TxOne<{ SubscriptionID: string; EndDate: string; Quantity: number; IsProrated: boolean }>(
                    ctx,
                    `SELECT st.SubscriptionID, st.EndDate, st.Quantity, st.IsProrated
                     FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                     WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
                );
                Assert(term.IsProrated, 'precondition: the first term is prorated');
                AssertEqual(Number(term.Quantity), 10, 'the first term records 10 seats');

                const out = await spawnRenewals(ctx, { SubscriptionID: term.SubscriptionID, AsOfDate: daysBefore(term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message} ${out.Candidates[0]?.SkippedReason ?? ''}`);
                const line = await TxOne<{ Quantity: number }>(
                    ctx,
                    `SELECT Quantity FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${out.Candidates[0].OrderID}'`,
                );
                AssertEqual(Number(line.Quantity), 10, 'the renewal line buys 10 seats');
                const [, renewed] = await TxQuery<{ Quantity: number }>(
                    ctx,
                    `SELECT Quantity FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE SubscriptionID = '${term.SubscriptionID}' ORDER BY TermNumber`,
                );
                AssertEqual(Number(renewed.Quantity), 10, 'term 2 records 10 seats');
            }),
    },
    // ─── Promotions that carry into renewals (#289) ─────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR32',
        Name: 'SR32: a promotion flagged AppliesToRenewals discounts the renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const code = await renewalPromotion(ctx, { AppliesToRenewals: true });
                const { OrderID, SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200, undefined, [code]);
                AssertEqual(await lineDiscount(ctx, OrderID), 240, 'precondition: 20% off at purchase');
                const asOf = daysBefore(Term.EndDate, 10);

                const preview = (await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf, Preview: true })).Candidates[0];
                AssertEqual(JSON.stringify(preview.RenewalPromotionCodes), JSON.stringify([code]), 'the preview reports it carries');
                AssertEqual(preview.UnusableRenewalPromotionCodes?.length ?? 0, 0, 'the preview reports nothing unusable');

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                const c = out.Candidates[0];
                AssertEqual(JSON.stringify(c.RenewalPromotionCodes), JSON.stringify([code]), 'the candidate reports it carried');
                AssertEqual(Number(c.UnitPrice), 1200, 'the renewal price is unchanged; the promotion is a discount on it');

                const orderID = c.OrderID!;
                const order = await TxOne<{ Status: string; Notes: string }>(
                    ctx,
                    `SELECT Status, Notes FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`,
                );
                AssertEqual(order.Status, 'Confirmed', 'confirmed, not held for a concession');
                Assert(order.Notes.includes(`Promotion ${code} carried into this renewal.`), `the notes name it, got: ${order.Notes}`);

                const line = await renewalLine(ctx, orderID);
                AssertEqual(Number(line.UnitPrice), 1200, 'the line keeps the price the pass wrote');
                AssertEqual(await lineDiscount(ctx, orderID), 240, '20% of 1200 off the renewal');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 960, 'term 2 at the discounted price');

                const adjustments = await TxQuery<{ Code: string }>(
                    ctx,
                    `SELECT pc.Code FROM ${ORDERS_SCHEMA}.OrderAdjustment oa
                     JOIN ${ORDERS_SCHEMA}.PromotionCode pc ON pc.ID = oa.PromotionCodeID
                     WHERE oa.OrderHeaderID = '${orderID}'`,
                );
                AssertEqual(adjustments.length, 1, 'one adjustment, the confirm replacing the draft row rather than adding one');
                AssertEqual(adjustments[0].Code, code, 'recorded against the code');

                const event = await TxOne<{ EventData: string }>(
                    ctx,
                    `SELECT EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID = '${SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                );
                const data = JSON.parse(event.EventData);
                AssertEqual(JSON.stringify(data.RenewalPromotionCodes), JSON.stringify([code]), 'event: the code carried');
            }),
    },
    {
        Id: 'subscription-renewal.SR33',
        Name: 'SR33: a promotion without AppliesToRenewals does not carry into the renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const code = await renewalPromotion(ctx, { AppliesToRenewals: false });
                const { OrderID, SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200, undefined, [code]);
                AssertEqual(await lineDiscount(ctx, OrderID), 240, 'precondition: 20% off at purchase');

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                const c = out.Candidates[0];
                AssertEqual(c.RenewalPromotionCodes, undefined, 'no code presented');
                AssertEqual(c.UnusableRenewalPromotionCodes, undefined, 'nothing to report');

                AssertEqual(await lineDiscount(ctx, c.OrderID!), 0, 'no discount on the renewal');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 1200, 'term 2 at full price');
                const adjustments = await TxQuery(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID = '${c.OrderID}'`);
                AssertEqual(adjustments.length, 0, 'no adjustment on the renewal');
            }),
    },
    {
        Id: 'subscription-renewal.SR34',
        Name: 'SR34: a flagged promotion that is paused or out of its dates is reported, and the renewal is at full price',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const paused = await renewalPromotion(ctx, { AppliesToRenewals: true });
                const expired = await renewalPromotion(ctx, { AppliesToRenewals: true });
                const a = await buySubscription(ctx, 'SubRolling', 1200, undefined, [paused]);
                // Another holder: a second SubRolling purchase by the same one would extend a's subscription,
                // leaving a nothing to renew on the date this check asks about.
                const b = await buySubscription(ctx, 'SubRolling', 1200, undefined, [expired], Fx().Customers.SecondOrganizationID);
                AssertEqual(await lineDiscount(ctx, a.OrderID), 240, 'precondition: the paused one applied at purchase');
                AssertEqual(await lineDiscount(ctx, b.OrderID), 240, 'precondition: the expired one applied at purchase');

                // After the purchase: one promotion is paused, the other's window closes mid-term.
                await upsertViaEntity(ctx, PROMOTION_ENTITY, await promotionIDFor(ctx, paused), { Status: 'Paused' });
                await upsertViaEntity(ctx, PROMOTION_ENTITY, await promotionIDFor(ctx, expired), {
                    EffectiveTo: new Date('2026-06-30T00:00:00Z'),
                });

                for (const [sub, code] of [
                    [a, paused],
                    [b, expired],
                ] as const) {
                    const asOf = daysBefore(sub.Term.EndDate, 10);
                    const preview = (await spawnRenewals(ctx, { SubscriptionID: sub.SubscriptionID, AsOfDate: asOf, Preview: true })).Candidates[0];
                    AssertEqual(preview.RenewalPromotionCodes?.length ?? 0, 0, `${code}: the preview says it does not carry`);
                    AssertEqual(preview.UnusableRenewalPromotionCodes?.[0]?.Code, code, `${code}: the preview reports it unusable`);

                    const out = await spawnRenewals(ctx, { SubscriptionID: sub.SubscriptionID, AsOfDate: asOf });
                    AssertEqual(out.Placed, 1, `${code}: the renewal is still placed: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                    const c = out.Candidates[0];
                    AssertEqual(c.RenewalPromotionCodes?.length ?? 0, 0, `${code}: nothing carried`);
                    const unusable = c.UnusableRenewalPromotionCodes ?? [];
                    AssertEqual(unusable.length, 1, `${code}: one code reported`);
                    AssertEqual(unusable[0].Code, code, `${code}: the code is named`);
                    AssertEqual(unusable[0].Reason, 'the promotion is not currently running', `${code}: with the engine's reason`);

                    AssertEqual(await lineDiscount(ctx, c.OrderID!), 0, `${code}: no discount`);
                    AssertEqual(Number((await termsOf(ctx, sub.SubscriptionID))[1].Amount), 1200, `${code}: term 2 at full price`);

                    const notes = (await TxOne<{ Notes: string }>(ctx, `SELECT Notes FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${c.OrderID}'`)).Notes;
                    Assert(notes.includes(`Promotion ${code} not applied: the promotion is not currently running.`), `${code}: the notes say why, got: ${notes}`);
                    const event = await TxOne<{ EventData: string }>(
                        ctx,
                        `SELECT EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                         WHERE SubscriptionID = '${sub.SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                    );
                    AssertEqual(JSON.parse(event.EventData).UnusableRenewalPromotionCodes?.[0]?.Code, code, `${code}: the event logs it`);
                }
            }),
    },
    // ─── Charging the renewal card (#289) ──────────────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR35',
        Name: 'SR35: a renewal-card subscription renews due on the term start, and booking calls no gateway',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_visa');
                const rows = await TxQuery<{ DueDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), DueDate, 23) AS DueDate FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${OrderID}'`,
                );
                AssertEqual(rows.length, 1, 'one schedule row');
                AssertEqual(rows[0].DueDate, TermStart, 'due on the term start, the day the card is first charged');
                const intents = await intentsOf(ctx, OrderID);
                AssertEqual(intents.length, 0, 'placing the renewal opened no intent');
                Assert(SubscriptionID.length > 0, 'precondition: a subscription');
            }),
    },
    {
        Id: 'subscription-renewal.SR36',
        Name: 'SR36: the renewal card is charged on the term start and captured against the order on the gateway day',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_visa');

                const early = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(TermStart, 1) });
                AssertEqual(early.Charged, 0, `nothing is charged before the term start: ${early.Message}`);
                AssertEqual((await intentsOf(ctx, OrderID)).length, 0, 'and no intent was opened');

                const out = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: TermStart });
                AssertEqual(out.Charged, 1, `one renewal paid: ${out.Message} ${JSON.stringify(out.Attempts)}`);
                const attempt = out.Attempts.find((a) => SameID(a.OrderID, OrderID));
                AssertEqual(attempt?.Outcome, 'Charged', 'the renewal order was charged');
                AssertEqual(attempt?.Attempt, 1, 'as attempt 1');

                const intents = await intentsOf(ctx, OrderID);
                AssertEqual(intents.length, 1, 'one intent');
                AssertEqual(intents[0].Status, 'Succeeded', 'that the gateway took');
                const payments = await paymentsFor(ctx, OrderID);
                AssertEqual(payments.length, 1, 'one payment');
                AssertEqual(payments[0].Status, 'Captured', 'captured');
                AssertEqual(Number(payments[0].Amount), 1200, 'for the renewal');
                Assert(SameID(payments[0].PaymentIntentID, intents[0].ID), 'linked to the intent');
                // The stub took the money now, so the gateway's business day is today, not the run's
                // as-of day: the payment is dated when the money moved.
                AssertEqual(payments[0].PaymentDate, Today(), 'dated the gateway business day, not the as-of day');
                Assert(payments[0].PaymentDate !== TermStart, 'the check needs the two days apart');

                const order = await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${OrderID}'`);
                AssertEqual(Number(order.Balance), 0, 'the renewal order is paid');

                const events = await chargeEventsOf(ctx, OrderID);
                AssertEqual(events.length, 1, 'one charge event');
                AssertEqual(events[0].EventType, 'PaymentSucceeded', 'a success');
                Assert(SameID(events[0].RelatedPaymentID, payments[0].ID), 'naming the payment');
                const data = JSON.parse(events[0].EventData) as { Attempt: number; AttemptDay: string };
                AssertEqual(data.Attempt, 1, 'attempt 1');
                AssertEqual(data.AttemptDay, TermStart, 'attempted on the term start');
            }),
    },
    {
        Id: 'subscription-renewal.SR37',
        Name: 'SR37: running the charge pass twice in a day charges once',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const paid = await renewWithCard(ctx, 'pm_card_visa');
                await chargeRenewals(ctx, { SubscriptionID: paid.SubscriptionID, AsOfDate: paid.TermStart });
                const again = await chargeRenewals(ctx, { SubscriptionID: paid.SubscriptionID, AsOfDate: paid.TermStart });
                AssertEqual(again.Charged, 0, `the second pass charges nothing: ${again.Message}`);
                AssertEqual((await intentsOf(ctx, paid.OrderID)).length, 1, 'still one intent');
                AssertEqual((await paymentsFor(ctx, paid.OrderID)).length, 1, 'still one payment');

                const declined = await renewWithCard(ctx, 'pm_card_chargeDeclined', { organizationID: Fx().Customers.SecondOrganizationID });
                const first = await chargeRenewals(ctx, { SubscriptionID: declined.SubscriptionID, AsOfDate: declined.TermStart });
                AssertEqual(first.Failed, 1, `the first pass is declined: ${first.Message}`);
                const second = await chargeRenewals(ctx, { SubscriptionID: declined.SubscriptionID, AsOfDate: declined.TermStart });
                AssertEqual(second.Failed, 0, 'the second pass does not try again');
                const skip = second.Attempts.find((a) => SameID(a.OrderID, declined.OrderID));
                AssertEqual(skip?.Outcome, 'Skipped', 'it is skipped');
                Assert(/already attempted/.test(skip?.Reason ?? ''), `because the day was attempted: ${skip?.Reason}`);
                AssertEqual((await intentsOf(ctx, declined.OrderID)).length, 1, 'one intent for the day');
                AssertEqual((await chargeEventsOf(ctx, declined.OrderID)).length, 1, 'one failure event for the day');
            }),
    },
    {
        Id: 'subscription-renewal.SR38',
        Name: 'SR38: a declined renewal card is retried on days 3, 7 and 11 and then stops',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                const attempted: number[] = [];
                for (let offset = 0; offset <= 15; offset++) {
                    const out = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(TermStart, -offset) });
                    AssertEqual(out.Charged, 0, `day ${offset}: nothing is paid`);
                    if (out.Failed > 0) attempted.push(offset);
                }
                AssertEqual(attempted.join(','), '0,3,7,11', 'tried on the due day and days 3, 7 and 11 only');

                const intents = await intentsOf(ctx, OrderID);
                AssertEqual(intents.length, 4, 'each attempt its own intent');
                Assert(intents.every((i) => i.Status === 'Failed'), `all Failed: ${JSON.stringify(intents)}`);
                AssertEqual(new Set(intents.map((i) => i.ProviderIntentID)).size, 4, 'with four gateway ids');

                const events = await chargeEventsOf(ctx, OrderID);
                AssertEqual(events.length, 4, 'one PaymentFailed per attempt');
                const data = events.map((e) => ({ type: e.EventType, ...(JSON.parse(e.EventData) as { Attempt: number; NextAttemptDay: string | null; Reason: string; FailureCode: string }) }));
                Assert(data.every((d) => d.type === 'PaymentFailed'), 'all failures');
                AssertEqual(data.map((d) => d.Attempt).join(','), '1,2,3,4', 'numbered 1 to 4');
                AssertEqual(
                    data.map((d) => d.NextAttemptDay ?? 'none').join(','),
                    [3, 7, 11].map((n) => daysBefore(TermStart, -n)).join(',') + ',none',
                    'each naming the next attempt day, and the last naming none',
                );
                Assert(data.every((d) => d.FailureCode === 'card_declined' && !!d.Reason), 'with the gateway reason');
                AssertEqual((await paymentsFor(ctx, OrderID)).length, 0, 'and no payment');
            }),
    },
    {
        Id: 'subscription-renewal.SR39',
        Name: 'SR39: an authentication demand on the off-session charge is a failed attempt',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_authenticationRequired');
                const out = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: TermStart });
                AssertEqual(out.Failed, 1, `the attempt failed: ${out.Message}`);
                AssertEqual(out.Attempts.find((a) => SameID(a.OrderID, OrderID))?.Outcome, 'AuthenticationRequired', 'as an authentication demand');
                const intents = await intentsOf(ctx, OrderID);
                AssertEqual(intents.length, 1, 'one intent');
                AssertEqual(intents[0].Status, 'Failed', 'recorded Failed');
                const events = await chargeEventsOf(ctx, OrderID);
                AssertEqual(events[0].EventType, 'PaymentFailed', 'a PaymentFailed event');
                const data = JSON.parse(events[0].EventData) as { AuthenticationRequired: boolean; NextAttemptDay: string };
                AssertEqual(data.AuthenticationRequired, true, 'marked as needing authentication');
                AssertEqual(data.NextAttemptDay, daysBefore(TermStart, -3), 'with the next attempt day');
            }),
    },
    {
        Id: 'subscription-renewal.SR40',
        Name: 'SR40: a subscription without a renewal card keeps the invoice-day due date and is never charged',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 10);
                const placed = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(placed.Placed, 1, `renewed: ${placed.Message}`);
                const orderID = placed.Candidates[0].OrderID!;
                const row = await TxOne<{ DueDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), DueDate, 23) AS DueDate FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'`,
                );
                Assert(row.DueDate < daysBefore(Term.EndDate, -1), `due before the term start, on the invoice-day rule: ${row.DueDate}`);

                const out = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: row.DueDate });
                AssertEqual(out.Considered, 0, `an invoice-only renewal is not a candidate: ${out.Message}`);
                AssertEqual((await intentsOf(ctx, orderID)).length, 0, 'and no intent is opened');
            }),
    },
    {
        Id: 'subscription-renewal.SR41',
        Name: 'SR41: the charge Action previews from the string "true" and charges on "false"',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_visa');
                const preview = await chargeRenewalsViaAction(ctx, { SubscriptionID, AsOfDate: TermStart, Preview: 'true' });
                Assert(preview.Success, `the preview ran: ${preview.Message}`);
                AssertEqual(preview.ResultCode, 'PREVIEWED', 'reported as a preview');
                AssertEqual(preview.Attempts.find((a) => SameID(a.OrderID, OrderID))?.Outcome, 'WouldCharge', 'listing the order it would charge');
                AssertEqual((await intentsOf(ctx, OrderID)).length, 0, 'and charging nothing');

                const live = await chargeRenewalsViaAction(ctx, { SubscriptionID, AsOfDate: TermStart, Preview: 'false' });
                AssertEqual(live.Charged, 1, `"false" charges: ${live.Message}`);
                AssertEqual((await paymentsFor(ctx, OrderID)).length, 1, 'one payment');
            }),
    },
    {
        Id: 'subscription-renewal.SR42',
        Name: 'SR42: the charge schedule points at its Action, and ships disabled and set to preview',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const action = await TxMaybeOne<{ ID: string; DriverClass: string; Status: string }>(
                    ctx,
                    `SELECT ID, DriverClass, Status FROM __mj.Action WHERE Name = 'Charge Renewals'`,
                );
                Assert(action != null, 'the action row exists — push the app metadata if not');
                AssertEqual(action!.Status, 'Active', 'and it is active');
                AssertEqual(action!.DriverClass, CHARGE_ACTION_DRIVER_CLASS, 'pointing at the registered key');

                const job = await TxMaybeOne<{ Configuration: string; Status: string }>(
                    ctx,
                    `SELECT Configuration, Status FROM __mj.ScheduledJob WHERE Name = N'Orders — Charge Renewals (daily)'`,
                );
                Assert(job != null, 'the scheduled job row exists — push the app metadata if not');
                const config = JSON.parse(job!.Configuration ?? '{}') as { ActionID?: string; Params?: Array<{ ActionParamID: string; Value: string }> };
                Assert(config.ActionID != null && SameID(config.ActionID, action!.ID), `the job names this action: ${job!.Configuration}`);
                // Shipping it live would start charging cards on whatever day this metadata reached a host.
                AssertEqual(job!.Status, 'Disabled', 'and it ships disabled');
                const previewParam = await TxMaybeOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM __mj.ActionParam WHERE ActionID = '${action!.ID}' AND Name = 'Preview'`,
                );
                Assert(previewParam != null, 'the Preview parameter is declared');
                const configured = config.Params?.find((p) => SameID(p.ActionParamID, previewParam!.ID));
                AssertEqual(String(configured?.Value), 'true', `and the job is configured for preview: ${job!.Configuration}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR43',
        Name: 'SR43: a later settled-payment webhook for the charged intent books nothing more',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_visa');
                await chargeRenewals(ctx, { SubscriptionID, AsOfDate: TermStart });
                const [intent] = await intentsOf(ctx, OrderID);
                Assert(intent != null, 'precondition: the charge opened an intent');

                // A card driver does not settle late, so `payment_intent.succeeded` stamps the intent
                // and then asks the checkout to book its payment. This is that second step, which is
                // the only one that could book money: it must find no checkout behind the intent.
                const booked = await CheckoutSessionService.BookSettledCheckoutPaymentIfNeeded(intent.ID, ctx.User);
                AssertEqual(booked.Attempted, false, 'the webhook path does not try to book the renewal charge');
                await chargeRenewals(ctx, { SubscriptionID, AsOfDate: TermStart });
                const payments = await TxQuery<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE PaymentIntentID = '${intent.ID}'`,
                );
                AssertEqual(payments.length, 1, 'one payment for the intent');
            }),
    },
    {
        Id: 'subscription-renewal.SR44',
        Name: "SR44: one renewal order's fault does not stop the charge pass",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const broken = await renewWithCard(ctx, 'pm_card_visa', { inactiveProvider: true });
                const healthy = await renewWithCard(ctx, 'pm_card_visa', { organizationID: Fx().Customers.SecondOrganizationID });
                const out = await chargeRenewals(ctx, { AsOfDate: healthy.TermStart });
                const failed = out.Attempts.find((a) => SameID(a.OrderID, broken.OrderID));
                const charged = out.Attempts.find((a) => SameID(a.OrderID, healthy.OrderID));
                AssertEqual(failed?.Outcome, 'Error', `the order on an inactive provider fails: ${JSON.stringify(failed)}`);
                Assert(out.Failures.some((f) => SameID(f.OrderID, broken.OrderID)), 'and is reported');
                AssertEqual(charged?.Outcome, 'Charged', `the next order is still charged: ${JSON.stringify(charged)}`);
                AssertEqual(out.Success, false, 'the pass reports the failure');
                AssertEqual((await chargeEventsOf(ctx, broken.OrderID)).length, 0, 'a fault is not logged as a declined card');
            }),
    },

    // ─── The update-card link (#289) ──────────────────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR45',
        Name: "SR45: an order's first failed charge sends the update-card link, and its second does not",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    // A bill-to person with an e-mail address: the link goes to them.
                    const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_chargeDeclined', {
                        billToPersonID: Fx().Customers.PersonID,
                    });
                    const first = await chargeRenewalsViaAction(ctx, { SubscriptionID, AsOfDate: TermStart, Preview: 'false' });
                    AssertEqual(first.Failed, 1, `the first charge failed: ${first.Message}`);
                    const a1 = first.Attempts.find((a) => SameID(a.OrderID, OrderID));
                    AssertEqual(a1?.FirstFailure, true, 'it is the first failure');
                    Assert(typeof a1?.PaymentLinkSent === 'boolean', `a send was attempted: ${JSON.stringify(a1)}`);
                    // The suite's database has no mail provider, so the send itself may fail; everything
                    // before it — the secret, the link address, the recipient and both templates — must not.
                    Assert(
                        a1?.PaymentLinkSent === true || !/secret|RenewalPaymentLinkBaseUrl|templates are not installed|no bill-to person|did not render/.test(a1?.PaymentLinkReason ?? ''),
                        `the link was built and rendered: ${a1?.PaymentLinkReason}`,
                    );

                    const second = await chargeRenewalsViaAction(ctx, { SubscriptionID, AsOfDate: daysBefore(TermStart, -3), Preview: 'false' });
                    AssertEqual(second.Failed, 1, 'the retry failed too');
                    const a2 = second.Attempts.find((a) => SameID(a.OrderID, OrderID));
                    Assert(!a2?.FirstFailure, 'the retry is not a first failure');
                    AssertEqual(a2?.PaymentLinkSent, undefined, 'and sends no second link');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR46',
        Name: 'SR46: the update-card link pays the open renewal order, with no new order',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                    await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart });
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);
                    const orders = async () => Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderHeader`)).N);
                    const before = await orders();

                    const key = `it-renew-${r.OrderID.slice(0, 8)}`;
                    const init = await CheckoutSessionService.InitializeRenewalPaymentSession(await linkToken(r.OrderID, r.SubscriptionID), key, ctx.User);
                    Assert(init.Success, `the link opens a session: ${init.ErrorMessage}`);
                    AssertEqual(init.RenewalPayment?.Amount, 1200, 'for the open balance');
                    const sessionID = init.SessionID!;

                    const intent = await CheckoutSessionService.OpenPaymentIntentForSession(sessionID, key, ctx.User);
                    Assert(intent.Success, `an intent opens: ${intent.ErrorMessage}`);
                    AssertEqual(intent.Amount, 1200, 'for the balance');
                    await settleSessionIntent(ctx, sessionID);

                    const done = await CheckoutSessionService.CompleteCheckout(sessionID, key, ctx.User);
                    Assert(done.Success, `the payment completes: ${done.ErrorMessage}`);
                    Assert(SameID(done.OrderID, r.OrderID), 'on the renewal order');
                    AssertEqual(await orders(), before, 'and no order was created');

                    const order = await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${r.OrderID}'`);
                    AssertEqual(Number(order.Balance), 0, 'the renewal is paid');
                    const payments = await paymentsFor(ctx, r.OrderID);
                    AssertEqual(payments.length, 1, 'by one payment');
                    AssertEqual(payments[0].Status, 'Captured', 'captured through the ordinary path');
                    const session = await TxOne<{ Status: string; DraftOrderID: string }>(ctx, `SELECT Status, DraftOrderID FROM ${ORDERS_SCHEMA}.CheckoutSession WHERE ID = '${sessionID}'`);
                    AssertEqual(session.Status, 'Confirmed', 'the session is confirmed');
                    Assert(SameID(session.DraftOrderID, r.OrderID), 'on the renewal order');

                    const later = await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: daysBefore(r.TermStart, -3) });
                    AssertEqual(later.Considered, 0, 'the paid renewal is no longer charged');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR47',
        Name: 'SR47: the update-card link is refused once the renewal is paid, and when tampered with',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const r = await renewWithCard(ctx, 'pm_card_visa');
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);
                    const token = await linkToken(r.OrderID, r.SubscriptionID);

                    const [payload, signature] = token.split('.');
                    const tampered = `${payload}.${signature.slice(0, -2)}${signature.endsWith('AA') ? 'BB' : 'AA'}`;
                    const forged = await CheckoutSessionService.InitializeRenewalPaymentSession(tampered, 'it-renew-forged', ctx.User);
                    AssertEqual(forged.Success, false, 'a tampered link opens nothing');
                    AssertEqual(forged.ErrorMessage, 'This payment link is not valid.', 'and says only that it is not valid');

                    await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart });
                    const paid = await CheckoutSessionService.InitializeRenewalPaymentSession(token, 'it-renew-paid', ctx.User);
                    AssertEqual(paid.Success, false, 'a paid renewal opens nothing');
                    AssertEqual(paid.ErrorMessage, 'This renewal is already paid.', 'and says so');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR48',
        Name: 'SR48: a pay-renewal session cannot be drafted, so the renewal is never re-priced',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);
                    const key = 'it-renew-draft';
                    const init = await CheckoutSessionService.InitializeRenewalPaymentSession(await linkToken(r.OrderID, r.SubscriptionID), key, ctx.User);
                    Assert(init.Success, `the link opens a session: ${init.ErrorMessage}`);
                    const draft = await CheckoutSessionService.UpdateDraft(
                        init.SessionID!,
                        key,
                        'buyer@example.com',
                        [{ ProductID: Fx().Products.SubRolling, Quantity: 3 }],
                        { Country: 'US', StateProvince: 'IL', PostalCode: '60601' },
                        ctx.User,
                    );
                    AssertEqual(draft.Success, false, 'the draft is refused');
                    const line = await renewalLine(ctx, r.OrderID);
                    AssertEqual(Number(line.UnitPrice), 1200, 'and the renewal keeps its price');
                }),
            ),
    },

    // ─── Edge cases of the charge pass (#683) ─────────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR49',
        Name: 'SR49: money taken but not booked is booked after the last retry day, with automatic renewal off',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const r = await renewWithCard(ctx, 'pm_card_visa');
                // The gateway took the money and the capture never booked it.
                await createViaEntity(ctx, PAYMENT_INTENT_ENTITY, {
                    PaymentProviderID: r.ProviderID,
                    ProviderIntentID: `pi_it_unbooked_${r.OrderID.slice(0, 8)}`,
                    Status: 'Succeeded',
                    Amount: 1200,
                    OrderHeaderID: r.OrderID,
                });
                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, r.SubscriptionID, { AutoRenew: false });

                const out = await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: daysBefore(r.TermStart, -20) });
                const attempt = out.Attempts.find((a) => SameID(a.OrderID, r.OrderID));
                AssertEqual(attempt?.Outcome, 'Captured', `day 20, automatic renewal off: the money is booked: ${JSON.stringify(attempt)}`);
                AssertEqual((await intentsOf(ctx, r.OrderID)).length, 1, 'and the card is not charged again');
                const payments = await paymentsFor(ctx, r.OrderID);
                AssertEqual(payments.length, 1, 'one payment');
                AssertEqual(Number(payments[0].Amount), 1200, 'for the renewal');
            }),
    },
    {
        Id: 'subscription-renewal.SR50',
        Name: 'SR50: the update-card link waits until the failed charge is recorded, so a rerun never sends it twice',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                const sent: string[] = [];
                const hooks = {
                    OnFirstFailure: async (a: { OrderID: string }) => {
                        sent.push(a.OrderID);
                        return { Sent: true };
                    },
                };
                // The failure event cannot be saved. Rolled back with the check.
                await TxQuery(
                    ctx,
                    `ALTER TABLE ${ORDERS_SCHEMA}.SubscriptionEvent WITH NOCHECK ADD CONSTRAINT CK_IT_SR50_NoPaymentFailed CHECK (EventType <> 'PaymentFailed')`,
                );
                const first = await ChargeRenewals({ SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart }, ctx.Provider, ctx.User, hooks);
                const a1 = first.Attempts.find((a) => SameID(a.OrderID, r.OrderID));
                AssertEqual(a1?.Outcome, 'Declined', `the card was declined: ${JSON.stringify(a1)}`);
                AssertEqual(sent.length, 0, 'no link while the failure is unrecorded');
                AssertEqual(a1?.PaymentLinkSent, false, 'reported as not sent');
                Assert(first.Failures.some((f) => SameID(f.OrderID, r.OrderID)), 'and the run reports the order');

                await TxQuery(ctx, `ALTER TABLE ${ORDERS_SCHEMA}.SubscriptionEvent DROP CONSTRAINT CK_IT_SR50_NoPaymentFailed`);
                const rerun = await ChargeRenewals({ SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart }, ctx.Provider, ctx.User, hooks);
                AssertEqual(rerun.Attempts.find((a) => SameID(a.OrderID, r.OrderID))?.Outcome, 'Declined', 'the rerun records the decline');
                AssertEqual(sent.length, 1, 'and sends the link once');

                const third = await ChargeRenewals({ SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart }, ctx.Provider, ctx.User, hooks);
                AssertEqual(third.Attempts.find((a) => SameID(a.OrderID, r.OrderID))?.Outcome, 'Skipped', 'a third run that day skips the order');
                AssertEqual(sent.length, 1, 'and sends nothing');
            }),
    },

    // ─── Edge cases of the update-card link (#683) ────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR51',
        Name: "SR51: the update-card link is refused once the subscription is cancelled, though its renewal order stays open",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                    await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart });
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);
                    const token = await linkToken(r.OrderID, r.SubscriptionID);

                    const cancelled = await cancelSubscription(ctx, { SubscriptionID: r.SubscriptionID, RequestDate: r.TermStart });
                    Assert(cancelled.Success, `the cancel must succeed: ${cancelled.Message}`);
                    const init = await CheckoutSessionService.InitializeRenewalPaymentSession(token, 'it-renew-cancelled', ctx.User);
                    AssertEqual(init.Success, false, 'a cancelled subscription opens nothing');
                    AssertEqual(
                        init.ErrorMessage,
                        'This subscription is no longer set to renew, so this renewal cannot be paid here. Contact us to renew.',
                        'and says why',
                    );
                    const later = await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: daysBefore(r.TermStart, -3) });
                    AssertEqual(later.Charged + later.Failed, 0, 'and the card is not tried again');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR52',
        Name: "SR52: on a gift, the update-card link's payment and new card are the buyer's, and the renewal still bills the beneficiary",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const f = Fx();
                    // The renewal bills the beneficiary; the declined card is the buyer's, filed in their wallet.
                    const r = await renewWithCard(ctx, 'pm_card_chargeDeclined', { billToPersonID: f.Customers.PersonID });
                    const buyerID = f.Customers.SecondPersonID;
                    await TxQuery(
                        ctx,
                        `UPDATE ${ORDERS_SCHEMA}.CustomerPaymentMethod SET OwnerPersonID = '${buyerID}', OwnerOrganizationID = NULL
                         WHERE ID = (SELECT DefaultCustomerPaymentMethodID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${r.SubscriptionID}')`,
                    );
                    await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart });
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);

                    const order = await LoadRenewalPaymentOrder(r.OrderID, ctx.Provider, ctx.User);
                    Assert(SameID(order?.BillToPersonID, f.Customers.PersonID), 'precondition: the renewal bills the beneficiary');
                    Assert(SameID(order?.PayerPersonID, buyerID), `the payer is the buyer who owns the card: ${order?.PayerPersonID}`);

                    const key = 'it-renew-gift';
                    const init = await CheckoutSessionService.InitializeRenewalPaymentSession(await linkToken(r.OrderID, r.SubscriptionID), key, ctx.User);
                    Assert(init.Success, `the link opens a session: ${init.ErrorMessage}`);
                    const session = await TxOne<{ PersonID: string }>(ctx, `SELECT PersonID FROM ${ORDERS_SCHEMA}.CheckoutSession WHERE ID = '${init.SessionID}'`);
                    Assert(SameID(session.PersonID, buyerID), 'the session is the buyer\'s');

                    const opened = await CheckoutSessionService.OpenPaymentIntentForSession(init.SessionID!, key, ctx.User);
                    Assert(opened.Success, `an intent opens: ${opened.ErrorMessage}`);
                    await settleSessionIntent(ctx, init.SessionID!);
                    const done = await CheckoutSessionService.CompleteCheckout(init.SessionID!, key, ctx.User);
                    Assert(done.Success, `the renewal is paid: ${done.ErrorMessage}`);

                    const payment = await TxOne<{ BillToPersonID: string | null }>(
                        ctx,
                        `SELECT ph.BillToPersonID FROM ${ORDERS_SCHEMA}.PaymentHeader ph
                         JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
                         WHERE pl.OrderHeaderID = '${r.OrderID}'`,
                    );
                    Assert(SameID(payment.BillToPersonID, buyerID), 'the payment is booked to the buyer');
                    const card = await TxOne<{ OwnerPersonID: string | null }>(
                        ctx,
                        `SELECT cpm.OwnerPersonID FROM ${ORDERS_SCHEMA}.Subscription s
                         JOIN ${ORDERS_SCHEMA}.CustomerPaymentMethod cpm ON cpm.ID = s.DefaultCustomerPaymentMethodID
                         WHERE s.ID = '${r.SubscriptionID}'`,
                    );
                    Assert(SameID(card.OwnerPersonID, buyerID), 'and the new renewal card is in the buyer\'s wallet');
                    const billTo = await TxOne<{ BillToPersonID: string }>(ctx, `SELECT BillToPersonID FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${r.OrderID}'`);
                    Assert(SameID(billTo.BillToPersonID, f.Customers.PersonID), 'the renewal still bills the beneficiary');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR53',
        Name: 'SR53: a link payment the browser never completed is completed by the payment webhook, and a late complete returns the same order (#724)',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                    await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart });
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);

                    const key = 'it-renew-closed-tab';
                    const init = await CheckoutSessionService.InitializeRenewalPaymentSession(await linkToken(r.OrderID, r.SubscriptionID), key, ctx.User);
                    Assert(init.Success, `the link opens a session: ${init.ErrorMessage}`);
                    const sessionID = init.SessionID!;
                    const opened = await CheckoutSessionService.OpenPaymentIntentForSession(sessionID, key, ctx.User);
                    Assert(opened.Success, `an intent opens: ${opened.ErrorMessage}`);
                    await settleSessionIntent(ctx, sessionID);

                    // The page closed after the payment succeeded: only the webhook's booking step runs.
                    const intentID = (await TxOne<{ PaymentIntentID: string }>(ctx, `SELECT PaymentIntentID FROM ${ORDERS_SCHEMA}.CheckoutSession WHERE ID = '${sessionID}'`)).PaymentIntentID;
                    const booked = await CheckoutSessionService.BookSettledCheckoutPaymentIfNeeded(intentID, ctx.User);
                    Assert(booked.Booked, `the webhook completes the payment: ${booked.ErrorMessage}`);

                    const session = await TxOne<{ Status: string; DraftOrderID: string }>(ctx, `SELECT Status, DraftOrderID FROM ${ORDERS_SCHEMA}.CheckoutSession WHERE ID = '${sessionID}'`);
                    AssertEqual(session.Status, 'Confirmed', 'the session is confirmed');
                    const order = await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${r.OrderID}'`);
                    AssertEqual(Number(order.Balance), 0, 'the renewal is paid');
                    const step = await TxOne<{ LastAttemptSource: string; Status: string }>(
                        ctx,
                        `SELECT LastAttemptSource, Status FROM ${ORDERS_SCHEMA}.CheckoutSessionStep WHERE CheckoutSessionID = '${sessionID}' AND StepName = 'Capture'`,
                    );
                    AssertEqual(step.LastAttemptSource, 'Webhook', 'the capture is recorded as the webhook\'s');
                    AssertEqual(step.Status, 'Succeeded', 'and it succeeded');

                    const late = await CheckoutSessionService.CompleteCheckout(sessionID, key, ctx.User);
                    Assert(late.Success, `a late complete succeeds: ${late.ErrorMessage}`);
                    Assert(SameID(late.OrderID, r.OrderID), 'with the same order');
                    AssertEqual((await paymentsFor(ctx, r.OrderID)).length, 1, 'and the payment is booked once');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR58',
        Name: 'SR58: a subscription renewed at a price of zero books, the $0-line refusal leaving the renewal pass\'s own price alone',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { OrderID, SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                // The product is now listed at zero, so pricing the renewal line resolves to zero too.
                await CreateProductPrice(ctx, f.Products.SubRolling, 0);

                // A complimentary term: the booked line at zero, as a conversion from the previous
                // system writes it. A hand-entered order cannot confirm a $0 line, and a booked line
                // cannot be edited through the application, so the row is written directly with the
                // immutability trigger off.
                await TxQuery(ctx, `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`);
                await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.OrderLine SET UnitPrice = 0 WHERE OrderHeaderID = '${OrderID}'`);
                await TxQuery(ctx, `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `the renewal books: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                const orderID = out.Candidates[0].OrderID!;
                const order = await TxOne<{ Status: string; Origin: string }>(
                    ctx,
                    `SELECT Status, Origin FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`,
                );
                AssertEqual(order.Status, 'Confirmed', 'confirmed, not refused as an unpriced line');
                AssertEqual(order.Origin, 'Direct', 'the renewal keeps the hand-entry origin');
                AssertEqual(Number((await renewalLine(ctx, orderID)).UnitPrice), 0, 'at the prior price of zero');
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 2, 'the subscription gained its next term');
            }),
    },

    // ─── Subscriptions a gateway bills itself (option E, E1) ─────────────────────────────────────
    {
        Id: 'subscription-renewal.SR54',
        Name: 'SR54: Spawn Renewals skips a provider-billed subscription; a sibling with no gateway id still renews',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // The account's switch is ON here, so the sibling proves the switch does not stop Orders
                // renewing a subscription the gateway does not bill.
                const providerID = await stubStripeProvider(ctx);
                await upsertViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, providerID, { BillsSubscriptions: true });

                const billed = await buySubscription(ctx, 'SubRolling', 1200);
                await markProviderBilled(ctx, billed.SubscriptionID, providerID, `sub_it_sr54_${billed.SubscriptionID.slice(0, 8)}`);
                // A second holder: AnnualRolling extends an existing subscription for the same holder.
                const sibling = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, f.Customers.SecondOrganizationID);
                const asOf = daysBefore(billed.Term.EndDate, 10);

                const skipped = await spawnRenewals(ctx, { SubscriptionID: billed.SubscriptionID, AsOfDate: asOf });
                AssertEqual(skipped.Placed, 0, `the gateway renews it, so Orders places nothing: ${skipped.Message}`);
                AssertEqual(skipped.Candidates.length, 0, 'and it is not a candidate at all');
                const lines = await TxQuery(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${billed.SubscriptionID}'`);
                AssertEqual(lines.length, 0, 'no renewal line names it');

                const renewed = await spawnRenewals(ctx, { SubscriptionID: sibling.SubscriptionID, AsOfDate: asOf });
                AssertEqual(renewed.Placed, 1, `the sibling with no gateway id renews as before: ${renewed.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR55',
        Name: 'SR55: Charge Renewals does not charge a provider-billed subscription with the switch off; a sibling is charged',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const billed = await renewWithCard(ctx, 'pm_card_visa');
                const sibling = await renewWithCard(ctx, 'pm_card_visa', { organizationID: Fx().Customers.SecondOrganizationID });
                // The renewal order already exists (placed before the gateway took over billing). The
                // account's switch stays at its default, OFF: the marker alone keeps Orders off the card.
                const provider = await TxOne<{ BillsSubscriptions: boolean }>(ctx, `SELECT BillsSubscriptions FROM ${ORDERS_SCHEMA}.PaymentProvider WHERE ID = '${billed.ProviderID}'`);
                AssertEqual(Boolean(provider.BillsSubscriptions), false, 'precondition: the switch is off');
                await markProviderBilled(ctx, billed.SubscriptionID, billed.ProviderID, `sub_it_sr55_${billed.SubscriptionID.slice(0, 8)}`);

                const out = await chargeRenewals(ctx, { SubscriptionID: billed.SubscriptionID, AsOfDate: billed.TermStart });
                AssertEqual(out.Considered, 0, `not a candidate: ${out.Message} ${JSON.stringify(out.Attempts)}`);
                AssertEqual(out.Charged, 0, 'nothing charged');
                AssertEqual((await intentsOf(ctx, billed.OrderID)).length, 0, 'and no intent was opened on the card');

                const control = await chargeRenewals(ctx, { SubscriptionID: sibling.SubscriptionID, AsOfDate: sibling.TermStart });
                AssertEqual(control.Charged, 1, `the sibling with no gateway id is charged as before: ${control.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR56',
        Name: 'SR56: money taken but not booked is not captured once the subscription is provider-billed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SR49's shape, which on its own is captured on day 20 with automatic renewal off. This
                // branch selects without AutoRenew, so only a rule in the OUTER WHERE keeps it out.
                const r = await renewWithCard(ctx, 'pm_card_visa');
                await createViaEntity(ctx, PAYMENT_INTENT_ENTITY, {
                    PaymentProviderID: r.ProviderID,
                    ProviderIntentID: `pi_it_sr56_${r.OrderID.slice(0, 8)}`,
                    Status: 'Succeeded',
                    Amount: 1200,
                    OrderHeaderID: r.OrderID,
                });
                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, r.SubscriptionID, { AutoRenew: false });
                await markProviderBilled(ctx, r.SubscriptionID, r.ProviderID, `sub_it_sr56_${r.SubscriptionID.slice(0, 8)}`);

                const out = await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: daysBefore(r.TermStart, -20) });
                AssertEqual(out.Considered, 0, `not a candidate on either branch: ${JSON.stringify(out.Attempts)}`);
                AssertEqual((await paymentsFor(ctx, r.OrderID)).length, 0, 'no payment is booked by the renewal pass');
            }),
    },
    {
        Id: 'subscription-renewal.SR57',
        Name: 'SR57: one Orders subscription per (provider, gateway id), another account may reuse an id, and an id needs its provider and may not be empty',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const first = await buySubscription(ctx, 'SubRolling', 1200);
                const second = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, f.Customers.SecondOrganizationID);
                const accountA = await stubStripeProvider(ctx);
                const accountB = await stubStripeProvider(ctx);
                const gatewayID = `sub_it_sr57_${first.SubscriptionID.slice(0, 8)}`;
                await markProviderBilled(ctx, first.SubscriptionID, accountA, gatewayID);

                // NULLs repeat freely: the index is filtered to rows with a gateway id.
                const unbilled = await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.Subscription WHERE ProviderSubscriptionID IS NULL`);
                Assert(Number(unbilled.N) >= 1, 'subscriptions with no gateway id coexist');

                // The object model refuses an id without its provider before the database is asked.
                let modelRefusal = '';
                try {
                    await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, second.SubscriptionID, { ProviderSubscriptionID: 'sub_it_sr57_orphan' });
                } catch (e) {
                    modelRefusal = String(e);
                }
                Assert(/payment provider is required/i.test(modelRefusal), `the entity refuses an id with no provider: ${modelRefusal || 'it was allowed'}`);

                // An empty id is refused too, by the object model and by the database: the generated form saves
                // '' when the field is cleared, and an empty marker would stop Orders renewing a subscription
                // nothing bills. Only spaces counts as empty.
                for (const empty of ['', '   ']) {
                    let blankRefusal = '';
                    try {
                        await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, second.SubscriptionID, { PaymentProviderID: accountB, ProviderSubscriptionID: empty });
                    } catch (e) {
                        blankRefusal = String(e);
                    }
                    Assert(/cannot be blank/i.test(blankRefusal), `the entity refuses the id ${JSON.stringify(empty)}: ${blankRefusal || 'it was allowed'}`);
                    const blankInDb = await refusedBySql(ctx, `UPDATE ${ORDERS_SCHEMA}.Subscription SET PaymentProviderID = '${accountB}', ProviderSubscriptionID = '${empty}' WHERE ID = '${second.SubscriptionID}'`);
                    Assert(/CK_Subscription_ProviderSubscriptionHasProvider/.test(blankInDb), `the database refuses the id ${JSON.stringify(empty)}: ${blankInDb || 'it was allowed'}`);
                }

                // The database floor, each probe behind a savepoint so a refusal leaves the check's transaction usable.
                const sameAccount = await refusedBySql(ctx, `UPDATE ${ORDERS_SCHEMA}.Subscription SET PaymentProviderID = '${accountA}', ProviderSubscriptionID = '${gatewayID}' WHERE ID = '${second.SubscriptionID}'`);
                Assert(/UQ_Subscription_ProviderSubscriptionID/.test(sameAccount), `a second subscription with the same (provider, id) is refused: ${sameAccount || 'it was allowed'}`);
                const otherAccount = await refusedBySql(ctx, `UPDATE ${ORDERS_SCHEMA}.Subscription SET PaymentProviderID = '${accountB}', ProviderSubscriptionID = '${gatewayID}' WHERE ID = '${second.SubscriptionID}'`);
                AssertEqual(otherAccount, '', 'the same id under another provider account is allowed (two accounts are two id spaces)');
                const noProvider = await refusedBySql(ctx, `UPDATE ${ORDERS_SCHEMA}.Subscription SET PaymentProviderID = NULL, ProviderSubscriptionID = 'sub_it_sr57_orphan' WHERE ID = '${second.SubscriptionID}'`);
                Assert(/CK_Subscription_ProviderSubscriptionHasProvider/.test(noProvider), `an id with no provider is refused by the database: ${noProvider || 'it was allowed'}`);
            }),
    },

    {
        // Inside InRolledBackTransaction the capture joins the check's transaction (#947), so SR46,
        // SR52 and SR53 cannot tell a capture that runs on its own provider from one that would
        // wait on a transaction its own request holds. This one runs outside it: everything it
        // writes commits, the capture runs on an isolated provider exactly as in production, and a
        // self-blocking capture times out here (#950 review). Its rows are deleted afterwards.
        Id: 'subscription-renewal.SR46-OT',
        Name: 'SR46-OT: outside the harness transaction, the update-card link pays the renewal through the isolated capture (#950)',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const run: CheckoutRun = { OrderIDs: [], SubscriptionIDs: [] };
            await OutsideTransaction(
                () =>
                    withRenewalLinks(async () => {
                        const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                        run.OrderIDs.push(r.SourceOrderID, r.OrderID);
                        run.SubscriptionIDs.push(r.SubscriptionID);
                        run.PaymentProviderID = r.ProviderID;
                        await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart });
                        run.CheckoutWidgetID = await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);

                        const key = `it-renew-ot-${r.OrderID.slice(0, 8)}`;
                        const init = await CheckoutSessionService.InitializeRenewalPaymentSession(await linkToken(r.OrderID, r.SubscriptionID), key, ctx.User);
                        Assert(init.Success, `the link opens a session: ${init.ErrorMessage}`);
                        const sessionID = init.SessionID!;
                        const intent = await CheckoutSessionService.OpenPaymentIntentForSession(sessionID, key, ctx.User);
                        Assert(intent.Success, `an intent opens: ${intent.ErrorMessage}`);
                        await settleSessionIntent(ctx, sessionID);

                        const done = await CheckoutSessionService.CompleteCheckout(sessionID, key, ctx.User);
                        Assert(done.Success, `the payment completes: ${done.ErrorMessage}`);
                        Assert(SameID(done.OrderID, r.OrderID), 'on the renewal order');

                        const order = await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${r.OrderID}'`);
                        AssertEqual(Number(order.Balance), 0, 'the renewal is paid');
                        const payments = await paymentsFor(ctx, r.OrderID);
                        AssertEqual(payments.length, 1, 'by one payment');
                        AssertEqual(payments[0].Status, 'Captured', 'captured, and committed by the isolated capture');
                        const session = await TxOne<{ Status: string }>(ctx, `SELECT Status FROM ${ORDERS_SCHEMA}.CheckoutSession WHERE ID = '${sessionID}'`);
                        AssertEqual(session.Status, 'Confirmed', 'the session is confirmed');
                    }),
                async () => {
                    await PurgeCheckoutRun(ctx, run);
                },
            );

            // OutsideTransaction only warns when cleanup fails, so the check asserts it did not.
            const ids = (values: Array<string | undefined>) => values.filter(Boolean).map((v) => `'${v}'`).join(',') || 'NULL';
            const left = await TxOne<{ Orders: number; Subscriptions: number; Providers: number; Widgets: number }>(
                ctx,
                `SELECT
                    (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID IN (${ids(run.OrderIDs)})) AS Orders,
                    (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.Subscription WHERE ID IN (${ids(run.SubscriptionIDs)})) AS Subscriptions,
                    (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.PaymentProvider WHERE ID IN (${ids([run.PaymentProviderID])})) AS Providers,
                    (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.CheckoutWidget WHERE ID IN (${ids([run.CheckoutWidgetID])})) AS Widgets`,
            );
            AssertEqual(
                Number(left.Orders) + Number(left.Subscriptions) + Number(left.Providers) + Number(left.Widgets),
                0,
                `the check's committed rows are deleted afterwards: ${JSON.stringify(left)}`,
            );
        },
    },

    // ─── Handing a subscription to the gateway that bills it (option E, E2) ─────────────────────
    {
        Id: 'subscription-renewal.SR61',
        Name: "SR61: a subscription is handed to its account's gateway once, anchored on the term's last day, and Spawn then skips it",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const account = await gatewayBillingAccount(ctx);
                const sub = await subscriptionWithCard(ctx, account);
                await flagPrice(ctx, account, Fx().Products.SubRolling, 'price_it_rolling');

                const first = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                AssertEqual(first.Outcomes.map((o) => o.Code).join(','), 'Created', `created: ${JSON.stringify(first.Outcomes)}`);
                AssertEqual(fakeGateway.created.length, 1, 'one gateway subscription');
                const sent = fakeGateway.created[0];
                await BusinessTimeZoneEngine.Instance.Config(false, ctx.User, ctx.Provider);
                const expected = DayStartUtc(isoDate(sub.Term.EndDate), BusinessTimeZoneEngine.Instance.Zone);
                AssertEqual(sent.FirstChargeAt.toISOString(), expected.toISOString(), "first charge = 00:00 business time on the term's last day");
                AssertEqual(sent.ProviderPriceID, 'price_it_rolling', 'the flagged price');
                AssertEqual(sent.ProviderInstrumentRef, 'pm_it_e2', 'the renewal card');
                AssertEqual(sent.Metadata?.OrdersSubscriptionID, sub.SubscriptionID, 'the Orders id rides in the metadata');

                const row = await TxOne<{ PaymentProviderID: string; ProviderSubscriptionID: string }>(ctx, `SELECT PaymentProviderID, ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`);
                Assert(SameID(row.PaymentProviderID, account), 'recorded with its account');
                AssertEqual(row.ProviderSubscriptionID, first.Outcomes[0].ProviderSubscriptionID, 'recorded with the gateway id');

                const again = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                AssertEqual(again.Outcomes[0]?.Code, 'AlreadyLinked', 'a second run finds it linked');
                const byOrder = await ensureProviderSubscriptions(ctx, { OrderHeaderID: sub.OrderID, CheckoutPaymentProviderID: account });
                AssertEqual(byOrder.Outcomes.map((o) => o.Code).join(','), 'AlreadyLinked', "the checkout's order scope too");
                AssertEqual(fakeGateway.created.length, 1, 'still one gateway subscription');

                const spawned = await spawnRenewals(ctx, { SubscriptionID: sub.SubscriptionID, AsOfDate: daysBefore(sub.Term.EndDate, 10) });
                AssertEqual(spawned.Placed, 0, `the gateway renews it now, so Orders places nothing: ${spawned.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR62',
        Name: 'SR62: a gateway subscription an earlier run created is found by its metadata and recorded, never created twice',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const account = await gatewayBillingAccount(ctx);
                const sub = await subscriptionWithCard(ctx, account);
                await flagPrice(ctx, account, Fx().Products.SubRolling, 'price_it_rolling');
                // Days ago a run created it at the gateway and then failed to record it; the key has expired.
                fakeGateway.held.push({ ProviderSubscriptionID: 'sub_it_from_last_week', Status: 'active', IsLive: true, Customer: 'cus_it_e2', Metadata: { OrdersSubscriptionID: sub.SubscriptionID } });

                const out = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                AssertEqual(out.Outcomes[0]?.Code, 'Found', `found, not created: ${JSON.stringify(out.Outcomes)}`);
                AssertEqual(fakeGateway.created.length, 0, 'nothing created at the gateway');
                const row = await TxOne<{ ProviderSubscriptionID: string }>(ctx, `SELECT ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`);
                AssertEqual(row.ProviderSubscriptionID, 'sub_it_from_last_week', 'the existing gateway subscription is recorded');
            }),
    },
    {
        Id: 'subscription-renewal.SR63',
        Name: 'SR63: refusals are visible Tasks and write nothing; switch off is silent; the unlinked subscription still renews in Orders',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                // No price flagged for the product.
                const account = await gatewayBillingAccount(ctx);
                const noPrice = await subscriptionWithCard(ctx, account);
                const refused = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [noPrice.SubscriptionID] });
                AssertEqual(refused.Outcomes[0]?.Code, 'NoProviderPrice', JSON.stringify(refused.Outcomes));
                await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [noPrice.SubscriptionID] });
                AssertEqual(await alertTasks(ctx, noPrice.SubscriptionID, 'NoProviderPrice'), 1, 'one Task, however often it is reported');

                // A stub account (IsLiveMode = 0) with the switch on.
                const stub = await gatewayBillingAccount(ctx, { live: false });
                await flagPrice(ctx, stub, f.Products.SubRolling, 'price_it_stub');
                const onStub = await subscriptionWithCard(ctx, stub, f.Customers.SecondOrganizationID);
                const stubbed = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [onStub.SubscriptionID] });
                AssertEqual(stubbed.Outcomes[0]?.Code, 'StubMode', JSON.stringify(stubbed.Outcomes));
                AssertEqual(await alertTasks(ctx, onStub.SubscriptionID, 'StubMode'), 1, 'a Task for the stub account');

                // The switch off: nothing happens and nobody is bothered.
                await upsertViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, account, { BillsSubscriptions: false });
                const off = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [noPrice.SubscriptionID] });
                AssertEqual(off.Outcomes[0]?.Code, 'NotEnabled', 'switch off: not this account\'s job');

                AssertEqual(fakeGateway.created.length, 0, 'the gateway was never asked to create');
                const linked = await TxQuery(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID IN ('${noPrice.SubscriptionID}','${onStub.SubscriptionID}') AND ProviderSubscriptionID IS NOT NULL`);
                AssertEqual(linked.length, 0, 'nothing recorded');
                const renewed = await spawnRenewals(ctx, { SubscriptionID: noPrice.SubscriptionID, AsOfDate: daysBefore(noPrice.Term.EndDate, 10) });
                AssertEqual(renewed.Placed, 1, `unlinked, so Orders still renews it: ${renewed.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR64',
        Name: 'SR64: the daily pass previews, then links the eligible one, defers a late-starting term and leaves a non-renewing one alone',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                const account = await gatewayBillingAccount(ctx);
                await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                const eligible = await subscriptionWithCard(ctx, account);
                const notRenewing = await subscriptionWithCard(ctx, account, f.Customers.SecondOrganizationID);
                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, notRenewing.SubscriptionID, { AutoRenew: false });
                const ours = [eligible.SubscriptionID, notRenewing.SubscriptionID];
                const mine = (r: EnsureProviderSubscriptionsResult) => r.Outcomes.filter((o) => ours.some((id) => SameID(id, o.SubscriptionID)));

                const preview = await ensureProviderSubscriptions(ctx, { Preview: true });
                AssertEqual(mine(preview).map((o) => o.Code).join(','), 'WouldCreate', `preview lists only the eligible one: ${JSON.stringify(mine(preview))}`);
                AssertEqual(fakeGateway.created.length, 0, 'preview calls no gateway');

                // A day so early that the term's last day is more than a year out: deferred, not refused.
                const early = await ensureProviderSubscriptions(ctx, { Now: new Date('2025-12-01T12:00:00Z') });
                AssertEqual(mine(early).map((o) => o.Code).join(','), 'Deferred', JSON.stringify(mine(early)));
                AssertEqual(fakeGateway.created.length, 0, 'nothing created while deferred');

                const pass = await ensureProviderSubscriptions(ctx, {});
                AssertEqual(mine(pass).map((o) => o.Code).join(','), 'Created', JSON.stringify(mine(pass)));
                AssertEqual(fakeGateway.created.length, 1, 'one gateway subscription');
                const after = await ensureProviderSubscriptions(ctx, {});
                AssertEqual(mine(after).length, 0, 'linked subscriptions drop out of the daily pass');
            }),
    },
    {
        Id: 'subscription-renewal.SR65',
        Name: 'SR65: Spawn, then this pass, then Charge: an unpaid renewal term is collected by Orders and only the term after is handed to the gateway',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const account = await gatewayBillingAccount(ctx);
                await flagPrice(ctx, account, Fx().Products.SubRolling, 'price_it_rolling');
                // A buyer from before the switch: paid term 1 (2026), no gateway subscription.
                const sub = await subscriptionWithCard(ctx, account);

                // 03:00 UTC, the lead window: Spawn Renewals books term 2 (Confirmed, Active) and nothing pays it yet.
                const placed = await spawnRenewals(ctx, { SubscriptionID: sub.SubscriptionID, AsOfDate: daysBefore(sub.Term.EndDate, 10) });
                AssertEqual(placed.Placed, 1, `the renewal is placed: ${placed.Message}`);
                const renewalOrderID = placed.Candidates[0].OrderID!;
                const term2Start = daysBefore(sub.Term.EndDate, -1);
                const term2 = (await termsOf(ctx, sub.SubscriptionID)).find((t) => isoDate(t.StartDate) === term2Start);
                Assert(term2 != null, `precondition: term 2 starts ${term2Start}`);

                // 02:45 UTC on term 2's first day: this pass runs BEFORE Charge Renewals' 03:15. Term 2 is
                // the latest live term and its order owes 1200: handing over now would anchor the gateway at
                // the end of term 2 and leave term 2 unpaid.
                const early = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID], Now: new Date(`${term2Start}T02:45:00Z`) });
                AssertEqual(early.Outcomes.map((o) => o.Code).join(','), 'TermUnpaid', `not handed over while term 2 is unpaid: ${JSON.stringify(early.Outcomes)}`);
                AssertEqual(fakeGateway.created.length, 0, 'no gateway subscription');
                const unlinked = await TxOne<{ ProviderSubscriptionID: string | null }>(ctx, `SELECT ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`);
                AssertEqual(unlinked.ProviderSubscriptionID, null, 'still no gateway id, so Charge Renewals still owns term 2');

                // 03:15 UTC: Charge Renewals collects term 2 on the saved card.
                const charged = await chargeRenewals(ctx, { SubscriptionID: sub.SubscriptionID, AsOfDate: term2Start });
                AssertEqual(charged.Charged, 1, `Orders collects term 2: ${charged.Message}`);
                const renewal = await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${renewalOrderID}'`);
                AssertEqual(Number(renewal.Balance), 0, 'term 2 is paid');

                // 02:45 UTC the next day: term 2 is paid, so the gateway takes over from the end of term 2.
                const next = await ensureProviderSubscriptions(ctx, { Now: new Date(`${daysBefore(term2Start, -1)}T02:45:00Z`) });
                const mine = next.Outcomes.filter((o) => SameID(o.SubscriptionID, sub.SubscriptionID));
                AssertEqual(mine.map((o) => o.Code).join(','), 'Created', `handed over after Orders collected term 2: ${JSON.stringify(mine)}`);
                AssertEqual(fakeGateway.created.length, 1, 'one gateway subscription');
                await BusinessTimeZoneEngine.Instance.Config(false, ctx.User, ctx.Provider);
                AssertEqual(
                    fakeGateway.created[0].FirstChargeAt.toISOString(),
                    DayStartUtc(isoDate(term2!.EndDate), BusinessTimeZoneEngine.Instance.Zone).toISOString(),
                    "the gateway's first charge is term 3's, on term 2's last day",
                );
                AssertEqual((await paymentsFor(ctx, renewalOrderID)).length, 1, 'term 2 was paid once, by Orders');
            }),
    },
    {
        Id: 'subscription-renewal.SR66',
        Name: "SR66: a new buyer's checkout on an account that bills subscriptions hands the subscription to the gateway, and the buyer's next subscription purchase is refused",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                const account = await gatewayBillingAccount(ctx);
                await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                const widgetID = await createViaEntity(ctx, CHECKOUT_WIDGET_ENTITY, {
                    Name: `${f.Run} gateway-billed checkout`,
                    CompanyID: f.CoA.ID,
                    Status: 'Active',
                    Configuration: JSON.stringify({
                        paymentProviderId: account,
                        currency: 'USD',
                        productId: f.Products.SubRolling,
                        autoRenewConsentText: 'Renews every year until cancelled.',
                        providerBilledSubscriptionMessage: 'You already have a subscription that renews on {renewalDate}.',
                    }),
                });
                const slug = `${f.Run.toLowerCase()}-gw-${widgetID.slice(0, 8).toLowerCase()}`;
                await createViaEntity(ctx, CHECKOUT_WIDGET_DISTRIBUTION_ENTITY, { CheckoutWidgetID: widgetID, Slug: slug, Status: 'Active' });
                const email = `e2-it-${widgetID.slice(0, 8).toLowerCase()}@example.com`;
                const billing = { Country: 'US', StateProvince: 'IL', PostalCode: '60601' };
                const lines = [{ ProductID: f.Products.SubRolling, Quantity: 1 }];

                const key = `it-gw-${widgetID.slice(0, 8)}`;
                const init = await CheckoutSessionService.InitializeSession(slug, key, ctx.User);
                Assert(init.Success, `a session opens: ${init.ErrorMessage}`);
                const draft = await CheckoutSessionService.UpdateDraft(init.SessionID!, key, email, lines, billing, ctx.User);
                Assert(draft.Success, `the draft prices: ${draft.ErrorMessage}`);
                const opened = await CheckoutSessionService.OpenPaymentIntentForSession(init.SessionID!, key, ctx.User, { AutoRenewConsent: true });
                Assert(opened.Success, `an intent opens: ${opened.ErrorMessage}`);
                await settleSessionIntent(ctx, init.SessionID!);
                const done = await CheckoutSessionService.CompleteCheckout(init.SessionID!, key, ctx.User);
                Assert(done.Success, `the checkout completes: ${done.ErrorMessage}`);

                // The hook ran after the card was kept: one gateway subscription, recorded on the one sold.
                const sold = await TxOne<{ ID: string; PaymentProviderID: string | null; ProviderSubscriptionID: string | null; BeneficiaryPersonID: string | null }>(
                    ctx,
                    `SELECT s.ID, s.PaymentProviderID, s.ProviderSubscriptionID, s.BeneficiaryPersonID FROM ${ORDERS_SCHEMA}.Subscription s
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = s.OrderLineID WHERE ol.OrderHeaderID = '${done.OrderID}'`,
                );
                AssertEqual(fakeGateway.created.length, 1, `the checkout created one gateway subscription: ${JSON.stringify(fakeGateway.created)}`);
                Assert(sold.ProviderSubscriptionID?.startsWith('sub_it_') === true, `and recorded its id: ${sold.ProviderSubscriptionID}`);
                Assert(SameID(sold.PaymentProviderID, account), 'with its account');
                AssertEqual(fakeGateway.created[0].Metadata?.OrdersSubscriptionID?.toLowerCase(), sold.ID.toLowerCase(), 'carrying the Orders id');
                AssertEqual(fakeGateway.created[0].ProviderPriceID, 'price_it_rolling', 'on the flagged price');

                // The same buyer comes back for another subscription: refused at the draft, by its own code.
                const again = await CheckoutSessionService.InitializeSession(slug, `${key}-again`, ctx.User);
                Assert(again.Success, `a second session opens: ${again.ErrorMessage}`);
                const refused = await CheckoutSessionService.UpdateDraft(again.SessionID!, `${key}-again`, email, lines, billing, ctx.User);
                AssertEqual(refused.Success, false, 'the second subscription purchase is refused');
                AssertEqual(refused.Refusal?.Code, 'ProviderBilledSubscription', `by the gateway-billed rule: ${JSON.stringify(refused.Refusal)}`);
                Assert(/renews on /.test(refused.ErrorMessage ?? ''), `with the widget's wording: ${refused.ErrorMessage}`);
            }),
    },

    {
        Id: 'subscription-renewal.SR67',
        Name: 'SR67: the returning-buyer refusal, both directions: refused in the company the gateway bills; not elsewhere, not for someone else, a ticket or a cancelled subscription',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                const person = f.Customers.PersonID;
                // The fake gateway's account, so the cancel at the end can stop it there (E2b).
                const account = await gatewayBillingAccount(ctx);
                // P holds SubRolling in company A, billed by the gateway, renewing on its term's last day.
                const held = await buySubscription(ctx, 'SubRolling', 1200);
                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, held.SubscriptionID, { BeneficiaryPersonID: person });
                const check = (personID: string | null, companyID: string, productKey: string) =>
                    RunPrePurchaseChecks({
                        Email: 'buyer@example.com',
                        PersonID: personID,
                        CompanyID: companyID,
                        Lines: [{ ProductID: f.Products[productKey], Quantity: 1 }],
                        ProviderBilledSubscriptionMessage: 'Renews on {renewalDate}.',
                        ContextUser: ctx.User,
                    });

                // Control: before the marker, another subscription product is allowed.
                AssertEqual(await check(person, f.CoA.ID, 'SubCalendar'), null, 'an Orders-billed holder may buy another plan');

                await markProviderBilled(ctx, held.SubscriptionID, account, `sub_it_sr64_${held.SubscriptionID.slice(0, 8)}`);
                const refused = await check(person, f.CoA.ID, 'SubCalendar');
                AssertEqual(refused?.Refusal.Code, 'ProviderBilledSubscription', `refused in company A: ${JSON.stringify(refused)}`);
                Assert(refused!.Refusal.ProductIDs.some((id) => SameID(id, f.Products.SubRolling)), 'naming the product the gateway bills');
                const lastDay = isoDate(held.Term.EndDate);
                Assert(refused!.Message.includes(new Date(`${lastDay}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })), `with the renewal day: ${refused!.Message}`);

                AssertEqual(await check(person, f.CoB.ID, 'SubCalendar'), null, 'the same buyer in company B is not refused');
                AssertEqual(await check(f.Customers.SecondPersonID, f.CoA.ID, 'SubCalendar'), null, 'someone else (another e-mail) is not refused');
                AssertEqual(await check(person, f.CoA.ID, 'EventTicket'), null, 'a ticket (no subscription type) is not refused');

                // Cancelled the only way a gateway-billed subscription can be (E2b): through the cancel, which
                // stops the gateway first. An edit of its Status is refused (SR68).
                fakeGateway.held.push({ ProviderSubscriptionID: `sub_it_sr64_${held.SubscriptionID.slice(0, 8)}`, Status: 'active', IsLive: true, Customer: 'cus_it_e2', Metadata: {} });
                const cancelled = await cancelSubscription(ctx, { SubscriptionID: held.SubscriptionID, RequestDate: '2026-02-01', Timing: 'Immediate' });
                Assert(cancelled.Success, `cancelled: ${cancelled.Message}`);
                AssertEqual(await check(person, f.CoA.ID, 'SubCalendar'), null, 'a cancelled gateway-billed subscription does not refuse');
            }),
    },
    // ─── Once the gateway bills it, no Orders door changes it unseen (E2b) ──────────────────────────
    {
        Id: 'subscription-renewal.SR68',
        Name: "SR68: a gateway-billed subscription's billing columns cannot be edited; the same edit before it was linked saved",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const account = await gatewayBillingAccount(ctx);
                const sub = await subscriptionWithCard(ctx, account);
                await flagPrice(ctx, account, Fx().Products.SubRolling, 'price_it_rolling');
                const edit = async (fields: Record<string, unknown>) => {
                    const entity = await new Metadata().GetEntityObject<BaseEntity>(SUBSCRIPTION_ENTITY, ctx.User);
                    Assert(await entity.InnerLoad(CompositeKey.FromID(sub.SubscriptionID)), 'the subscription loads');
                    for (const [k, v] of Object.entries(fields)) entity.Set(k, v);
                    const saved = await entity.Save();
                    const detail = (entity.LatestResult?.Errors ?? []).map((e) => (typeof e === 'string' ? e : (e as { Message?: string }).Message ?? JSON.stringify(e))).join('; ') || entity.LatestResult?.CompleteMessage || '';
                    return { saved, detail };
                };

                // Control, before the gateway bills it: the edit saves, as it always has.
                const before = await edit({ AutoRenew: false });
                Assert(before.saved, `an Orders-billed subscription's AutoRenew still saves: ${before.detail}`);
                Assert((await edit({ AutoRenew: true })).saved, 'and back on');

                const linked = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                AssertEqual(linked.Outcomes[0]?.Code, 'Created', JSON.stringify(linked.Outcomes));
                const gatewayID = linked.Outcomes[0].ProviderSubscriptionID!;

                for (const fields of [{ AutoRenew: false }, { Status: 'Canceled' }, { ProviderSubscriptionID: null, PaymentProviderID: null }]) {
                    const refused = await edit(fields);
                    Assert(!refused.saved, `${JSON.stringify(fields)} is refused on a gateway-billed subscription`);
                    Assert(/also cancels it at the gateway/.test(refused.detail) && refused.detail.includes(gatewayID), `and says why: ${refused.detail}`);
                }
                const row = await TxOne<{ Status: string; AutoRenew: boolean; ProviderSubscriptionID: string }>(
                    ctx,
                    `SELECT Status, AutoRenew, ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`,
                );
                AssertEqual(`${row.Status}|${Number(row.AutoRenew)}|${row.ProviderSubscriptionID}`, `Active|1|${gatewayID}`, 'nothing changed in the database');

                // A column the gateway does not bill on still saves.
                const lead = await edit({ RenewalLeadDays: 45 });
                Assert(lead.saved, `RenewalLeadDays still saves: ${lead.detail}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR69',
        Name: 'SR69: cancelling a gateway-billed subscription stops the gateway first; a refusal leaves Orders unchanged',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const account = await gatewayBillingAccount(ctx);
                const sub = await subscriptionWithCard(ctx, account);
                await flagPrice(ctx, account, Fx().Products.SubRolling, 'price_it_rolling');
                const linked = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                const gatewayID = linked.Outcomes[0].ProviderSubscriptionID!;
                const state = () =>
                    TxOne<{ Status: string; AutoRenew: boolean; ProviderSubscriptionID: string }>(
                        ctx,
                        `SELECT Status, AutoRenew, ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`,
                    );

                // The gateway does not confirm: nothing changes in Orders.
                fakeGateway.refuseCancel = 'rate limited';
                const refused = await cancelSubscription(ctx, { SubscriptionID: sub.SubscriptionID, RequestDate: '2026-02-01', Timing: 'EndOfTerm' });
                Assert(!refused.Success, 'refused while the gateway does not confirm');
                Assert(/rate limited.*Nothing was changed in Orders/.test(refused.Message ?? ''), `says so: ${refused.Message}`);
                AssertEqual((await state()).Status, 'Active', 'still Active in Orders');
                AssertEqual(fakeGateway.cancelled.length, 1, 'the gateway was asked once');

                // It confirms: told to charge nothing after 00:00 business time the day after the term ends.
                fakeGateway.refuseCancel = null;
                const done = await cancelSubscription(ctx, { SubscriptionID: sub.SubscriptionID, RequestDate: '2026-02-01', Timing: 'EndOfTerm' });
                Assert(done.Success, `cancelled: ${done.Message}`);
                await BusinessTimeZoneEngine.Instance.Config(false, ctx.User, ctx.Provider);
                const expected = DayStartUtc(AddDays(isoDate(sub.Term.EndDate), 1), BusinessTimeZoneEngine.Instance.Zone);
                AssertEqual(fakeGateway.cancelled[1].ProviderSubscriptionID, gatewayID, 'the recorded gateway subscription');
                AssertEqual(fakeGateway.cancelled[1].BillingEndsAt?.toISOString(), expected.toISOString(), 'nothing charged after coverage ends');
                const after = await state();
                AssertEqual(`${after.Status}|${Number(after.AutoRenew)}|${after.ProviderSubscriptionID}`, `Canceled|0|${gatewayID}`, 'cancelled, the gateway id kept as history');
                const event = await TxOne<{ EventData: string }>(
                    ctx,
                    `SELECT TOP 1 EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID = '${sub.SubscriptionID}' AND EventType = 'Canceled' ORDER BY __mj_CreatedAt DESC`,
                );
                AssertEqual(JSON.parse(event.EventData).Gateway?.Outcome, 'EndsAtPeriodEnd', 'the event records what the gateway did');
            }),
    },
    {
        Id: 'subscription-renewal.SR70',
        Name: 'SR70: a second order cannot extend a gateway-billed subscription; after a cancel, buying again starts fresh with a new gateway subscription',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                const account = await gatewayBillingAccount(ctx);
                const sub = await subscriptionWithCard(ctx, account);
                await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                const linked = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                const oldID = linked.Outcomes[0].ProviderSubscriptionID!;
                const buyAgain = (orderDate: string) =>
                    ConfirmOrder(ctx.User, {
                        CompanyID: f.CoA.ID,
                        OrderDate: new Date(`${orderDate}T00:00:00Z`),
                        BillToOrganizationID: f.Customers.OrganizationID,
                        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
                    });

                // SubRolling extends an existing subscription: here that would bill a year the gateway bills too.
                const extend = await buyAgain('2026-02-01');
                Assert(!extend.Saved, 'a second order cannot extend it');
                Assert(/billed by the payment gateway.*cannot extend it/.test(extend.Message ?? ''), `and says why: ${extend.Message}`);

                // Cancelled now (the gateway with it), then bought again: reactivated without the old id.
                const cancelled = await cancelSubscription(ctx, { SubscriptionID: sub.SubscriptionID, RequestDate: '2026-02-01', Timing: 'Immediate' });
                Assert(cancelled.Success, `cancelled: ${cancelled.Message}`);
                AssertEqual(fakeGateway.held.find((h) => h.ProviderSubscriptionID === oldID)?.IsLive, false, 'the old gateway subscription ended');
                const again = await buyAgain('2026-03-01');
                Assert(again.Saved, `buying again confirms: ${again.Message}`);
                const term = await TxOne<{ SubscriptionID: string }>(
                    ctx,
                    `SELECT st.SubscriptionID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID WHERE ol.OrderHeaderID = '${again.Order.ID}'`,
                );
                Assert(SameID(term.SubscriptionID, sub.SubscriptionID), 'the same subscription comes back (reactivated)');
                const row = await TxOne<{ Status: string; ProviderSubscriptionID: string | null; PaymentProviderID: string | null }>(
                    ctx,
                    `SELECT Status, ProviderSubscriptionID, PaymentProviderID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`,
                );
                AssertEqual(`${row.Status}|${row.ProviderSubscriptionID}|${row.PaymentProviderID}`, 'Active|null|null', 'active, its old gateway id retired');
                const activated = await TxOne<{ EventData: string }>(
                    ctx,
                    `SELECT TOP 1 EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID = '${sub.SubscriptionID}' AND EventType = 'Activated' ORDER BY __mj_CreatedAt DESC`,
                );
                AssertEqual(JSON.parse(activated.EventData).RetiredProviderSubscriptionID, oldID, 'the retired id is on the event');

                // Paid, then handed over: a NEW gateway subscription, the old one not mistaken for it.
                await payInFull(ctx, again.Order.ID as string, f.Customers.OrganizationID);
                // Through the checkout's own scope, the new ORDER: the subscription keeps its original line in
                // OrderLineID, so the hand-over finds it through the new term's line.
                const fresh = await ensureProviderSubscriptions(ctx, { OrderHeaderID: again.Order.ID as string, Now: new Date('2026-03-01T12:00:00Z') });
                AssertEqual(fresh.Outcomes[0]?.Code, 'Created', `a new one is created: ${JSON.stringify(fresh.Outcomes)}`);
                Assert(fresh.Outcomes[0].ProviderSubscriptionID !== oldID, 'with a new id');
                AssertEqual(fakeGateway.created.length, 2, 'two gateway subscriptions in all, one per period of billing');
            }),
    },
    {
        Id: 'subscription-renewal.SR71',
        Name: 'SR71: a return of its sale and a Duration concession on its term are refused; an open gateway alert stops a cancel',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                const account = await gatewayBillingAccount(ctx);
                const sub = await subscriptionWithCard(ctx, account);
                await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });

                const sale = await TxOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${sub.OrderID}'`);
                const ret = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderType: 'Return',
                    OrderDate: new Date('2026-02-01T00:00:00Z'),
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [{ ProductID: f.Products.SubRolling, Quantity: -1, ReversesOrderLineID: sale.ID }],
                });
                Assert(!ret.Saved, 'a return of the gateway-billed sale is refused');
                Assert(/payment gateway bills.*Cancel the subscription instead/.test(ret.Message ?? ''), `and says what to do: ${ret.Message}`);

                const concession = await new Metadata().GetEntityObject<BaseEntity>(ORDER_CONCESSION_ENTITY, ctx.User);
                concession.NewRecord();
                concession.Set('DeliveryForm', 'Duration');
                concession.Set('SubscriptionTermID', sub.Term.ID);
                concession.Set('AddedDays', 30);
                concession.Set('ReasonCategory', 'Retention');
                concession.Set('Reason', 'keep Jane');
                Assert(!(await concession.Save()), 'a Duration concession on its term is refused');
                Assert(/billed by the payment gateway/.test(concession.LatestResult?.CompleteMessage ?? ''), `and says why: ${concession.LatestResult?.CompleteMessage}`);

                // An unlinked subscription whose gateway subscription went unrecorded: the cancel waits for the person.
                const other = await subscriptionWithCard(ctx, account, f.Customers.SecondOrganizationID);
                const number = (await TxOne<{ SubscriptionNumber: string }>(ctx, `SELECT SubscriptionNumber FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${other.SubscriptionID}'`)).SubscriptionNumber;
                await raiseProviderSubscriptionAlert(
                    { SubscriptionID: other.SubscriptionID, SubscriptionNumber: number, Code: 'NotRecorded', Reason: 'SR71 probe' },
                    ctx.User,
                    ctx.Provider,
                );
                const blocked = await cancelSubscription(ctx, { SubscriptionID: other.SubscriptionID, RequestDate: '2026-02-01', Timing: 'Immediate' });
                Assert(!blocked.Success, 'the cancel waits for the open alert');
                Assert(/open gateway alert \(NotRecorded\)/.test(blocked.Message ?? ''), `and names it: ${blocked.Message}`);
                AssertEqual((await TxOne<{ Status: string }>(ctx, `SELECT Status FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${other.SubscriptionID}'`)).Status, 'Active', 'nothing changed');
            }),
    },
    {
        Id: 'subscription-renewal.SR72',
        Name: 'SR72: every term-changing concession (Duration, Shift, Seats, amount) is refused on a gateway-billed term; not on an unlinked one',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                const account = await gatewayBillingAccount(ctx);
                const billed = await subscriptionWithCard(ctx, account);
                await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                const handed = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [billed.SubscriptionID] });
                AssertEqual(handed.Outcomes[0]?.Code, 'Created', `precondition: the gateway bills it: ${JSON.stringify(handed.Outcomes)}`);
                // The control: the same product and holder shape, never handed over.
                const unlinked = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, f.Customers.SecondOrganizationID);

                const kinds: Array<{ Kind: string; Fields: (sub: { OrderID: string; Term: { ID: string } }) => Promise<Record<string, unknown>> }> = [
                    { Kind: 'Duration', Fields: async (sub) => ({ DeliveryForm: 'Duration', SubscriptionTermID: sub.Term.ID, AddedDays: 30 }) },
                    {
                        Kind: 'Shift',
                        Fields: async (sub) => {
                            const t = await TxOne<{ StartDate: string; EndDate: string }>(ctx, `SELECT StartDate, EndDate FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID = '${sub.Term.ID}'`);
                            return {
                                DeliveryForm: 'Shift',
                                SubscriptionTermID: sub.Term.ID,
                                NewStartDate: new Date(AddDays(isoDate(t.StartDate), 10) + 'T00:00:00Z'),
                                NewEndDate: new Date(AddDays(isoDate(t.EndDate), 10) + 'T00:00:00Z'),
                            };
                        },
                    },
                    {
                        Kind: 'Seats',
                        Fields: async (sub) => {
                            const line = await TxOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${sub.OrderID}'`);
                            return { DeliveryForm: 'Seats', OrderLineID: line.ID, AddedQuantity: 3 };
                        },
                    },
                    { Kind: 'amount change', Fields: async (sub) => ({ DeliveryForm: 'Price', SubscriptionTermID: sub.Term.ID, NewAmount: 900 }) },
                ];
                const record = async (fields: Record<string, unknown>) => {
                    const c = await new Metadata().GetEntityObject<BaseEntity>(ORDER_CONCESSION_ENTITY, ctx.User);
                    c.NewRecord();
                    for (const [k, v] of Object.entries(fields)) c.Set(k, v);
                    c.Set('ReasonCategory', 'Retention');
                    c.Set('Reason', 'SR72 probe');
                    const saved = await c.Save();
                    return { Saved: saved, Message: c.LatestResult?.CompleteMessage ?? '' };
                };
                const gatewayRefusal = /billed by the payment gateway/;
                // The control's concessions must be ones staff could record: within the requester's authority, and
                // with an accounting role to tell of the term amendment.
                await grantAuthority(ctx, 10_000, 365);
                await AcknowledgeAmendmentsWith(ctx);
                OrdersSettings.SetOverride(ORDERS_SETTING.TermShiftReviewDays, '30'); // a 10-day shift goes through
                try {
                    for (const k of kinds) {
                        const onBilled = await record(await k.Fields(billed));
                        Assert(!onBilled.Saved, `a ${k.Kind} concession on the gateway-billed term is refused`);
                        Assert(gatewayRefusal.test(onBilled.Message), `${k.Kind}: and says the gateway bills it: ${onBilled.Message}`);
                        const onUnlinked = await record(await k.Fields(unlinked));
                        Assert(onUnlinked.Saved, `${k.Kind}: the same concession on an unlinked subscription saves: ${onUnlinked.Message}`);
                    }
                } finally {
                    OrdersSettings.SetOverride(ORDERS_SETTING.AmendmentAcknowledgmentRole, undefined);
                    OrdersSettings.SetOverride(ORDERS_SETTING.TermShiftReviewDays, undefined);
                }
            }),
    },

    {
        Id: 'subscription-renewal.SR73',
        Name: "SR73: a cancel on the term's last day, after the gateway renewed at 00:00, is refused; once ended at the gateway, the cancel finishes in Orders",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                const account = await gatewayBillingAccount(ctx);
                const sub = await subscriptionWithCard(ctx, account);
                await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                const linked = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                const gatewayID = linked.Outcomes[0].ProviderSubscriptionID!;
                const lastDay = isoDate(sub.Term.EndDate);
                const held = fakeGateway.held.find((h) => h.ProviderSubscriptionID === gatewayID)!;

                // The gateway charged the renewal at 00:00 business time on the last day: a period Orders has not booked.
                held.PeriodStart = DayStartUtc(lastDay, BusinessTimeZoneEngine.Instance.Zone);
                const status = async () =>
                    (await TxOne<{ Status: string }>(ctx, `SELECT Status FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`)).Status;
                for (const input of [
                    { RequestDate: lastDay, Timing: 'Immediate' },
                    { RequestDate: lastDay, Timing: 'EndOfTerm' },
                ]) {
                    const refused = await cancelSubscription(ctx, { SubscriptionID: sub.SubscriptionID, ...input });
                    Assert(!refused.Success, `the last-day cancel (${input.Timing}) is refused`);
                    Assert(/started a new billing period/.test(refused.Message ?? ''), `and says the gateway already renewed it: ${refused.Message}`);
                }
                AssertEqual(fakeGateway.cancelled.length, 0, 'nothing was asked of the gateway');
                AssertEqual(await status(), 'Active', 'nothing changed in Orders');

                // Support cancels it at the gateway (and refunds the renewal there); a week after the term, Orders finishes.
                held.IsLive = false;
                held.Status = 'canceled';
                const finished = (await cancelSubscription(ctx, {
                    SubscriptionID: sub.SubscriptionID,
                    RequestDate: AddDays(lastDay, 7),
                    Timing: 'Immediate',
                })) as { Success: boolean; Message?: string; TotalRefundAmount?: number; Decision?: { EffectiveDate?: string }; Gateway?: { Outcome?: string } };
                Assert(finished.Success, `the cancel finishes once the gateway has ended it: ${finished.Message}`);
                AssertEqual(await status(), 'Canceled', 'cancelled in Orders');
                AssertEqual(isoDate(finished.Decision!.EffectiveDate!), lastDay, 'effective at the end of the coverage it sold, not a week later');
                AssertEqual(finished.TotalRefundAmount ?? 0, 0, 'nothing refunded: the term was served');
                AssertEqual(finished.Gateway?.Outcome, 'AlreadyEnded', 'the gateway answered that it had already ended');
            }),
    },
    {
        Id: 'subscription-renewal.SR74',
        Name: 'SR74: a gateway id typed onto an existing subscription is refused and the row stays unlinked; the sanctioned link records one',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const account = await gatewayBillingAccount(ctx);
                const sub = await buySubscription(ctx, 'SubRolling', 1200);
                let refusal = '';
                try {
                    await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, sub.SubscriptionID, { PaymentProviderID: account, ProviderSubscriptionID: 'sub_it_typed' });
                } catch (e) {
                    refusal = String(e);
                }
                Assert(/recorded by Orders when it creates the gateway subscription/.test(refusal), `typing an id is refused: ${refusal || 'it was allowed'}`);
                const row = async () =>
                    TxOne<{ ProviderSubscriptionID: string | null }>(ctx, `SELECT ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`);
                AssertEqual((await row()).ProviderSubscriptionID, null, 'the row stays unlinked, so Orders still renews it');

                await markProviderBilled(ctx, sub.SubscriptionID, account, 'sub_it_sanctioned');
                AssertEqual((await row()).ProviderSubscriptionID, 'sub_it_sanctioned', 'the sanctioned link (the hand-over\'s) records it');
            }),
    },

    // ─── E3 + E4: hearing what the gateway did, and booking it ──────────────────────────────────────
    {
        Id: 'subscription-renewal.SR75',
        Name: 'SR75: a renewal the gateway charged is booked once: term 2 the day after term 1, a confirmed order on the subscription\'s product, the payment captured by charge, events and grants; then nothing more',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                g.held.Invoices = [renewalInvoice(g, 'r1')];
                const first = await syncNow(ctx, g.SubscriptionID, g.anchor);
                AssertEqual(first.Outcome, 'Changed', `the sync booked it: ${JSON.stringify(first)}`);

                const terms = await termsOf(ctx, g.SubscriptionID);
                AssertEqual(terms.length, 2, 'a second term');
                AssertEqual(`${isoDate(terms[1].StartDate)}→${isoDate(terms[1].EndDate)}`, `${AddDays(g.lastDay, 1)}→2027-12-31`, 'contiguous with term 1, a year long');
                const order = await renewalOrderOf(ctx, g.SubscriptionID);
                AssertEqual(`${order.Status}|${order.Origin}|${isoDate(order.OrderDate)}`, `Confirmed|ProviderPayment|${g.lastDay}`, 'a confirmed ProviderPayment order dated the business day it was charged');
                AssertEqual(`${order.ProductID.toLowerCase()}|${Number(order.UnitPrice)}|${order.RenewsSubscriptionID.toLowerCase()}`, `${Fx().Products.SubRolling.toLowerCase()}|1200|${g.SubscriptionID.toLowerCase()}`, "one line, the subscription's own product, at what was charged, renewing it");
                const pay = await TxOne<{ N: number; Amount: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N, SUM(Amount) AS Amount FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE IdempotencyKey = 'provider-charge:${g.account.toLowerCase()}:ch_it_r1'`,
                );
                AssertEqual(`${pay.N}|${Number(pay.Amount)}`, '1|1200', 'one payment, keyed by the gateway charge');
                AssertEqual(Number((await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${order.ID}'`)).Balance), 0, 'the renewal is paid');
                const events = await gatewayEvents(ctx, g.SubscriptionID);
                AssertEqual(events.filter((e) => e.EventType === 'PaymentSucceeded' || e.EventType === 'RenewalOrderSpawned').length, 2, 'PaymentSucceeded and RenewalOrderSpawned, from the gateway');
                const grants = await TxQuery<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionTermID = '${terms[1].ID}'`);
                Assert(Number(grants[0].N) > 0, 'term 2 granted its access');

                const again = await syncNow(ctx, g.SubscriptionID, new Date(g.anchor.getTime() + 3600_000));
                AssertEqual(again.Outcome, 'InLine', `the second sync finds nothing to do: ${JSON.stringify(again)}`);
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 2, 'still two terms');
                // Spawn Renewals still leaves it alone (E1), now that the gateway renews it.
                AssertEqual((await spawnRenewals(ctx, { SubscriptionID: g.SubscriptionID, AsOfDate: '2027-12-20' })).Placed, 0, 'Spawn Renewals places nothing');
            }),
    },
    {
        Id: 'subscription-renewal.SR76',
        Name: "SR76: a renewal charged on another price keeps the subscription's product and is booked as charged; below the last price with no coupon a person is told, with a coupon not",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                // The $399 "Foundation" price a Professional subscriber was imported on.
                g.held.Invoices = [renewalInvoice(g, 'r1', { AmountPaid: 399, AmountDue: 399, ProviderPriceID: 'price_it_foundation' })];
                const synced = await syncNow(ctx, g.SubscriptionID, g.anchor);
                Assert(synced.Notices.includes('RenewalAmountUnusual'), `a person is told: ${JSON.stringify(synced)}`);
                const order = await renewalOrderOf(ctx, g.SubscriptionID);
                AssertEqual(`${order.ProductID.toLowerCase()}|${Number(order.UnitPrice)}`, `${Fx().Products.SubRolling.toLowerCase()}|399`, 'the product is kept; the price is what was charged');
                AssertEqual(await namedTasks(ctx, `Gateway subscription needs attention: ${g.SubscriptionNumber} (RenewalAmountUnusual)`), 1, 'one Task');

                // Control: a deep coupon ($1 a year, far below today's list price) is booked and confirmed as charged,
                // with no Task and never held as a concession: the price is what the gateway took, not one someone typed.
                const h = await gatewayBilled(ctx, Fx().Customers.SecondOrganizationID);
                h.held.Invoices = [renewalInvoice(h, 'r2', { AmountPaid: 1, AmountDue: 1, Discounted: true })];
                const quiet = await syncNow(ctx, h.SubscriptionID, h.anchor);
                AssertEqual(`${quiet.Outcome}|${quiet.Notices.length}`, 'Changed|0', `booked, nobody told: ${JSON.stringify(quiet)}`);
                const deepOrder = await renewalOrderOf(ctx, h.SubscriptionID);
                AssertEqual(`${deepOrder.Status}|${Number(deepOrder.UnitPrice)}`, 'Confirmed|1', '$1 a year, confirmed as charged');
            }),
    },
    {
        Id: 'subscription-renewal.SR77',
        Name: 'SR77: a failed renewal charge is recorded once and keeps access to the end of the retry day (Q4); the retry that succeeds books term 2 from the day after term 1',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                const retry = new Date(`${AddDays(g.lastDay, 3)}T15:00:00Z`);
                g.held.State = 'Collecting';
                g.held.Invoices = [renewalInvoice(g, 'r1', { Status: 'open', AmountPaid: 0, PaidAt: null, ProviderChargeID: null, NextAttemptAt: retry })];
                const before = await grantEnd(ctx, g.TermID);
                const failed = await syncNow(ctx, g.SubscriptionID, g.anchor);
                AssertEqual(failed.Outcome, 'Changed', `recorded: ${JSON.stringify(failed)}`);
                const failures = (await gatewayEvents(ctx, g.SubscriptionID)).filter((e) => e.EventType === 'PaymentFailed');
                AssertEqual(failures.length, 1, 'one PaymentFailed event');
                AssertEqual(JSON.parse(failures[0].EventData).Attempt, 1, 'naming the attempt');
                const kept = await grantEnd(ctx, g.TermID);
                const endOfRetryDay = DayStartUtc(AddDays(g.lastDay, 4), BusinessTimeZoneEngine.Instance.Zone);
                AssertEqual(kept?.toISOString(), endOfRetryDay.toISOString(), `access kept to the end of the retry's business day (was ${before?.toISOString()})`);
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 1, 'no term booked for a charge that failed');

                const rerun = await syncNow(ctx, g.SubscriptionID, new Date(g.anchor.getTime() + 3600_000));
                AssertEqual(rerun.Outcome, 'InLine', `a rerun records nothing twice: ${JSON.stringify(rerun)}`);

                // The retry collects.
                g.held.State = undefined;
                g.held.Invoices = [renewalInvoice(g, 'r1', { AttemptCount: 2, PaidAt: retry })];
                const paid = await syncNow(ctx, g.SubscriptionID, retry);
                AssertEqual(paid.Outcome, 'Changed', `booked: ${JSON.stringify(paid)}`);
                const terms = await termsOf(ctx, g.SubscriptionID);
                AssertEqual(isoDate(terms[1].StartDate), AddDays(g.lastDay, 1), 'term 2 still starts the day after term 1');
                AssertEqual(isoDate((await renewalOrderOf(ctx, g.SubscriptionID)).OrderDate), AddDays(g.lastDay, 3), 'the order is dated the day it was collected');
            }),
    },
    {
        Id: 'subscription-renewal.SR78',
        Name: 'SR78: the gateway gives up and ends it: Orders records the cancel at the end of the term, nothing refunded, nothing booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                const endedAt = new Date(`${AddDays(g.lastDay, 15)}T15:00:00Z`);
                g.held.IsLive = false;
                g.held.Status = 'canceled';
                g.held.EndedAt = endedAt;
                g.held.Invoices = [renewalInvoice(g, 'r1', { Status: 'uncollectible', AmountPaid: 0, PaidAt: null, ProviderChargeID: null, AttemptCount: 4 })];
                const synced = await syncNow(ctx, g.SubscriptionID, endedAt);
                AssertEqual(synced.Outcome, 'Changed', `the cancel is recorded: ${JSON.stringify(synced)}`);
                const row = await subscriptionRow(ctx, g.SubscriptionID);
                AssertEqual(`${row.Status}|${row.ProviderSubscriptionID}`, `Canceled|${g.gatewayID}`, 'cancelled, the gateway id kept as history');
                const ev = await TxOne<{ EventData: string }>(
                    ctx,
                    `SELECT TOP 1 EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID = '${g.SubscriptionID}' AND EventType = 'Canceled' ORDER BY __mj_CreatedAt DESC`,
                );
                const data = JSON.parse(ev.EventData) as { Gateway?: { Outcome?: string } };
                AssertEqual(data.Gateway?.Outcome, 'AlreadyEnded', 'the gateway had already ended it, so nothing was asked of it');
                AssertEqual(fakeGateway.cancelled.length, 1, 'one read-only cancel call answered AlreadyEnded');
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 1, 'nothing booked');
                const again = await syncNow(ctx, g.SubscriptionID, new Date(endedAt.getTime() + 3600_000));
                AssertEqual(again.Outcome, 'InLine', `the next sync agrees: ${JSON.stringify(again)}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR79',
        Name: "SR79: a cancel at period end made at the gateway turns automatic renewal off with an event; withdrawn, it turns back on; one ending before the coverage sold tells a person",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                g.held.EndsAt = g.anchor; // the portal's "cancel at period end"
                const off = await syncNow(ctx, g.SubscriptionID, new Date('2026-03-03T15:00:00Z'));
                AssertEqual(`${off.Outcome}|${off.Notices.length}`, 'Changed|0', `recorded, no Task for a routine cancel: ${JSON.stringify(off)}`);
                AssertEqual(`${(await subscriptionRow(ctx, g.SubscriptionID)).Status}|${Number((await subscriptionRow(ctx, g.SubscriptionID)).AutoRenew)}`, 'Active|0', 'still active, automatic renewal off');
                const requested = (await gatewayEvents(ctx, g.SubscriptionID)).filter((e) => e.EventType === 'CancellationRequested');
                AssertEqual(JSON.parse(requested[0].EventData).EndsAt, g.anchor.toISOString(), 'the event says when the gateway ends it');
                AssertEqual(fakeGateway.cancelled.length, 0, 'nothing asked of the gateway');

                g.held.EndsAt = undefined; // withdrawn in the portal
                const on = await syncNow(ctx, g.SubscriptionID, new Date('2026-03-05T15:00:00Z'));
                AssertEqual(on.Outcome, 'Changed', `${JSON.stringify(on)}`);
                AssertEqual(Number((await subscriptionRow(ctx, g.SubscriptionID)).AutoRenew), 1, 'automatic renewal back on');
                const withdrawn = (await gatewayEvents(ctx, g.SubscriptionID)).filter((e) => e.EventType === 'CancellationRequested');
                AssertEqual(JSON.parse(withdrawn[withdrawn.length - 1].EventData).Withdrawn, true, 'with an event saying the cancel was withdrawn');

                // Ending at the gateway months before the coverage Orders sold: access is kept, a person is told.
                g.held.EndsAt = new Date('2026-06-01T05:00:00Z');
                const early = await syncNow(ctx, g.SubscriptionID, new Date('2026-03-06T15:00:00Z'));
                Assert(early.Notices.includes('GatewayEndsBeforeCoverage'), `a person is told: ${JSON.stringify(early)}`);
                AssertEqual((await subscriptionRow(ctx, g.SubscriptionID)).Status, 'Active', 'Orders keeps it to its term end');
            }),
    },
    {
        Id: 'subscription-renewal.SR80',
        Name: 'SR80: ended now at the gateway (a dashboard cancel): Orders records an immediate cancel on the day it ended',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                const endedAt = new Date('2026-06-01T15:00:00Z');
                g.held.IsLive = false;
                g.held.Status = 'canceled';
                g.held.EndedAt = endedAt;
                const synced = await syncNow(ctx, g.SubscriptionID, endedAt);
                AssertEqual(synced.Outcome, 'Changed', `${JSON.stringify(synced)}`);
                Assert(synced.Actions.some((a) => /Immediate, 2026-06-01/.test(a)), `an immediate cancel on 1 Jun: ${synced.Actions.join(' | ')}`);
                AssertEqual((await subscriptionRow(ctx, g.SubscriptionID)).Status, 'Canceled', 'cancelled');
                const ev = await TxOne<{ EventData: string }>(
                    ctx,
                    `SELECT TOP 1 EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID = '${g.SubscriptionID}' AND EventType = 'Canceled' ORDER BY __mj_CreatedAt DESC`,
                );
                AssertEqual(isoDate(JSON.parse(ev.EventData).EffectiveDate ?? JSON.parse(ev.EventData).Decision?.EffectiveDate ?? '2026-06-01'), '2026-06-01', 'effective the day the gateway ended it');
            }),
    },
    {
        Id: 'subscription-renewal.SR81',
        Name: 'SR81: Q5 the gateway renews a subscription Orders cancelled: the SAME subscription is reactivated with its gateway id, the renewal booked, and support told',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                const cancelled = await cancelSubscription(ctx, { SubscriptionID: g.SubscriptionID, RequestDate: '2026-06-01', Timing: 'EndOfTerm' });
                Assert(cancelled.Success, `cancelled in Orders: ${cancelled.Message}`);
                AssertEqual((await subscriptionRow(ctx, g.SubscriptionID)).Status, 'Canceled', 'precondition: cancelled');
                // The customer withdrew the cancel at the gateway, and it charged.
                g.held.EndsAt = undefined;
                g.held.Invoices = [renewalInvoice(g, 'r1')];
                const synced = await syncNow(ctx, g.SubscriptionID, g.anchor);
                Assert(synced.Notices.includes('ReactivatedByGateway'), `support is told: ${JSON.stringify(synced)}`);
                const row = await subscriptionRow(ctx, g.SubscriptionID);
                AssertEqual(`${row.Status}|${Number(row.AutoRenew)}|${row.ProviderSubscriptionID}`, `Active|1|${g.gatewayID}`, 'the same subscription, active, its gateway id kept');
                const subs = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(DISTINCT st.SubscriptionID) AS N FROM ${ORDERS_SCHEMA}.SubscriptionTerm st JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID JOIN ${ORDERS_SCHEMA}.OrderHeader oh ON oh.ID = ol.OrderHeaderID WHERE oh.BillToOrganizationID = '${Fx().Customers.OrganizationID}' AND oh.Origin = 'ProviderPayment'`,
                );
                AssertEqual(Number(subs.N), 1, 'never a second subscription');
                const terms = await termsOf(ctx, g.SubscriptionID);
                AssertEqual(isoDate(terms[terms.length - 1].StartDate), AddDays(g.lastDay, 1), 'its term continues from the last one');
                AssertEqual(await namedTasks(ctx, `Gateway subscription needs attention: ${g.SubscriptionNumber} (ReactivatedByGateway)`), 1, 'one Task for support');
            }),
    },
    {
        Id: 'subscription-renewal.SR82',
        Name: "SR82: the webhook: a paid renewal's event books it and is recorded Applied, the same event again books nothing; an unknown gateway subscription on a price Orders sells raises one Task, one on another price none",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx, undefined, { webhooks: true });
                g.held.Invoices = [renewalInvoice(g, 'r1')];
                const deliver = async (event: WebhookEvent) => {
                    fakeGateway.event = event;
                    return HandlePaymentWebhook({ RawBody: '{}', Headers: {}, PaymentProviderID: g.account }, ctx.Provider, ctx.User);
                };
                const paid: WebhookEvent = { EventID: 'evt_it_paid_1', Kind: 'invoice.paid', ProviderSubscriptionID: g.gatewayID, OccurredAt: g.anchor };
                AssertEqual((await deliver(paid)).Status, 200, 'answered 200');
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 2, 'the renewal is booked');
                const delivery = async (id: string) =>
                    TxQuery<{ Outcome: string; ReasonCode: string | null }>(ctx, `SELECT Outcome, ReasonCode FROM ${ORDERS_SCHEMA}.PaymentWebhookDelivery WHERE ProviderEventID = '${id}'`);
                AssertEqual((await delivery('evt_it_paid_1'))[0]?.Outcome, 'Applied', 'recorded Applied');
                const again = await deliver(paid);
                AssertEqual(`${again.Status}|${(again.Body as { outcome?: string }).outcome}`, '200|AlreadyApplied', 'the same event again: already applied');
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 2, 'nothing booked twice');

                // Not recorded in Orders, on the price Orders sells here: one Task, however often the gateway says so.
                fakeGateway.held.push({ ProviderSubscriptionID: 'sub_it_unknown', Status: 'active', IsLive: true, Customer: 'cus_sam', Metadata: {}, PriceID: 'price_it_rolling', Email: 'ethan.testing.bc+sam@gmail.com' });
                await deliver({ EventID: 'evt_it_unknown_1', Kind: 'invoice.paid', ProviderSubscriptionID: 'sub_it_unknown' });
                await deliver({ EventID: 'evt_it_unknown_2', Kind: 'invoice.paid', ProviderSubscriptionID: 'sub_it_unknown' });
                AssertEqual(await namedTasks(ctx, 'Gateway subscription not recorded in Orders: sub_it_unknown (UnknownGatewaySubscription)'), 1, 'one Task');
                AssertEqual((await delivery('evt_it_unknown_1'))[0]?.ReasonCode, 'unknown_subscription', 'recorded as unknown');
                // A legacy subscriber on a price Orders does not sell here: not ours, no Task.
                fakeGateway.held.push({ ProviderSubscriptionID: 'sub_it_legacy', Status: 'active', IsLive: true, Customer: 'cus_old', Metadata: {}, PriceID: 'price_it_legacy_175' });
                await deliver({ EventID: 'evt_it_legacy', Kind: 'invoice.paid', ProviderSubscriptionID: 'sub_it_legacy' });
                AssertEqual((await delivery('evt_it_legacy'))[0]?.ReasonCode, 'not_ours', 'recorded as not ours');
                AssertEqual(await namedTasks(ctx, 'Gateway subscription not recorded in Orders: sub_it_legacy (UnknownGatewaySubscription)'), 0, 'and no Task');
            }),
    },
    {
        Id: 'subscription-renewal.SR83',
        Name: 'SR83: linking a gateway subscription is checked first (not at the gateway, ended, recorded elsewhere, created for another, another e-mail, an unverifiable customer unless confirmed, already linked are refused, writing nothing); a good link books what the gateway charged',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                fakeGateway.reset();
                const f = Fx();
                const account = await gatewayBillingAccount(ctx);
                await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                const sub = await subscriptionWithCard(ctx, account);
                // An organization holds `sub`, so the e-mails cannot be compared: a person confirms the customer (#989 review).
                const link = (gatewayID: string, preview = false, confirmed = true) =>
                    LinkProviderSubscription(
                        { SubscriptionID: sub.SubscriptionID, PaymentProviderID: account, ProviderSubscriptionID: gatewayID, Preview: preview, CustomerConfirmed: confirmed },
                        ctx.Provider,
                        ctx.User,
                    );
                const lastDay = isoDate(sub.Term.EndDate);
                const anchor = DayStartUtc(lastDay, BusinessTimeZoneEngine.Instance.Zone);

                AssertEqual((await link('sub_it_missing')).Code, 'NotAtGateway', 'an id the gateway does not have');
                fakeGateway.held.push({ ProviderSubscriptionID: 'sub_it_ended', Status: 'canceled', IsLive: false, Customer: 'cus_x', Metadata: {} });
                AssertEqual((await link('sub_it_ended')).Code, 'EndedAtGateway', 'one the gateway ended');
                // Another customer's id: a subscription whose subscriber has an e-mail, and a gateway subscription billing
                // someone else. The same id with the subscriber's own e-mail passes this check (the control).
                const personal = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, f.Customers.SecondOrganizationID, f.Customers.SecondPersonID);
                await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.Subscription SET BeneficiaryPersonID = '${f.Customers.SecondPersonID}' WHERE ID = '${personal.SubscriptionID}' AND BeneficiaryPersonID IS NULL`);
                await TxQuery(ctx, `UPDATE ${COMMON_SCHEMA}.Person SET Email = 'ethan.testing.bc+sr83-jane@gmail.com' WHERE ID = '${f.Customers.SecondPersonID}'`);
                const otherCustomer = { ProviderSubscriptionID: 'sub_it_other', Status: 'active', IsLive: true, Customer: 'cus_y', Metadata: {} as Record<string, string>, Email: 'ethan.testing.bc+someone-else@gmail.com' };
                fakeGateway.held.push(otherCustomer);
                const linkPersonal = (preview: boolean) =>
                    LinkProviderSubscription({ SubscriptionID: personal.SubscriptionID, PaymentProviderID: account, ProviderSubscriptionID: 'sub_it_other', Preview: preview }, ctx.Provider, ctx.User);
                AssertEqual((await linkPersonal(true)).Code, 'EmailMismatch', "another customer's");
                otherCustomer.Email = 'ETHAN.testing.bc+sr83-jane@gmail.com';
                AssertEqual((await linkPersonal(true)).Code, 'WouldLink', 'control: the same e-mail (any case) passes');
                // A plan this subscription is not on (a price the account maps to no product, or another product): refused
                // unless a person confirms the subscription's product is right.
                fakeGateway.held.push({ ProviderSubscriptionID: 'sub_it_plan', Status: 'active', IsLive: true, Customer: 'cus_p', Metadata: {}, PriceID: 'price_it_other_plan' });
                AssertEqual((await link('sub_it_plan', true)).Code, 'PriceForAnotherProduct', "a plan that is not this subscription's product");
                AssertEqual(
                    (await LinkProviderSubscription({ SubscriptionID: sub.SubscriptionID, PaymentProviderID: account, ProviderSubscriptionID: 'sub_it_plan', Preview: true, AllowPriceOfAnotherProduct: true, CustomerConfirmed: true }, ctx.Provider, ctx.User)).Code,
                    'WouldLink',
                    'control: confirmed by a person (an imported subscriber on an older price), it passes',
                );
                const other = await subscriptionWithCard(ctx, account, f.Customers.SecondOrganizationID);
                await markProviderBilled(ctx, other.SubscriptionID, account, 'sub_it_taken');
                fakeGateway.held.push({ ProviderSubscriptionID: 'sub_it_taken', Status: 'active', IsLive: true, Customer: 'cus_z', Metadata: {} });
                AssertEqual((await link('sub_it_taken')).Code, 'LinkedElsewhere', 'one another subscription records');
                // Orders' own hand-over created it for ANOTHER subscription (its OrdersSubscriptionID metadata).
                fakeGateway.held.push({ ProviderSubscriptionID: 'sub_it_created', Status: 'active', IsLive: true, Customer: 'cus_c', Metadata: { OrdersSubscriptionID: other.SubscriptionID } });
                AssertEqual((await link('sub_it_created')).Code, 'CreatedForAnother', "one Orders created for another subscription");
                AssertEqual((await subscriptionRow(ctx, sub.SubscriptionID)).ProviderSubscriptionID, null, 'nothing written by any refusal');

                // The real one, with a renewal it already charged.
                const held = { ProviderSubscriptionID: 'sub_it_real', Status: 'active', IsLive: true, Customer: 'cus_it_e2', Metadata: {} as Record<string, string>, Invoices: [] as GatewaySubscriptionInvoice[] };
                fakeGateway.held.push(held);
                held.Invoices = [renewalInvoice({ anchor, currency: await booksIn(ctx) }, 'r1')];
                AssertEqual((await link('sub_it_real', true, false)).Code, 'CustomerUnverified', 'an organization holds it and nobody confirmed the customer: refused');
                AssertEqual((await link('sub_it_real', true)).Code, 'WouldLink', 'a preview checks and writes nothing');
                AssertEqual((await subscriptionRow(ctx, sub.SubscriptionID)).ProviderSubscriptionID, null, 'still unlinked after the preview');
                const linked = await link('sub_it_real');
                AssertEqual(linked.Code, 'Linked', `linked: ${linked.Message}`);
                AssertEqual(linked.Sync?.Outcome, 'Changed', `and synced: ${JSON.stringify(linked.Sync)}`);
                AssertEqual((await termsOf(ctx, sub.SubscriptionID)).length, 2, 'the renewal it charged is booked');
                AssertEqual((await link('sub_it_real')).Code, 'AlreadyLinked', 'a recorded id is never replaced');
            }),
    },
    {
        Id: 'subscription-renewal.SR84',
        Name: 'SR84: controls: a subscription the gateway does not bill is not synced; a team subscription invoiced in Orders still renews in Orders; an account whose switch is off still follows the subscriptions the gateway already bills',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                g.held.Invoices = [renewalInvoice(g, 'r1')];
                // A team subscription invoiced through Orders (as the Bill.com rail bills it): never handed over.
                const team = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, Fx().Customers.SecondOrganizationID);
                const unlinked = await syncNow(ctx, team.SubscriptionID, g.anchor);
                AssertEqual(unlinked.Outcome, 'NotBilledByGateway', 'not synced');
                AssertEqual((await spawnRenewals(ctx, { SubscriptionID: team.SubscriptionID, AsOfDate: daysBefore(team.Term.EndDate, 10) })).Placed, 1, 'and Spawn Renewals still renews it');

                // The account's switch off: it gates handing NEW subscriptions to the gateway (E2), never following one
                // the gateway already bills, whose renewals the gateway charges whatever the switch says.
                await upsertViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, g.account, { BillsSubscriptions: 0 });
                const off = await syncNow(ctx, g.SubscriptionID, g.anchor);
                AssertEqual(off.Outcome, 'Changed', `followed with the switch off: ${JSON.stringify(off)}`);
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 2, 'the renewal the gateway charged is booked');
                // …while the switch still stops a new hand-over (E2's rule, unchanged).
                const fresh = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, Fx().Customers.SecondOrganizationID);
                await payInFull(ctx, fresh.OrderID, Fx().Customers.SecondOrganizationID);
                const handed = await EnsureProviderSubscriptions({ SubscriptionIDs: [fresh.SubscriptionID], Now: new Date('2026-01-01T12:00:00Z') }, ctx.Provider, ctx.User);
                AssertEqual(handed.Outcomes.filter((o) => o.Code === 'Created').length, 0, `no new gateway subscription with the switch off: ${JSON.stringify(handed.Outcomes)}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR85',
        Name: "SR85: an order that is not the gateway's renewal still cannot extend a gateway-billed subscription after E4 (E2b holds), and Charge Renewals charges nothing for it",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                const f = Fx();
                const extend = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: new Date('2026-02-01T00:00:00Z'),
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
                });
                Assert(!extend.Saved && /billed by the payment gateway/.test(extend.Message ?? ''), `refused: ${extend.Message}`);
                const renewalLine = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: new Date('2026-12-01T00:00:00Z'),
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200, RenewsSubscriptionID: g.SubscriptionID }],
                });
                Assert(!renewalLine.Saved, `a hand-made renewal line naming it is refused too: ${renewalLine.Message}`);
                const charged = await chargeRenewals(ctx, { SubscriptionID: g.SubscriptionID, AsOfDate: AddDays(g.lastDay, 1) });
                AssertEqual(charged.Charged, 0, 'Charge Renewals charges nothing');
            }),
    },
    {
        Id: 'subscription-renewal.SR86',
        Name: "SR86: a $0 renewal is booked once with no payment; a refund the gateway made before the booking is booked after the capture",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                g.held.Invoices = [renewalInvoice(g, 'r0', { AmountPaid: 0, AmountDue: 0, ProviderIntentID: null, ProviderChargeID: null, Discounted: true })];
                const zero = await syncNow(ctx, g.SubscriptionID, g.anchor);
                AssertEqual(zero.Outcome, 'Changed', `booked: ${JSON.stringify(zero)}`);
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 2, 'term 2');
                const zeroOrder = await renewalOrderOf(ctx, g.SubscriptionID);
                const owed = await TxOne<{ Net: number; Balance: number }>(
                    ctx,
                    `SELECT ol.LineTotalNet AS Net, oh.Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders oh JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.OrderHeaderID = oh.ID WHERE oh.ID = '${zeroOrder.ID}'`,
                );
                AssertEqual(`${Number(zeroOrder.UnitPrice)}|${Number(owed.Net)}|${Number(owed.Balance)}`, '1200|0|0', 'the last price, 100% off: nothing owed');
                AssertEqual((await syncNow(ctx, g.SubscriptionID, new Date(g.anchor.getTime() + 3600_000))).Outcome, 'InLine', 'and not again');

                const h = await gatewayBilled(ctx, Fx().Customers.SecondOrganizationID);
                h.held.Invoices = [renewalInvoice(h, 'rr')];
                fakeGateway.refunds.set('ch_it_rr', [{ ProviderRefundID: 're_it_rr', ProviderChargeID: 'ch_it_rr', Amount: 200, CurrencyCode: h.currency, Status: 'succeeded' }]);
                const booked = await syncNow(ctx, h.SubscriptionID, h.anchor);
                AssertEqual(booked.Outcome, 'Changed', `${JSON.stringify(booked)}`);
                const refund = await TxOne<{ N: number; Amount: number }>(ctx, `SELECT COUNT(*) AS N, SUM(Amount) AS Amount FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ProviderRefundID = 're_it_rr'`);
                AssertEqual(`${refund.N}|${Math.abs(Number(refund.Amount))}`, '1|200', 'the refund is booked once, for 200');
            }),
    },
    {
        Id: 'subscription-renewal.SR87',
        Name: 'SR87: the nightly pass in preview reports what it would do and writes nothing; live, it brings each one in line and reports it',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                g.held.Invoices = [renewalInvoice(g, 'r1')];
                const h = await gatewayBilled(ctx, Fx().Customers.SecondOrganizationID);
                const ids = [g.SubscriptionID, h.SubscriptionID];
                const preview = await SyncProviderSubscriptions({ SubscriptionIDs: ids, Preview: true, Now: g.anchor }, ctx.Provider, ctx.User);
                AssertEqual(`${preview.Read}|${preview.Changed}|${preview.Failed}`, '2|1|0', `one would change: ${preview.Message}`);
                Assert(preview.Results.find((r) => SameID(r.SubscriptionID, g.SubscriptionID))!.Actions.some((a) => /book renewal/.test(a)), 'and says what');
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 1, 'preview wrote nothing');
                const live = await SyncProviderSubscriptions({ SubscriptionIDs: ids, Now: g.anchor }, ctx.Provider, ctx.User);
                AssertEqual(`${live.Read}|${live.Changed}|${live.Failed}`, '2|1|0', `${live.Message}`);
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 2, 'live, it booked');
            }),
    },
    {
        Id: 'subscription-renewal.SR88',
        Name: 'SR88: the nightly sync Action and its schedule: the job points at the Action and ships disabled and in preview',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const action = await TxMaybeOne<{ ID: string; DriverClass: string; Status: string }>(
                    ctx,
                    `SELECT ID, DriverClass, Status FROM __mj.Action WHERE Name = 'Sync Provider Subscriptions'`,
                );
                Assert(action != null, 'the action row exists — push the app metadata if not');
                AssertEqual(`${action!.Status}|${action!.DriverClass}`, 'Active|Orders.SyncProviderSubscriptions', 'active, pointing at the registered key');
                const job = await TxMaybeOne<{ Configuration: string; Status: string }>(
                    ctx,
                    `SELECT Configuration, Status FROM __mj.ScheduledJob WHERE Name = N'Orders — Sync Provider Subscriptions (nightly)'`,
                );
                Assert(job != null, 'the scheduled job row exists — push the app metadata if not');
                const config = JSON.parse(job!.Configuration ?? '{}') as { ActionID?: string; Params?: Array<{ ActionParamID: string; Value: string }> };
                Assert(config.ActionID != null && SameID(config.ActionID, action!.ID), `the job names this action: ${job!.Configuration}`);
                AssertEqual(job!.Status, 'Disabled', 'it ships disabled');
                const previewParam = await TxOne<{ ID: string }>(ctx, `SELECT ID FROM __mj.ActionParam WHERE ActionID = '${action!.ID}' AND Name = 'Preview'`);
                AssertEqual(String(config.Params?.find((p) => SameID(p.ActionParamID, previewParam.ID))?.Value), 'true', 'and in preview');
                const linkAction = await TxMaybeOne<{ DriverClass: string }>(ctx, `SELECT DriverClass FROM __mj.Action WHERE Name = 'Link Provider Subscription'`);
                AssertEqual(linkAction?.DriverClass, 'Orders.LinkProviderSubscription', 'the link Action is registered too');
            }),
    },

    {
        Id: 'subscription-renewal.SR89',
        Name: "SR89: an imported subscriber (Chicago): the year it already paid is never booked again (payment by charge with no intent, or no charge recorded at all; through the link or the sanction); its next renewal is",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withChicago(async () => {
                    fakeGateway.reset();
                    const f = Fx();
                    const account = await gatewayBillingAccount(ctx);
                    await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                    const currency = await booksIn(ctx);
                    const imported = (tag: string, organizationID: string, reason: 'subscription_create' | 'subscription_cycle') =>
                        importedSubscriber(ctx, currency, tag, organizationID, reason);
                    const termCount = async (id: string) => (await termsOf(ctx, id)).length;
                    const intents = async (pi: string) => Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE ProviderIntentID = '${pi}'`)).N);

                    // Second year (the current period was a renewal at Stripe), linked through the checked link: the
                    // link's own sync must not book the year the importer already recorded.
                    const second = await imported('y2', f.Customers.OrganizationID, 'subscription_cycle');
                    const linked = await LinkProviderSubscription(
                        { SubscriptionID: second.sub.SubscriptionID, PaymentProviderID: account, ProviderSubscriptionID: 'sub_it_y2', CustomerConfirmed: true },
                        ctx.Provider,
                        ctx.User,
                    );
                    AssertEqual(
                        `${linked.Code}|${linked.Sync?.Outcome}|${await termCount(second.sub.SubscriptionID)}|${await intents('pi_it_y2_now')}`,
                        'Linked|InLine|1|0',
                        `linked; the year it paid is not booked again: ${JSON.stringify(linked.Sync)}`,
                    );
                    // Its next renewal, charged 14:23 UTC on term 1's last day, is.
                    second.held.Invoices.push({ ...renewalInvoice({ anchor: second.nextStart, currency }, 'y2_next') });
                    const s2 = await syncNow(ctx, second.sub.SubscriptionID, new Date(second.nextStart.getTime() + 3_600_000));
                    AssertEqual(`${s2.Outcome}|${await termCount(second.sub.SubscriptionID)}`, 'Changed|2', `the next renewal is booked: ${JSON.stringify(s2)}`);
                    AssertEqual(isoDate((await termsOf(ctx, second.sub.SubscriptionID))[1].StartDate), AddDays(second.lastDay, 1), 'term 2 starts the day after term 1');
                    const charged = await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ProviderChargeID = 'ch_it_y2_now' OR IdempotencyKey LIKE '%:ch_it_y2_now'`);
                    AssertEqual(Number(charged.N), 1, "the current year's charge is on the books once");

                    // Second year again, with NO charge recorded (a sheet row without one: the importer writes no payment
                    // charge), linked by the importer's own sanction (D20) and synced as the webhook or the nightly pass
                    // would. Only the period rule keeps the year it paid from being booked again. The gateway also still
                    // lists last year's first invoice (subscription_create), which is never a renewal.
                    const bare = await imported('y2bare', f.Customers.SecondOrganizationID, 'subscription_cycle');
                    await TxQuery(ctx, `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`);
                    await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.PaymentHeader SET ProviderChargeID = NULL WHERE ProviderChargeID = 'ch_it_y2bare_now'`);
                    await TxQuery(ctx, `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`);
                    const created = bare.held.Invoices[0].PeriodStart!;
                    bare.held.Invoices.unshift({
                        ...renewalInvoice({ anchor: new Date(created.getTime() - 365 * 86_400_000), currency }, 'y2bare_first'),
                        BillingReason: 'subscription_create',
                    });
                    await markProviderBilled(ctx, bare.sub.SubscriptionID, account, 'sub_it_y2bare');
                    const s1 = await syncNow(ctx, bare.sub.SubscriptionID, new Date(`${AddDays(bare.lastDay, -200)}T12:00:00Z`));
                    AssertEqual(`${s1.Outcome}|${await termCount(bare.sub.SubscriptionID)}|${await intents('pi_it_y2bare_now')}`, 'InLine|1|0', `nothing booked again: ${JSON.stringify(s1)}`);
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR99',
        Name: "SR99: an imported FIRST-YEAR subscriber (its current invoice is Stripe's subscription_create, its charge on the importer's payment) is in line: the nightly preview reports 0 differences for it; a creation charge nothing records, one recorded only on ANOTHER subscription's payment, or only on a Failed payment, is still reported",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withChicago(async () => {
                    // L3 finding 5: 372 of 509 rehearsal subscribers each reported "charged … at creation" although the
                    // importer's payment records that charge, so switch day's "0 differences" could not pass.
                    fakeGateway.reset();
                    const f = Fx();
                    const account = await gatewayBillingAccount(ctx);
                    await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                    const currency = await booksIn(ctx);
                    const first = await importedSubscriber(ctx, currency, 'y1', f.Customers.OrganizationID, 'subscription_create');
                    await markProviderBilled(ctx, first.sub.SubscriptionID, account, 'sub_it_y1');
                    // Control: the same shape with NO payment recording the creation charge (an E2 subscription the
                    // gateway charged at creation on top of checkout): genuinely unbooked, so still a difference.
                    const unbooked = await importedSubscriber(ctx, currency, 'y1bare', f.Customers.SecondOrganizationID, 'subscription_create');
                    await TxQuery(ctx, `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`);
                    await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.PaymentHeader SET ProviderChargeID = NULL WHERE ProviderChargeID = 'ch_it_y1bare_now'`);
                    await TxQuery(ctx, `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`);
                    await markProviderBilled(ctx, unbooked.sub.SubscriptionID, account, 'sub_it_y1bare');
                    const now = new Date(`${AddDays(first.lastDay, -200)}T12:00:00Z`);
                    const ids = [first.sub.SubscriptionID, unbooked.sub.SubscriptionID];
                    const preview = await SyncProviderSubscriptions({ SubscriptionIDs: ids, Preview: true, Now: now }, ctx.Provider, ctx.User);
                    const of = (id: string) => preview.Results.find((r) => SameID(r.SubscriptionID, id))!;
                    AssertEqual(
                        `${preview.Read}|${preview.Changed}|${preview.NeedsPerson}|${preview.Failed}|${preview.Differences}`,
                        '2|0|0|0|1',
                        `one difference, from the unbooked control only: ${preview.Message}`,
                    );
                    AssertEqual(`${of(first.sub.SubscriptionID).Outcome}|${of(first.sub.SubscriptionID).Differences.length}`, 'InLine|0', `the imported first-year subscriber is in line: ${JSON.stringify(of(first.sub.SubscriptionID))}`);
                    const control = of(unbooked.sub.SubscriptionID);
                    Assert(
                        control.Differences.length === 1 && /in_it_y1bare_now: charged .* at creation/.test(control.Differences[0]),
                        `control: the creation charge nothing records is still reported: ${JSON.stringify(control)}`,
                    );
                    AssertEqual(`${control.Actions.length}|${control.Notices.length}`, '0|0', 'and nothing is booked or raised for it');

                    // Control: the control's creation invoice now names y1's charge, which IS recorded, but on ANOTHER
                    // subscription's payment (y1's): not this subscription's money, so still a difference.
                    unbooked.held.Invoices[0] = { ...unbooked.held.Invoices[0], ProviderChargeID: 'ch_it_y1_now' };
                    const elsewhere = await SyncProviderSubscription(unbooked.sub.SubscriptionID, { Preview: true, Now: now }, ctx.Provider, ctx.User);
                    Assert(
                        elsewhere.Outcome !== 'Failed' && elsewhere.Differences.length === 1 && /in_it_y1bare_now: charged .* at creation/.test(elsewhere.Differences[0]),
                        `control: a charge recorded only on another subscription's payment is still reported: ${JSON.stringify(elsewhere)}`,
                    );
                    // Live, the imported one is still in line and nothing is booked.
                    const live = await syncNow(ctx, first.sub.SubscriptionID, now);
                    AssertEqual(`${live.Outcome}|${live.Differences.length}|${(await termsOf(ctx, first.sub.SubscriptionID)).length}`, 'InLine|0|1', `live: ${JSON.stringify(live)}`);
                    // Its second year is unaffected: the next renewal (subscription_cycle) is booked once.
                    first.held.Invoices.push({ ...renewalInvoice({ anchor: first.nextStart, currency }, 'y1_next') });
                    const renewed = await syncNow(ctx, first.sub.SubscriptionID, new Date(first.nextStart.getTime() + 3_600_000));
                    AssertEqual(`${renewed.Outcome}|${(await termsOf(ctx, first.sub.SubscriptionID)).length}`, 'Changed|2', `the next renewal is booked: ${JSON.stringify(renewed)}`);

                    // Control: the same payment, Failed, is not money: the creation invoice is a difference again.
                    await TxQuery(ctx, `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`);
                    await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.PaymentHeader SET Status = 'Failed' WHERE ProviderChargeID = 'ch_it_y1_now'`);
                    await TxQuery(ctx, `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`);
                    const failedRun = await SyncProviderSubscription(first.sub.SubscriptionID, { Preview: true, Now: new Date(first.nextStart.getTime() + 7_200_000) }, ctx.Provider, ctx.User);
                    Assert(
                        failedRun.Outcome !== 'Failed' && failedRun.Differences.some((d) => /in_it_y1_now: charged .* at creation/.test(d)),
                        `control: a Failed payment recording the charge does not make it booked: ${JSON.stringify(failedRun)}`,
                    );
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR90',
        Name: "SR90: recording a cancel the gateway already made is never blocked: an open RenewalNotBooked alert does not stop it; a refused attempt raises a non-blocking notice and the next sync records it",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                await raiseProviderSubscriptionAlert(
                    { SubscriptionID: g.SubscriptionID, SubscriptionNumber: g.SubscriptionNumber, Code: 'RenewalNotBooked', Reason: 'SR90 probe', Urgent: true, Linked: true },
                    ctx.User,
                    ctx.Provider,
                );
                // Control: while the gateway still bills it, the alert stops a cancel (E2b's rule, unchanged).
                const blocked = await cancelSubscription(ctx, { SubscriptionID: g.SubscriptionID, RequestDate: '2026-06-01', Timing: 'Immediate' });
                Assert(!blocked.Success && /open gateway alert \(RenewalNotBooked\)/.test(blocked.Message ?? ''), `blocked while billing: ${blocked.Message}`);

                // The gateway ends it. The first attempt to record that hits a transient gateway read (the cancel's
                // own read, the sync's second describe): a non-blocking notice, nothing changed.
                g.held.IsLive = false;
                g.held.Status = 'canceled';
                g.held.EndedAt = new Date('2026-06-01T15:00:00Z');
                fakeGateway.describeCalls = 0;
                fakeGateway.failDescribeOnCall = 2;
                const refused = await syncNow(ctx, g.SubscriptionID, new Date('2026-06-01T16:00:00Z'));
                Assert(refused.Notices.includes('GatewayCancelNotRecorded') && !refused.Notices.includes('RenewalNotBooked'), `a non-blocking notice: ${JSON.stringify(refused)}`);
                AssertEqual((await subscriptionRow(ctx, g.SubscriptionID)).Status, 'Active', 'nothing changed yet');

                // The next sync records it, although RenewalNotBooked (and now GatewayCancelNotRecorded) are open.
                fakeGateway.failDescribeOnCall = 0;
                const recorded = await syncNow(ctx, g.SubscriptionID, new Date('2026-06-02T03:00:00Z'));
                AssertEqual((await subscriptionRow(ctx, g.SubscriptionID)).Status, 'Canceled', `recorded: ${JSON.stringify(recorded)}`);
                const again = await syncNow(ctx, g.SubscriptionID, new Date('2026-06-02T04:00:00Z'));
                AssertEqual(again.Outcome, 'InLine', 'a duplicate deleted event later changes nothing and raises nothing');
            }),
    },
    {
        Id: 'subscription-renewal.SR91',
        Name: 'SR91: a renewal invoice that carries tax is not booked (net booked, gross captured would leave the tax as spendable credit): urgent RenewalNotBooked, nothing written',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const g = await gatewayBilled(ctx);
                g.held.Invoices = [renewalInvoice(g, 'tx', { AmountPaid: 1296, AmountDue: 1296, Tax: 96 })];
                const r = await syncNow(ctx, g.SubscriptionID, g.anchor);
                AssertEqual(`${r.Outcome}|${r.Notices.join(',')}`, 'NeedsPerson|RenewalNotBooked', `${JSON.stringify(r)}`);
                AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 1, 'no term');
                AssertEqual(Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE ProviderIntentID = 'pi_it_tx'`)).N), 0, 'no intent, no payment');
                AssertEqual(await namedTasks(ctx, `URGENT: Gateway subscription needs attention: ${g.SubscriptionNumber} (RenewalNotBooked)`), 1, 'one urgent Task');
            }),
    },
    {
        Id: 'subscription-renewal.SR93',
        Name: "SR93: on the term's last day, once E4 has booked term 2, a cancel is no longer refused: end of term ends with term 2 (the latest booked) and stops the gateway there; Immediate follows E2b's rule",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                for (const timing of ['EndOfTerm', 'Immediate'] as const) {
                    const g = await gatewayBilled(ctx, timing === 'EndOfTerm' ? undefined : Fx().Customers.SecondOrganizationID);
                    g.held.PeriodStart = g.anchor; // Stripe renewed at 00:00 on the last day
                    g.held.Invoices = [renewalInvoice(g, `x14${timing}`)];
                    const booked = await syncNow(ctx, g.SubscriptionID, g.anchor);
                    AssertEqual(booked.Outcome, 'Changed', `term 2 booked: ${JSON.stringify(booked)}`);
                    const terms = await termsOf(ctx, g.SubscriptionID);
                    const cancelled = (await cancelSubscription(ctx, { SubscriptionID: g.SubscriptionID, RequestDate: g.lastDay, Timing: timing })) as {
                        Success: boolean;
                        Message?: string;
                        Decision?: { EffectiveDate?: string };
                        Gateway?: { Outcome?: string };
                    };
                    Assert(cancelled.Success, `${timing}: not refused once term 2 is booked: ${cancelled.Message}`);
                    Assert(!/started a new billing period/.test(cancelled.Message ?? ''), `${timing}: not the unbooked-period refusal`);
                    const asked = fakeGateway.cancelled[fakeGateway.cancelled.length - 1];
                    if (timing === 'EndOfTerm') {
                        // Ethan, 29 Oct: end of term on a subscription the gateway still bills is the end of the LATEST
                        // booked term (term 2, which the gateway was paid for), and the gateway stops at that period end.
                        AssertEqual(isoDate(cancelled.Decision!.EffectiveDate!), isoDate(terms[1].EndDate), 'ends with term 2, the term the gateway was paid for');
                        // "Charge nothing after the end of term 2's last day"; Stripe's period ends at its anchor on that
                        // day, before it, so the driver sets cancel_at_period_end and term 3 is never charged
                        // (PlanStripeCancel → AtPeriodEnd, #972's tests).
                        AssertEqual(isoDate(asked!.BillingEndsAt!), AddDays(isoDate(terms[1].EndDate), 1), 'the gateway is told: nothing after term 2');
                        AssertEqual((await termsOf(ctx, g.SubscriptionID)).length, 2, 'term 2 stays booked');
                    } else {
                        AssertEqual((await subscriptionRow(ctx, g.SubscriptionID)).Status, 'Canceled', 'cancelled now');
                    }
                }
            }),
    },
    {
        Id: 'subscription-renewal.SR94',
        Name: 'SR94: the gateway charged the renewal and then ended the subscription: the renewal is booked, the cancel reverses only what the gateway refunded (nothing when it kept the charge), and a person is told',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // A type that REFUNDS on cancel: the case where reversing the gateway's renewal in full would book a
                // credit memo Stripe never paid out.
                const typeID = (await TxOne<{ ID: string }>(ctx, `SELECT SubscriptionTypeID AS ID FROM ${ORDERS_SCHEMA}.Product WHERE ID = '${Fx().Products.SubRolling}'`)).ID;
                const was = (await TxOne<{ Mode: string }>(ctx, `SELECT CancellationRefundMode AS Mode FROM ${ORDERS_SCHEMA}.SubscriptionType WHERE ID = '${typeID}'`)).Mode;
                await upsertViaEntity(ctx, SUBSCRIPTION_TYPE_ENTITY, typeID, { CancellationRefundMode: 'ProrateUnused' });
                await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
                try {
                for (const refunded of [0, 1200]) {
                    const g = await gatewayBilled(ctx, refunded ? Fx().Customers.SecondOrganizationID : undefined);
                    const key = refunded ? 'ear_refunded' : 'ear_kept';
                    g.held.Invoices = [renewalInvoice(g, key)];
                    if (refunded) fakeGateway.refunds.set(`ch_it_${key}`, [{ ProviderRefundID: `re_it_${key}`, ProviderChargeID: `ch_it_${key}`, Amount: refunded, CurrencyCode: g.currency, Status: 'succeeded' }]);
                    // Stripe ended it that afternoon (support cancelled it in the dashboard after the 00:00 charge).
                    g.held.IsLive = false;
                    g.held.Status = 'canceled';
                    g.held.EndedAt = new Date(g.anchor.getTime() + 9 * 3_600_000);
                    const r = await syncNow(ctx, g.SubscriptionID, new Date(g.anchor.getTime() + 10 * 3_600_000));
                    const reversals = await TxQuery<{ ID: string; Total: number }>(
                        ctx,
                        `SELECT oh.ID, SUM(ol.LineTotalNet) AS Total FROM ${ORDERS_SCHEMA}.OrderHeader oh JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.OrderHeaderID = oh.ID
                          WHERE ol.ReversesOrderLineID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${g.SubscriptionID}') GROUP BY oh.ID`,
                    );
                    const reversed = reversals.reduce((sum, x) => sum + Math.abs(Number(x.Total)), 0);
                    console.log(`      SR94 refunded=${refunded}: outcome ${r.Outcome}; actions ${r.Actions.join(' | ')}; notices ${r.Notices.join(',')}; reversed ${reversed}`);
                    AssertEqual((await subscriptionRow(ctx, g.SubscriptionID)).Status, 'Canceled', 'cancelled in Orders');
                    AssertEqual(reversed, refunded, refunded ? 'reversed exactly what the gateway refunded' : 'nothing reversed: the gateway kept the charge');
                    Assert(r.Notices.includes('EndedAfterRenewal'), `a person is told: ${r.Notices.join(',')}`);
                }
                } finally {
                    // Put back before reloading: the engine's cache outlives this check's rollback.
                    await upsertViaEntity(ctx, SUBSCRIPTION_TYPE_ENTITY, typeID, { CancellationRefundMode: was });
                    await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
                }
            }),
    },
    {
        Id: 'subscription-renewal.SR95',
        Name: 'SR95: the renewal booked, then two days into term 2 Stripe ends it (refunding in part, or not at all): the immediate cancel reverses exactly what Stripe refunded, and a person is told',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const typeID = (await TxOne<{ ID: string }>(ctx, `SELECT SubscriptionTypeID AS ID FROM ${ORDERS_SCHEMA}.Product WHERE ID = '${Fx().Products.SubRolling}'`)).ID;
                const was = (await TxOne<{ Mode: string }>(ctx, `SELECT CancellationRefundMode AS Mode FROM ${ORDERS_SCHEMA}.SubscriptionType WHERE ID = '${typeID}'`)).Mode;
                await upsertViaEntity(ctx, SUBSCRIPTION_TYPE_ENTITY, typeID, { CancellationRefundMode: 'ProrateUnused' });
                await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
                try {
                // The usual flow: the renewal booked at 00:00 on the last day; two days into term 2 support cancels in the
                // dashboard (and refunds, in full, in part, or not at all). The sync records an IMMEDIATE cancel inside
                // term 2, and term 2 reverses exactly what Stripe refunded.
                for (const [refunded, org] of [[0, undefined], [500, Fx().Customers.SecondOrganizationID]] as const) {
                    const g = await gatewayBilled(ctx, org);
                    const key = `ear2_${refunded}`;
                    g.held.Invoices = [renewalInvoice(g, key)];
                    AssertEqual((await syncNow(ctx, g.SubscriptionID, g.anchor)).Outcome, 'Changed', 'the renewal booked at the anchor');
                    if (refunded) fakeGateway.refunds.set(`ch_it_${key}`, [{ ProviderRefundID: `re_it_${key}`, ProviderChargeID: `ch_it_${key}`, Amount: refunded, CurrencyCode: g.currency, Status: 'succeeded' }]);
                    g.held.IsLive = false;
                    g.held.Status = 'canceled';
                    g.held.EndedAt = new Date(g.anchor.getTime() + 2 * 86_400_000 + 9 * 3_600_000);
                    const r = await syncNow(ctx, g.SubscriptionID, new Date(g.held.EndedAt.getTime() + 3_600_000));
                    const reversals = await TxQuery<{ Total: number }>(
                        ctx,
                        `SELECT SUM(ol.LineTotalNet) AS Total FROM ${ORDERS_SCHEMA}.OrderLine ol
                          WHERE ol.ReversesOrderLineID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${g.SubscriptionID}')`,
                    );
                    const reversed = Math.abs(Number(reversals[0]?.Total ?? 0));
                    console.log(`      SR95 two days later, refunded=${refunded}: ${r.Actions.join(' | ')}; notices ${r.Notices.join(',')}; reversed ${reversed}`);
                    Assert(r.Actions.some((a) => /Immediate/.test(a)), `an immediate cancel inside term 2: ${r.Actions.join(' | ')}`);
                    AssertEqual(reversed, refunded, 'term 2 reverses exactly what the gateway refunded');
                    Assert(r.Notices.includes('EndedAfterRenewal'), 'and a person is told');
                }
                } finally {
                    await upsertViaEntity(ctx, SUBSCRIPTION_TYPE_ENTITY, typeID, { CancellationRefundMode: was });
                    await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
                }
            }),
    },
    {
        Id: 'subscription-renewal.SR96',
        Name: "SR96: D20 a gateway refund on a renewal's charge credits THAT renewal order (nothing owed, access unchanged, a notice), whenever it lands, once; with a cancel, the total credit is the refund, never double",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // What the renewal order itself owes (D20, the credit-note model: the refund's credit is booked as a credit
                // order and APPLIED to the renewal, so it reads sold − credit applied: nothing owed).
                const owed = async (subscriptionID: string) => {
                    const order = await renewalOrderOf(ctx, subscriptionID);
                    return Math.round(Number((await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${order.ID}'`)).Balance) * 100) / 100;
                };
                // Net of every reversal of it: the credit order(s) hold nothing back once applied.
                const owedNet = async (subscriptionID: string) => {
                    const order = await renewalOrderOf(ctx, subscriptionID);
                    const r = await TxOne<{ Net: number }>(ctx, `SELECT SUM(Balance) AS Net FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${order.ID}' OR ReversesOrderHeaderID = '${order.ID}'`);
                    return Math.round(Number(r.Net ?? 0) * 100) / 100;
                };
                const credited = async (subscriptionID: string) => {
                    const r = await TxOne<{ Reversed: number; Memos: number }>(
                        ctx,
                        `SELECT ABS(COALESCE((SELECT SUM(ol.LineTotalNet) FROM ${ORDERS_SCHEMA}.OrderLine ol
                                 WHERE ol.ReversesOrderLineID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${subscriptionID}')), 0)) AS Reversed,
                                COALESCE((SELECT SUM(COALESCE(c.CreditMemoAmount, 0) + COALESCE(c.ScheduleReduction, 0)) FROM ${ORDERS_SCHEMA}.OrderConcession c
                                 JOIN ${ORDERS_SCHEMA}.SubscriptionTerm st ON st.ID = c.SubscriptionTermID
                                 WHERE st.SubscriptionID = '${subscriptionID}' AND c.Status = 'Approved' AND c.DeliveryForm = 'Price' AND c.NewAmount IS NOT NULL), 0) AS Memos`,
                    );
                    return Math.round((Number(r.Reversed) + Number(r.Memos)) * 100) / 100;
                };
                const refundEvent = (g: Awaited<ReturnType<typeof gatewayBilled>>, key: string, amount: number, n: number): WebhookEvent => ({
                    EventID: `evt_it_refund_${key}_${n}`,
                    Kind: 'charge.refunded',
                    ProviderIntentID: `pi_it_${key}`,
                    ProviderChargeID: `ch_it_${key}`,
                    Amount: amount,
                });
                const refundAtStripe = (key: string, currency: string, amounts: number[]) =>
                    fakeGateway.refunds.set(
                        `ch_it_${key}`,
                        amounts.map((a, i) => ({ ProviderRefundID: `re_it_${key}_${i}`, ProviderChargeID: `ch_it_${key}`, Amount: a, CurrencyCode: currency, Status: 'succeeded' })),
                    );

                // No amount change, so no acknowledgment role: none is configured here, and none is needed.
                OrdersSettings.SetOverride(ORDERS_SETTING.AmendmentAcknowledgmentRole, undefined);
                // 1. Five days into term 2, no cancel: Stripe refunds $200 (partial); it lands once.
                const g = await gatewayBilled(ctx, undefined, { webhooks: true });
                const deliver = (event: WebhookEvent) => {
                    fakeGateway.event = event;
                    return HandlePaymentWebhook({ RawBody: '{}', Headers: {}, PaymentProviderID: g.account }, ctx.Provider, ctx.User);
                };
                g.held.Invoices = [renewalInvoice(g, 'd20')];
                await syncNow(ctx, g.SubscriptionID, g.anchor);
                const termsBefore = await termsOf(ctx, g.SubscriptionID);
                const grantsBefore = await grantEnd(ctx, termsBefore[1].ID);
                const seats = async () =>
                    Number((await TxOne<{ Q: number }>(ctx, `SELECT SUM(Quantity) AS Q FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionTermID = '${termsBefore[1].ID}' AND Status IN ('Active','Suspended')`)).Q ?? 0);
                const seatsBefore = await seats();
                // One notice per credit (keyed by the credit order), so a later refund is told even while this one is open.
                const notices = async () =>
                    Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM __mj_BizAppsTasks.Task WHERE Name LIKE N'Gateway subscription needs attention: ${g.SubscriptionNumber} (GatewayRenewalRefunded) %'`)).N);
                refundAtStripe('d20', g.currency, [200]);
                await deliver(refundEvent(g, 'd20', 200, 1));
                AssertEqual(`${await credited(g.SubscriptionID)}|${await owed(g.SubscriptionID)}`, '200|0', '$200 credited ON the renewal, which owes nothing');
                await deliver(refundEvent(g, 'd20', 200, 1)); // replayed
                AssertEqual(await credited(g.SubscriptionID), 200, 'a replayed refund credits nothing more');
                const after = await termsOf(ctx, g.SubscriptionID);
                AssertEqual(`${after.length}|${isoDate(after[1].EndDate)}|${(await subscriptionRow(ctx, g.SubscriptionID)).Status}`, `2|${isoDate(termsBefore[1].EndDate)}|Active`, 'access unchanged: term 2 and the subscription as they were');
                AssertEqual((await grantEnd(ctx, termsBefore[1].ID))?.toISOString(), grantsBefore?.toISOString(), "term 2's access does not end sooner");
                AssertEqual(await seats(), seatsBefore, "and no grant quantity is reduced (a money-only credit)");
                AssertEqual(await notices(), 1, 'a person is told, once (the replay told nobody again)');

                // 2. Support ends it at Stripe (keeping the other $1,000): the recorded cancel reverses only what is refunded
                // and not yet credited (nothing more), then Stripe refunds the rest AFTER the cancel: credited then, once.
                g.held.IsLive = false;
                g.held.Status = 'canceled';
                g.held.EndedAt = new Date(g.anchor.getTime() + 6 * 86_400_000);
                await syncNow(ctx, g.SubscriptionID, new Date(g.held.EndedAt.getTime() + 3_600_000));
                AssertEqual(await credited(g.SubscriptionID), 200, 'refund then cancel: the cancel credits nothing more (200 in all)');
                refundAtStripe('d20', g.currency, [200, 1000]);
                await deliver(refundEvent(g, 'd20', 1200, 2));
                AssertEqual(
                    `${await credited(g.SubscriptionID)}|${await owed(g.SubscriptionID)}|${await owedNet(g.SubscriptionID)}`,
                    '1200|0|0',
                    'cancel then refund: the rest credited once (1,200 in all), applied to the renewal (owes nothing)',
                );
                AssertEqual(await notices(), 2, "the second refund is its own notice (the first one's Task is still open)");

                // 3. A FULL refund with no cancel (another subscription): the whole of it credited once, and still no access is
                // taken (a full reversal of a line would otherwise revoke its grants; only a cancel ends access).
                const h = await gatewayBilled(ctx, Fx().Customers.SecondOrganizationID, { webhooks: true });
                const deliverH = (event: WebhookEvent) => {
                    fakeGateway.event = event;
                    return HandlePaymentWebhook({ RawBody: '{}', Headers: {}, PaymentProviderID: h.account }, ctx.Provider, ctx.User);
                };
                h.held.Invoices = [renewalInvoice(h, 'd20h')];
                await syncNow(ctx, h.SubscriptionID, h.anchor);
                const hTerms = await termsOf(ctx, h.SubscriptionID);
                const hSeats = async () =>
                    Number((await TxOne<{ Q: number }>(ctx, `SELECT SUM(Quantity) AS Q FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionTermID = '${hTerms[1].ID}' AND Status IN ('Active','Suspended')`)).Q ?? 0);
                const hSeatsBefore = await hSeats();
                Assert(hSeatsBefore > 0, 'precondition: term 2 grants access');
                refundAtStripe('d20h', h.currency, [1200]);
                await deliverH(refundEvent(h, 'd20h', 1200, 1));
                AssertEqual(
                    `${await credited(h.SubscriptionID)}|${await owed(h.SubscriptionID)}|${await owedNet(h.SubscriptionID)}`,
                    '1200|0|0',
                    'a full refund: credited 1,200 once and applied ON the renewal, which owes nothing (sold 1,200, credit 1,200)',
                );
                const renewalTotal = await TxOne<{ T: number }>(ctx, `SELECT TotalGross AS T FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${(await renewalOrderOf(ctx, h.SubscriptionID)).ID}'`);
                AssertEqual(Number(renewalTotal.T), 1200, "the renewal keeps its total: only what it owes falls");
                AssertEqual(await hSeats(), hSeatsBefore, 'and term 2 still grants its access');
                AssertEqual((await subscriptionRow(ctx, h.SubscriptionID)).Status, 'Active', 'still active: a refund is not a cancel');
            }),
    },
    {
        Id: 'subscription-renewal.SR97',
        Name: "SR97: two gateway renewals; Stripe charged term 3 on term 2's last day, refunded THAT charge and ended it: term 2 (served) reverses 0 and term 3 reverses its own $1,200 — in one run and in two",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const typeID = (await TxOne<{ ID: string }>(ctx, `SELECT SubscriptionTypeID AS ID FROM ${ORDERS_SCHEMA}.Product WHERE ID = '${Fx().Products.SubRolling}'`)).ID;
                const was = (await TxOne<{ Mode: string }>(ctx, `SELECT CancellationRefundMode AS Mode FROM ${ORDERS_SCHEMA}.SubscriptionType WHERE ID = '${typeID}'`)).Mode;
                await upsertViaEntity(ctx, SUBSCRIPTION_TYPE_ENTITY, typeID, { CancellationRefundMode: 'ProrateUnused' });
                await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
                try {
                    for (const runs of [1, 2]) {
                        const g = await gatewayBilled(ctx, runs === 1 ? undefined : Fx().Customers.SecondOrganizationID);
                        const year = 365 * 86_400_000;
                        const r2 = renewalInvoice(g, `t2_${runs}`);
                        await (g.held.Invoices = [r2], syncNow(ctx, g.SubscriptionID, g.anchor));
                        const terms2 = await termsOf(ctx, g.SubscriptionID);
                        const anchor3 = DayStartUtc(isoDate(terms2[1].EndDate), BusinessTimeZoneEngine.Instance.Zone);
                        const r3 = { ...renewalInvoice({ anchor: anchor3, currency: g.currency }, `t3_${runs}`), PeriodEnd: new Date(anchor3.getTime() + year) };
                        g.held.Invoices = [r2, r3];
                        fakeGateway.refunds.set(`ch_it_t3_${runs}`, [{ ProviderRefundID: `re_it_t3_${runs}`, ProviderChargeID: `ch_it_t3_${runs}`, Amount: 1200, CurrencyCode: g.currency, Status: 'succeeded' }]);
                        if (runs === 2) await syncNow(ctx, g.SubscriptionID, anchor3); // term 3 booked in its own run first
                        g.held.IsLive = false;
                        g.held.Status = 'canceled';
                        g.held.EndedAt = new Date(anchor3.getTime() + 9 * 3_600_000);
                        await syncNow(ctx, g.SubscriptionID, new Date(anchor3.getTime() + 10 * 3_600_000));
                        const byTerm = await TxQuery<{ TermNumber: number; Reversed: number }>(
                            ctx,
                            `SELECT st.TermNumber, ABS(COALESCE((SELECT SUM(r.LineTotalNet) FROM ${ORDERS_SCHEMA}.OrderLine r WHERE r.ReversesOrderLineID = st.OrderLineID), 0)) AS Reversed
                               FROM ${ORDERS_SCHEMA}.SubscriptionTerm st WHERE st.SubscriptionID = '${g.SubscriptionID}' ORDER BY st.TermNumber`,
                        );
                        AssertEqual(
                            byTerm.map((t) => `${t.TermNumber}:${Number(t.Reversed)}`).join(','),
                            '1:0,2:0,3:1200',
                            `${runs} run(s): each term reverses its OWN charge's refund`,
                        );
                    }
                } finally {
                    await upsertViaEntity(ctx, SUBSCRIPTION_TYPE_ENTITY, typeID, { CancellationRefundMode: was });
                    await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
                }
            }),
    },
    {
        Id: 'subscription-renewal.SR92-OT',
        Name: 'SR92-OT: outside the harness transaction, two bookings of one paid renewal at the same instant, each on its own provider (two workers), book it once',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const run: CheckoutRun = { OrderIDs: [], SubscriptionIDs: [] };
            const typeExisted = !!(await TxMaybeOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code = '${IT_GATEWAY_BILLING}'`));
            let outcomes: string[] = [];
            await OutsideTransaction(
                async () => {
                    fakeGateway.reset();
                    const f = Fx();
                    const account = await gatewayBillingAccount(ctx);
                    run.PaymentProviderID = account;
                    const sub = await subscriptionWithCard(ctx, account, f.Customers.SecondOrganizationID);
                    run.OrderIDs.push(sub.OrderID);
                    run.SubscriptionIDs.push(sub.SubscriptionID);
                    await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                    const linked = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                    const held = fakeGateway.held.find((h) => h.ProviderSubscriptionID === linked.Outcomes[0].ProviderSubscriptionID)!;
                    await BusinessTimeZoneEngine.Instance.Config(false, ctx.User, ctx.Provider);
                    const anchor = DayStartUtc(isoDate(sub.Term.EndDate), BusinessTimeZoneEngine.Instance.Zone);
                    held.Invoices = [renewalInvoice({ anchor, currency: await booksIn(ctx) }, 'race')];

                    // 1. Two deliveries of one renewal at the same instant, each on a provider of its own (two workers),
                    //    straight into the booking so neither can see the other's commit before it starts: both find no
                    //    intent, then queue on the subscription row's lock; the second finds the first's booking under it.
                    const row = await TxOne<Record<string, unknown>>(
                        ctx,
                        `SELECT ID, SubscriptionNumber, Status, ProductID, CompanyID, HolderOrganizationID, BeneficiaryPersonID, PaymentProviderID, ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`,
                    );
                    const renewal = {
                        ...(row as object),
                        LatestTermOrderLineID: null,
                        LatestTermQuantity: 1,
                        LatestTermUnitPrice: 1200,
                    } as RenewalSubscription;
                    const config = await LoadPaymentProviderConfig(account, ctx.Provider, ctx.User);
                    const driver = await BuildPaymentProvider(config, ctx.Provider, ctx.User);
                    const db = ctx.Provider as unknown as { CreateIndependentInstance: () => Promise<unknown> };
                    const workers = await Promise.all([db.CreateIndependentInstance(), db.CreateIndependentInstance()]);
                    try {
                        const booked = await Promise.all(
                            workers.map((w) => BookProviderRenewal(renewal, held.Invoices![0], config, driver, w as never, ctx.User).catch((e: unknown) => ({ Outcome: `threw: ${e}` }))),
                        );
                        outcomes = booked.map((b) => b.Outcome).sort();
                    } finally {
                        for (const w of workers) await (w as { ReleaseIndependentInstance: () => Promise<void> }).ReleaseIndependentInstance().catch(() => undefined);
                    }
                    AssertEqual(JSON.stringify(outcomes), JSON.stringify(['AlreadyBooked', 'Booked']), 'one books; the other finds it under the lock');

                    // 1b. The same race for a $0 renewal (a 100% coupon: no intent, so the guard is the invoice's event).
                    const zeroSub = await subscriptionWithCard(ctx, account, f.Customers.OrganizationID);
                    run.OrderIDs.push(zeroSub.OrderID);
                    run.SubscriptionIDs.push(zeroSub.SubscriptionID);
                    const zeroLinked = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [zeroSub.SubscriptionID] });
                    const zeroRow = await TxOne<Record<string, unknown>>(
                        ctx,
                        `SELECT ID, SubscriptionNumber, Status, ProductID, CompanyID, HolderOrganizationID, BeneficiaryPersonID, PaymentProviderID, ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${zeroSub.SubscriptionID}'`,
                    );
                    const zeroInvoice = { ...renewalInvoice({ anchor, currency: await booksIn(ctx) }, 'race0'), AmountPaid: 0, AmountDue: 0, ProviderIntentID: null, ProviderChargeID: null, Discounted: true };
                    const zeroWorkers = await Promise.all([db.CreateIndependentInstance(), db.CreateIndependentInstance()]);
                    try {
                        const zeroBooked = await Promise.all(
                            zeroWorkers.map((w) =>
                                BookProviderRenewal({ ...(zeroRow as object), LatestTermOrderLineID: null, LatestTermQuantity: 1, LatestTermUnitPrice: 1200 } as RenewalSubscription, zeroInvoice, config, driver, w as never, ctx.User).catch(
                                    (e: unknown) => ({ Outcome: `threw: ${e}` }),
                                ),
                            ),
                        );
                        AssertEqual(JSON.stringify(zeroBooked.map((b) => b.Outcome).sort()), JSON.stringify(['AlreadyBooked', 'Booked']), `the $0 renewal booked once (${zeroLinked.Outcomes[0]?.Code})`);
                    } finally {
                        for (const w of zeroWorkers) await (w as { ReleaseIndependentInstance: () => Promise<void> }).ReleaseIndependentInstance().catch(() => undefined);
                    }
                    AssertEqual(
                        Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE SubscriptionID = '${zeroSub.SubscriptionID}'`)).N),
                        2,
                        'one term added for the $0 renewal',
                    );

                    // 2. And the sync's own path, twice at once: the same single booking (both now in line).
                    const results = await Promise.all([
                        SyncProviderSubscription(sub.SubscriptionID, { Now: anchor }, ctx.Provider, ctx.User),
                        SyncProviderSubscription(sub.SubscriptionID, { Now: anchor }, ctx.Provider, ctx.User),
                    ]);
                    Assert(results.every((r) => r.Outcome === 'InLine'), `two later syncs at once find it booked: ${JSON.stringify(results.map((r) => [r.Outcome, r.Error]))}`);
                    const counts = await TxOne<{ Terms: number; Intents: number; Payments: number; Orders: number }>(
                        ctx,
                        `SELECT (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE SubscriptionID = '${sub.SubscriptionID}') AS Terms,
                                (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE ProviderIntentID = 'pi_it_race') AS Intents,
                                (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE IdempotencyKey = 'provider-charge:${account.toLowerCase()}:ch_it_race') AS Payments,
                                (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${sub.SubscriptionID}') AS Orders`,
                    );
                    AssertEqual(`${counts.Terms}|${counts.Intents}|${counts.Payments}|${counts.Orders}`, '2|1|1|1', `booked once: ${JSON.stringify(counts)}`);
                },
                async () => {
                    await PurgeCheckoutRun(ctx, run);
                    if (!typeExisted) await TxQuery(ctx, `DELETE FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code = '${IT_GATEWAY_BILLING}'`);
                },
            );
            const left = await TxOne<{ N: number }>(
                ctx,
                `SELECT (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.Subscription WHERE ID IN (${run.SubscriptionIDs.map((i) => `'${i}'`).join(',') || 'NULL'}))
                      + (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.PaymentProvider WHERE ID = ${run.PaymentProviderID ? `'${run.PaymentProviderID}'` : 'NULL'}) AS N`,
            );
            AssertEqual(Number(left.N), 0, "the check's committed rows are deleted afterwards");
        },
    },

    {
        Id: 'subscription-renewal.SR98-OT',
        Name: "SR98-OT: outside the harness transaction, one $200 gateway refund of a renewal is credited ONCE (and applied, the renewal owes 0): two deliveries at once on one provider; refund door vs cancel door, whichever locks first",
        RequiresMutation: true,
        Fn: async (ctx) => {
            const run: CheckoutRun = { OrderIDs: [], SubscriptionIDs: [] };
            const typeExisted = !!(await TxMaybeOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code = '${IT_GATEWAY_BILLING}'`));
            const numbers: string[] = [];
            const user = ctx.User;
            // The committed rows' clean-up: the credit orders and the alert Tasks too (the purge below takes the rest).
            const seenSubs: string[] = [];
            const seenOrders: string[] = [];
            const purgeSubscriptions = async () => {
                fakeGateway.chargeGate = null;
                const subs = run.SubscriptionIDs.map((i) => `'${i}'`).join(',') || 'NULL';
                const credits = await TxQuery<{ ID: string }>(
                    ctx,
                    `SELECT DISTINCT OrderHeaderID AS ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE ReversesOrderLineID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID IN (${subs}) OR SubscriptionID IN (${subs}))`,
                );
                run.OrderIDs.push(...credits.map((r) => r.ID));
                for (const n of numbers.filter(Boolean)) {
                    const like = `N'%${n.replace(/'/g, "''")} (%'`;
                    await TxQuery(ctx, `DELETE FROM __mj_BizAppsTasks.TaskLink WHERE TaskID IN (SELECT ID FROM __mj_BizAppsTasks.Task WHERE Name LIKE ${like})`).catch(() => undefined);
                    await TxQuery(ctx, `DELETE FROM __mj_BizAppsTasks.TaskAssignment WHERE TaskID IN (SELECT ID FROM __mj_BizAppsTasks.Task WHERE Name LIKE ${like})`).catch(() => undefined);
                    await TxQuery(ctx, `DELETE FROM __mj_BizAppsTasks.Task WHERE Name LIKE ${like}`).catch(() => undefined);
                }
                seenSubs.push(...run.SubscriptionIDs);
                seenOrders.push(...run.OrderIDs);
            };
            await OutsideTransaction(
                async () => {
                    fakeGateway.reset();
                    const f = Fx();
                    const account = await gatewayBillingAccount(ctx);
                    run.PaymentProviderID = account;
                    const config = await LoadPaymentProviderConfig(account, ctx.Provider, user);
                    const currency = await booksIn(ctx);
                    await BusinessTimeZoneEngine.Instance.Config(false, user, ctx.Provider);
                    const zone = BusinessTimeZoneEngine.Instance.Zone;
                    let priceFlagged = false;

                    // What is credited against THIS renewal (the latest one booked): part 3 sells part 1's customer again,
                    // and Orders reactivates the same subscription (Q5), so the subscription alone does not pick it.
                    const credited = async (subscriptionID: string) =>
                        Math.round(
                            Number(
                                (
                                    await TxOne<{ R: number }>(
                                        ctx,
                                        `SELECT ABS(COALESCE(SUM(ol.LineTotalNet), 0)) AS R FROM ${ORDERS_SCHEMA}.OrderLine ol
                                          WHERE ol.ReversesOrderLineID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${(await renewalOrderOf(ctx, subscriptionID)).ID}')`,
                                    )
                                ).R,
                            ) * 100,
                        ) / 100;
                    const owed = async (subscriptionID: string) => {
                        const o = await renewalOrderOf(ctx, subscriptionID);
                        return Math.round(Number((await TxOne<{ B: number }>(ctx, `SELECT Balance AS B FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${o.ID}'`)).B) * 100) / 100;
                    };
                    // One gateway-billed subscription with its renewal booked (committed), Stripe having refunded $200 of it.
                    const renewed = async (organizationID: string | undefined, key: string, ended: boolean) => {
                        const sub = await subscriptionWithCard(ctx, account, organizationID);
                        run.OrderIDs.push(sub.OrderID);
                        run.SubscriptionIDs.push(sub.SubscriptionID);
                        if (!priceFlagged) {
                            await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
                            priceFlagged = true;
                        }
                        const linked = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
                        const held = fakeGateway.held.find((h) => h.ProviderSubscriptionID === linked.Outcomes[0].ProviderSubscriptionID)!;
                        const anchor = DayStartUtc(isoDate(sub.Term.EndDate), zone);
                        held.Invoices = [renewalInvoice({ anchor, currency }, key)];
                        const synced = await SyncProviderSubscription(sub.SubscriptionID, { Now: anchor }, ctx.Provider, user);
                        Assert(synced.Outcome !== 'Failed', `precondition: the renewal booked: ${synced.Error}`);
                        numbers.push((await TxOne<{ N: string }>(ctx, `SELECT SubscriptionNumber AS N FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`)).N);
                        fakeGateway.refunds.set(`ch_it_${key}`, [{ ProviderRefundID: `re_it_${key}_0`, ProviderChargeID: `ch_it_${key}`, Amount: 200, CurrencyCode: currency, Status: 'succeeded' }]);
                        const endedAt = new Date(anchor.getTime() + 6 * 86_400_000);
                        if (ended) {
                            held.IsLive = false;
                            held.Status = 'canceled';
                            held.EndedAt = endedAt;
                        }
                        const intent = await TxOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE ProviderIntentID = 'pi_it_${key}'`);
                        const event = (n: number): WebhookEvent => ({ EventID: `evt_it_${key}_${n}`, Kind: 'charge.refunded', ProviderIntentID: `pi_it_${key}`, ProviderChargeID: `ch_it_${key}`, Amount: 200 });
                        const refundDoor = async (n: number, driver?: Awaited<ReturnType<typeof BuildPaymentProvider>>) =>
                            BookProviderRefunds(event(n), intent.ID, driver ?? (await BuildPaymentProvider(config, ctx.Provider, user)), ctx.Provider, user);
                        const cancelDoor = async () => {
                            const w = await (ctx.Provider as unknown as { CreateIndependentInstance: () => Promise<unknown> }).CreateIndependentInstance();
                            try {
                                return await WithGatewayEndRecorded(() =>
                                    new CancelSubscriptionOperation().ExecuteServer(
                                        { SubscriptionID: sub.SubscriptionID, RequestDate: isoDate(endedAt), Timing: 'Immediate', Reason: 'Ended at the payment gateway' },
                                        { provider: w as never, user, emitProgress: () => undefined },
                                    ),
                                );
                            } finally {
                                await (w as { ReleaseIndependentInstance: () => Promise<void> }).ReleaseIndependentInstance().catch(() => undefined);
                            }
                        };
                        const end = () => {
                            held.IsLive = false;
                            held.Status = 'canceled';
                            held.EndedAt = endedAt;
                        };
                        return { SubscriptionID: sub.SubscriptionID, refundDoor, cancelDoor, end };
                    };
                    /** Hold the next gateway charge read (not one by a `bypass` driver) after it reads; returns the release. */
                    const gate = (bypass: object[] = []) => {
                        let release!: () => void;
                        let reached!: () => void;
                        const atGate = new Promise<void>((res) => (reached = res));
                        fakeGateway.chargeGate = { bypass: new Set(bypass), reached, release: new Promise<void>((res) => (release = res)) };
                        return { atGate, release: () => release() };
                    };

                    // 1. Two refund deliveries of one refund at the same instant, both on ONE (shared) provider: each runs
                    //    on its own instance, so the subscription lock really makes one wait: credited once.
                    const a = await renewed(f.Customers.OrganizationID, 'd20ra', false);
                    const both = await Promise.all([a.refundDoor(1), a.refundDoor(2)]);
                    Assert(both.every((o) => !o.ReviewReason), `neither delivery raised a review: ${JSON.stringify(both)}`);
                    AssertEqual(`${await credited(a.SubscriptionID)}|${await owed(a.SubscriptionID)}`, '200|0', 'two deliveries at once: 200 credited once, applied (the renewal owes 0)');

                    // 2. The refund door LOCKS FIRST: the cancel has read the gateway (200 refunded, nothing credited) and
                    //    waits; the refund credits 200 and commits; the cancel then locks, re-reads, and reverses nothing more.
                    const b = await renewed(f.Customers.SecondOrganizationID, 'd20rb', true);
                    const refundDriver = await BuildPaymentProvider(config, ctx.Provider, user);
                    const g1 = gate([refundDriver]);
                    const cancelling = b.cancelDoor();
                    await g1.atGate;
                    await b.refundDoor(1, refundDriver);
                    g1.release();
                    const c1 = await cancelling;
                    Assert(c1.Success && c1.Output?.Success, `the cancel recorded: ${c1.Output?.Message ?? c1.ErrorMessage}`);
                    AssertEqual(`${await credited(b.SubscriptionID)}|${await owed(b.SubscriptionID)}`, '200|0', 'refund locked first: 200 credited once (the cancel reversed nothing more), the renewal owes 0');

                    // 3. The cancel door LOCKS FIRST: the refund door has read the gateway and waits; the cancel reverses
                    //    the 200 and commits; the refund door then locks, re-reads, and credits nothing more.
                    // The fixture has two customers, each holding one of these subscriptions: part 1's is ended (recorded
                    // as the gateway's end) so part 3 can sell its customer a new one.
                    a.end();
                    const ca = await a.cancelDoor();
                    Assert(ca.Success && ca.Output?.Success, `part 1's subscription recorded as ended: ${ca.Output?.Message ?? ca.ErrorMessage}`);
                    const c = await renewed(f.Customers.OrganizationID, 'd20rc', true);
                    const g2 = gate();
                    const refunding = c.refundDoor(1);
                    await g2.atGate;
                    const c2 = await c.cancelDoor();
                    Assert(c2.Success && c2.Output?.Success, `the cancel recorded: ${c2.Output?.Message ?? c2.ErrorMessage}`);
                    g2.release();
                    await refunding;
                    const detail = await TxQuery<Record<string, unknown>>(
                        ctx,
                        `SELECT oh.OrderNumber, oh.OrderType, LEFT(oh.Notes, 120) AS Notes, ol.Quantity, ol.LineTotalNet FROM ${ORDERS_SCHEMA}.OrderLine ol JOIN ${ORDERS_SCHEMA}.OrderHeader oh ON oh.ID = ol.OrderHeaderID
                          WHERE ol.ReversesOrderLineID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${c.SubscriptionID}')`,
                    );
                    AssertEqual(`${await credited(c.SubscriptionID)}|${await owed(c.SubscriptionID)}`, '200|0', `cancel locked first: 200 credited once (the refund door credited nothing more), the renewal owes 0: ${JSON.stringify(detail)}`);
                },
                async () => {
                    await purgeSubscriptions();
                    await PurgeCheckoutRun(ctx, run);
                    if (!typeExisted) await TxQuery(ctx, `DELETE FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code = '${IT_GATEWAY_BILLING}'`);
                },
            );
            const left = await TxOne<{ N: number }>(
                ctx,
                `SELECT (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.Subscription WHERE ID IN (${seenSubs.map((i) => `'${i}'`).join(',') || 'NULL'}))
                      + (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID IN (${seenOrders.map((i) => `'${i}'`).join(',') || 'NULL'}))
                      + (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.PaymentProvider WHERE ID = ${run.PaymentProviderID ? `'${run.PaymentProviderID}'` : 'NULL'}) AS N`,
            );
            AssertEqual(Number(left.N), 0, "the check's committed rows are deleted afterwards");
        },
    },

    {
        Id: 'subscription-renewal.SR100',
        Name: 'SR100: a 24-month line at a typed price renews for one 12-month term at half its price, and the preview shows the term dates (golive #338)',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // Two years paid up front on one line, at a price typed for the whole period: two
                // 12-month terms of 10,000 each. Only a typed price is cut to one term at renewal; the
                // engine prices one term whatever period the line states.
                const result = await BuildOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: new Date('2026-11-01T00:00:00Z'),
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [
                        {
                            ProductID: f.Products.SubRolling,
                            Quantity: 1,
                            UnitPrice: 20000,
                            ServicePeriodStart: '2026-11-01',
                            ServicePeriodEnd: '2028-10-31',
                        },
                    ],
                });
                result.Lines[0].PriceOverridden = true;
                result.Lines[0].PriceOverrideReason = 'two years paid up front';
                result.Order.Status = 'Confirmed';
                Assert(await result.Order.Save(), `confirm failed: ${result.Order.LatestResult?.CompleteMessage}`);
                const subscription = await TxOne<{ SubscriptionID: string }>(
                    ctx,
                    `SELECT DISTINCT st.SubscriptionID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                     WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
                );
                const SubscriptionID = subscription.SubscriptionID;
                const bought = await termsOf(ctx, SubscriptionID);
                AssertEqual(
                    JSON.stringify(bought.map((t) => `${isoDate(t.StartDate)}..${isoDate(t.EndDate)}:${Number(t.Amount)}`)),
                    JSON.stringify(['2026-11-01..2027-10-31:10000', '2027-11-01..2028-10-31:10000']),
                    'precondition: two 12-month terms of 10,000',
                );

                // The paid second year is not billed.
                const early = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: '2027-08-15', Preview: true });
                AssertEqual(early.Candidates.length, 0, 'nothing is due inside the paid coverage');

                const asOf = daysBefore('2028-10-31', 10);
                const preview = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf, Preview: true });
                AssertEqual(preview.Candidates.length, 1, `the subscription is due: ${preview.Message}`);
                const c = preview.Candidates[0];
                AssertEqual(c.BasePriceSource, 'PriorPrice', "the base is the line's own price");
                AssertEqual(Number(c.BasePrice), 10000, 'one 12-month term of the 24-month price');
                AssertEqual(Number(c.UnitPrice), 10000, 'no increase is set');
                AssertEqual(c.RenewalTermStart, '2028-11-01', 'the preview shows the renewal term start');
                AssertEqual(c.RenewalTermEnd, '2029-10-31', 'and its end, one 12-month term');

                const live = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(live.Placed, 1, `expected one renewal: ${live.Candidates[0]?.SkippedReason ?? live.Message}`);
                AssertEqual(Number((await renewalLine(ctx, live.Candidates[0].OrderID!)).UnitPrice), 10000, 'the renewal line at 10,000');
                const renewed = (await termsOf(ctx, SubscriptionID))[2];
                Assert(renewed != null, 'the renewal booked a third term');
                AssertEqual(
                    `${isoDate(renewed.StartDate)}..${isoDate(renewed.EndDate)}:${Number(renewed.Amount)}`,
                    '2028-11-01..2029-10-31:10000',
                    'the booked term matches the preview',
                );
                const notes = await TxOne<{ Notes: string }>(
                    ctx,
                    `SELECT Notes FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${live.Candidates[0].OrderID}'`,
                );
                Assert(
                    notes.Notes.includes('one term of a 24-month line'),
                    `the notes say the base is one term of the line: ${notes.Notes}`,
                );
            }),
    },
];

/** A 20%-off promotion and its code, with `AppliesToRenewals` as given; returns the code. */
async function renewalPromotion(ctx: IntegrationCheckContext, opts: { AppliesToRenewals: boolean }): Promise<string> {
    const code = await CreatePromotion(ctx, { Value: 0.2 });
    await upsertViaEntity(ctx, PROMOTION_ENTITY, await promotionIDFor(ctx, code), { AppliesToRenewals: opts.AppliesToRenewals });
    return code;
}

/** The promotion a code belongs to. */
async function promotionIDFor(ctx: IntegrationCheckContext, code: string): Promise<string> {
    const row = await TxOne<{ PromotionID: string }>(
        ctx,
        `SELECT PromotionID FROM ${ORDERS_SCHEMA}.PromotionCode WHERE Code = '${code.replace(/[^A-Za-z0-9-]/g, '')}'`,
    );
    return row.PromotionID;
}

/** The total discount amount stamped on an order's lines. */
async function lineDiscount(ctx: IntegrationCheckContext, orderID: string): Promise<number> {
    const row = await TxOne<{ Discount: number }>(
        ctx,
        `SELECT ISNULL(SUM(DiscountAmount), 0) AS Discount FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`,
    );
    return Number(row.Discount);
}

/** Give the fixture's selling company a default terms row by code (rolled back with the check). */
async function setCompanyDefaultTerms(ctx: IntegrationCheckContext, code: string): Promise<void> {
    const companyID = Fx().CoA.ID;
    await TxQuery(
        ctx,
        `DECLARE @t UNIQUEIDENTIFIER = (SELECT ID FROM ${ORDERS_SCHEMA}.PaymentTermsType WHERE Code = '${code}');
         IF EXISTS (SELECT 1 FROM ${ORDERS_SCHEMA}.OrderCompanyPolicy WHERE ID = '${companyID}')
           UPDATE ${ORDERS_SCHEMA}.OrderCompanyPolicy SET DefaultPaymentTermsTypeID = @t WHERE ID = '${companyID}';
         ELSE
           INSERT INTO ${ORDERS_SCHEMA}.OrderCompanyPolicy (ID, DefaultPaymentTermsTypeID) VALUES ('${companyID}', @t);`,
    );
}

/**
 * Run `body` with a product recognised at sale. Through the object model with the catalog engine
 * reloaded, because booking reads products from `OrdersEngine`'s cache; put back the same way
 * before the transaction rolls back, or the cache would carry it into the next check.
 */
async function withUpFrontRecognition<T>(ctx: IntegrationCheckContext, productID: string, body: () => Promise<T>): Promise<T> {
    const was = await TxOne<{ RevenueRecognitionTypeID: string | null }>(
        ctx,
        `SELECT RevenueRecognitionTypeID FROM ${ORDERS_SCHEMA}.Product WHERE ID = '${productID}'`,
    );
    const upFront = Fx().RevRecTypeIDs.get('UpFront');
    Assert(upFront != null, "RevRec type 'UpFront' missing from the fixture");
    await upsertViaEntity(ctx, PRODUCT_ENTITY, productID, { RevenueRecognitionTypeID: upFront });
    await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
    try {
        return await body();
    } finally {
        await upsertViaEntity(ctx, PRODUCT_ENTITY, productID, { RevenueRecognitionTypeID: was.RevenueRecognitionTypeID });
        await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
    }
}

/** Run `body` with the selling company's Unbilled Receivable link disabled, restored the same way. */
async function withUnbilledUnlinked<T>(ctx: IntegrationCheckContext, body: () => Promise<T>): Promise<T> {
    const links = await TxQuery<{ ID: string }>(
        ctx,
        `SELECT l.ID FROM ${ACCT_SCHEMA}.GLAccountLink l
         JOIN ${ACCT_SCHEMA}.GLAccountRole r ON r.ID = l.GLAccountRoleID
         JOIN ${ACCT_SCHEMA}.GLAccount a ON a.ID = l.GLAccountID
         WHERE r.Name = 'Unbilled Receivable' AND a.CompanyID = '${Fx().CoA.ID}' AND l.Status = 'Active'`,
    );
    Assert(links.length > 0, 'precondition: the fixture links an Unbilled Receivable account');
    for (const l of links) await upsertViaEntity(ctx, GL_ACCOUNT_LINK_ENTITY, l.ID, { Status: 'Disabled' });
    await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    try {
        return await body();
    } finally {
        for (const l of links) await upsertViaEntity(ctx, GL_ACCOUNT_LINK_ENTITY, l.ID, { Status: 'Active' });
        await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    }
}

/** The GL lines of every journal entry `entryIDsSql` selects. */
const ledgerOf = (ctx: IntegrationCheckContext, entryIDsSql: string) =>
    TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
         FROM ${ACCT_SCHEMA}.JournalEntryLine jel
         JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         WHERE jel.JournalEntryID IN (${entryIDsSql})`,
    );

/** Debits less credits on one account. */
const netOn = (lines: Array<{ Code: string; DebitAmount: number; CreditAmount: number }>, code: string): number =>
    Math.round(
        lines.filter((l) => l.Code === code).reduce((t, l) => t + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0) * 100,
    ) / 100;


// ─── Renewal-card charging helpers (#289) ─────────────────────────────────────────────────────

/** The key both the charge Action metadata and its `@RegisterClass` decorator name. */
const CHARGE_ACTION_DRIVER_CLASS = 'Orders.ChargeRenewals';

/** A Stripe account in stub mode (`IsLiveMode = 0`), created with its type if the metadata has not seeded it. */
async function stubStripeProvider(ctx: IntegrationCheckContext, active = true): Promise<string> {
    const existingType = await TxMaybeOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code = 'Stripe'`);
    const typeID =
        existingType?.ID ??
        (await createViaEntity(ctx, PAYMENT_PROVIDER_TYPE_ENTITY, {
            Code: 'Stripe',
            Name: 'IT Stripe',
            DriverClass: 'StripePaymentProvider',
            SupportsTokenization: 1,
            SupportsRefund: 1,
            SupportsWebhooks: 1,
            Sequence: 90,
            IsActive: 1,
        }));
    return createViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, {
        PaymentProviderTypeID: typeID,
        CompanyID: Fx().CoA.ID,
        Name: `IT Stripe renewal${active ? '' : ' (inactive)'}`,
        CredentialsRef: null,
        IsLiveMode: 0,
        IsActive: active ? 1 : 0,
    });
}

/**
 * Buy an annual subscription, give it a renewal card (a wallet entry the customer organization owns,
 * as checkout writes one) and spawn its renewal. `instrumentRef` is one of Stripe's test card names,
 * which the stub answers the way test mode does.
 */
async function renewWithCard(
    ctx: IntegrationCheckContext,
    instrumentRef: string,
    opts: { inactiveProvider?: boolean; organizationID?: string; billToPersonID?: string } = {},
): Promise<{ SubscriptionID: string; OrderID: string; TermStart: string; SourceOrderID: string; ProviderID: string }> {
    const f = Fx();
    // A second subscription in one check needs a second holder: AnnualRolling is ExtendExisting, so the
    // same holder buying again extends the first subscription instead of starting another.
    const holder = opts.organizationID ?? f.Customers.OrganizationID;
    const { SubscriptionID, Term, OrderID: SourceOrderID } = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, holder, opts.billToPersonID);
    const providerID = await stubStripeProvider(ctx, !opts.inactiveProvider);
    const tenderID = f.PaymentTypeIDs.get('CreditCard');
    Assert(tenderID != null, 'precondition: a CreditCard payment type');
    // The card is the wallet's embedded Payment Detail, written through the wallet as checkout writes it
    // (D38/D39): a new wallet holds a new, empty detail, and the wallet's save persists it first.
    const wallet = await ctx.Provider.GetEntityObject<CustomerPaymentMethodEntity>(CUSTOMER_PAYMENT_METHOD_ENTITY, ctx.User);
    wallet.NewRecord();
    wallet.OwnerOrganizationID = holder;
    wallet.IsDefault = true;
    wallet.IsActive = true;
    const detail = wallet.PaymentDetailID_Object;
    detail.CompanyID = f.CoA.ID;
    detail.PaymentTypeID = tenderID!;
    detail.PaymentProviderID = providerID;
    detail.ProviderCustomerRef = 'cus_it_renewal';
    detail.ProviderInstrumentRef = instrumentRef;
    detail.Brand = 'visa';
    detail.Last4 = '4242';
    Assert(await wallet.Save(), `the renewal card is filed: ${wallet.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    const walletID = wallet.ID;
    await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, SubscriptionID, { DefaultCustomerPaymentMethodID: walletID });

    const placed = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
    AssertEqual(placed.Placed, 1, `the renewal is placed: ${placed.Message}`);
    return { SubscriptionID, OrderID: placed.Candidates[0].OrderID!, TermStart: isoDate(daysBefore(Term.EndDate, -1)), SourceOrderID, ProviderID: providerID };
}

// ─── Option E, E2 fixtures: a fake gateway that bills subscriptions ─────────────────────────────

/** The type code of the fake gateway; also its ClassFactory key. */
const IT_GATEWAY_BILLING = 'ITGatewayBilling';

/** What the fake gateway was asked to create, and what it holds. Reset by each check. */
const fakeGateway = {
    created: [] as CreateProviderSubscriptionRequest[],
    held: [] as Array<{
        ProviderSubscriptionID: string;
        Status: string;
        IsLive: boolean;
        Customer: string;
        Metadata: Record<string, string>;
        EndsAt?: Date;
        /** Start of the period it last billed; set by a check to stage a renewal the gateway charged. */
        PeriodStart?: Date;
        /** E3: what the gateway says it bills, who, and when it ended; set by a check. */
        PriceID?: string;
        Quantity?: number;
        Email?: string;
        EndedAt?: Date;
        /** E3: a state to report instead of the one derived (Collecting, while the gateway retries). */
        State?: 'Renewing' | 'Ending' | 'Ended' | 'Collecting';
        /** E3: the gateway's invoices for it, as a check stages them. */
        Invoices?: GatewaySubscriptionInvoice[];
    }>,
    /** E4: refunds the gateway made, by charge. */
    refunds: new Map<string, GatewayRefund[]>(),
    /** A race check's gate on the next RetrieveCharge (not on a `bypass` driver): see the driver's RetrieveCharge. */
    chargeGate: null as null | { bypass: Set<object>; reached: () => void; release: Promise<void> },
    /** E3: the event the next webhook delivery carries. */
    event: null as WebhookEvent | null,
    /** Describe calls so far, and the call number that fails (a transient gateway read failure); 0 = none. */
    describeCalls: 0,
    failDescribeOnCall: 0,
    priceInterval: { Unit: 'year', Count: 1 } as GatewayPriceInterval,
    /** Every cancel the gateway was asked for (E2b). */
    cancelled: [] as CancelProviderSubscriptionRequest[],
    /** Set to make the gateway refuse every cancel, as Stripe does when it cannot be reached or says no. */
    refuseCancel: null as string | null,
    reset(): void {
        this.created = [];
        this.held = [];
        this.priceInterval = { Unit: 'year', Count: 1 };
        this.cancelled = [];
        this.refuseCancel = null;
        this.refunds = new Map();
        this.event = null;
        this.describeCalls = 0;
        this.failDescribeOnCall = 0;
        this.chargeGate = null;
    },
};

/**
 * A gateway that bills subscriptions, in memory. Registered under its own type code so no real driver
 * changes. Its payment verbs are the Stripe stub's (so Charge Renewals can charge its cards in SR65);
 * its subscription verbs are in memory, with Stripe's first-charge limit, so deferral behaves as it
 * does against Stripe.
 */
@RegisterClass(BasePaymentProvider, IT_GATEWAY_BILLING)
export class IntegrationTestGatewayBillingProvider extends StripePaymentProvider {
    protected override get useStub(): boolean {
        return true;
    }

    /** The stub's intent, with the card a real gateway reports after a payment that saved it (so checkout keeps it). */
    public override async RetrieveIntent(request: RetrieveIntentRequest): Promise<RetrieveIntentResult> {
        const retrieved = await super.RetrieveIntent(request);
        return retrieved.Success
            ? { ...retrieved, Instrument: { ProviderCustomerRef: 'cus_it_checkout', ProviderInstrumentRef: 'pm_it_checkout', Brand: 'visa', Last4: '4242' } }
            : retrieved;
    }

    public override async CreateProviderSubscription(request: CreateProviderSubscriptionRequest): Promise<CreateProviderSubscriptionResult> {
        fakeGateway.created.push(request);
        const id = `sub_it_${fakeGateway.created.length}_${(request.Metadata?.OrdersSubscriptionID ?? '').slice(0, 8)}`;
        fakeGateway.held.push({ ProviderSubscriptionID: id, Status: 'active', IsLive: true, Customer: request.ProviderCustomerRef, Metadata: request.Metadata ?? {} });
        return { Success: true, ProviderSubscriptionID: id, Status: 'active', FirstChargeAt: request.FirstChargeAt, ChargedAtCreation: false };
    }

    /** In memory, as Stripe answers: now ends it; an instant sets it to end then; an unknown id is refused. */
    public override async CancelProviderSubscription(request: CancelProviderSubscriptionRequest): Promise<CancelProviderSubscriptionResult> {
        fakeGateway.cancelled.push(request);
        if (fakeGateway.refuseCancel) return { Success: false, Reason: fakeGateway.refuseCancel };
        const held = fakeGateway.held.find((h) => h.ProviderSubscriptionID === request.ProviderSubscriptionID);
        if (!held) return { Success: false, Reason: `No such subscription: '${request.ProviderSubscriptionID}'` };
        if (!held.IsLive) return { Success: true, Outcome: 'AlreadyEnded', Status: held.Status };
        if (!request.BillingEndsAt) {
            held.Status = 'canceled';
            held.IsLive = false;
            return { Success: true, Outcome: 'CanceledNow', BillingEndsAt: new Date(), Status: 'canceled' };
        }
        held.EndsAt = request.BillingEndsAt;
        return { Success: true, Outcome: 'EndsAtPeriodEnd', BillingEndsAt: request.BillingEndsAt, Status: held.Status };
    }

    /** In memory, as Stripe reports it: ended, set to end, or renewing from `PeriodStart`; an unknown id is refused. */
    public override async DescribeProviderSubscription(providerSubscriptionID: string): Promise<DescribeProviderSubscriptionResult> {
        fakeGateway.describeCalls++;
        if (fakeGateway.failDescribeOnCall && fakeGateway.describeCalls === fakeGateway.failDescribeOnCall) {
            return { Success: false, Reason: 'the gateway timed out (staged)' };
        }
        const held = fakeGateway.held.find((h) => h.ProviderSubscriptionID === providerSubscriptionID);
        if (!held) return { Success: false, Reason: `No such subscription: '${providerSubscriptionID}'` };
        return {
            Success: true,
            State: held.State ?? (!held.IsLive ? 'Ended' : held.EndsAt ? 'Ending' : 'Renewing'),
            CurrentPeriodStart: held.PeriodStart ?? null,
            EndsAt: held.EndsAt ?? null,
            EndedAt: held.EndedAt ?? null,
            Status: held.Status,
            ProviderPriceID: held.PriceID ?? 'price_it_rolling',
            Quantity: held.Quantity ?? 1,
            ProviderCustomerRef: held.Customer,
            CustomerEmail: held.Email ?? null,
            Metadata: held.Metadata,
        };
    }

    /** E3: the invoices a check staged; an unknown id is refused. */
    public override async ListProviderSubscriptionInvoices(request: { ProviderSubscriptionID: string; CreatedSince?: Date | null }): Promise<ListProviderSubscriptionInvoicesResult> {
        const held = fakeGateway.held.find((h) => h.ProviderSubscriptionID === request.ProviderSubscriptionID);
        if (!held) return { Success: false, Reason: `No such subscription: '${request.ProviderSubscriptionID}'` };
        return { Success: true, Invoices: held.Invoices ?? [] };
    }

    /** E4: a charge of a staged invoice, with the refunds the gateway made on it. */
    public override async RetrieveCharge(request: RetrieveChargeRequest): Promise<RetrieveChargeResult> {
        // A race check's gate: the read is made NOW, then held until the check lets it return (the caller has read
        // the gateway and not yet locked anything).
        const gate = fakeGateway.chargeGate;
        if (gate && !gate.bypass.has(this)) {
            const result = this.chargeNow(request);
            fakeGateway.chargeGate = null;
            gate.reached();
            await gate.release;
            return result;
        }
        return this.chargeNow(request);
    }

    private chargeNow(request: RetrieveChargeRequest): RetrieveChargeResult {
        const invoice = fakeGateway.held.flatMap((h) => h.Invoices ?? []).find((i) => i.ProviderChargeID === request.ProviderChargeID);
        if (!invoice) return { Success: false, NotFound: true, Reason: `No such charge: '${request.ProviderChargeID}'` };
        const refunded = (fakeGateway.refunds.get(request.ProviderChargeID) ?? []).reduce((sum, r) => sum + r.Amount, 0);
        return {
            Success: true,
            Charge: {
                ProviderChargeID: request.ProviderChargeID,
                ProviderIntentID: invoice.ProviderIntentID,
                Amount: invoice.AmountPaid,
                AmountRefunded: refunded,
                CurrencyCode: invoice.CurrencyCode,
                Status: 'succeeded',
            },
        };
    }

    public override async ListRefunds(request: ListRefundsRequest): Promise<ListRefundsResult> {
        return { Success: true, Refunds: request.ProviderChargeID ? (fakeGateway.refunds.get(request.ProviderChargeID) ?? []) : [] };
    }

    /** E3: every delivery verifies, and carries the event a check staged. */
    public override async VerifyWebhook(): Promise<{ Valid: boolean; Reason?: string }> {
        return { Valid: true };
    }

    public override ParseWebhookEvent(): WebhookEvent | null {
        return fakeGateway.event;
    }

    public override async FindProviderSubscriptions(request: FindProviderSubscriptionsRequest): Promise<FindProviderSubscriptionsResult> {
        return {
            Success: true,
            Subscriptions: fakeGateway.held
                .filter((h) => h.Customer === request.ProviderCustomerRef && h.Metadata[request.MetadataKey] === request.MetadataValue)
                .map((h) => ({ ProviderSubscriptionID: h.ProviderSubscriptionID, Status: h.Status, IsLive: h.IsLive, Metadata: h.Metadata })),
        };
    }

    public override async DescribeProviderPrice(_providerPriceID: string): Promise<DescribeProviderPriceResult> {
        return { Success: true, Active: true, Interval: fakeGateway.priceInterval };
    }

    public override LatestFirstChargeAt(createdAt: Date, interval?: GatewayPriceInterval | null): Date | null {
        return interval ? OneIntervalLaterAsStripeCounts(createdAt, interval) : OneYearLaterAsStripeCounts(createdAt);
    }
}

/** A live account on the fake gateway with the switch on (unless asked otherwise). */
async function gatewayBillingAccount(ctx: IntegrationCheckContext, opts: { live?: boolean; billsSubscriptions?: boolean } = {}): Promise<string> {
    const existingType = await TxMaybeOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code = '${IT_GATEWAY_BILLING}'`);
    const typeID =
        existingType?.ID ??
        (await createViaEntity(ctx, PAYMENT_PROVIDER_TYPE_ENTITY, {
            Code: IT_GATEWAY_BILLING,
            Name: 'IT gateway that bills subscriptions',
            DriverClass: 'IntegrationTestGatewayBillingProvider',
            SupportsTokenization: 1,
            SupportsRefund: 0,
            SupportsWebhooks: 0,
            SupportsSubscriptionBilling: 1,
            Sequence: 91,
            IsActive: 1,
        }));
    return createViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, {
        PaymentProviderTypeID: typeID,
        CompanyID: Fx().CoA.ID,
        Name: `IT gateway billing${opts.live === false ? ' (stub)' : ''}`,
        CredentialsRef: null,
        IsLiveMode: opts.live === false ? 0 : 1,
        IsActive: 1,
        BillsSubscriptions: opts.billsSubscriptions === false ? 0 : 1,
    });
}

/** The price new subscriptions to this product are created on, for this account. */
async function flagPrice(ctx: IntegrationCheckContext, providerID: string, productID: string, providerPriceID: string): Promise<void> {
    await createViaEntity(ctx, PAYMENT_PROVIDER_PRICE_ENTITY, {
        PaymentProviderID: providerID,
        ProviderPriceID: providerPriceID,
        ProductID: productID,
        IsActive: 1,
        UseForNewSubscriptions: 1,
    });
}

/**
 * An annual subscription (bought 1 Jan 2026, paid) with a renewal card kept on this account, as checkout
 * leaves it.
 */
async function subscriptionWithCard(ctx: IntegrationCheckContext, providerID: string, organizationID?: string) {
    const f = Fx();
    const holder = organizationID ?? f.Customers.OrganizationID;
    const bought = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, holder);
    // Paid, as a checkout's order is: the hand-over waits while the latest term's order owes money.
    await payInFull(ctx, bought.OrderID, holder);
    const tenderID = f.PaymentTypeIDs.get('CreditCard');
    Assert(tenderID != null, 'precondition: a CreditCard payment type');
    const wallet = await ctx.Provider.GetEntityObject<CustomerPaymentMethodEntity>(CUSTOMER_PAYMENT_METHOD_ENTITY, ctx.User);
    wallet.NewRecord();
    wallet.OwnerOrganizationID = holder;
    wallet.IsDefault = true;
    wallet.IsActive = true;
    const detail = wallet.PaymentDetailID_Object;
    detail.CompanyID = f.CoA.ID;
    detail.PaymentTypeID = tenderID!;
    detail.PaymentProviderID = providerID;
    detail.ProviderCustomerRef = 'cus_it_e2';
    detail.ProviderInstrumentRef = 'pm_it_e2';
    Assert(await wallet.Save(), `the renewal card is filed: ${wallet.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, bought.SubscriptionID, { DefaultCustomerPaymentMethodID: wallet.ID });
    return bought;
}

/** Capture cash for an order's whole balance through `Orders.CapturePayment`, as a finance user would. */
async function payInFull(ctx: IntegrationCheckContext, orderID: string, billToOrganizationID: string): Promise<void> {
    const f = Fx();
    const balance = Number((await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${orderID}'`)).Balance);
    Assert(balance > 0, `precondition: the order owes something: ${balance}`);
    Assert(f.PaymentTypeIDs.get('Cash') != null, "PaymentType 'Cash' missing — push the orders app metadata");
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<Record<string, unknown>, { Success: boolean; Message?: string }>
    >(BaseRemotableOperation, 'Orders.CapturePayment');
    Assert(op != null, "'Orders.CapturePayment' is not registered");
    const result = await op!.Execute(
        { Amount: balance, ReceivingCompanyID: f.CoA.ID, BillToOrganizationID: billToOrganizationID, TenderCode: 'Cash', Allocations: [{ OrderHeaderID: orderID, Amount: balance }] },
        { provider: ctx.Provider, user: ctx.User },
    );
    Assert(result.Success && result.Output?.Success, `the order is paid: ${result.ErrorMessage ?? result.Output?.Message ?? 'unknown'}`);
}

/** `EnsureProviderSubscriptions` on the check's transaction, at noon UTC on the purchase day unless told otherwise. */
async function ensureProviderSubscriptions(ctx: IntegrationCheckContext, input: EnsureProviderSubscriptionsInput): Promise<EnsureProviderSubscriptionsResult> {
    const result = await EnsureProviderSubscriptions({ Now: new Date('2026-01-01T12:00:00Z'), ...input }, ctx.Provider, ctx.User);
    Assert(result.Success, `the pass selected its subscriptions: ${result.Message}`);
    return result;
}

/** How many alert Tasks name this subscription and problem. */
async function alertTasks(ctx: IntegrationCheckContext, subscriptionID: string, code: string): Promise<number> {
    const sub = await TxOne<{ SubscriptionNumber: string }>(ctx, `SELECT SubscriptionNumber FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${subscriptionID}'`);
    Assert(ctx.Provider.Entities.some((e) => e.Name === TASK_ENTITY), 'precondition: bizapps-tasks is installed, so alerts are Tasks');
    const rows = await TxQuery<{ N: number }>(
        ctx,
        `SELECT COUNT(*) AS N FROM __mj_BizAppsTasks.Task WHERE Name = 'Gateway subscription needs attention: ${sub.SubscriptionNumber} (${code})'`,
    );
    return Number(rows[0]?.N ?? 0);
}

/**
 * Mark a subscription as billed by a gateway: its provider account and the gateway's subscription id, set
 * together, with the server sanction the checkout hand-over takes (linking by hand is refused).
 */
async function markProviderBilled(ctx: IntegrationCheckContext, subscriptionID: string, providerID: string, gatewayID: string): Promise<void> {
    const sub = await ctx.Provider.GetEntityObject<BaseEntity>(SUBSCRIPTION_ENTITY, ctx.User);
    Assert(await sub.InnerLoad(CompositeKey.FromID(subscriptionID)), `precondition: subscription ${subscriptionID} loads`);
    SanctionProviderBilledChange(sub);
    sub.Set('PaymentProviderID', providerID);
    sub.Set('ProviderSubscriptionID', gatewayID);
    Assert(await sub.Save(), `marked gateway-billed: ${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`);
}

/**
 * Run one statement behind a savepoint and return the database's refusal, or '' when it was allowed.
 * A refused statement is rolled back to the savepoint, so the check's transaction stays usable for the
 * next probe; an allowed one is kept (the check's own rollback discards it).
 */
async function refusedBySql(ctx: IntegrationCheckContext, statement: string): Promise<string> {
    const rows = await TxQuery<{ Refusal: string | null }>(
        ctx,
        `SAVE TRANSACTION sr_probe;
         BEGIN TRY
             ${statement};
             SELECT CAST(NULL AS NVARCHAR(4000)) AS Refusal;
         END TRY
         BEGIN CATCH
             IF XACT_STATE() = 1 ROLLBACK TRANSACTION sr_probe;
             SELECT ERROR_MESSAGE() AS Refusal;
         END CATCH`,
    );
    return rows[0]?.Refusal ?? '';
}

/** `ChargeRenewals` as the Action calls it. */
async function chargeRenewals(ctx: IntegrationCheckContext, input: { SubscriptionID?: string; AsOfDate: string; Preview?: boolean }): Promise<ChargeRenewalsOutput> {
    return ChargeRenewals(input, ctx.Provider, ctx.User);
}

/** The charge Action, resolved and run the way the scheduler does: every parameter a string. */
async function chargeRenewalsViaAction(
    ctx: IntegrationCheckContext,
    inputs: Record<string, string>,
): Promise<{ Success: boolean; ResultCode?: string; Message?: string; Charged: number; Failed: number; Attempts: ChargeRenewalsOutput['Attempts'] }> {
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAction>(BaseAction, CHARGE_ACTION_DRIVER_CLASS);
    Assert(resolved.Resolved && resolved.Instance != null, `'${CHARGE_ACTION_DRIVER_CLASS}' is not registered — the Load anchor is missing`);
    const params = {
        ContextUser: ctx.User,
        Provider: ctx.Provider,
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' as const })),
        Filters: [],
    } as unknown as RunActionParams;
    const result = await resolved.Instance!.Run(params);
    const output = <T,>(name: string): T | undefined =>
        params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value as T | undefined;
    return {
        Success: result.Success,
        ResultCode: result.ResultCode,
        Message: result.Message,
        Charged: Number(output<number>('Charged') ?? 0),
        Failed: Number(output<number>('Failed') ?? 0),
        Attempts: output<ChargeRenewalsOutput['Attempts']>('Attempts') ?? [],
    };
}

/** The intents opened against an order, oldest first. */
const intentsOf = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ ID: string; Status: string; ProviderIntentID: string }>(
        ctx,
        `SELECT ID, Status, ProviderIntentID FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE OrderHeaderID = '${orderID}' ORDER BY __mj_CreatedAt`,
    );

/** The payments allocated to an order. */
const paymentsFor = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ ID: string; Status: string; Amount: number; PaymentIntentID: string; PaymentDate: string }>(
        ctx,
        `SELECT DISTINCT ph.ID, ph.Status, ph.Amount, ph.PaymentIntentID, CONVERT(varchar(10), ph.PaymentDate, 23) AS PaymentDate
         FROM ${ORDERS_SCHEMA}.PaymentHeader ph
         JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
         WHERE pl.OrderHeaderID = '${orderID}'`,
    );

/** The charge pass's PaymentSucceeded / PaymentFailed events on an order, oldest first. */
const chargeEventsOf = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ EventType: string; EventData: string; RelatedPaymentID: string | null }>(
        ctx,
        `SELECT EventType, EventData, RelatedPaymentID FROM ${ORDERS_SCHEMA}.SubscriptionEvent
         WHERE RelatedOrderHeaderID = '${orderID}' AND EventType IN ('PaymentSucceeded','PaymentFailed')
         ORDER BY __mj_CreatedAt, ID`,
    );


// ─── Update-card link helpers (#289) ──────────────────────────────────────────────────────────

/** A secret for the checks only: links are signed and checked with it while a check runs. */
const TEST_LINK_SECRET = 'integration-check-renewal-link-secret-0123456789';

/** Run `body` with renewal links switched on (a secret and a link address), and off again after. */
async function withRenewalLinks<T>(body: () => Promise<T>): Promise<T> {
    ConfigureRenewalPaymentLinks({ Secret: TEST_LINK_SECRET });
    OrdersSettings.SetOverride('RenewalPaymentLinkBaseUrl', 'https://checkout.example.test/checkout');
    try {
        return await body();
    } finally {
        ConfigureRenewalPaymentLinks({ Secret: null });
        OrdersSettings.SetOverride('RenewalPaymentLinkBaseUrl', undefined);
    }
}

/**
 * The checkout that sold the subscription: an active widget on the renewal card's provider, with a
 * distribution, named as the source of the subscription's first order. The update-card page is shown
 * in it.
 */
async function soldThroughCheckout(ctx: IntegrationCheckContext, sourceOrderID: string, providerID: string): Promise<string> {
    const f = Fx();
    const widgetID = await createViaEntity(ctx, CHECKOUT_WIDGET_ENTITY, {
        Name: `${f.Run} renewal checkout`,
        CompanyID: f.CoA.ID,
        Status: 'Active',
        Configuration: JSON.stringify({ paymentProviderId: providerID, currency: 'USD' }),
    });
    await createViaEntity(ctx, CHECKOUT_WIDGET_DISTRIBUTION_ENTITY, {
        CheckoutWidgetID: widgetID,
        Slug: `${f.Run.toLowerCase()}-renew-${widgetID.slice(0, 8).toLowerCase()}`,
        Status: 'Active',
    });
    await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.OrderHeader SET SourceCheckoutWidgetID = '${widgetID}' WHERE ID = '${sourceOrderID}'`);
    return widgetID;
}

/** A link token for a renewal, valid for a day. */
const linkToken = (orderID: string, subscriptionID: string) =>
    SignRenewalPaymentToken({ OrderID: orderID, SubscriptionID: subscriptionID, ExpiresAt: new Date(Date.now() + 86_400_000) }, TEST_LINK_SECRET);

/** Mark the session's intent paid, as the gateway's webhook would once the buyer confirms. */
async function settleSessionIntent(ctx: IntegrationCheckContext, sessionID: string): Promise<void> {
    const row = await TxOne<{ PaymentIntentID: string }>(ctx, `SELECT PaymentIntentID FROM ${ORDERS_SCHEMA}.CheckoutSession WHERE ID = '${sessionID}'`);
    Assert(!!row.PaymentIntentID, 'precondition: the session has an intent');
    await upsertViaEntity(ctx, PAYMENT_INTENT_ENTITY, row.PaymentIntentID, { Status: 'Succeeded' });
}

for (const check of SubscriptionRenewalChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('subscription-renewal', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});


// ─── E3 + E4 fixtures ───────────────────────────────────────────────────────────────────────────

type HeldGatewaySubscription = (typeof fakeGateway.held)[number];

/**
 * A subscriber in the importer's shape (SR89, SR99): term 1 = the day after Stripe's period start → the business
 * day of its end; a captured payment recording the current charge (`ch_it_<tag>_now`) under the importer's own
 * key, with no intent. The fake gateway holds `sub_it_<tag>`, whose current invoice has `reason`: a first-year
 * subscriber's is `subscription_create`, a second-year one's `subscription_cycle`. Not yet linked.
 */
async function importedSubscriber(
    ctx: IntegrationCheckContext,
    currency: string,
    tag: string,
    organizationID: string,
    reason: 'subscription_create' | 'subscription_cycle',
) {
    const sub = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, organizationID);
    await payInFull(ctx, sub.OrderID, organizationID);
    const lastDay = isoDate(sub.Term.EndDate);
    await TxQuery(ctx, `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`);
    await TxQuery(
        ctx,
        `UPDATE ph SET ProviderChargeID = 'ch_it_${tag}_now', IdempotencyKey = 'csv-sub-pay:it:${tag}', PaymentIntentID = NULL
           FROM ${ORDERS_SCHEMA}.PaymentHeader ph JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID WHERE pl.OrderHeaderID = '${sub.OrderID}'`,
    );
    await TxQuery(ctx, `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`);
    // Stripe's current period: 14:23 UTC on the day before term 1 began, to 14:23 UTC on term 1's last day.
    const periodStart = new Date(`${AddDays(isoDate(sub.Term.EndDate), -365)}T14:23:00Z`);
    const nextStart = new Date(`${lastDay}T14:23:00Z`);
    const current: GatewaySubscriptionInvoice = {
        ...renewalInvoice({ anchor: periodStart, currency }, `${tag}_now`),
        BillingReason: reason,
        PeriodStart: periodStart,
        PeriodEnd: nextStart,
    };
    const held = {
        ProviderSubscriptionID: `sub_it_${tag}`,
        Status: 'active',
        IsLive: true,
        Customer: `cus_${tag}`,
        Metadata: {} as Record<string, string>,
        PeriodStart: periodStart,
        Invoices: [current] as GatewaySubscriptionInvoice[],
    };
    fakeGateway.held.push(held);
    return { sub, lastDay, held, nextStart };
}

/**
 * An annual subscription the fake gateway bills (handed over by E2's own pass), with its anchor: 00:00
 * business time on its term's last day, when the gateway charges the renewal.
 */
async function gatewayBilled(ctx: IntegrationCheckContext, organizationID?: string, opts: { webhooks?: boolean } = {}) {
    if (!organizationID) fakeGateway.reset();
    const f = Fx();
    const account = await gatewayBillingAccount(ctx);
    if (opts.webhooks) {
        const type = await TxOne<{ ID: string }>(ctx, `SELECT PaymentProviderTypeID AS ID FROM ${ORDERS_SCHEMA}.PaymentProvider WHERE ID = '${account}'`);
        await upsertViaEntity(ctx, PAYMENT_PROVIDER_TYPE_ENTITY, type.ID, { SupportsWebhooks: 1 });
    }
    const sub = await subscriptionWithCard(ctx, account, organizationID);
    await flagPrice(ctx, account, f.Products.SubRolling, 'price_it_rolling');
    const linked = await ensureProviderSubscriptions(ctx, { SubscriptionIDs: [sub.SubscriptionID] });
    AssertEqual(linked.Outcomes[0]?.Code, 'Created', `precondition: the gateway bills it: ${JSON.stringify(linked.Outcomes)}`);
    const gatewayID = linked.Outcomes[0].ProviderSubscriptionID!;
    const held = fakeGateway.held.find((h) => h.ProviderSubscriptionID === gatewayID)!;
    const lastDay = isoDate(sub.Term.EndDate);
    const number = (await TxOne<{ SubscriptionNumber: string }>(ctx, `SELECT SubscriptionNumber FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${sub.SubscriptionID}'`)).SubscriptionNumber;
    return {
        account,
        currency: await booksIn(ctx),
        SubscriptionID: sub.SubscriptionID,
        SubscriptionNumber: number,
        TermID: sub.Term.ID,
        gatewayID,
        held: held as HeldGatewaySubscription,
        lastDay,
        anchor: DayStartUtc(lastDay, BusinessTimeZoneEngine.Instance.Zone),
    };
}

/** A renewal invoice the gateway was paid for at the anchor, as Stripe reports one; `key` names its ids. */
function renewalInvoice(g: { anchor: Date; currency: string }, key: string, over: Partial<GatewaySubscriptionInvoice> = {}): GatewaySubscriptionInvoice {
    return {
        ProviderInvoiceID: `in_it_${key}`,
        Status: 'paid',
        BillingReason: 'subscription_cycle',
        AmountPaid: 1200,
        AmountDue: 1200,
        Tax: 0,
        CurrencyCode: g.currency,
        ProviderIntentID: `pi_it_${key}`,
        ProviderChargeID: `ch_it_${key}`,
        CreatedAt: g.anchor,
        PaidAt: g.anchor,
        PaidOutOfBand: false,
        Discounted: false,
        AttemptCount: 1,
        NextAttemptAt: null,
        ProviderPriceID: 'price_it_rolling',
        Quantity: 1,
        PeriodStart: g.anchor,
        PeriodEnd: new Date(g.anchor.getTime() + 365 * 86_400_000),
        ...over,
    };
}

/** The fixture company's booking currency (the world picks one at random): the gateway charges in it. */
async function booksIn(ctx: IntegrationCheckContext): Promise<string> {
    return (await TxOne<{ Code: string }>(ctx, `SELECT FunctionalCurrencyCode AS Code FROM ${ACCT_SCHEMA}.AccountingCompanyProfile WHERE ID = '${Fx().CoA.ID}'`)).Code.trim().toUpperCase();
}

/** One sync, on the check's transaction, at `now`; asserts it did not fail. */
async function syncNow(ctx: IntegrationCheckContext, subscriptionID: string, now: Date): Promise<SyncProviderSubscriptionResult> {
    const result = await SyncProviderSubscription(subscriptionID, { Now: now }, ctx.Provider, ctx.User);
    Assert(result.Outcome !== 'Failed', `the sync did not fail: ${result.Error}`);
    return result;
}

/** The renewal order the gateway's charge booked (the newest ProviderPayment order renewing it). */
async function renewalOrderOf(ctx: IntegrationCheckContext, subscriptionID: string) {
    return TxOne<{ ID: string; Status: string; Origin: string; OrderDate: string; ProductID: string; UnitPrice: number; RenewsSubscriptionID: string }>(
        ctx,
        `SELECT TOP 1 oh.ID, oh.Status, oh.Origin, oh.OrderDate, ol.ProductID, ol.UnitPrice, ol.RenewsSubscriptionID
           FROM ${ORDERS_SCHEMA}.OrderLine ol JOIN ${ORDERS_SCHEMA}.OrderHeader oh ON oh.ID = ol.OrderHeaderID
          WHERE ol.RenewsSubscriptionID = '${subscriptionID}' AND oh.Origin = 'ProviderPayment'
          ORDER BY oh.__mj_CreatedAt DESC`,
    );
}

const subscriptionRow = (ctx: IntegrationCheckContext, subscriptionID: string) =>
    TxOne<{ Status: string; AutoRenew: boolean | number; ProviderSubscriptionID: string | null }>(
        ctx,
        `SELECT Status, AutoRenew, ProviderSubscriptionID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${subscriptionID}'`,
    );

/** The subscription's events, oldest first. */
const gatewayEvents = (ctx: IntegrationCheckContext, subscriptionID: string) =>
    TxQuery<{ EventType: string; EventData: string }>(
        ctx,
        `SELECT EventType, EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID = '${subscriptionID}' ORDER BY __mj_CreatedAt, OccurredAt`,
    );

/** The latest end of a term's live grants. */
async function grantEnd(ctx: IntegrationCheckContext, termID: string): Promise<Date | null> {
    const row = await TxMaybeOne<{ ValidTo: string | null }>(
        ctx,
        `SELECT MAX(ValidTo) AS ValidTo FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionTermID = '${termID}' AND Status IN ('Active','Suspended')`,
    );
    return row?.ValidTo ? new Date(row.ValidTo) : null;
}

/** How many alert Tasks carry exactly this name. */
async function namedTasks(ctx: IntegrationCheckContext, name: string): Promise<number> {
    Assert(ctx.Provider.Entities.some((e) => e.Name === TASK_ENTITY), 'precondition: bizapps-tasks is installed, so alerts are Tasks');
    const rows = await TxQuery<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM __mj_BizAppsTasks.Task WHERE Name = N'${name.replace(/'/g, "''")}'`);
    return Number(rows[0]?.N ?? 0);
}

/** Run `body` with the business zone America/Chicago (AIDP's), restored after; the engine is read by every caller. */
async function withChicago<T>(body: () => Promise<T>): Promise<T> {
    const engine = BusinessTimeZoneEngine.Instance;
    Object.defineProperty(engine, 'Zone', { get: () => 'America/Chicago', configurable: true });
    try {
        return await body();
    } finally {
        delete (engine as unknown as { Zone?: string }).Zone;
    }
}
