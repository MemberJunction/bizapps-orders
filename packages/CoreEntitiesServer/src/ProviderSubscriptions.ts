/**
 * ProviderSubscriptions — hand an auto-renewing subscription to the gateway that will bill it (option E, E2).
 *
 * Some accounts let the payment gateway bill renewals itself (Stripe Billing: it charges the saved card
 * each year, sends the reminder and the receipt, and offers its portal). Orders still takes the FIRST
 * payment on its own checkout. Right after that payment, this file asks the gateway for a subscription
 * that charges nothing now and first charges when the term Orders sold ends, then records the gateway's
 * id on the Orders subscription. From then on the renewal jobs leave the subscription alone
 * (./ProviderBilledSubscriptions.ts, the marker rule).
 *
 * Example: Jane buys Professional ($599) at 20:30 Central on 31 Oct 2026. Term 1 is 31 Oct 2026 →
 * 30 Oct 2027 (business days). Orders creates a Stripe subscription on the Professional price whose
 * first charge is 00:00 Central on 30 Oct 2027 (05:00 UTC), and writes its `sub_…` and the provider
 * onto SUB-000110.
 *
 * WHEN IT APPLIES. Only when the account that holds the subscription's renewal card has the type
 * capability (`SupportsSubscriptionBilling`) AND its own switch (`BillsSubscriptions`) — the one rule
 * `ProviderBillsNewSubscriptions`. Everything else (a team invoiced through a rail, a host that never
 * turned it on) is skipped without a word, because it is the normal case.
 *
 * THE FIRST CHARGE: 00:00 business time on the LAST day of the latest term. A business day is the
 * day in `BusinessTimeZoneEngine.Zone`, not in UTC, so an evening purchase lands on the right day. The
 * gateway charges a few hours before Orders' term ends rather than after, so access overlaps instead
 * of lapsing; and Stripe accepts a first charge at most one year after creation, which a term's last
 * day always is when the term starts on the purchase day (29 Feb and DST included). A term that starts
 * later than that is DEFERRED, not refused: the retry creates it once the day fits.
 *
 * NEVER WHILE ORDERS STILL HAS MONEY TO COLLECT. The latest live term must be paid. Spawn Renewals books
 * term N+1 (Active) at the start of its lead window, and Charge Renewals collects it only on the term's
 * first day; handed over in between, the gateway would first charge a year later and the renewal order
 * would stay unpaid: a free year. So while the latest term's order still owes money the subscription
 * stays with Orders (`TermUnpaid`, quiet: it is the normal state for weeks), and a pass after Charge
 * Renewals collected it hands over the term after. The pass reads that state once for all its rows,
 * so right before it creates anything it reads the one subscription again through the same query: a
 * term Spawn Renewals booked in between is seen then, never handed over. Example: a buyer from before the switch, SUB-000079,
 * term 1 ending 31 Oct 2027. Spawn Renewals books term 2 (1 Nov 2027 → 31 Oct 2028) on renewal order
 * ORD-002901, Confirmed, 599.00 owing: not handed over. On 1 Nov 2027 Charge Renewals collects it; the
 * 2 Nov pass creates the gateway subscription with its first charge at 00:00 on 31 Oct 2028.
 *
 * NEVER FAILS THE SALE, AND NEVER FAILS QUIETLY. Called after the checkout's payment is booked, so
 * every problem is an outcome, never an exception. Any problem a person must act on raises an alert
 * Task, one OPEN Task per subscription and problem (./checkoutCaptureAlert.ts); a problem that comes
 * back after staff closed its Task raises a new one. A replayed checkout never comes back here once
 * its payment is booked, so a failure is retried by the `Orders.CreateProviderSubscriptions` action
 * (daily, scheduled), which runs exactly this code over every eligible unlinked subscription.
 *
 * RETRYABLE vs NEEDS A PERSON. A fault (the gateway timed out or answered 5xx while creating), a failed
 * read (the gateway's, or Orders' own before it asked the gateway to create anything: `FailedBeforeCreate`)
 * and a failed write are retried by every daily pass; their Task stays the one open Task. A problem only a
 * person can clear at the gateway (`PROVIDER_SUBSCRIPTION_PARKED_CODES`: two live gateway subscriptions,
 * only ended ones, a create the gateway refused, a price whose period is not the term's) is not
 * retried while its Task is open: the daily pass does not ask the gateway again, and closing the Task
 * is how staff say "fixed, try again". The problems Orders finds in its own data (no card, no price,
 * a stub account) cost no gateway call and are simply re-checked. The daily run fails only for a Task
 * it newly raised, so one stuck subscription does not fail every run after it.
 *
 * NO SECOND GATEWAY SUBSCRIPTION.
 *   · The gateway is searched first (`FindProviderSubscriptions`, by the Orders subscription id in its
 *     metadata): Stripe forgets idempotency keys after about 24 hours, so a retry days later could
 *     otherwise create another.
 *   · The idempotency key names the subscription, every parameter of the request and the business day
 *     of the attempt, so two runs racing (the page and the webhook, seconds apart) send the same key
 *     with the same parameters and get the same gateway subscription back; a changed parameter is a
 *     new key, never Stripe's "same key, other parameters" refusal; and the next day's pass is a new
 *     key, so a refusal staff fixed is asked again rather than replayed from Stripe's cache.
 *   · The id is written only while the column is still empty, re-read just before the write. A
 *     different id already there is an alert, never an overwrite. (Not atomic: two writers that both
 *     read it empty both save, the later one winning; the search after create is what catches that.)
 *     `SubscriptionEntity` refuses any change to an id that was already recorded when loaded.
 *   · After a create the gateway is searched again; two live subscriptions for one Orders subscription
 *     (two runs straddling business midnight) raise an urgent `AmbiguousAtGateway`.
 *   · A live gateway subscription found for it is recorded even when it bills another price or
 *     quantity than the plan, and raised (`FoundMismatch`): it will bill whatever Orders does, so not
 *     recording it would add Orders' renewal to the gateway's (a double charge) to fix a wrong amount.
 *
 * CONNECTS TO:
 *   CALLERS: ./CheckoutSessionService.ts (after SaveCheckoutInstrumentForRenewals) ·
 *            packages/Server/src/custom/create-provider-subscriptions.action.ts (retry and backfill),
 *            both through `EnsureProviderSubscriptionsOnOwnProvider`
 *   DRIVER:  ./BasePaymentProvider.ts (CreateProviderSubscription, FindProviderSubscriptions, DescribeProviderPrice, LatestFirstChargeAt)
 *   RULE:    ./ProviderBilledSubscriptions.ts (the marker the renewal jobs skip on)
 *   TABLES:  __mj_BizAppsOrders.{Subscription,SubscriptionTerm,OrderLine,vwOrderHeaders,CustomerPaymentMethod,PaymentDetail,PaymentProvider,PaymentProviderPrice}
 */
import { IMetadataProvider, IRunViewProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BusinessTimeZoneEngine, CalendarDayIn, DayStartUtc, ToCalendarDay, type CalendarDay } from '@mj-biz-apps/common-entities';
import { LoadOrdersEngine, NON_OWING_STATUSES, OrdersEngine, type mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import type { BasePaymentProvider, GatewayPriceInterval, PaymentProviderConfig } from './BasePaymentProvider.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { IsProviderBilled, NotProviderBilledSql } from './ProviderBilledSubscriptions.js';
import { SubscriptionBehavior, SubscriptionTypeRulesFrom } from './SubscriptionBehavior.js';
import { OpenProviderSubscriptionAlerts, raiseProviderSubscriptionAlert } from './checkoutCaptureAlert.js';
import { WithIsolatedProvider } from './isolatedProvider.js';
import { RequireUUID, RequireUUIDs } from './sql-guards.js';
import { SanctionProviderBilledChange } from './SubscriptionEntityServer.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';
const PAYMENT_PROVIDER_PRICE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Prices';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';

/** The gateway metadata key that carries the Orders subscription id, and that a retry searches by. */
export const ORDERS_SUBSCRIPTION_METADATA_KEY = 'OrdersSubscriptionID';

/**
 * Whether Orders creates a gateway subscription for subscriptions sold through this account: the
 * gateway can (type capability) and this account does (its switch). The one place the two combine.
 *
 * Deliberately not part of the renewal jobs' rule: once a subscription carries a gateway id, the
 * gateway bills it whatever this says (./ProviderBilledSubscriptions.ts).
 */
export function ProviderBillsNewSubscriptions(config: Pick<PaymentProviderConfig, 'BillsSubscriptions' | 'Capabilities'>): boolean {
    return !!config.Capabilities?.SupportsSubscriptionBilling && !!config.BillsSubscriptions;
}

/** When the gateway first charges: 00:00 in the business zone on the term's last day. */
export function ProviderSubscriptionFirstChargeAt(lastTermDay: CalendarDay, zone: string): Date {
    return DayStartUtc(lastTermDay, zone);
}

/** What the clock allows for one subscription right now. */
export type ProviderSubscriptionChargePlan =
    | { Kind: 'Ready'; FirstChargeAt: Date }
    /** The first charge is later than the gateway accepts from today; create it on a later run. */
    | { Kind: 'Deferred'; FirstChargeAt: Date; LatestAccepted: Date }
    /** The first charge would be now or in the past: the gateway would bill at once. */
    | { Kind: 'Passed'; FirstChargeAt: Date };

/**
 * Decide whether the gateway subscription can be created now. Pure: `now`, the zone and the gateway's
 * limit are passed in, so tests never read the clock.
 *
 * @param latestAccepted - `driver.LatestFirstChargeAt(now)`; null when the driver knows no limit.
 */
export function PlanProviderSubscriptionCharge(
    lastTermDay: CalendarDay,
    zone: string,
    now: Date,
    latestAccepted: Date | null,
): ProviderSubscriptionChargePlan {
    const firstChargeAt = ProviderSubscriptionFirstChargeAt(lastTermDay, zone);
    if (firstChargeAt.getTime() <= now.getTime()) return { Kind: 'Passed', FirstChargeAt: firstChargeAt };
    if (latestAccepted && firstChargeAt.getTime() > latestAccepted.getTime()) {
        return { Kind: 'Deferred', FirstChargeAt: firstChargeAt, LatestAccepted: latestAccepted };
    }
    return { Kind: 'Ready', FirstChargeAt: firstChargeAt };
}

/**
 * The gateway ids a subscription's lifecycle events name as no longer its own: the `Gateway` a cancel
 * stopped (`Canceled`), and the id a fresh start retired (`Activated`). Unreadable event data is skipped.
 */
export function RetiredGatewayIDsFromEvents(events: Array<{ EventData: string | null }>): Set<string> {
    const ids = new Set<string>();
    for (const e of events) {
        if (!e.EventData) continue;
        try {
            const data = JSON.parse(e.EventData) as { Gateway?: { ProviderSubscriptionID?: unknown } | null; RetiredProviderSubscriptionID?: unknown };
            const cancelled = data.Gateway?.ProviderSubscriptionID;
            if (typeof cancelled === 'string' && cancelled) ids.add(cancelled);
            if (typeof data.RetiredProviderSubscriptionID === 'string' && data.RetiredProviderSubscriptionID) ids.add(data.RetiredProviderSubscriptionID);
        } catch {
            // Not ours to read; a malformed event names nothing.
        }
    }
    return ids;
}

/**
 * The idempotency key for one create. It names every parameter, so racing runs (same parameters)
 * share a key and a run after something changed (a new price, a new card) gets a new one.
 *
 * AND THE BUSINESS DAY OF THE ATTEMPT. Stripe keeps a key's first answer for about 24 hours, a refusal
 * included: without the day, a create refused for a reason staff then fix at the gateway (a detached
 * card, a customer setting) is answered with the cached refusal by every retry for a day. With it, the
 * next daily pass is a new key and asks again. The races the key exists for are the checkout page and
 * its webhook, seconds apart on the same day, so they still share it. The rare pair that straddles
 * midnight sends two keys, and if both create before either records, the gateway holds two. The search
 * before the create does not stop that (both searched first), and neither does the record step: both
 * read the column empty, so the later save overwrites the earlier id. What makes it loud is the search
 * after every create (`confirmOnlyOne`): the run that finishes second sees both live and raises an urgent
 * `AmbiguousAtGateway` naming them.
 * Not finer than a day (an hour, a per-run salt): each step finer widens that midnight window to more
 * boundaries for nothing the daily retry needs.
 */
export function ProviderSubscriptionIdempotencyKey(p: {
    SubscriptionID: string;
    ProviderPriceID: string;
    ProviderInstrumentRef: string;
    Quantity: number;
    FirstChargeAt: Date;
    /** The business day the attempt is made on (`CalendarDayIn(now, zone)`). */
    AttemptDay: CalendarDay;
    /**
     * How many gateway subscriptions this one has retired (cancelled, or left behind by a fresh start).
     * Bought, cancelled and bought again on one day, every other part repeats; without this the gateway
     * would answer the new create with the CANCELLED subscription it saved for the first key. Left out
     * of the key at 0, so a first create's key is unchanged.
     */
    Generation?: number;
}): string {
    const anchor = Math.floor(p.FirstChargeAt.getTime() / 1000);
    const generation = p.Generation ? `:g${p.Generation}` : '';
    return `provider-subscription:${p.SubscriptionID.toLowerCase()}:${p.ProviderPriceID}:${p.ProviderInstrumentRef}:${p.Quantity}:${anchor}:${p.AttemptDay}${generation}`;
}

/** Months in one billing period of a gateway price; null for a period Orders terms cannot have (days, weeks). */
export function GatewayIntervalMonths(interval: GatewayPriceInterval | null | undefined): number | null {
    if (!interval) return null;
    if (interval.Unit === 'year') return 12 * interval.Count;
    if (interval.Unit === 'month') return interval.Count;
    return null;
}

/** What happened to one subscription. */
export type ProviderSubscriptionOutcomeCode =
    /** The gateway subscription was created and recorded. */
    | 'Created'
    /** A gateway subscription for it already existed (an earlier run) and is now recorded. */
    | 'Found'
    /** Already recorded, by an earlier run or a run racing this one. */
    | 'AlreadyLinked'
    /** A run racing this one holds the gateway's idempotency key and will record the id; the daily pass finds it if not. */
    | 'InProgressElsewhere'
    /** Preview: would be created with the values shown. */
    | 'WouldCreate'
    /** Preview: the gateway already holds one live subscription for it, which a run would record. */
    | 'WouldRecordFound'
    /** Preview: a run would raise it for a person (two live at the gateway, only ended ones, or the search failed). */
    | 'WouldNeedPerson'
    /** The account does not bill subscriptions (capability or switch off). The normal case; silent. */
    | 'NotEnabled'
    /** The first charge is further out than the gateway accepts today; a later run creates it. */
    | 'Deferred'
    /** The latest term's order still owes money: Orders collects it first, and a later pass hands over the next term. */
    | 'TermUnpaid'
    /** A problem only a person can clear has an open Task; the daily pass leaves it until the Task is closed. */
    | 'AwaitingPerson'
    /** Re-read just before the create, it is no longer an active subscription with automatic renewal on. */
    | 'NoLongerRenewing'
    // Below: a person must act. Each raises an alert Task.
    | 'NoCard'
    | 'StubMode'
    | 'NoProviderPrice'
    | 'NoTerm'
    | 'ChargeDayPassed'
    | 'PriceMismatch'
    | 'AmbiguousAtGateway'
    | 'EndedAtGateway'
    | 'GatewayReadFailed'
    | 'GatewayRefused'
    /** The gateway faulted (threw: timeout, 5xx) while creating it: whether it holds a subscription is unknown. */
    | 'GatewayFault'
    /**
     * Something in Orders failed (a database read, the driver's set-up) before the gateway was asked
     * to create anything: nothing was created there, and the daily pass tries again.
     */
    | 'FailedBeforeCreate'
    | 'LinkedElsewhere'
    | 'NotRecorded'
    | 'AnchorMismatch'
    /** A live gateway subscription found for it bills another price or quantity: recorded, and raised. */
    | 'FoundMismatch'
    | 'ChargedAtCreation'
    /**
     * The Orders subscription was cancelled (or stopped renewing) while its gateway subscription was being
     * created, and stopping that gateway subscription failed: it will bill unless a person cancels it (E2b).
     */
    | 'UnwantedAtGateway';

/** The codes that raise an alert Task. */
export const PROVIDER_SUBSCRIPTION_ALERT_CODES: ReadonlySet<ProviderSubscriptionOutcomeCode> = new Set([
    'NoCard',
    'StubMode',
    'NoProviderPrice',
    'NoTerm',
    'ChargeDayPassed',
    'PriceMismatch',
    'AmbiguousAtGateway',
    'EndedAtGateway',
    'GatewayReadFailed',
    'GatewayRefused',
    'GatewayFault',
    'FailedBeforeCreate',
    'LinkedElsewhere',
    'NotRecorded',
    'AnchorMismatch',
    'FoundMismatch',
    'ChargedAtCreation',
    'UnwantedAtGateway',
]);

/**
 * The problems only a person can clear at the gateway. While one has an open Task, the daily pass does
 * not ask the gateway about that subscription again; closing the Task asks it to try again. The others
 * either cost no gateway call to re-check (no card, no price, a stub account, the day passed) or are
 * worth retrying every day (a fault, a failed read, a failed write).
 */
export const PROVIDER_SUBSCRIPTION_PARKED_CODES: ReadonlySet<ProviderSubscriptionOutcomeCode> = new Set([
    'PriceMismatch',
    'AmbiguousAtGateway',
    'EndedAtGateway',
    'GatewayRefused',
]);

export interface ProviderSubscriptionOutcome {
    SubscriptionID: string;
    SubscriptionNumber: string;
    Code: ProviderSubscriptionOutcomeCode;
    Message: string;
    PaymentProviderID?: string;
    ProviderSubscriptionID?: string;
    /** ISO instant of the (planned) first gateway charge. */
    FirstChargeAt?: string;
    /** True when the subscription now carries its gateway id (this run wrote it, or found it written). */
    Recorded?: boolean;
    /** True when this run raised a new alert Task for it (false when one was already open). */
    NewAlert?: boolean;
}

export interface EnsureProviderSubscriptionsInput {
    /** The checkout's order: its new auto-renewing subscriptions. */
    OrderHeaderID?: string;
    /**
     * Exactly these subscriptions (a targeted retry). With neither this nor `OrderHeaderID`: every
     * active auto-renewing subscription with a renewal card on an account that bills subscriptions and
     * no gateway id yet (the daily retry and the backfill).
     */
    SubscriptionIDs?: string[];
    /** The account that took the checkout's payment, so a subscription left without a card is still reported. */
    CheckoutPaymentProviderID?: string | null;
    /** Report what would be created; call no gateway and write nothing. */
    Preview?: boolean;
    /**
     * Cap on gateway subscriptions one pass creates (or, in preview, would create). A subscription
     * that is deferred, unpaid or already linked does not use the cap, as in Spawn Renewals; the
     * rest wait for the next pass.
     */
    MaxCount?: number;
    /** Treat this as now. For tests; the default is the clock. */
    Now?: Date;
}

export interface EnsureProviderSubscriptionsResult {
    /** False only when the subscriptions could not even be selected. */
    Success: boolean;
    Outcomes: ProviderSubscriptionOutcome[];
    Linked: number;
    Deferred: number;
    /** Alert Tasks this pass newly raised. The daily job fails when this is above zero. */
    Alerts: number;
    /** Subscriptions that need a person and already have an open Task (or, in preview, would need one). */
    Waiting: number;
    Message: string;
}

/** How far `handle` got with one subscription, for the loop to classify a throw. */
interface HandleProgress {
    /** The create request was sent to the gateway: from here a throw leaves its state unknown. */
    CreateSent: boolean;
    /** The row was re-read just before the create (once per subscription). */
    Rechecked?: boolean;
}

/** One selected subscription, with its renewal card and latest term. */
interface CandidateRow {
    SubscriptionID: string;
    SubscriptionNumber: string;
    SubscriptionTypeID: string;
    ProductID: string;
    OrderHeaderID: string | null;
    CompanyID: string;
    ProviderSubscriptionID: string | null;
    DefaultCustomerPaymentMethodID: string | null;
    CardIsActive: boolean | null;
    CardPaymentProviderID: string | null;
    ProviderCustomerRef: string | null;
    ProviderInstrumentRef: string | null;
    LastTermEndDate: Date | string | null;
    LastTermQuantity: number | null;
    /** The order that bought the latest term, and what it still owes. */
    LastTermOrderNumber: string | null;
    LastTermOrderStatus: string | null;
    LastTermOrderBalance: number | null;
    /** 1 when that order is a real order (not a draft, quote or void) that owes nothing. */
    LastTermPaid: boolean | number | null;
}

/**
 * `EnsureProviderSubscriptions` on a provider of its own (./isolatedProvider.ts), so the write that
 * records the gateway id cannot join, and be rolled back with, another request's transaction on the
 * shared provider. A lost write here would leave the gateway billing a subscription Orders also renews.
 * The checkout and the daily action call this; tests and integration checks that hold their own
 * transaction call `EnsureProviderSubscriptions` directly.
 *
 * The checkout's call reads its account's switch on the shared provider first (a read, so no
 * transaction to join): a host that never turns `BillsSubscriptions` on, the usual case, returns there
 * without creating a provider of its own.
 */
export async function EnsureProviderSubscriptionsOnOwnProvider(
    input: EnsureProviderSubscriptionsInput,
    shared: IMetadataProvider | undefined,
    user: UserInfo,
): Promise<EnsureProviderSubscriptionsResult> {
    if (shared && (await checkoutAccountDoesNotBill(input, new ProviderSubscriptionRun(input, shared, user)))) {
        return summarize(input, []);
    }
    return WithIsolatedProvider((own) => EnsureProviderSubscriptions(input, own, user), shared);
}

/**
 * The checkout's own call on an account that does not bill subscriptions: one read of the account by
 * id. Never true for the daily pass or a targeted retry, which name no checkout account.
 */
async function checkoutAccountDoesNotBill(input: EnsureProviderSubscriptionsInput, run: ProviderSubscriptionRun): Promise<boolean> {
    return !!input.OrderHeaderID && !!input.CheckoutPaymentProviderID && !(await run.billsNewSubscriptions(input.CheckoutPaymentProviderID));
}

/**
 * Create (or find) and record the gateway subscription of each selected subscription. Never throws.
 * See the header for the rules; each subscription's result is in `Outcomes`.
 */
export async function EnsureProviderSubscriptions(
    input: EnsureProviderSubscriptionsInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<EnsureProviderSubscriptionsResult> {
    let rows: CandidateRow[];
    const run = new ProviderSubscriptionRun(input, provider, user);
    try {
        // The checkout's own call on an account that does not bill subscriptions, the case on every
        // host that never turns the switch on: one read of the account by id, and no SELECT.
        if (await checkoutAccountDoesNotBill(input, run)) return summarize(input, []);
        rows = await run.select();
        await run.loadParked();
    } catch (err) {
        const message = `Could not select the subscriptions to hand to a gateway: ${err instanceof Error ? err.message : String(err)}`;
        LogError(`[ProviderSubscriptions] ${message}`);
        return { Success: false, Outcomes: [], Linked: 0, Deferred: 0, Alerts: 0, Waiting: 0, Message: message };
    }

    const outcomes: ProviderSubscriptionOutcome[] = [];
    for (const row of rows) {
        if (run.capReached()) break;
        let outcome: ProviderSubscriptionOutcome;
        const progress: HandleProgress = { CreateSent: false };
        try {
            outcome = await run.handle(row, progress);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Only a throw once the create was sent leaves the gateway's state unknown (Stripe
            // unreachable, a timeout, a 5xx). Before it, the throw was Orders' own (a database read,
            // the driver's set-up) and nothing was created: saying "state unknown at the gateway"
            // would send a person to look for a subscription that cannot exist.
            outcome = progress.CreateSent
                ? await run.alert(row, 'GatewayFault', `the gateway faulted while creating it, so whether it holds a subscription is unknown: ${message}`)
                : await run.alert(row, 'FailedBeforeCreate', `Orders failed before asking the gateway to create anything (nothing was created there): ${message}`);
        }
        outcomes.push(outcome);
    }
    return summarize(input, outcomes);
}

/**
 * What decides a hand-over, as one comparable string: the latest term and whether it is paid, the card,
 * and the link. Two reads of a subscription that agree on it would hand over the same thing.
 */
function handOverFacts(r: CandidateRow): string {
    return [
        ToCalendarDay(r.LastTermEndDate) ?? '',
        r.LastTermQuantity ?? '',
        r.LastTermPaid ? 1 : 0,
        r.ProviderSubscriptionID ?? '',
        r.CardIsActive === false ? 0 : 1,
        r.ProviderCustomerRef ?? '',
        r.ProviderInstrumentRef ?? '',
        (r.CardPaymentProviderID ?? '').toLowerCase(),
    ].join('|');
}

function summarize(input: EnsureProviderSubscriptionsInput, outcomes: ProviderSubscriptionOutcome[]): EnsureProviderSubscriptionsResult {
    const count = (codes: ProviderSubscriptionOutcomeCode[]) => outcomes.filter((o) => codes.includes(o.Code)).length;
    // Linked BY THIS PASS: an id another run recorded first is not counted.
    const linked = outcomes.filter((o) => o.Recorded && o.Code !== 'AlreadyLinked').length;
    const deferred = count(['Deferred']);
    const unpaid = count(['TermUnpaid']);
    const alerts = outcomes.filter((o) => o.NewAlert).length;
    const waiting = outcomes.filter((o) => o.Code === 'AwaitingPerson' || (PROVIDER_SUBSCRIPTION_ALERT_CODES.has(o.Code) && !o.NewAlert)).length;
    const message =
        `${outcomes.length} subscription(s): ${linked} linked to a gateway subscription, ${deferred} deferred, ` +
        `${unpaid} left with Orders until their latest term is paid, ${alerts} new problem(s) raised for a person, ` +
        `${waiting} already with a person` +
        (input.Preview
            ? ` (preview: ${count(['WouldCreate'])} would be created, ${count(['WouldRecordFound'])} found at the gateway and ` +
              `would be recorded, ${count(['WouldNeedPerson'])} would need a person)`
            : '');
    if (outcomes.length) LogStatus(`[ProviderSubscriptions] ${message}`);
    return { Success: true, Outcomes: outcomes, Linked: linked, Deferred: deferred, Alerts: alerts, Waiting: waiting, Message: message };
}

/** The per-call state: configs, drivers, prices and the term rule read once, however many subscriptions share them. */
class ProviderSubscriptionRun {
    private readonly configs = new Map<string, Promise<PaymentProviderConfig | null>>();
    private readonly drivers = new Map<string, Promise<BasePaymentProvider>>();
    private readonly prices = new Map<string, Promise<Map<string, string>>>();
    private readonly gatewayPrices = new Map<string, Promise<{ Interval: GatewayPriceInterval | null; Problem: string | null; Unreadable: string | null }>>();
    private parked = new Map<string, Set<string>>();
    private zone: string | null = null;
    /** Gateway subscriptions this pass created or tried to create (preview: would create), for `MaxCount`. */
    private committed = 0;

    public constructor(
        private readonly input: EnsureProviderSubscriptionsInput,
        private readonly provider: IMetadataProvider,
        private readonly user: UserInfo,
    ) {}

    private get isSweep(): boolean {
        return !this.input.OrderHeaderID && !this.input.SubscriptionIDs?.length;
    }

    public capReached(): boolean {
        return !!this.input.MaxCount && this.input.MaxCount > 0 && this.committed >= this.input.MaxCount;
    }

    public async billsNewSubscriptions(providerID: string): Promise<boolean> {
        const config = await this.config(providerID);
        return !!config && ProviderBillsNewSubscriptions(config);
    }

    // ─── Selection ─────────────────────────────────────────────────────────────

    public async select(): Promise<CandidateRow[]> {
        const scope = await this.selectionScope();
        return scope ? this.query(scope) : [];
    }

    /**
     * The subscription as the selection reads it, read again now: whether its latest term is still
     * the one this pass read, and still paid (the one query, so the one "paid" rule). Null when it is
     * no longer an active subscription with automatic renewal on.
     */
    private async reselect(subscriptionID: string): Promise<CandidateRow | null> {
        const id = RequireUUID(subscriptionID, 'SubscriptionID');
        const found = await this.query(`s.ID = '${id}'`);
        return found.find((r) => r.SubscriptionID.toLowerCase() === id.toLowerCase()) ?? null;
    }

    private async selectionScope(): Promise<string> {
        let scope: string;
        if (this.input.OrderHeaderID) {
            // The order that sold the latest term as well as the one that created the subscription: a
            // cancelled subscription bought again keeps its ORIGINAL line in `OrderLineID` (other code reads
            // that as the line that created it), and the new order sells only its new term.
            const order = RequireUUID(this.input.OrderHeaderID, 'OrderHeaderID');
            scope = `(ol.OrderHeaderID = '${order}' OR tol.OrderHeaderID = '${order}')`;
        } else if (this.input.SubscriptionIDs?.length) {
            scope = `s.ID IN (${RequireUUIDs(this.input.SubscriptionIDs, 'SubscriptionID').map((id) => `'${id}'`).join(',')})`;
        } else {
            const enabled = await this.enabledProviderIDs();
            // Matches nothing: no account passes the rule, so there is nothing to read.
            if (enabled.length === 0) return '';
            scope =
                `${NotProviderBilledSql('s')} ` +
                `AND pd.PaymentProviderID IN (${RequireUUIDs(enabled, 'PaymentProviderID').map((id) => `'${id}'`).join(',')})`;
        }
        return scope;
    }

    private async query(scope: string): Promise<CandidateRow[]> {
        const notOwing = NON_OWING_STATUSES.map((st) => `'${st}'`).join(',');
        const db = this.provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        // One statement: the subscription, the card it renews on, its latest live term and what that
        // term's order still owes (`vwOrderHeaders.Balance`, the figure Charge Renewals reads). Raw SQL
        // for the same reason as the renewal jobs' selections: one statement over six tables. At
        // checkout this is one indexed row per subscription the order sold, run only on an account
        // that bills subscriptions (see the caller).
        const rows = (await db.ExecuteSQL(`
            SELECT
                s.ID                              AS SubscriptionID,
                s.SubscriptionNumber,
                s.SubscriptionTypeID,
                s.ProductID,
                s.CompanyID,
                s.ProviderSubscriptionID,
                s.DefaultCustomerPaymentMethodID,
                ol.OrderHeaderID,
                cpm.IsActive                      AS CardIsActive,
                pd.PaymentProviderID              AS CardPaymentProviderID,
                pd.ProviderCustomerRef,
                pd.ProviderInstrumentRef,
                lt.EndDate                        AS LastTermEndDate,
                lt.Quantity                       AS LastTermQuantity,
                toh.OrderNumber                   AS LastTermOrderNumber,
                toh.Status                        AS LastTermOrderStatus,
                toh.Balance                       AS LastTermOrderBalance,
                CASE WHEN toh.ID IS NOT NULL AND toh.Status NOT IN (${notOwing}) AND toh.Balance <= 0 THEN 1 ELSE 0 END AS LastTermPaid
            FROM __mj_BizAppsOrders.Subscription s
            LEFT JOIN __mj_BizAppsOrders.OrderLine ol ON ol.ID = s.OrderLineID
            LEFT JOIN __mj_BizAppsOrders.CustomerPaymentMethod cpm ON cpm.ID = s.DefaultCustomerPaymentMethodID
            LEFT JOIN __mj_BizAppsOrders.PaymentDetail pd ON pd.ID = cpm.PaymentDetailID
            OUTER APPLY (
                SELECT TOP 1 st.EndDate, st.Quantity, st.OrderLineID
                FROM __mj_BizAppsOrders.SubscriptionTerm st
                WHERE st.SubscriptionID = s.ID AND st.Status IN ('Scheduled', 'Active')
                ORDER BY st.EndDate DESC
            ) lt
            LEFT JOIN __mj_BizAppsOrders.OrderLine tol ON tol.ID = lt.OrderLineID
            LEFT JOIN __mj_BizAppsOrders.vwOrderHeaders toh ON toh.ID = tol.OrderHeaderID
            WHERE s.AutoRenew = 1
              AND s.Status IN ('Active', 'Trialing')
              AND ${scope}
            ORDER BY s.SubscriptionNumber
        `)) as CandidateRow[];
        return Array.isArray(rows) ? rows : [];
    }

    /** The daily pass only: which subscriptions have an open Task for a problem only a person clears. */
    public async loadParked(): Promise<void> {
        if (this.isSweep) this.parked = await OpenProviderSubscriptionAlerts(this.user, this.provider);
    }

    /** Accounts whose switch is on and whose config passes the one rule. */
    private async enabledProviderIDs(): Promise<string[]> {
        const rv = new RunView(this.provider as unknown as IRunViewProvider);
        const switchedOn = await rv.RunView<{ ID: string }>(
            {
                EntityName: PAYMENT_PROVIDER_ENTITY,
                ExtraFilter: `BillsSubscriptions = 1 AND IsActive = 1`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.user,
        );
        if (!switchedOn.Success) throw new Error(`could not read the payment providers: ${switchedOn.ErrorMessage ?? 'unknown error'}`);
        const ids: string[] = [];
        for (const row of switchedOn.Results ?? []) {
            if (await this.billsNewSubscriptions(row.ID)) ids.push(row.ID);
        }
        return ids;
    }

    // ─── One subscription ──────────────────────────────────────────────────────

    public async handle(row: CandidateRow, progress: HandleProgress): Promise<ProviderSubscriptionOutcome> {
        if (IsProviderBilled(row)) {
            return this.outcome(row, 'AlreadyLinked', `already billed by its gateway as ${row.ProviderSubscriptionID}`, {
                ProviderSubscriptionID: row.ProviderSubscriptionID ?? undefined,
                Recorded: true,
            });
        }

        const providerID = row.CardPaymentProviderID ?? this.input.CheckoutPaymentProviderID ?? null;
        const config = providerID ? await this.config(providerID) : null;
        if (!config || !ProviderBillsNewSubscriptions(config)) {
            return this.outcome(row, 'NotEnabled', 'its payment account does not bill subscriptions');
        }
        const extra = { PaymentProviderID: config.ID };

        if (!row.DefaultCustomerPaymentMethodID || !row.ProviderCustomerRef || !row.ProviderInstrumentRef || row.CardIsActive === false) {
            return this.alert(
                row,
                'NoCard',
                `account '${config.Name}' bills its subscriptions, but this one has no active saved card with a gateway customer ` +
                    `(the card was not kept at checkout). The gateway cannot charge a renewal without one.`,
                extra,
            );
        }
        if (!config.IsLiveMode) {
            return this.alert(
                row,
                'StubMode',
                `account '${config.Name}' is not live (IsLiveMode = 0), so its driver is a stub that cannot create a gateway subscription. ` +
                    `Turn BillsSubscriptions off on a test account, or make it live.`,
                extra,
            );
        }

        const priceID = await this.priceFor(config.ID, row.ProductID);
        if (!priceID) {
            return this.alert(
                row,
                'NoProviderPrice',
                `account '${config.Name}' has no active Payment Provider Price flagged UseForNewSubscriptions for this product, ` +
                    `so there is nothing to subscribe the customer to.`,
                extra,
            );
        }

        const lastDay = ToCalendarDay(row.LastTermEndDate);
        if (!lastDay) {
            return this.alert(row, 'NoTerm', 'the subscription has no scheduled or active term to take the first charge day from', extra);
        }
        if (!row.LastTermPaid) {
            // Not a problem: Charge Renewals collects it, and a pass after that hands over the next term.
            return this.outcome(
                row,
                'TermUnpaid',
                `its latest term (ends ${lastDay}) is on order ${row.LastTermOrderNumber ?? '(none found)'}` +
                    (row.LastTermOrderNumber ? `, ${row.LastTermOrderStatus}, ${Number(row.LastTermOrderBalance ?? 0).toFixed(2)} owing` : '') +
                    `: Orders collects it first`,
                extra,
            );
        }

        const parked = [...(this.parked.get(row.SubscriptionNumber) ?? [])].filter((c) =>
            PROVIDER_SUBSCRIPTION_PARKED_CODES.has(c as ProviderSubscriptionOutcomeCode),
        );
        if (parked.length) {
            return this.outcome(
                row,
                'AwaitingPerson',
                `its ${parked.join(', ')} Task is open; the gateway is not asked again until a person closes it`,
                extra,
            );
        }

        const driver = await this.driver(config);
        // An instant, not a calendar day: the gateway's limit counts from the moment of creation.
        const now = this.now();
        const zone = await this.businessZone();
        const quantity = Number(row.LastTermQuantity ?? 1) || 1;

        if (this.input.Preview) {
            // Preview reads the gateway but never writes to it: the price's period is not read (the limit
            // assumes a yearly price), but the search is, so the list says which subscriptions the gateway
            // already holds. It finds only gateway subscriptions Orders created (they carry
            // this subscription's id); one a buyer opened elsewhere is invisible to it.
            const plan = PlanProviderSubscriptionCharge(lastDay, zone, now, driver.LatestFirstChargeAt(now));
            const at = { ...extra, FirstChargeAt: plan.FirstChargeAt.toISOString() };
            if (plan.Kind === 'Passed') return this.chargeDayPassed(row, lastDay, plan.FirstChargeAt, at);
            if (plan.Kind === 'Deferred') return this.deferred(row, plan.FirstChargeAt, plan.LatestAccepted, at);
            const seen = await this.previewSearch(driver, row);
            if ('Problem' in seen) return this.outcome(row, 'WouldNeedPerson', seen.Problem, at);
            if (seen.Live.length === 1) {
                return this.outcome(row, 'WouldRecordFound', `the gateway already holds ${seen.Live[0]} for it; a run would record it`, {
                    ...at,
                    ProviderSubscriptionID: seen.Live[0],
                });
            }
            this.committed++;
            return this.outcome(row, 'WouldCreate', `would subscribe ${row.ProviderCustomerRef} to ${priceID} × ${quantity}`, at);
        }

        // The price's period must be the term's, or the gateway would bill on another cadence, silently.
        const price = await this.gatewayPrice(driver, priceID, row.SubscriptionTypeID);
        if (price.Unreadable) {
            return this.alert(row, 'GatewayReadFailed', `could not read the gateway price ${priceID}: ${price.Unreadable}`, extra);
        }
        if (price.Problem) {
            return this.alert(row, 'PriceMismatch', `the gateway price ${priceID} ${price.Problem}`, extra);
        }

        const plan = PlanProviderSubscriptionCharge(lastDay, zone, now, driver.LatestFirstChargeAt(now, price.Interval));
        const at = { ...extra, FirstChargeAt: plan.FirstChargeAt.toISOString() };
        if (plan.Kind === 'Passed') return this.chargeDayPassed(row, lastDay, plan.FirstChargeAt, at);
        if (plan.Kind === 'Deferred') return this.deferred(row, plan.FirstChargeAt, plan.LatestAccepted, at);

        // Search first: an earlier run may have created it, and the gateway no longer remembers its key.
        let found;
        try {
            found = await driver.FindProviderSubscriptions({
                ProviderCustomerRef: row.ProviderCustomerRef,
                MetadataKey: ORDERS_SUBSCRIPTION_METADATA_KEY,
                MetadataValue: row.SubscriptionID,
            });
        } catch (err) {
            // Nothing was created, so this is a read problem, not a fault of unknown state.
            return this.alert(row, 'GatewayReadFailed', `could not search the gateway for an existing subscription: ${err instanceof Error ? err.message : String(err)}`, at);
        }
        if (!found.Success) {
            return this.alert(row, 'GatewayReadFailed', `could not search the gateway for an existing subscription: ${found.Reason}`, at);
        }
        // A gateway subscription this Orders subscription already cancelled is history, never the one to
        // record: a cancelled subscription bought again (a fresh start, E2b) gets a new one, and the old
        // one, which still carries this id in its metadata, may run on to its period end.
        const retired = (found.Subscriptions ?? []).length ? await this.retiredGatewayIDs(row.SubscriptionID) : new Set<string>();
        const matches = (found.Subscriptions ?? []).filter((m) => !retired.has(m.ProviderSubscriptionID));
        const live = matches.filter((m) => m.IsLive);
        if (live.length > 1) {
            return this.alert(
                row,
                'AmbiguousAtGateway',
                `the gateway holds ${live.length} live subscriptions for it (${live.map((m) => m.ProviderSubscriptionID).join(', ')}); ` +
                    `cancel the extra one at the gateway and record the other.`,
                at,
            );
        }
        if (live.length === 1) {
            const existing = live[0];
            // Recorded whatever it bills: it is live, so the gateway charges it either way, and leaving
            // it unrecorded would let Orders renew the same term as well (a second charge). A wrong
            // price or quantity is one charge of the wrong amount, which a person corrects at the gateway.
            const recorded = await this.record(row, config, existing.ProviderSubscriptionID, 'Found', at);
            const anchored = await this.checkAnchor(row, recorded, existing.ProviderSubscriptionID, existing.FirstChargeAt, plan.FirstChargeAt, at);
            const differences: string[] = [];
            if (existing.ProviderPriceID && existing.ProviderPriceID !== priceID) differences.push(`price ${existing.ProviderPriceID}, not ${priceID}`);
            if (existing.Quantity != null && existing.Quantity !== quantity) differences.push(`quantity ${existing.Quantity}, not ${quantity}`);
            if (!differences.length) return anchored;
            // Orders skips the subscription when an id is on it: this one, or (LinkedElsewhere) another.
            const ordersSkipsIt = !!recorded.Recorded || recorded.Code === 'LinkedElsewhere';
            const mismatch = await this.alert(
                row,
                'FoundMismatch',
                `the gateway's ${existing.ProviderSubscriptionID} bills ${differences.join(' and ')} as this subscription's latest term does. ` +
                    `It is live, so it ` +
                    (recorded.Recorded ? `is recorded and the gateway will bill it as it stands` : `will bill as it stands although it is not recorded (${recorded.Code})`) +
                    `: correct its price or quantity at the gateway.`,
                { ...at, ProviderSubscriptionID: existing.ProviderSubscriptionID, Recorded: recorded.Recorded },
                { Linked: ordersSkipsIt },
            );
            // The record's own problem (NotRecorded, LinkedElsewhere) or the anchor's stays the outcome
            // when there is one; the mismatch is the outcome otherwise. Either way both are raised.
            const primary = anchored.Code === 'Found' || anchored.Code === 'AlreadyLinked' ? mismatch : anchored;
            return { ...primary, NewAlert: !!(primary.NewAlert || mismatch.NewAlert || anchored.NewAlert) };
        }
        if (matches.length > 0) {
            return this.alert(
                row,
                'EndedAtGateway',
                `its gateway subscription ${matches.map((m) => `${m.ProviderSubscriptionID} (${m.Status})`).join(', ')} has ended; ` +
                    `a new one is not created without a person deciding the customer still wants it.`,
                at,
            );
        }

        // The pass read every row at its start; Spawn Renewals may have booked a new term since (its
        // lead window opens daily). Read this one again, through the same query and so the same "paid"
        // rule, and start over on what it says now if anything that decides the hand-over moved: a
        // new unpaid term stays with Orders, a new card or quantity is a new request. Once per row.
        if (!progress.Rechecked) {
            progress.Rechecked = true;
            const fresh = await this.reselect(row.SubscriptionID);
            if (!fresh) {
                return this.outcome(row, 'NoLongerRenewing', 'it is no longer an active subscription with automatic renewal on', at);
            }
            if (handOverFacts(fresh) !== handOverFacts(row)) return this.handle(fresh, progress);
        }

        this.committed++;
        progress.CreateSent = true;
        const created = await driver.CreateProviderSubscription({
            ProviderCustomerRef: row.ProviderCustomerRef,
            ProviderInstrumentRef: row.ProviderInstrumentRef,
            ProviderPriceID: priceID,
            Quantity: quantity,
            FirstChargeAt: plan.FirstChargeAt,
            IdempotencyKey: ProviderSubscriptionIdempotencyKey({
                SubscriptionID: row.SubscriptionID,
                ProviderPriceID: priceID,
                ProviderInstrumentRef: row.ProviderInstrumentRef,
                Quantity: quantity,
                FirstChargeAt: plan.FirstChargeAt,
                AttemptDay: CalendarDayIn(now, zone),
                // A retired gateway subscription carries this subscription's id in its metadata, so the
                // search above found it, and read the retired ids, whenever the key could repeat.
                Generation: retired.size,
            }),
            Metadata: this.metadataFor(row),
        });
        if (!created.Success) {
            // A run racing this one may hold the key (Stripe answers 409 while it is in use) and have
            // recorded the id by now. A failed re-read is not a fault: the gateway answered, so its
            // state is known; it only leaves the racer unseen.
            const current = await this.reload(row.SubscriptionID).catch(() => null);
            if (current && IsProviderBilled(current)) {
                return this.outcome(row, 'AlreadyLinked', `recorded by another run as ${current.ProviderSubscriptionID}`, {
                    ...at,
                    ProviderSubscriptionID: current.ProviderSubscriptionID ?? undefined,
                    Recorded: true,
                });
            }
            if (created.InFlightElsewhere) {
                return this.outcome(row, 'InProgressElsewhere', `another run is creating it at the gateway now: ${created.Reason ?? ''}`.trim(), at);
            }
            return this.alert(row, 'GatewayRefused', `the gateway refused to create it: ${created.Reason ?? 'no reason given'}`, at);
        }

        // A success with no id is not a refusal: the gateway may hold one. `record` raises it as NotRecorded.
        const recorded = await this.record(row, config, created.ProviderSubscriptionID ?? '', 'Created', at);
        if (created.ChargedAtCreation) {
            // Whatever happened to the record: the customer was charged twice, and that alert must
            // not depend on the write succeeding.
            const charged = await this.alert(
                row,
                'ChargedAtCreation',
                `the gateway created ${created.ProviderSubscriptionID} with status '${created.Status ?? ''}' and billed it at creation, ` +
                    `although the customer already paid this term. Refund the gateway's charge and check the subscription.` +
                    (recorded.Recorded ? '' : ` It is also NOT recorded on the Orders subscription (${recorded.Code}).`),
                { ...at, ProviderSubscriptionID: created.ProviderSubscriptionID, Recorded: recorded.Recorded },
                { Urgent: true, Linked: recorded.Recorded },
            );
            return { ...charged, NewAlert: charged.NewAlert || recorded.NewAlert };
        }
        const anchored = await this.checkAnchor(row, recorded, created.ProviderSubscriptionID, created.FirstChargeAt, plan.FirstChargeAt, at);
        return this.confirmOnlyOne(row, driver, created.ProviderSubscriptionID ?? '', anchored, at);
    }

    /** The read-only search a preview reports, with the same rules a run applies to what it finds. */
    private async previewSearch(driver: BasePaymentProvider, row: CandidateRow): Promise<{ Live: string[] } | { Problem: string }> {
        try {
            const found = await driver.FindProviderSubscriptions({
                ProviderCustomerRef: row.ProviderCustomerRef,
                MetadataKey: ORDERS_SUBSCRIPTION_METADATA_KEY,
                MetadataValue: row.SubscriptionID,
            });
            if (!found.Success) return { Problem: `could not search the gateway: ${found.Reason ?? 'no reason given'}` };
            const retired = (found.Subscriptions ?? []).length ? await this.retiredGatewayIDs(row.SubscriptionID) : new Set<string>();
            const matches = (found.Subscriptions ?? []).filter((m) => !retired.has(m.ProviderSubscriptionID));
            const live = matches.filter((m) => m.IsLive).map((m) => m.ProviderSubscriptionID);
            if (live.length > 1) return { Problem: `the gateway holds ${live.length} live subscriptions for it (${live.join(', ')})` };
            if (!live.length && matches.length) {
                return { Problem: `its gateway subscription ${matches.map((m) => `${m.ProviderSubscriptionID} (${m.Status})`).join(', ')} has ended` };
            }
            return { Live: live };
        } catch (err) {
            return { Problem: `could not search the gateway: ${err instanceof Error ? err.message : String(err)}` };
        }
    }

    /**
     * After a create, search the gateway again: two runs that straddled business midnight send two
     * idempotency keys, and if both created, the gateway holds two live subscriptions for one Orders
     * subscription. The record step keeps one; this makes the other loud instead of an
     * orphan nothing finds. A failed search is logged, not raised: the create itself succeeded.
     */
    private async confirmOnlyOne(
        row: CandidateRow,
        driver: BasePaymentProvider,
        providerSubscriptionID: string,
        outcome: ProviderSubscriptionOutcome,
        at: Partial<ProviderSubscriptionOutcome>,
    ): Promise<ProviderSubscriptionOutcome> {
        let live: string[];
        try {
            const again = await driver.FindProviderSubscriptions({
                ProviderCustomerRef: row.ProviderCustomerRef,
                MetadataKey: ORDERS_SUBSCRIPTION_METADATA_KEY,
                MetadataValue: row.SubscriptionID,
            });
            if (!again.Success) throw new Error(again.Reason ?? 'no reason given');
            live = (again.Subscriptions ?? []).filter((m) => m.IsLive).map((m) => m.ProviderSubscriptionID);
            // The retired ids are read only when they could change the answer: two or more live.
            if (live.length > 1) {
                const retired = await this.retiredGatewayIDs(row.SubscriptionID);
                live = live.filter((id) => !retired.has(id));
            }
        } catch (err) {
            LogError(`[ProviderSubscriptions] ${row.SubscriptionNumber}: could not search the gateway again after creating ${providerSubscriptionID}: ${err instanceof Error ? err.message : String(err)}`);
            return outcome;
        }
        if (live.length <= 1) return outcome;
        const extra = await this.alert(
            row,
            'AmbiguousAtGateway',
            `after creating ${providerSubscriptionID}, the gateway holds ${live.length} live subscriptions for it (${live.join(', ')}): ` +
                `another run created one at the same time. Cancel every one except the one recorded on the subscription.`,
            { ...at, ProviderSubscriptionID: providerSubscriptionID },
            { Urgent: true, Linked: true },
        );
        return { ...extra, NewAlert: !!(extra.NewAlert || outcome.NewAlert) };
    }

    private chargeDayPassed(row: CandidateRow, lastDay: CalendarDay, firstChargeAt: Date, at: Partial<ProviderSubscriptionOutcome>): Promise<ProviderSubscriptionOutcome> {
        return this.alert(
            row,
            'ChargeDayPassed',
            `its term ends ${lastDay}, so the first gateway charge (${firstChargeAt.toISOString()}) is not in the future. ` +
                `Creating it now would bill the customer at once; renew it in Orders or create it by hand.`,
            at,
        );
    }

    private deferred(row: CandidateRow, firstChargeAt: Date, latestAccepted: Date, at: Partial<ProviderSubscriptionOutcome>): ProviderSubscriptionOutcome {
        return this.outcome(
            row,
            'Deferred',
            `first charge ${firstChargeAt.toISOString()} is later than the gateway accepts today ` +
                `(${latestAccepted.toISOString()}); a later run creates it`,
            at,
        );
    }

    /** A recorded gateway subscription whose first charge is not the planned one: Orders' term and the gateway's period disagree. */
    private async checkAnchor(
        row: CandidateRow,
        recorded: ProviderSubscriptionOutcome,
        providerSubscriptionID: string,
        gatewayFirstChargeAt: Date | undefined,
        planned: Date,
        at: Partial<ProviderSubscriptionOutcome>,
    ): Promise<ProviderSubscriptionOutcome> {
        if (!recorded.Recorded || !gatewayFirstChargeAt || Math.abs(gatewayFirstChargeAt.getTime() - planned.getTime()) < 1000) {
            return recorded;
        }
        const mismatch = await this.alert(
            row,
            'AnchorMismatch',
            `the gateway's ${providerSubscriptionID} first charges ${gatewayFirstChargeAt.toISOString()}, but this term's first charge is ` +
                `${planned.toISOString()}. The customer would be charged on the wrong day: correct it at the gateway.`,
            { ...at, ProviderSubscriptionID: providerSubscriptionID, Recorded: true },
            { Linked: true },
        );
        return mismatch;
    }

    /**
     * Write the id, only while the column is still NULL. Never throws: the gateway holds the
     * subscription by now, so a failed read or write is `NotRecorded` naming the id, never a fault of
     * unknown state. Never writes an empty id: a gateway answer with no id (`''` or only spaces) is
     * `NotRecorded` before anything is read or saved. The entity's validator and
     * `CK_Subscription_ProviderSubscriptionHasProvider` refuse one too, but an empty marker must not even
     * be attempted: it would read as "the gateway bills this" while naming nothing a person can find.
     */
    private async record(
        row: CandidateRow,
        config: PaymentProviderConfig,
        providerSubscriptionID: string,
        code: 'Created' | 'Found',
        at: Partial<ProviderSubscriptionOutcome>,
    ): Promise<ProviderSubscriptionOutcome> {
        if (providerSubscriptionID.trim() === '') {
            return this.alert(
                row,
                'NotRecorded',
                `the gateway answered without a subscription id, so nothing was recorded. Find it at the gateway by its ` +
                    `${ORDERS_SUBSCRIPTION_METADATA_KEY} metadata (${row.SubscriptionID}) and record it by hand, or Orders will also renew it.`,
                at,
            );
        }
        const linked = { ...at, ProviderSubscriptionID: providerSubscriptionID };
        try {
            return await this.recordOnce(row, config, providerSubscriptionID, code, at, linked);
        } catch (err) {
            return this.alert(
                row,
                'NotRecorded',
                `the gateway bills it as ${providerSubscriptionID}, but recording that failed ` +
                    `(${err instanceof Error ? err.message : String(err)}). Record it by hand, or Orders will also renew it.`,
                linked,
            );
        }
    }

    private async recordOnce(
        row: CandidateRow,
        config: PaymentProviderConfig,
        providerSubscriptionID: string,
        code: 'Created' | 'Found',
        at: Partial<ProviderSubscriptionOutcome>,
        linked: Partial<ProviderSubscriptionOutcome>,
    ): Promise<ProviderSubscriptionOutcome> {
        const subscription = await this.reload(row.SubscriptionID);
        if (!subscription) {
            return this.alert(row, 'NotRecorded', `the gateway holds ${providerSubscriptionID}, but the subscription could not be re-read to record it`, linked);
        }
        if (!IsProviderBilled(subscription) && (!['Active', 'Trialing'].includes(subscription.Status) || !subscription.AutoRenew)) {
            // Cancelled (or switched off) between the pass's re-read and now: support pressed Cancel
            // while the gateway was creating it. Recording it would need the cancel's sanction and is
            // not wanted anyway; leaving it would bill a customer who cancelled. So stop it (E2b).
            return this.stopUnwanted(row, config, providerSubscriptionID, subscription.Status, linked);
        }
        if (IsProviderBilled(subscription)) {
            if (subscription.ProviderSubscriptionID === providerSubscriptionID) {
                return this.outcome(row, 'AlreadyLinked', `recorded by another run as ${providerSubscriptionID}`, { ...linked, Recorded: true });
            }
            return this.alert(
                row,
                'LinkedElsewhere',
                `the gateway returned ${providerSubscriptionID}, but the subscription already records ${subscription.ProviderSubscriptionID}. ` +
                    `The gateway may now bill twice: cancel the one that should not exist.`,
                linked,
                { Linked: true },
            );
        }
        if (code === 'Created' && (await this.retiredGatewayIDs(row.SubscriptionID)).has(providerSubscriptionID)) {
            // A create answered with a subscription this one already cancelled or retired: the gateway
            // replayed an earlier request. Recording it would bill nothing and stop Orders renewing.
            return this.alert(
                row,
                'NotRecorded',
                `the gateway answered the create with ${providerSubscriptionID}, which this subscription already cancelled or retired ` +
                    `(a replayed request), so it was not recorded. No new gateway subscription exists yet; the next daily pass asks again.`,
                linked,
            );
        }
        // Linking is the one write that makes the gateway bill this subscription; only Orders' own
        // hand-over may make it (the shared entity rule refuses it from a form or API).
        SanctionProviderBilledChange(subscription);
        subscription.PaymentProviderID = config.ID;
        subscription.ProviderSubscriptionID = providerSubscriptionID;
        if (!(await subscription.Save())) {
            return this.alert(
                row,
                'NotRecorded',
                `the gateway bills it as ${providerSubscriptionID}, but recording that failed ` +
                    `(${subscription.LatestResult?.CompleteMessage ?? 'unknown error'}). Record it by hand, or Orders will also renew it.`,
                linked,
            );
        }
        LogStatus(`[ProviderSubscriptions] ${row.SubscriptionNumber}: billed by '${config.Name}' as ${providerSubscriptionID} from ${at.FirstChargeAt}.`);
        return this.outcome(row, code, `${code === 'Created' ? 'created' : 'found'} ${providerSubscriptionID}; first charge ${at.FirstChargeAt}`, {
            ...linked,
            Recorded: true,
        });
    }

    /** Cancel, now, a gateway subscription made for an Orders subscription that no longer wants one. */
    private async stopUnwanted(
        row: CandidateRow,
        config: PaymentProviderConfig,
        providerSubscriptionID: string,
        status: string,
        linked: Partial<ProviderSubscriptionOutcome>,
    ): Promise<ProviderSubscriptionOutcome> {
        let stopped: { Success: boolean; Reason?: string };
        try {
            const driver = await this.driver(config);
            stopped = await driver.CancelProviderSubscription({
                ProviderSubscriptionID: providerSubscriptionID,
                BillingEndsAt: null,
                IdempotencyKey: `provider-subscription-unwanted:${row.SubscriptionID.toLowerCase()}:${providerSubscriptionID}`,
            });
        } catch (err) {
            stopped = { Success: false, Reason: err instanceof Error ? err.message : String(err) };
        }
        if (stopped.Success) {
            return this.outcome(
                row,
                'NoLongerRenewing',
                `it was ${status === 'Active' || status === 'Trialing' ? 'switched off' : status.toLowerCase()} while ${providerSubscriptionID} ` +
                    `was being created, so that gateway subscription was cancelled again and not recorded`,
                linked,
            );
        }
        return this.alert(
            row,
            'UnwantedAtGateway',
            `the gateway created ${providerSubscriptionID}, but the subscription was ${status.toLowerCase()} meanwhile and cancelling ` +
                `${providerSubscriptionID} at the gateway failed (${stopped.Reason ?? 'no reason given'}). Cancel it at the gateway, or ` +
                `the customer will be charged.`,
            linked,
            { Urgent: true },
        );
    }

    private metadataFor(row: CandidateRow): Record<string, string> {
        const metadata: Record<string, string> = {
            [ORDERS_SUBSCRIPTION_METADATA_KEY]: row.SubscriptionID,
            OrdersSubscriptionNumber: row.SubscriptionNumber,
            OrdersCompanyID: row.CompanyID,
        };
        if (row.OrderHeaderID) metadata.OrdersOrderHeaderID = row.OrderHeaderID;
        return metadata;
    }

    // ─── Reads, once per call ──────────────────────────────────────────────────

    /** The account's config, or null when it cannot be used (missing, inactive). */
    private config(providerID: string): Promise<PaymentProviderConfig | null> {
        const key = providerID.toLowerCase();
        let found = this.configs.get(key);
        if (!found) {
            found = LoadPaymentProviderConfig(providerID, this.provider, this.user).catch((err: unknown) => {
                LogError(`[ProviderSubscriptions] Payment provider ${providerID} cannot be used: ${err instanceof Error ? err.message : String(err)}`);
                return null;
            });
            this.configs.set(key, found);
        }
        return found;
    }

    private driver(config: PaymentProviderConfig): Promise<BasePaymentProvider> {
        const key = config.ID.toLowerCase();
        let found = this.drivers.get(key);
        if (!found) {
            found = BuildPaymentProvider(config, this.provider, this.user);
            this.drivers.set(key, found);
        }
        return found;
    }

    /** The one active price flagged for new subscriptions on this account; the filtered unique index allows at most one per product. */
    private async priceFor(providerID: string, productID: string): Promise<string | null> {
        const key = providerID.toLowerCase();
        let byProduct = this.prices.get(key);
        if (!byProduct) {
            byProduct = (async () => {
                const rv = new RunView(this.provider as unknown as IRunViewProvider);
                const result = await rv.RunView<{ ID: string; ProductID: string; ProviderPriceID: string }>(
                    {
                        EntityName: PAYMENT_PROVIDER_PRICE_ENTITY,
                        ExtraFilter: `PaymentProviderID = '${RequireUUID(providerID, 'PaymentProviderID')}' AND IsActive = 1 AND UseForNewSubscriptions = 1`,
                        Fields: ['ID', 'ProductID', 'ProviderPriceID'],
                        ResultType: 'simple',
                        IgnoreMaxRows: true,
                        BypassCache: true,
                    },
                    this.user,
                );
                if (!result.Success) throw new Error(`could not read the payment provider prices: ${result.ErrorMessage ?? 'unknown error'}`);
                return new Map((result.Results ?? []).map((r) => [r.ProductID.toLowerCase(), r.ProviderPriceID]));
            })();
            this.prices.set(key, byProduct);
        }
        return (await byProduct).get(productID.toLowerCase()) ?? null;
    }

    /**
     * The gateway price's period, checked against the subscription type's term length (the rule
     * `SubscriptionBehavior.TermMonths` books terms with). Read once per price and type per call.
     */
    private gatewayPrice(
        driver: BasePaymentProvider,
        priceID: string,
        subscriptionTypeID: string,
    ): Promise<{ Interval: GatewayPriceInterval | null; Problem: string | null; Unreadable: string | null }> {
        const key = `${priceID}|${subscriptionTypeID}`.toLowerCase();
        let found = this.gatewayPrices.get(key);
        if (!found) {
            found = (async () => {
                let described;
                try {
                    described = await driver.DescribeProviderPrice(priceID);
                } catch (err) {
                    return { Interval: null, Problem: null, Unreadable: err instanceof Error ? err.message : String(err) };
                }
                if (!described.Success) return { Interval: null, Problem: null, Unreadable: described.Reason ?? 'no reason given' };
                const interval = described.Interval ?? null;
                if (described.Active === false) return { Interval: interval, Problem: 'is not active at the gateway', Unreadable: null };
                const priceMonths = GatewayIntervalMonths(interval);
                const termMonths = await this.termMonths(subscriptionTypeID);
                if (priceMonths == null || termMonths == null || priceMonths !== termMonths) {
                    const every = interval ? `every ${interval.Count} ${interval.Unit}(s)` : 'once (not a recurring price)';
                    return {
                        Interval: interval,
                        Problem: `bills ${every}, but this subscription's terms are ${termMonths ?? 'an unknown number of'} month(s). ` +
                            `Flag a price whose period matches the term, or the gateway would bill on another cadence.`,
                        Unreadable: null,
                    };
                }
                return { Interval: interval, Problem: null, Unreadable: null };
            })();
            this.gatewayPrices.set(key, found);
        }
        return found;
    }

    /** The subscription type's term length in months, as booking computes it; null when the type cannot be found. */
    private async termMonths(subscriptionTypeID: string): Promise<number | null> {
        await LoadOrdersEngine(this.provider, this.user);
        const cached = OrdersEngine.Instance.SubscriptionTypeByID(subscriptionTypeID);
        if (!cached) return null;
        const rules = SubscriptionTypeRulesFrom(cached);
        const behavior = rules.DriverClass
            ? MJGlobal.Instance.ClassFactory.CreateInstance<SubscriptionBehavior>(SubscriptionBehavior, rules.DriverClass)
            : new SubscriptionBehavior();
        return behavior ? behavior.TermMonths(rules) : null;
    }

    /** The moment the gateway subscription would be created: the caller's `Now` (tests), else the clock. */
    private now(): Date {
        if (this.input.Now) return this.input.Now;
        return new Date();
    }

    private async businessZone(): Promise<string> {
        if (!this.zone) {
            await BusinessTimeZoneEngine.Instance.Config(false, this.user, this.provider);
            this.zone = BusinessTimeZoneEngine.Instance.Zone;
        }
        return this.zone;
    }

    /**
     * The gateway subscriptions this Orders subscription cancelled (its `Canceled` events record the
     * gateway's part, E2b) or retired on a fresh start (`Activated` events). Read only when the gateway
     * search found something.
     */
    private async retiredGatewayIDs(subscriptionID: string): Promise<Set<string>> {
        const rv = new RunView(this.provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{ ID: string; EventData: string | null }>(
            {
                EntityName: SUBSCRIPTION_EVENT_ENTITY,
                ExtraFilter: `SubscriptionID = '${RequireUUID(subscriptionID, 'SubscriptionID')}' AND EventType IN ('Canceled', 'Activated')`,
                Fields: ['ID', 'EventData'],
                ResultType: 'simple',
                IgnoreMaxRows: true,
                BypassCache: true,
            },
            this.user,
        );
        if (!result.Success) throw new Error(`could not read the subscription's events: ${result.ErrorMessage}`);
        return RetiredGatewayIDsFromEvents(result.Results ?? []);
    }

    /** The subscription as the database holds it now, never a cached copy. */
    private async reload(subscriptionID: string): Promise<mjBizAppsOrdersSubscriptionEntity | null> {
        const subscription = await this.provider.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(SUBSCRIPTION_ENTITY, this.user);
        return (await subscription.Load(subscriptionID)) ? subscription : null;
    }

    // ─── Outcomes ──────────────────────────────────────────────────────────────

    private outcome(
        row: CandidateRow,
        code: ProviderSubscriptionOutcomeCode,
        message: string,
        extra: Partial<ProviderSubscriptionOutcome> = {},
    ): ProviderSubscriptionOutcome {
        return { SubscriptionID: row.SubscriptionID, SubscriptionNumber: row.SubscriptionNumber, Code: code, Message: message, ...extra };
    }

    /**
     * An outcome a person must act on: logged and raised as a Task (never in preview). `NewAlert`
     * says whether this call raised the Task or found one already open.
     */
    public async alert(
        row: CandidateRow,
        code: ProviderSubscriptionOutcomeCode,
        reason: string,
        extra: Partial<ProviderSubscriptionOutcome> = {},
        options: { Urgent?: boolean; Linked?: boolean } = {},
    ): Promise<ProviderSubscriptionOutcome> {
        let newAlert = false;
        if (this.input.Preview) {
            LogStatus(`[ProviderSubscriptions] Preview: ${row.SubscriptionNumber} would need a person: ${code}: ${reason}`);
        } else {
            newAlert = await raiseProviderSubscriptionAlert(
                {
                    SubscriptionID: row.SubscriptionID,
                    SubscriptionNumber: row.SubscriptionNumber,
                    Code: code,
                    Reason: reason,
                    Urgent: options.Urgent,
                    Linked: options.Linked,
                },
                this.user,
                this.provider,
            );
        }
        return this.outcome(row, code, reason, { ...extra, NewAlert: newAlert });
    }
}
