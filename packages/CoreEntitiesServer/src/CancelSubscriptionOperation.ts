/**
 * Orders.CancelSubscription — cancel a subscription atomically, by POLICY (design §5).
 *
 * WHY THIS IS AN OPERATION AND NOT A FORM
 * The mechanics already worked: a reversal order line with a negative quantity produces mirrored
 * journal entries through the ordinary booking path (D16). What did not work was asking a human to
 * do it. Amith's case — a subscription running 1/1–12/31, cancelled on 7/1 — needs a line of
 * quantity `-0.5`. That is correct double-entry and terrible data entry, and it silently ignores
 * the `SubscriptionType`'s own rules about WHEN coverage may end and WHETHER money comes back.
 *
 * So the caller supplies a subscription, a date and a reason. `SubscriptionBehavior` decides what
 * the rules permit; this operation performs it in ONE transaction:
 *
 *   1. resolve the affected term (the one whose window covers the request, else the next to
 *      start, else the latest), and the LATER terms — open terms that start after its coverage ends
 *   2. ask the behaviour what the rules say — effective date, refund, reversal fraction — for the
 *      affected term, and for each later term (never delivered, so reversed in full, #406). The
 *      rules are the type's, or, when the caller chose a `Timing`, the type's with that timing
 *      in place of its `CancellationMode`
 *   3. when there is something to reverse, emit ONE reversal ORDER with a line per reversed term,
 *      each carrying the negative quantity and pointing at its original line, and confirm it —
 *      booking mirrors the JEs
 *   4. stamp every term (Canceled/Completed, CanceledAt, CancellationEffectiveDate)
 *   5. stamp the subscription (Canceled, EndDate = access-through, so grace is visible)
 *   6. revoke standing grants when access-through has already passed; leave them when
 *      grace remains — the read evaluator honours `subscription.EndDate` either way
 *   7. log a `SubscriptionEvent` — the lifecycle record that made the table worth having
 *
 * A GATEWAY-BILLED SUBSCRIPTION (E2b). When a payment gateway bills it (`IsProviderBilled`), the gateway
 * is READ first (`ReadGatewaySubscription`; a read that fails, or an answer with no status, refuses with
 * nothing written), and its billing state decides (`GateGatewayCancel`, ./ProviderSubscriptionCancel.ts):
 *   · a period the gateway started at or after 00:00 business time on the latest open term's last day is one
 *     Orders has not booked (the gateway renews then): REFUSED on that last day, with nothing asked of the
 *     gateway — cancel and refund at the gateway, then here;
 *   · a subscription the gateway already ended (or set to end with nothing unbooked) is FINISHED: Orders records
 *     the cancel, after the coverage too (effective the latest term's last day, nothing refunded), which is the
 *     one exception to "no open term covers the request";
 *   · otherwise the gateway is asked, before the transaction, to charge nothing after coverage ends; if it does
 *     not confirm, nothing is written.
 * It is also refused while an open alert says another gateway subscription may be billing (unless the gateway
 * has ENDED it, which bills nothing more), and when no open term covers the request. Inside the transaction the
 * subscription row is locked (`UPDLOCK, ROWLOCK`) and its status read again, so two cancels at once book one
 * credit memo. The stamp on the subscription is the one write `SubscriptionEntity` lets through for it,
 * sanctioned after the gateway confirmed (./SubscriptionEntityServer.ts).
 *
 * ATOMICITY: everything above shares one transaction opened here. The reversal order's own
 * `OrderEntityServer.Save` nests inside it as savepoints (the same composition booking already
 * relies on), so a failure anywhere leaves the subscription exactly as it was — never a reversed
 * ledger with a still-active subscription, or vice versa.
 *
 * FAILURE MODEL: logical failures (unknown subscription, already cancelled, no term) come back
 * INSIDE the output as `Success: false` with a message — the same contract accounting's operations
 * use. Only genuine faults throw.
 *
 * CONNECTS TO:
 *   POLICY: SubscriptionBehavior.DecideCancellation (./SubscriptionBehavior.ts)
 *   BOOKING: OrderEntityServer.Save (./OrderEntityServer.ts) — the reversal order goes through it
 *   TABLES: __mj_BizAppsOrders.{Subscription,SubscriptionTerm,SubscriptionEvent,OrderHeader,OrderLine}
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
    BaseEntity,
    BaseRemotableOperation,
    CompositeKey,
    DatabaseProviderBase,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    OrdersCancelSubscriptionOperation as OrdersCancelSubscriptionOperationBase,
    type CancellationDecisionResult,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';
import type { OrderEntityServer } from './OrderEntityServer.js';
import { RequireOptionalDay, RequireUUID } from './sql-guards.js';
import { CalendarDayOrToday } from './calendar-day.js';
import { RevokeGrantsForCanceledSubscription, type CancelAccessEnd } from './EntitlementEngine.js';
import {
    SubscriptionBehavior,
    CANCELLATION_TIMINGS,
    type CancellableTerm,
    type CancellationDecision,
    type CancellationTiming,
    type LaterTermBilling,
    type SubscriptionTypeRules,
} from './SubscriptionBehavior.js';
import { InstalmentsToCancel } from './ContractBalance.js';
import { MarkAsOrdersOwnWrite } from './OrderLineEntityServer.js';
import { LoadReversalContext } from './ReversalResolver.js';
import { BusinessTimeZoneEngine, ToCalendarDay, type CalendarDay } from '@mj-biz-apps/common-entities';
import { IsProviderBilled } from './ProviderBilledSubscriptions.js';
import { SanctionCancellationReversal, SanctionProviderBilledChange } from './SubscriptionEntityServer.js';
import {
    ApplyGatewayCredit,
    CreditReversalQuantity,
    GatewayCreditQuantity,
    GatewayRenewalCreditFor,
    IsGatewayChargeFullyRefunded,
    LockGatewayCreditRows,
    LockSubscriptionForCredit,
    ReversedQuantityOf,
    type RenewalTermCredit,
} from './GatewayRenewalCredit.js';
import { raiseProviderSubscriptionAlert } from './checkoutCaptureAlert.js';
import {
    BusinessToday,
    CancelAtGateway,
    CancelBlockingAlerts,
    GateGatewayCancel,
    GatewayCancelPreview,
    gatewayDriver,
    PlanGatewayCancel,
    ReadGatewaySubscription,
    type GatewayCancelSummary,
} from './ProviderSubscriptionCancel.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const SUBSCRIPTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Subscription Types';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

/**
 * SERVER-ONLY: this cancel RECORDS an end the payment gateway already made (the gateway-renewal sync, E3/E4),
 * so it is never extended to a later booked term (D19 is for a person's end-of-term cancel). Its renewal terms
 * reverse what the gateway refunded (below). Never an input a client can send.
 */
/** Cancel-blocking alerts about this subscription's OWN money, which stop mattering once the gateway ended it. */
const OWN_SUBSCRIPTION_ALERT_CODES: readonly string[] = ['RenewalNotBooked'];

const gatewayEndRecorded = new AsyncLocalStorage<{ Recording: true }>();

/** Run a cancel that records the gateway's end. Server-only. */
export function WithGatewayEndRecorded<T>(fn: () => Promise<T>): Promise<T> {
    return gatewayEndRecorded.run({ Recording: true }, fn);
}

export interface CancelSubscriptionInput {
    SubscriptionID: string;
    /** When the customer asked. Defaults to today. The RULES decide when coverage actually ends. */
    RequestDate?: Date | string;
    /** Free text, stored on the lifecycle event. */
    Reason?: string;
    /**
     * When coverage ends, chosen by the person cancelling: `Immediate` ends coverage and access on
     * the request day, `EndOfTerm` on the term's last day. Either way the type's grace does not
     * apply. Absent, the type's `CancellationMode` and grace decide. See
     * `SubscriptionBehavior.RulesForTiming`.
     */
    Timing?: CancellationTiming;
    /**
     * Compute and return the decision WITHOUT writing anything — for a confirmation screen that
     * shows "you will be refunded $X, coverage ends Y" before the user commits.
     */
    Preview?: boolean;
}

export interface CancelSubscriptionOutput {
    Success: boolean;
    Message?: string;
    /** What the rules decided. Present even on a preview. */
    Decision?: CancellationDecisionResult;
    /** The term that was (or would be) cancelled. */
    SubscriptionTermID?: string;
    /**
     * Terms that start after coverage ends — a renewal already booked, say — and are (or would be)
     * cancelled and reversed with it (#406). Empty when there are none. Present even on a preview.
     */
    LaterTerms?: CanceledLaterTerm[];
    /** `Decision.RefundAmount` plus every later term's refund — the whole refund the cancel gives. */
    TotalRefundAmount?: number;
    /** The reversal order, when one was needed. Absent when nothing was refunded. */
    ReversalOrderID?: string;
    ReversalOrderNumber?: string;
    /**
     * What the cancel did (or, on a preview, will do) at the payment gateway that bills the
     * subscription. Absent when no gateway bills it.
     */
    Gateway?: GatewayCancelSummary;
}

/** A later term cancelled alongside the affected one. */
export interface CanceledLaterTerm {
    SubscriptionTermID: string;
    TermNumber: number;
    Decision: CancellationDecisionResult;
}

/** One term's share of the cancellation: the row, and what the rules decided for it. */
interface TermCancellation {
    Term: TermRow;
    Decision: CancellationDecision;
}

interface TermRow {
    ID: string;
    SubscriptionID: string;
    TermNumber: number;
    OrderLineID: string;
    StartDate: string;
    EndDate: string;
    Amount: number;
    Status: string;
}

interface SubscriptionRow {
    ID: string;
    SubscriptionNumber: string;
    PaymentProviderID: string | null;
    ProviderSubscriptionID: string | null;
    CompanyID: string;
    SubscriptionTypeID: string;
    ProductID: string;
    Status: string;
    HolderOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
}

interface OrderLineRow {
    ID: string;
    OrderHeaderID: string;
    ProductID: string;
    Quantity: number;
}

/** The decision as it crosses the transport: dates as ISO strings, the form JSON gives a `Date`. */
function decisionResult(decision: CancellationDecision): CancellationDecisionResult {
    // `Coverage` is the message's building block, not part of the decision the caller reads.
    const { Coverage: _coverage, ...rest } = decision;
    return {
        ...rest,
        EffectiveDate: decision.EffectiveDate.toISOString(),
        AccessThroughDate: decision.AccessThroughDate.toISOString(),
    };
}

/**
 * The sentence for a term whose money a payment gateway's refund decided instead of the type's refund rule (D20). Built
 * from the decision's coverage half (`Coverage`), so it never states the type's figure ("does not refund, so what was
 * invoiced for it is kept") next to the gateway's ("599.00 is reversed"). Pure.
 *
 * Example (NoRefund type, term 2's $599 refunded in full at Stripe): "Term 2 starts 2027-01-01, after coverage ends
 * 2026-12-31, so it is canceled. The payment gateway charged this renewal (ch_t2) and refunded 599.00 of it. That
 * refund, not this subscription type's refund rule, is what is reversed: 599.00."
 */
export function GatewayRefundExplanation(
    decision: Pick<CancellationDecision, 'Explanation' | 'Coverage'>,
    credit: Pick<RenewalTermCredit, 'ChargeID' | 'Refunded' | 'Credited'>,
    reversed: number,
    held: number,
): string {
    const charged =
        `The payment gateway charged this renewal (${credit.ChargeID}) and refunded ${credit.Refunded.toFixed(2)} of it` +
        `${credit.Credited ? `, ${credit.Credited.toFixed(2)} of which Orders has already credited` : ''}.`;
    let money: string;
    if (held) {
        money = `What it refunded is reversed, not this subscription type's refund rule, but ${held.toFixed(2)} is held: too small to split off what is left of the line, so nothing is reversed now.`;
    } else if (!(credit.Refunded > 0)) {
        money = `The gateway kept the charge, so nothing is reversed: this subscription type's refund rule does not apply to money the gateway kept.`;
    } else {
        money = `That refund, not this subscription type's refund rule, is what is reversed: ${reversed.toFixed(2)}.`;
    }
    return `${decision.Coverage ?? decision.Explanation} ${charged} ${money}`;
}

/** A gateway charge that could not be read while deciding a term's credit: the cancel refuses rather than guess. */
class GatewayCreditReadError extends Error {
    constructor(termNumber: number, cause: unknown) {
        super(`Could not read what the payment gateway refunded of term ${termNumber}'s renewal (${cause instanceof Error ? cause.message : String(cause)}).`);
    }
}

@RegisterClass(BaseRemotableOperation, 'Orders.CancelSubscription')
export class CancelSubscriptionOperation extends OrdersCancelSubscriptionOperationBase {
    protected async InternalExecute(
        input: CancelSubscriptionInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<CancelSubscriptionOutput> {
        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireUUID(input.SubscriptionID, 'SubscriptionID');

        // The day the cancellation is REQUESTED for, as a calendar day (#209). `DecideCancellation`
        // reduces this with `utcDay`, and its `EffectiveDate` is written to three `date` columns —
        // `OrderHeader.OrderDate` on the reversal, `OrderLine.ServicePeriodStart`, and
        // `SubscriptionTerm.CancellationEffectiveDate` — as well as driving the refund proration.
        // An instant taken at 9 PM Eastern reduces to tomorrow, so an evening cancellation refunded
        // a day the customer had not reached yet. Computed before `BeginTransaction` below, so the
        // fallback's metadata read never lands inside the write transaction.
        // A day that arrived over the wire is text until something says otherwise, and the sibling
        // field three lines up is already validated here for the same reason. Without this,
        // `2026-02-30` passes the shape check inside `AsDateValue` and comes back as a `RangeError`
        // from a helper, not as this operation's own refusal. An invalid `Date` is refused too
        // (#272): `CalendarDayOrToday` would read it as no day and cancel as of today.
        let requestedDay: Date | string | null;
        try {
            requestedDay = RequireOptionalDay(input.RequestDate, 'RequestDate');
        } catch (e) {
            return { Success: false, Message: String((e as Error).message) };
        }

        // A timing outside the two the contract names would fall through to the type's rule, and
        // the caller would believe they had chosen something they had not.
        if (input.Timing != null && !CANCELLATION_TIMINGS.includes(input.Timing)) {
            return {
                Success: false,
                Message: `Timing must be one of ${CANCELLATION_TIMINGS.join(', ')}; got '${input.Timing}'.`,
            };
        }

        let requestDate = await CalendarDayOrToday(requestedDay, provider, user);
        // The business day now, to tell a cancel that ends access at once from one that ends it later. Taken
        // before the gateway path can move requestDate, so it is always the real day.
        const today = requestedDay == null ? requestDate : await CalendarDayOrToday(null, provider, user);

        const subscription = await this.loadSubscription(provider, user, input.SubscriptionID);
        if (!subscription) {
            return { Success: false, Message: `No subscription found with ID '${input.SubscriptionID}'.` };
        }
        if (subscription.Status === 'Canceled') {
            // Not an error worth throwing over — the caller asked for a state that already holds.
            return { Success: false, Message: `Subscription is already canceled.` };
        }

        const gatewayBilled = IsProviderBilled(subscription);

        // A gateway subscription Orders has not recorded, or a second one, would keep billing after a
        // cancel that stops only the one it knows. For a gateway-billed one, alerts that cannot be read
        // refuse too: "none" would be a guess about money still moving.
        const blocking = await CancelBlockingAlerts(subscription.SubscriptionNumber, user, provider);
        // Most blocking alerts are about ANOTHER gateway subscription that may be billing (NotRecorded, GatewayFault,
        // LinkedElsewhere, AmbiguousAtGateway, ChargedAtCreation): this subscription ending at the gateway proves
        // nothing about that one, so they always block, and so does an alert list that cannot be read. Only an
        // alert about THIS subscription's own money (RenewalNotBooked: a renewal it charged that Orders has not
        // booked) stops mattering once the gateway has ENDED it: recording that end (a duplicate "deleted" event,
        // the nightly sync finishing a cancel the gateway made) must not be blocked by it.
        const ownOnly = blocking.Codes.length > 0 && blocking.Codes.every((c) => OWN_SUBSCRIPTION_ALERT_CODES.includes(c));
        let earlyBilling: Awaited<ReturnType<typeof ReadGatewaySubscription>> | null = null;
        if (gatewayBilled && ownOnly && !blocking.ReadFailure) {
            earlyBilling = await ReadGatewaySubscription(
                { PaymentProviderID: subscription.PaymentProviderID, ProviderSubscriptionID: subscription.ProviderSubscriptionID! },
                provider,
                user,
            );
        }
        const endedAtGateway = !!earlyBilling?.Success && earlyBilling.State === 'Ended';
        if (blocking.ReadFailure && gatewayBilled) {
            return {
                Success: false,
                Message:
                    `Subscription ${subscription.SubscriptionNumber} is billed by the payment gateway, and its open gateway alerts ` +
                    `could not be checked (${blocking.ReadFailure}). Nothing was changed. Cancelling needs read access to Tasks; try again.`,
            };
        }
        if (blocking.Codes.length && !(ownOnly && endedAtGateway)) {
            return {
                Success: false,
                Message:
                    `Subscription ${subscription.SubscriptionNumber} has an open gateway alert (${blocking.Codes.join(', ')}): a gateway ` +
                    `subscription may be billing that this cancel cannot see. Resolve that Task at the gateway first, then cancel.`,
            };
        }

        const typeRules = await this.loadRules(provider, user, subscription.SubscriptionTypeID);
        if (!typeRules) {
            return {
                Success: false,
                Message: `Subscription type '${subscription.SubscriptionTypeID}' was not found.`,
            };
        }

        const openTerms = await this.loadOpenTerms(provider, user, subscription.ID);
        let term = this.resolveTerm(openTerms, requestDate);
        if (!term) {
            return {
                Success: false,
                Message: `Subscription has no term to cancel — nothing was ever booked against it.`,
            };
        }
        // The gateway first: it, not Orders, knows whether it already charged a period Orders has not booked
        // (it renews at 00:00 on a term's last day), or has already stopped.
        let zone: string | null = null;
        let gatewayStillBills = false;
        let gatewayEnded = false;
        if (gatewayBilled) {
            zone = await this.businessZone(provider, user);
            const billing =
                earlyBilling ??
                (await ReadGatewaySubscription(
                    { PaymentProviderID: subscription.PaymentProviderID, ProviderSubscriptionID: subscription.ProviderSubscriptionID! },
                    provider,
                    user,
                ));
            if (!billing.Success) {
                return {
                    Success: false,
                    Message: `Could not read ${subscription.ProviderSubscriptionID} at the payment gateway: ${billing.Reason ?? 'no reason given'}. Nothing was changed; try again.`,
                };
            }
            const latestLastDay = this.latestTermLastDay(openTerms);
            const gate = latestLastDay ? GateGatewayCancel(billing, latestLastDay, zone) : { Kind: 'Proceed' as const };
            if (gate.Kind === 'UnbookedPeriod') {
                return {
                    Success: false,
                    Message:
                        `Subscription ${subscription.SubscriptionNumber} is billed by the payment gateway (${subscription.ProviderSubscriptionID}), ` +
                        `which started a new billing period on ${gate.PeriodStart.toISOString()} that Orders has not booked: it charges ` +
                        `the renewal at 00:00 on the term's last day (${latestLastDay}). Cancelling here would stop it without refunding ` +
                        `that charge. Nothing was changed. At the gateway, cancel the subscription now and refund the renewal charge if ` +
                        `it was paid; then cancel here, and Orders records it.`,
                };
            }
            // Still billing: renewing (Proceed), or set to end at period end with nothing unbooked (Ending reads as
            // Finished for the gate, but the paid later term is still coverage the customer bought: D19 applies).
            gatewayStillBills = gate.Kind === 'Proceed' || (gate.Kind === 'Finished' && billing.State === 'Ending');
            gatewayEnded = billing.State === 'Ended';
            if (gate.Kind === 'Finished' && !this.coversOrPrecedes(openTerms, requestDate) && latestLastDay) {
                // Finishing a cancel the gateway already completed, after Orders' coverage ended: Orders
                // records it as ending with the coverage it sold, refunding nothing. Moving the request
                // day onto that coverage is also what keeps the year-2 refusal below from firing: the
                // gateway is not billing a renewal Orders has not booked, it has stopped.
                requestDate = new Date(`${latestLastDay}T00:00:00Z`);
                term = this.resolveTerm(openTerms, requestDate) ?? term;
            }
        }
        if (gatewayBilled && !this.coversOrPrecedes(openTerms, requestDate)) {
            // The gateway renewed it but no term for the new period is booked here, so the term found is
            // one already over: cancelling it would end access at once although the gateway was paid.
            return {
                Success: false,
                Message:
                    `Subscription ${subscription.SubscriptionNumber} is billed by the payment gateway (${subscription.ProviderSubscriptionID}), ` +
                    `and no open term covers ${requestDate.toISOString().slice(0, 10)}: the gateway's renewal is not booked in Orders yet. ` +
                    `Nothing was changed. Cancel it at the gateway, and in Orders once the renewal is booked.`,
            };
        }

        const behavior = this.behaviorFor(typeRules);
        const rules = behavior.RulesForTiming(typeRules, input.Timing);
        // END OF TERM, ON A SUBSCRIPTION THE GATEWAY STILL BILLS, IS THE END OF THE LATEST BOOKED TERM (Ethan,
        // 30 Oct, D19). Orders books a gateway term only once the gateway was paid for it (E4), so a later booked term
        // is coverage the customer has paid for, and the gateway's own "cancel at period end" ends with it. The
        // term covering the request day would instead end coverage a year early and cancel a paid term. Not for
        // a subscription Orders bills (a renewal it booked ahead may be unpaid, and cancelling out of it is the
        // point, #406/#560), and not when the gateway has already ended it (Orders then records the gateway's end).
        // Two limits (#989 review): only a term the gateway had CHARGED BY THE REQUEST DAY (a backdated request made
        // before the renewal keeps the term covering it and the type's refund rule), and never a term whose charge the
        // gateway has refunded IN FULL (that is not coverage the customer paid for; see `endOfTermOnGateway`).
        // The context below is the one access is ended from too (#987's EndsNow), so it carries the term actually
        // cancelled: end of term keeps access, a recorded gateway end on a past day ends it at once.
        const recording = gatewayEndRecorded.getStore();
        const covering = term;
        let refundedSkipped: { Term: TermRow; Credit: RenewalTermCredit }[] = [];
        if (gatewayStillBills && !recording && rules.CancellationMode === 'EndOfTerm') {
            const pick = await this.endOfTermOnGateway(subscription, term, openTerms, requestDate, provider, user);
            if ('Refusal' in pick) return { Success: false, Message: pick.Refusal };
            term = pick.Term;
            refundedSkipped = pick.Refunded;
        }
        // The open terms D19 rode past (before the one it ends with): they are served in full, so they are stamped
        // Completed at their own end, as the old rule stamped the term it ended with. Without this they kept Active
        // under a Canceled subscription (#989 review).
        const servedBefore = term.ID === covering.ID ? [] : openTerms.filter((t) => t.ID !== term.ID && new Date(t.StartDate).getTime() < new Date(term.StartDate).getTime());
        const cancellation = { Rules: rules, RequestDate: requestDate, Term: this.cancellableTerm(term) };
        let decision = behavior.DecideCancellation(cancellation);
        if (refundedSkipped.length) {
            const named = refundedSkipped
                .map((r) => `term ${r.Term.TermNumber} (renewal ${r.Credit.OrderNumber}, charge ${r.Credit.ChargeID})`)
                .join(' and ');
            decision = {
                ...decision,
                Explanation:
                    `${decision.Explanation} The payment gateway refunded ${named} in full, so it is not coverage the customer paid for: ` +
                    `the end of term is term ${term.TermNumber}'s (its own refund follows this subscription type's rule), and the ` +
                    `refunded term is cancelled, reversing what the gateway refunded and Orders has not already credited.`,
            };
        }

        // A later term would otherwise stay booked and billed after the subscription it belongs to
        // has ended (#406). One that starts on or before the effective date overlaps the cancelled
        // term's coverage and is not decided here.
        const laterRows = openTerms
            .filter((t) => t.ID !== term.ID && new Date(t.StartDate).getTime() > decision.EffectiveDate.getTime())
            .sort((a, b) => a.TermNumber - b.TermNumber);
        const later: TermCancellation[] = [];
        for (const t of laterRows) {
            const billing = await this.laterTermBilling(provider, user, t);
            const laterDecision = behavior.DecideLaterTermCancellation({
                Rules: rules,
                Term: this.cancellableTerm(t),
                CoverageEndsDate: decision.EffectiveDate,
                Billing: billing,
            });
            // Keeping what was invoiced means withdrawing only the instalments still to come, which
            // nothing books yet: the only path that withdraws them is a reversal of the whole term,
            // and that credits the invoiced part back too (#560).
            if (billing === 'PartInvoiced' && laterDecision.ReversalFraction === 0 && Number(t.Amount) > 0) {
                return {
                    Success: false,
                    Message:
                        `Term ${t.TermNumber} has been partly invoiced and this subscription type does not refund, so ` +
                        `its invoiced amount is kept and its remaining instalments would have to be withdrawn on their own. ` +
                        `That is not supported yet. Reverse the order line that sold the term instead.`,
                };
            }
            later.push({ Term: t, Decision: laterDecision });
        }
        // A REFUNDED GATEWAY RENEWAL REVERSES WHAT THE GATEWAY REFUNDED, ONCE (D20, one per-term rule). Each term the
        // gateway sold as a renewal reverses exactly what the gateway refunded of THAT term's own charge and Orders has
        // not already credited (`GatewayRenewalCreditFor`), never the type's refund rule: the gateway, not Orders, moved
        // the money, so the type's rule would leave the order owing or credit a refund a second time. It governs:
        //   · every renewal term, when the gateway has ENDED it (a person finishing it, or the sync recording it): a
        //     charge the gateway kept reverses nothing;
        //   · while the gateway still bills, a renewal whose charge the gateway HAS refunded (any of it): the one D19
        //     skipped, and equally one an Immediate or a backdated cancel ends (#989 review, Robert's question). A
        //     renewal the gateway has refunded nothing of follows the type's rule, as before.
        // A term Orders billed (not a gateway renewal: `GatewayRenewalCreditFor` is null) always follows the type's rule.
        //
        // Read here for the preview and the message, then READ AGAIN inside the transaction once the subscription is
        // locked (`recredit`): the refund door decides under that same lock, so a refund credited on another worker
        // meanwhile is seen and never credited twice.
        let recredit: (() => Promise<void>) | null = null;
        const skippedIDs = new Set(refundedSkipped.map((r) => r.Term.ID));
        /** The gateway's figure governs this term whatever it refunded (it ended the subscription, or D19 skipped the term). */
        const gatewayAlwaysRules = (t: TermRow): boolean => !!recording || gatewayEnded || skippedIDs.has(t.ID);
        if (gatewayBilled && [term, ...later.map((l) => l.Term)].some((t) => !!t.OrderLineID)) {
            const built = await gatewayDriver(
                { PaymentProviderID: subscription.PaymentProviderID, ProviderSubscriptionID: subscription.ProviderSubscriptionID! },
                provider,
                user,
            );
            if ('Reason' in built) return { Success: false, Message: `${built.Reason} Nothing was changed.` };
            // The gateway's refund per line, read once before the lock; the re-read under it reads only Orders' side.
            const gatewayRead = new Map<string, { ChargeID: string; Refunded: number }>();
            for (const r of refundedSkipped) gatewayRead.set(r.Term.OrderLineID, { ChargeID: r.Credit.ChargeID, Refunded: r.Credit.Refunded });
            const exact = async (t: TermRow, d: CancellationDecision): Promise<CancellationDecision> => {
                if (!t.OrderLineID) return d;
                let credit: RenewalTermCredit | null;
                try {
                    credit = await GatewayRenewalCreditFor(t.OrderLineID, built.Driver, provider, user, gatewayRead.get(t.OrderLineID));
                } catch (err) {
                    throw new GatewayCreditReadError(t.TermNumber, err);
                }
                if (!credit) return d;
                gatewayRead.set(t.OrderLineID, { ChargeID: credit.ChargeID, Refunded: credit.Refunded });
                if (!gatewayAlwaysRules(t) && !(credit.Refunded > 0)) return d;
                const amount = Math.max(Number(t.Amount), 0);
                let refund = Math.min(credit.Outstanding, amount);
                // Too small to split off what is left of the line (and not the credit that finishes it): held, never a
                // throw that would leave the gateway's end unrecorded. The refund that finishes the line credits it.
                const held = refund > 0 && (await GatewayCreditQuantity(credit, refund, provider, user)) === 0 ? refund : 0;
                if (held) refund = 0;
                const basis = { Paid: credit.Paid, Credited: credit.Credited };
                if (refund === d.RefundAmount && (refund > 0 || d.ReversalFraction === 0)) {
                    return { ...d, ReversalAmount: refund > 0 ? refund : undefined, ReversalBasis: basis };
                }
                return {
                    ...d,
                    RefundAmount: refund,
                    ReversalFraction: amount > 0 ? refund / amount : 0,
                    ReversalAmount: refund,
                    ReversalBasis: basis,
                    Explanation: GatewayRefundExplanation(d, credit, refund, held),
                };
            };
            const baseDecision = decision;
            const baseLater = later.map((l) => l.Decision);
            recredit = async () => {
                decision = await exact(term, baseDecision);
                for (const [i, l] of later.entries()) l.Decision = await exact(l.Term, baseLater[i]);
            };
            try {
                await recredit();
            } catch (err) {
                if (!(err instanceof GatewayCreditReadError)) throw err;
                return { Success: false, Message: `${err.message} Nothing was changed; try again.` };
            }
        }
        const summarize = () => {
            const laterTerms: CanceledLaterTerm[] = later.map((l) => ({
                SubscriptionTermID: l.Term.ID,
                TermNumber: l.Term.TermNumber,
                Decision: decisionResult(l.Decision),
            }));
            const totalRefund =
                Math.round((decision.RefundAmount + later.reduce((sum, l) => sum + l.Decision.RefundAmount, 0)) * 100) / 100;
            const message = [decision.Explanation, ...later.map((l) => l.Decision.Explanation)].join(' ');
            return { message, totalRefund, summary: { SubscriptionTermID: term.ID, LaterTerms: laterTerms, TotalRefundAmount: totalRefund } };
        };
        let { message, totalRefund, summary } = summarize();

        const gatewayPlan = zone ? PlanGatewayCancel(decision.EffectiveDate, BusinessToday(zone), zone) : null;

        if (input.Preview) {
            const gateway = gatewayPlan ? GatewayCancelPreview(subscription.ProviderSubscriptionID!, gatewayPlan) : undefined;
            return { Success: true, Decision: decisionResult(decision), ...summary, Message: message, Gateway: gateway };
        }

        // The gateway first: if it does not confirm, nothing is written here.
        let gateway: GatewayCancelSummary | undefined;
        if (gatewayPlan) {
            const atGateway = await CancelAtGateway(
                { ID: subscription.ID, PaymentProviderID: subscription.PaymentProviderID, ProviderSubscriptionID: subscription.ProviderSubscriptionID! },
                gatewayPlan,
                provider,
                user,
            );
            if (!atGateway.Success) {
                return { Success: false, Message: atGateway.Reason, Decision: decisionResult(decision), ...summary, Gateway: atGateway.Summary };
            }
            gateway = atGateway.Summary;
        }

        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            // Two cancels at once both passed the status check above, before the gateway round trip. Lock
            // the row and read it again: the second waits for the first to commit, then sees it cancelled
            // instead of booking a second credit memo.
            const lockedStatus = await this.lockSubscriptionStatus(provider, subscription.ID);
            if (lockedStatus !== subscription.Status) {
                await dbProvider.RollbackTransaction();
                return {
                    Success: false,
                    Message:
                        lockedStatus === 'Canceled'
                            ? `Subscription is already canceled.`
                            : `Subscription ${subscription.SubscriptionNumber} changed while it was being cancelled (now ${lockedStatus ?? 'missing'}). Nothing was recorded; try again.`,
                    Gateway: gateway,
                };
            }
            // The credit decided again under the lock (see `recredit`): what is booked is this, not the pre-lock read.
            if (recredit) {
                await recredit();
                ({ message, totalRefund, summary } = summarize());
            }
            const all: TermCancellation[] = [{ Term: term, Decision: decision }, ...later];
            const toReverse = all.filter((c) => c.Decision.ReversalFraction > 0);
            const reversal =
                toReverse.length > 0
                    ? await this.emitReversalOrder(provider, user, subscription, toReverse, decision.EffectiveDate, input.Reason)
                    : undefined;
            // A gateway refund's credit lands ON the renewal it refunds (D20, the credit-note model): the renewal then owes
            // nothing once the refund's cash is un-applied. The same step the refund door runs, under the same lock.
            if (recredit) {
                const credited = toReverse.filter((c) => c.Term.OrderLineID && c.Decision.ReversalAmount).map((c) => c.Term.OrderLineID!);
                // Every row first, in the one lock order, then the applications (each takes the payment-number lock).
                await LockGatewayCreditRows(credited, provider, user);
                for (const lineID of credited) await ApplyGatewayCredit(lineID, provider, user);
            }

            for (const c of all) {
                await this.stampTerm(provider, user, c.Term.ID, c.Decision);
            }
            for (const t of servedBefore) {
                const end = new Date(t.EndDate);
                await this.stampTerm(provider, user, t.ID, {
                    EffectiveDate: end,
                    AccessThroughDate: end,
                    RefundAmount: 0,
                    ReversalFraction: 0,
                    TermStatus: 'Completed',
                    Explanation: '',
                });
            }
            await this.stampSubscription(provider, user, subscription.ID, decision, !!gateway);
            await this.syncGrantsOnCancel(
                provider,
                user,
                subscription.ID,
                { AccessThroughDate: decision.AccessThroughDate, EndsNow: behavior.EndsAccessOnCancel(cancellation, decision, today) },
                input.Reason,
            );
            await this.logEvent(provider, user, subscription.ID, decision, later, totalRefund, input, reversal?.ID, gateway);

            await dbProvider.CommitTransaction();
            return {
                Success: true,
                Message: message,
                Decision: decisionResult(decision),
                ...summary,
                ReversalOrderID: reversal?.ID,
                ReversalOrderNumber: reversal?.Number,
                Gateway: gateway,
            };
        } catch (err) {
            LogError(`Orders.CancelSubscription failed for ${input.SubscriptionID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after CancelSubscription error: ${rollbackErr}`);
            }
            const reason = err instanceof Error ? err.message : String(err);
            if (gateway) {
                // The gateway already stopped billing; Orders did not record the cancel. No charge
                // follows (Orders never renews a gateway-billed subscription), but access and the books
                // still say active until the cancel is run again, which the gateway answers as done.
                await raiseProviderSubscriptionAlert(
                    {
                        SubscriptionID: subscription.ID,
                        SubscriptionNumber: subscription.SubscriptionNumber,
                        Code: 'CanceledAtGatewayOnly',
                        Reason:
                            `the gateway confirmed the cancel of ${gateway.ProviderSubscriptionID} (${gateway.Outcome}), but recording ` +
                            `the cancel in Orders failed (${reason}). Run Cancel subscription again to finish it.`,
                        Linked: true,
                    },
                    user,
                    provider,
                ).catch((alertErr) => LogError(`CancelSubscription: could not raise the gateway-only alert: ${alertErr}`));
            }
            return {
                Success: false,
                Message: gateway
                    ? `The payment gateway stopped billing ${gateway.ProviderSubscriptionID}, but recording the cancel in Orders failed: ${reason}. Run the cancel again to finish it.`
                    : reason,
                Decision: decisionResult(decision),
                SubscriptionTermID: term.ID,
                Gateway: gateway,
            };
        }
    }

    // ─── Reads ─────────────────────────────────────────────────────────────────

    private async loadSubscription(
        provider: IMetadataProvider,
        user: UserInfo,
        id: string,
    ): Promise<SubscriptionRow | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<SubscriptionRow>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `ID='${id}'`,
                Fields: [
                    'ID',
                    'SubscriptionNumber',
                    'PaymentProviderID',
                    'ProviderSubscriptionID',
                    'CompanyID',
                    'SubscriptionTypeID',
                    'ProductID',
                    'Status',
                    'HolderOrganizationID',
                    'BeneficiaryPersonID',
                ],
                ResultType: 'simple',
                // The caller may have just written this row; a cached read would decide policy on
                // stale status.
                BypassCache: true,
            },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    private async loadRules(
        provider: IMetadataProvider,
        user: UserInfo,
        typeID: string,
    ): Promise<SubscriptionTypeRules | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<SubscriptionTypeRules>(
            { EntityName: SUBSCRIPTION_TYPE_ENTITY, ExtraFilter: `ID='${typeID}'`, ResultType: 'simple' },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    /** The subscription's terms that are still open — Scheduled or Active — latest first. */
    private async loadOpenTerms(
        provider: IMetadataProvider,
        user: UserInfo,
        subscriptionID: string,
    ): Promise<TermRow[]> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<TermRow>(
            {
                EntityName: SUBSCRIPTION_TERM_ENTITY,
                ExtraFilter: `SubscriptionID='${subscriptionID}' AND Status IN ('Scheduled','Active')`,
                OrderBy: 'TermNumber DESC',
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return result?.Results ?? [];
    }

    /**
     * The subscription's status, read under an update lock that the caller's transaction holds until it
     * ends (the `GiftCardEngine` pattern), so concurrent cancels of one subscription run one at a time.
     */
    private async lockSubscriptionStatus(provider: IMetadataProvider, subscriptionID: string): Promise<string | null> {
        // The same lock the refund door takes (D20): one subscription's credits are decided one at a time.
        return LockSubscriptionForCredit(provider, subscriptionID);
    }

    /** The last covered day of the latest open term, or null when there is none. */
    private latestTermLastDay(terms: TermRow[]): CalendarDay | null {
        const days = terms.map((t) => ToCalendarDay(new Date(t.EndDate))).filter((d): d is CalendarDay => !!d);
        return days.sort().pop() ?? null;
    }

    /** True when an open term covers the request day or starts after it: the term found is not one already over. */
    private coversOrPrecedes(terms: TermRow[], requestDate: Date): boolean {
        const at = requestDate.getTime();
        return terms.some((t) => new Date(t.EndDate).getTime() >= at);
    }

    /** The business time zone. `Config(false, …)` is a no-op once the engine is loaded, so nothing is cached here. */
    private async businessZone(provider: IMetadataProvider, user: UserInfo): Promise<string> {
        await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
        return BusinessTimeZoneEngine.Instance.Zone;
    }

    /**
     * The term the request lands in. When the request falls outside every window: an early
     * cancellation acts on the next term to start, so every term after it is a later term and
     * none is left booked (#406); a late one, after everything lapsed, acts on the latest term.
     * Cancelling always has to act on SOMETHING for the reversal to point at.
     */
    /**
     * D19's pick: the term an end-of-term cancel ends with on a subscription the gateway still bills.
     *
     * The latest booked term AFTER the one covering the request day that (1) the gateway had charged by the request
     * day — it charges a renewal at 00:00 on the preceding term's last day, so a term starting the day after the
     * request at the latest — and (2) whose charge the gateway has not refunded in full (`IsGatewayChargeFullyRefunded`,
     * the figure the credit doors use). None qualifying: the term covering the request day, exactly as before D19.
     *
     * Examples (term 1 = 2026, term 2 = 2027, Stripe renewed at 00:00 Central on 31 Dec 2026):
     *   · cancel on 31 Dec 2026 → term 2 (paid; D19).
     *   · support records a request made on 10 Mar 2026 → term 1, term 2 cancelled under the type's refund rule.
     *   · term 2's $599 refunded in full at Stripe, cancel on 31 Dec 2026 → term 1; term 2 cancelled, reversing what
     *     the gateway refunded and Orders has not credited.
     * Only terms later than the covering one are read at the gateway (in practice one: a renewal is charged on the
     * covering term's last day). A gateway that cannot be read refuses the cancel: a guess here decides coverage.
     */
    private async endOfTermOnGateway(
        subscription: SubscriptionRow,
        covering: TermRow,
        openTerms: TermRow[],
        requestDate: Date,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<{ Term: TermRow; Refunded: { Term: TermRow; Credit: RenewalTermCredit }[] } | { Refusal: string }> {
        const DAY = 86_400_000;
        const start = (t: TermRow): number => new Date(t.StartDate).getTime();
        const chargedBy = requestDate.getTime() + DAY; // charged on the day before it starts, on or before the request day
        const candidates = openTerms
            .filter((t) => t.ID !== covering.ID && start(t) > start(covering) && start(t) <= chargedBy)
            .sort((a, b) => start(b) - start(a) || b.TermNumber - a.TermNumber);
        if (candidates.length === 0) return { Term: covering, Refunded: [] };
        const built = await gatewayDriver(
            { PaymentProviderID: subscription.PaymentProviderID, ProviderSubscriptionID: subscription.ProviderSubscriptionID! },
            provider,
            user,
        );
        if ('Reason' in built) return { Refusal: `${built.Reason} Nothing was changed.` };
        const refunded: { Term: TermRow; Credit: RenewalTermCredit }[] = [];
        for (const t of candidates) {
            let credit: RenewalTermCredit | null = null;
            if (t.OrderLineID) {
                try {
                    credit = await GatewayRenewalCreditFor(t.OrderLineID, built.Driver, provider, user);
                } catch (err) {
                    return {
                        Refusal:
                            `Could not read what the payment gateway refunded of term ${t.TermNumber}'s renewal ` +
                            `(${err instanceof Error ? err.message : String(err)}). Nothing was changed; try again.`,
                    };
                }
            }
            if (credit && IsGatewayChargeFullyRefunded(credit)) {
                refunded.push({ Term: t, Credit: credit });
                continue;
            }
            return { Term: t, Refunded: refunded };
        }
        return { Term: covering, Refunded: refunded };
    }

    private resolveTerm(terms: TermRow[], requestDate: Date): TermRow | null {
        if (terms.length === 0) return null;

        const at = requestDate.getTime();
        const covering = terms.find(
            (t) => new Date(t.StartDate).getTime() <= at && new Date(t.EndDate).getTime() >= at,
        );
        if (covering) return covering;
        const upcoming = terms
            .filter((t) => new Date(t.StartDate).getTime() > at)
            .sort((a, b) => new Date(a.StartDate).getTime() - new Date(b.StartDate).getTime());
        return upcoming[0] ?? terms[0];
    }

    /**
     * How much of a later term has been invoiced, read from the order that sold it (#560). An order
     * with no payment schedule was invoiced in full at confirm. On a scheduled one, an instalment
     * was invoiced when it carries a document number, which is frozen at invoicing.
     */
    private async laterTermBilling(provider: IMetadataProvider, user: UserInfo, term: TermRow): Promise<LaterTermBilling> {
        const context = await LoadReversalContext(term.OrderLineID, provider, user);
        // A missing line is read as nothing kept: the reversal then refuses it by name.
        if (!context) return 'NotInvoiced';
        if (!context.OriginScheduled) return 'Invoiced';
        const invoiced = context.ScheduleRows.some((r) => r.DocumentNumber);
        const toCome = InstalmentsToCancel(context.ScheduleRows).length > 0;
        if (!invoiced) return 'NotInvoiced';
        return toCome ? 'PartInvoiced' : 'Invoiced';
    }

    private cancellableTerm(term: TermRow): CancellableTerm {
        return {
            StartDate: new Date(term.StartDate),
            EndDate: new Date(term.EndDate),
            Amount: Number(term.Amount),
            TermNumber: term.TermNumber,
        };
    }

    // ─── Writes ────────────────────────────────────────────────────────────────

    /**
     * A reversal order carrying one line per reversed term: the negative slice of each original
     * purchase. One order, not one per term, so the lifecycle event links to a single document.
     *
     * It goes through the ordinary confirm path rather than writing journal entries directly, so the
     * mirrored ledger, the GL account resolution and the all-or-none guarantee are the SAME code
     * that booked the original. `ReversesOrderLineID` is what makes a negative quantity legal
     * (OrderLineEntityServer validates exactly that).
     */
    private async emitReversalOrder(
        provider: IMetadataProvider,
        user: UserInfo,
        subscription: SubscriptionRow,
        slices: TermCancellation[],
        orderDate: Date,
        reason?: string,
    ): Promise<{ ID: string; Number: string }> {
        const order = await provider.GetEntityObject<OrderEntityServer>(ORDER_HEADER_ENTITY, user);
        order.NewRecord();
        // 'Cancellation' — one of the CK_OrderHeader_OrderType values. There is no 'Reversal'
        // order type; reversal is what the negative LINE does, not what the order is called.
        order.OrderType = 'Cancellation';
        // Its lines may reverse a gateway-billed subscription's sale: this cancel already stopped the
        // gateway (E2b). A return made any other way is refused.
        SanctionCancellationReversal(order);
        order.OrderDate = orderDate;
        order.CompanyID = subscription.CompanyID;
        order.BillToOrganizationID = subscription.HolderOrganizationID;
        order.BillToPersonID = subscription.BeneficiaryPersonID;
        order.Notes = reason ? `Subscription cancellation: ${reason}` : 'Subscription cancellation';

        for (const [index, slice] of slices.entries()) {
            const { Line: line, OriginOrderHeaderID } = await this.reversalLine(provider, user, slice.Term, slice.Decision, index + 1);
            // The order that sold the first reversed term. The booking save takes the reversal's
            // addresses from it. Tax is mirrored per line from each term's own sale, so a reversal
            // spanning two orders still refunds each line's tax where it was collected.
            order.ReversesOrderHeaderID ??= OriginOrderHeaderID;
            // Attached rather than assigned: `Lines` is a RelatedRecordCollection on the generated
            // class, and `Add()` stamps OrderHeaderID and the LineNumber for us.
            order.Lines.Add(line);
        }
        order.Status = 'Confirmed';

        if (!(await order.Save())) {
            throw new Error(
                `Failed to book the reversal order: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return { ID: order.ID, Number: order.OrderNumber };
    }

    /** The negative slice of the line that bought `term`, as decided, and the order that sold it. */
    private async reversalLine(
        provider: IMetadataProvider,
        user: UserInfo,
        term: TermRow,
        decision: CancellationDecision,
        lineNumber: number,
    ): Promise<{ Line: mjBizAppsOrdersOrderLineEntity; OriginOrderHeaderID: string }> {
        const original = await this.loadOriginalLine(provider, user, term.OrderLineID);
        if (!original) {
            throw new Error(
                `The order line that bought term ${term.TermNumber} (${term.OrderLineID}) no longer exists, ` +
                    `so the cancellation cannot be reversed against it.`,
            );
        }

        // A PARTIAL TERM ON AN ORDER BILLED BY INSTALMENT, NOT YET (D92 §6). A partial reversal covers
        // only the rest of the term, from the effective date, while the credit memo and the releases
        // it mirrors are worked out against the origin's own window. Booked here they would disagree
        // by the months already earned. Refused, so nothing half-right reaches the ledger; reverse the
        // order line itself, which inherits the origin's window.
        //
        // A WHOLE TERM IS NOT REFUSED. A term that never started — a renewal booked ahead, which
        // since #305 always carries a one-row schedule — is reversed in full over its own window,
        // which is the origin line's. That is exactly an order-line return: booking credits what
        // was invoiced and, once the whole order is reversed, withdraws the instalments not yet
        // invoiced.
        const wholeTerm =
            decision.ReversalFraction >= 1 && decision.EffectiveDate.getTime() <= new Date(term.StartDate).getTime();
        const context = wholeTerm ? null : await LoadReversalContext(original.ID, provider, user);
        if (context?.OriginScheduled) {
            throw new Error(
                `Term ${term.TermNumber} was sold on order ${context.Origin.OrderNumber ?? original.OrderHeaderID}, ` +
                    `which is billed by instalment. Cancelling part of a term on an instalment-billed order is ` +
                    `not supported yet. Reverse the order line instead: that credits back what was billed and ` +
                    `not yet earned, and once the whole order is reversed it withdraws the instalments nobody was invoiced for.`,
            );
        }

        const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        // Orders writing its own line. An app that froze this line freezes what a PERSON
        // may change, not Orders closing its own books (#206 item 1).
        MarkAsOrdersOwnWrite(line);
        line.NewRecord();
        line.ProductID = original.ProductID;
        line.LineNumber = lineNumber;
        // A FRACTION OF THE ORIGINAL LINE, not of one unit. The purchased line may already carry a
        // prorated quantity (a short first period), so reversing `-fraction` flat would unwind more
        // than was ever sold. Rounded to the column's 4dp scale for the same reason the purchase
        // path rounds: an unrounded quantity is truncated on insert and the recomputed total then
        // disagrees with the stored one.
        // A gateway refund's exact figure (D20): the shared rule, so slices never sum past the line and a sub-cent
        // credit is still a line (its stated unit price below makes it exact).
        const reversalQuantity =
            decision.ReversalAmount != null && decision.ReversalAmount > 0
                ? CreditReversalQuantity({
                      Quantity: Math.max(Number(original.Quantity), 0),
                      AlreadyReversed: await ReversedQuantityOf(original.ID, provider, user),
                      Credit: decision.ReversalAmount,
                      Paid: decision.ReversalBasis?.Paid ?? Math.max(Number(term.Amount), 0),
                      Credited: decision.ReversalBasis?.Credited ?? 0,
                  })
                : Math.round(Number(original.Quantity) * decision.ReversalFraction * 1e4) / 1e4;
        if (!(reversalQuantity > 0)) {
            throw new Error(
                `The computed reversal (${decision.ReversalFraction} of quantity ${original.Quantity}) ` +
                    `rounds to zero, which is not a valid order line. Nothing can be reversed at this size.`,
            );
        }
        line.Quantity = -reversalQuantity;
        // NO PRICE SET HERE. The order save settles a reversal line's money from its origin, as it
        // does for any return: unit price, discount rate, the allocated discount and the exact
        // amount a Flat price booked (#651). Copying the unit price here left the exact amount
        // behind, and the cancellation credited quantity × unit price.
        line.ReversesOrderLineID = original.ID;
        // To the cent when the reversal must equal a gateway refund: the fraction above is rounded to 4dp, so the
        // unit price is STATED (a stated price is kept by the order save) such that quantity × price is the refund.
        if (decision.ReversalAmount != null && reversalQuantity !== 0) {
            line.UnitPrice = Math.round((decision.ReversalAmount / reversalQuantity) * 1e4) / 1e4;
        }
        line.ServicePeriodStart = decision.EffectiveDate;
        line.ServicePeriodEnd = new Date(term.EndDate);
        return { Line: line, OriginOrderHeaderID: original.OrderHeaderID };
    }

    private async loadOriginalLine(
        provider: IMetadataProvider,
        user: UserInfo,
        orderLineID: string,
    ): Promise<OrderLineRow | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<OrderLineRow>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `ID='${orderLineID}'`,
                Fields: ['ID', 'OrderHeaderID', 'ProductID', 'Quantity'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    private async stampTerm(
        provider: IMetadataProvider,
        user: UserInfo,
        termID: string,
        decision: CancellationDecision,
    ): Promise<void> {
        const term = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionTermEntity>(
            SUBSCRIPTION_TERM_ENTITY,
            CompositeKey.FromID(termID),
            user,
        );
        term.Status = decision.TermStatus;
        term.CanceledAt = new Date();
        term.CancellationEffectiveDate = decision.EffectiveDate;
        if (!(await term.Save())) {
            throw new Error(`Failed to stamp the term: ${term.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    private async stampSubscription(
        provider: IMetadataProvider,
        user: UserInfo,
        subscriptionID: string,
        decision: CancellationDecision,
        gatewayConfirmed: boolean,
    ): Promise<void> {
        const sub = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(
            SUBSCRIPTION_ENTITY,
            CompositeKey.FromID(subscriptionID),
            user,
        );
        // The one write the shared entity lets through on a gateway-billed subscription: the gateway
        // has confirmed it charges nothing after coverage ends.
        if (gatewayConfirmed) SanctionProviderBilledChange(sub);
        sub.Status = 'Canceled';
        sub.CanceledAt = new Date();
        // EndDate is the ACCESS date, not the revenue date — grace is exactly the window where the
        // customer still gets in but nothing more is earned.
        sub.EndDate = decision.AccessThroughDate;
        sub.AutoRenew = false;
        if (!(await sub.Save())) {
            throw new Error(
                `Failed to stamp the subscription: ${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    private async logEvent(
        provider: IMetadataProvider,
        user: UserInfo,
        subscriptionID: string,
        decision: CancellationDecision,
        later: TermCancellation[],
        totalRefund: number,
        input: CancelSubscriptionInput,
        reversalOrderID?: string,
        gateway?: GatewayCancelSummary,
    ): Promise<void> {
        const event = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, user);
        event.NewRecord();
        event.SubscriptionID = subscriptionID;
        event.EventType = 'Canceled';
        event.OccurredAt = new Date();
        event.RelatedOrderHeaderID = reversalOrderID ?? null;
        event.EventData = JSON.stringify({
            EffectiveDate: decision.EffectiveDate,
            AccessThroughDate: decision.AccessThroughDate,
            RefundAmount: decision.RefundAmount,
            ReversalFraction: decision.ReversalFraction,
            TermStatus: decision.TermStatus,
            Explanation: decision.Explanation,
            LaterTerms: later.map((l) => ({
                SubscriptionTermID: l.Term.ID,
                TermNumber: l.Term.TermNumber,
                RefundAmount: l.Decision.RefundAmount,
                ReversalFraction: l.Decision.ReversalFraction,
            })),
            TotalRefundAmount: totalRefund,
            // Which timing the person cancelling chose, so a reader can tell an override from the
            // type's own rule. Null when the type decided.
            Timing: input.Timing ?? null,
            Reason: input.Reason ?? null,
            // What the payment gateway did, when one bills it: the evidence that it stopped billing.
            Gateway: gateway ?? null,
        });
        if (!(await event.Save())) {
            throw new Error(
                `Failed to log the cancellation event: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /**
     * Stored grant Status is a lie after cancel unless we revoke when access has already
     * ended; access that ends later moves the term grants' end to it. `end.EndsNow` is this
     * operation's call (`SubscriptionBehavior.EndsAccessOnCancel`): only it knows the mode it applied.
     */
    private async syncGrantsOnCancel(
        provider: IMetadataProvider,
        user: UserInfo,
        subscriptionID: string,
        end: CancelAccessEnd,
        reason?: string,
    ): Promise<void> {
        await RevokeGrantsForCanceledSubscription(
            subscriptionID,
            end,
            reason ? `Subscription canceled: ${reason}` : 'Subscription canceled',
            provider,
            user,
        );
    }

    /** The base behaviour, or the type's registered subclass when it names one (D45). */
    private behaviorFor(rules: SubscriptionTypeRules): SubscriptionBehavior {
        if (!rules.DriverClass) return new SubscriptionBehavior();
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<SubscriptionBehavior>(
            SubscriptionBehavior,
            rules.DriverClass,
        );
        if (!driver) {
            throw new Error(
                `Subscription type '${rules.Code}' names driver '${rules.DriverClass}', which is not registered.`,
            );
        }
        return driver;
    }
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadCancelSubscriptionOperation(): void {
    // intentionally empty
}
