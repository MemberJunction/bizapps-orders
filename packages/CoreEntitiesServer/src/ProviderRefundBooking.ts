/**
 * Booking a refund the gateway reports, so a refund made in Stripe is not missing from Orders' books
 * (#476).
 *
 * Refunds are made in the gateway's dashboard: nothing in Orders sends one, so `Orders.RefundPayment`
 * only ran when somebody remembered to record the refund by hand. Missed, the payment stayed captured
 * and the order stayed paid after the money had gone back.
 *
 * WHAT HAPPENS ON `charge.refunded`. The event carries the charge's CUMULATIVE refunded amount. That
 * is compared with the refunds Orders already holds against the payment, and only the difference is
 * booked — so a refund somebody already recorded by hand is never booked twice, and a redelivered or
 * out-of-order event books nothing.
 *
 * WHICH REFUNDS. The gateway's refunds for the charge are listed (current Stripe API versions do not
 * embed them in the charge). A refund Orders already holds is matched by its refund id, or — for one
 * recorded by hand without an id — by amount. What is left is booked one refund at a time through
 * `Orders.RefundPayment`, with its refund id, so every guard that operation has (captured only, never
 * more than captured, partial refunds accumulate) applies here too.
 *
 * WHAT GOES TO FINANCE INSTEAD. Anything that cannot be booked that way is raised as a
 * `PROVIDER_REFUND_NOT_BOOKED` finance exception: the payment is not captured or does not exist, the
 * gateway reports less refunded than Orders holds, the unmatched refunds do not add up to the
 * difference, or `Orders.RefundPayment` refused. The money has already left, so the answer is never
 * to ignore it.
 *
 * A REFUND IS A CONCESSION, NOT A CANCELLATION. Booking it does not cancel a subscription or remove
 * access; only a bank return or a return of goods does that (`EntitlementBehavior`). The reversal is
 * written with `ReversalSource = 'Refund'` by `Orders.RefundPayment`, as for one recorded by hand.
 *
 * CONNECTS TO:
 *   ROUTE:     ./PaymentWebhookHandler.ts — runs this before the event is stamped on the intent
 *   BOOKING:   ./RefundPaymentOperation.ts
 *   REVIEW:    ./AccountingBridge.ts — finance exceptions
 *   DRIVER:    ./BasePaymentProvider.ts `ListRefunds`
 */
import {
    LogError,
    LogStatus,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { ToISODate } from '@mj-biz-apps/orders-entities';
import {
    GetActiveFinanceExceptionType,
    RaiseFinanceExceptions,
    type FinanceExceptionToRaise,
} from './AccountingBridge.js';
import type { BasePaymentProvider, GatewayRefund, WebhookEvent } from './BasePaymentProvider.js';
import { CalendarDayOrToday } from './calendar-day.js';
import { RefundPaymentOperation, type RefundPaymentOutput } from './RefundPaymentOperation.js';
import { EscapeSQLString } from './sql-guards.js';

export const PROVIDER_REFUND_NOT_BOOKED_TYPE_CODE = 'PROVIDER_REFUND_NOT_BOOKED';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';

const money = (v: number): number => Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;

/** A refund Orders already holds against the payment. */
export interface HeldRefund {
    Amount: number;
    ProviderRefundID: string | null;
}

/** What to do about the difference between the gateway's refunded total and Orders'. */
export type RefundBookingPlan =
    | { Action: 'None'; Reason: string }
    | { Action: 'Book'; Refunds: GatewayRefund[]; Difference: number }
    | { Action: 'Review'; Reason: string; Difference: number };

/**
 * Decide what to book, from facts alone.
 *
 * @param gatewayRefundedTotal the charge's cumulative refunded amount, major units
 * @param paymentStatus        `PaymentHeader.Status` of the captured payment, or null when there is none
 * @param capturedAmount       that payment's `Amount`
 * @param held                 the refunds Orders holds against it (`ReversalSource = 'Refund'`)
 * @param gatewayRefunds       the gateway's refunds for the charge; failed and canceled ones excluded
 */
export function PlanProviderRefundBooking(input: {
    GatewayRefundedTotal: number;
    PaymentStatus: string | null;
    CapturedAmount: number;
    Held: HeldRefund[];
    GatewayRefunds: GatewayRefund[];
}): RefundBookingPlan {
    const heldTotal = money(input.Held.reduce((sum, r) => sum + Math.abs(r.Amount), 0));
    const difference = money(input.GatewayRefundedTotal - heldTotal);

    if (difference === 0) {
        return { Action: 'None', Reason: `Orders already holds the ${heldTotal} the gateway reports refunded.` };
    }
    if (difference < 0) {
        return {
            Action: 'Review',
            Difference: difference,
            Reason:
                `Orders holds ${heldTotal} of refunds against this payment but the gateway reports only ` +
                `${money(input.GatewayRefundedTotal)} refunded.`,
        };
    }
    if (input.PaymentStatus !== 'Captured') {
        return {
            Action: 'Review',
            Difference: difference,
            Reason: input.PaymentStatus
                ? `The gateway refunded ${difference} but the payment is ${input.PaymentStatus}, not Captured, so it cannot be refunded in Orders.`
                : `The gateway refunded ${difference} but Orders has no captured payment for this charge.`,
        };
    }
    if (money(input.GatewayRefundedTotal) > money(input.CapturedAmount)) {
        return {
            Action: 'Review',
            Difference: difference,
            Reason:
                `The gateway reports ${money(input.GatewayRefundedTotal)} refunded, more than the ` +
                `${money(input.CapturedAmount)} Orders captured.`,
        };
    }

    const unmatched = UnmatchedGatewayRefunds(input.Held, input.GatewayRefunds);
    const unmatchedTotal = money(unmatched.reduce((sum, r) => sum + r.Amount, 0));
    if (unmatchedTotal !== difference) {
        return {
            Action: 'Review',
            Difference: difference,
            Reason:
                `The gateway refunded ${difference} more than Orders holds, but its refunds that Orders ` +
                `has not recorded add up to ${unmatchedTotal}` +
                (unmatched.length ? ` (${unmatched.map((r) => `${r.ProviderRefundID} ${r.Amount}`).join(', ')})` : '') +
                `, so which refunds to book is unclear.`,
        };
    }
    return { Action: 'Book', Refunds: unmatched, Difference: difference };
}

/**
 * The gateway's refunds Orders does not hold yet, oldest first.
 *
 * A held refund with an id claims the gateway refund with that id. One recorded by hand without an id
 * claims the oldest unclaimed gateway refund of the same amount — the only fact it carries.
 */
export function UnmatchedGatewayRefunds(held: HeldRefund[], gatewayRefunds: GatewayRefund[]): GatewayRefund[] {
    const remaining = [...gatewayRefunds].sort((a, b) => (a.CreatedAt?.getTime() ?? 0) - (b.CreatedAt?.getTime() ?? 0));
    const ids = new Set(held.map((h) => h.ProviderRefundID).filter((id): id is string => !!id));
    const unclaimed = remaining.filter((r) => !ids.has(r.ProviderRefundID));
    for (const hand of held.filter((h) => !h.ProviderRefundID)) {
        const index = unclaimed.findIndex((r) => money(r.Amount) === money(Math.abs(hand.Amount)));
        if (index >= 0) unclaimed.splice(index, 1);
    }
    return unclaimed;
}

/** The captured payment an intent's charge was booked as. */
interface CapturedPayment {
    ID: string;
    PaymentNumber: string;
    ReceivingCompanyID: string;
    Amount: number;
    Status: string;
    ProviderChargeID: string | null;
}

export interface ProviderRefundOutcome {
    Booked: Array<{ ProviderRefundID: string; Amount: number; RefundPaymentNumber?: string }>;
    /** Set when a finance exception was raised (or would have been, had the type been active). */
    ReviewReason?: string;
}

/**
 * Bring Orders' refunds for this charge level with what the gateway reports.
 *
 * @throws when the gateway cannot be read or the review cannot be raised — the caller answers 500 so
 *         the gateway redelivers, and the difference-based plan makes the retry safe.
 */
export async function BookProviderRefunds(
    event: WebhookEvent,
    paymentIntentID: string,
    driver: BasePaymentProvider,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ProviderRefundOutcome> {
    const outcome: ProviderRefundOutcome = { Booked: [] };
    const gatewayTotal = money(event.Amount ?? 0);
    const payment = await loadCapturedPayment(paymentIntentID, event.ProviderChargeID, provider, user);
    const held = payment ? await loadHeldRefunds(payment.ID, provider, user) : [];

    // Listing the gateway's refunds is a network call, so it is skipped when the totals already agree.
    let gatewayRefunds: GatewayRefund[] = [];
    const heldTotal = money(held.reduce((sum, r) => sum + Math.abs(r.Amount), 0));
    if (gatewayTotal !== heldTotal && payment?.Status === 'Captured' && event.ProviderChargeID) {
        const listed = await driver.ListRefunds({ ProviderChargeID: event.ProviderChargeID });
        if (!listed.Success) {
            throw new Error(`Could not list the gateway's refunds for charge ${event.ProviderChargeID}: ${listed.Reason}`);
        }
        gatewayRefunds = (listed.Refunds ?? []).filter((r) => r.Status !== 'failed' && r.Status !== 'canceled');
    }

    const plan = PlanProviderRefundBooking({
        GatewayRefundedTotal: gatewayTotal,
        PaymentStatus: payment?.Status ?? null,
        CapturedAmount: payment?.Amount ?? 0,
        Held: held,
        GatewayRefunds: gatewayRefunds,
    });

    if (plan.Action === 'None') {
        LogStatus(`Refund event ${event.EventID}: ${plan.Reason}`);
        return outcome;
    }

    let reviewReason = plan.Action === 'Review' ? plan.Reason : undefined;
    if (plan.Action === 'Book' && payment) {
        for (const refund of plan.Refunds) {
            const booked = await bookOne(payment, refund, provider, user);
            if (!booked.Success) {
                const remaining = money(plan.Difference - outcome.Booked.reduce((s, b) => s + b.Amount, 0));
                reviewReason =
                    `Orders.RefundPayment refused gateway refund ${refund.ProviderRefundID} of ${refund.Amount} ` +
                    `on payment ${payment.PaymentNumber}: ${booked.Message ?? 'no reason given'}. ` +
                    `${remaining} of the gateway's refunds is not booked.`;
                break;
            }
            outcome.Booked.push({
                ProviderRefundID: refund.ProviderRefundID,
                Amount: refund.Amount,
                RefundPaymentNumber: booked.RefundPaymentNumber,
            });
            LogStatus(
                `Booked gateway refund ${refund.ProviderRefundID} of ${refund.Amount} on payment ` +
                    `${payment.PaymentNumber} as ${booked.RefundPaymentNumber ?? 'a refund'}.`,
            );
        }
    }

    if (reviewReason) {
        outcome.ReviewReason = reviewReason;
        const difference = plan.Action === 'Book' || plan.Action === 'Review' ? plan.Difference : 0;
        await raiseReview(event, paymentIntentID, payment, driver, difference, reviewReason, provider, user);
    }
    return outcome;
}

async function bookOne(
    payment: CapturedPayment,
    refund: GatewayRefund,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RefundPaymentOutput> {
    const result = await new RefundPaymentOperation().ExecuteServer(
        {
            PaymentHeaderID: payment.ID,
            Amount: refund.Amount,
            ProviderRefundID: refund.ProviderRefundID,
            Reason: `Refunded at the payment gateway (${refund.ProviderRefundID}).`,
        },
        { provider, user, emitProgress: () => undefined },
    );
    if (!result.Success || !result.Output) {
        return { Success: false, Message: result.ErrorMessage ?? 'Orders.RefundPayment returned no result.' };
    }
    return result.Output;
}

async function raiseReview(
    event: WebhookEvent,
    paymentIntentID: string,
    payment: CapturedPayment | null,
    driver: BasePaymentProvider,
    difference: number,
    reason: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    LogError(`Gateway refund on charge ${event.ProviderChargeID ?? '(none)'} not booked: ${reason}`);
    const type = await GetActiveFinanceExceptionType(PROVIDER_REFUND_NOT_BOOKED_TYPE_CODE, provider, user);
    if (!type) return;

    const exceptionDate = ToISODate(await CalendarDayOrToday(undefined, provider, user)) as string;
    const exception: FinanceExceptionToRaise = {
        TypeCode: PROVIDER_REFUND_NOT_BOOKED_TYPE_CODE,
        SourceEntityName: payment ? PAYMENT_HEADER_ENTITY : PAYMENT_INTENT_ENTITY,
        SourceRecordID: payment?.ID ?? paymentIntentID,
        CompanyID: payment?.ReceivingCompanyID ?? driver.Config.CompanyID,
        Amount: Math.abs(difference),
        ExceptionDate: exceptionDate,
        Summary:
            `Refund at the gateway on charge ${event.ProviderChargeID ?? '(unknown)'}` +
            `${payment ? ` (payment ${payment.PaymentNumber})` : ''} was not booked: ${reason}`,
        // The cumulative refunded total, so a later partial refund on the same charge raises again
        // while a redelivery of this one does not.
        DedupeKey: `${event.ProviderChargeID ?? paymentIntentID}|${money(event.Amount ?? 0)}`,
        SourceCreatedByUserID: null,
        CreatorUnresolved: false,
    };
    await RaiseFinanceExceptions([exception], 'a gateway refund that could not be booked', provider, user);
}

/**
 * The captured payment this charge was booked as. Prefers the row carrying the event's charge id; an
 * intent normally has one payment, and a reversal is never the answer.
 */
async function loadCapturedPayment(
    paymentIntentID: string,
    providerChargeID: string | undefined,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<CapturedPayment | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<CapturedPayment>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter: `PaymentIntentID = '${EscapeSQLString(paymentIntentID)}' AND ReversesPaymentHeaderID IS NULL`,
            Fields: ['ID', 'PaymentNumber', 'ReceivingCompanyID', 'Amount', 'Status', 'ProviderChargeID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!result.Success) throw new Error(`Could not read the payment for intent ${paymentIntentID}: ${result.ErrorMessage}`);
    const rows = result.Results ?? [];
    return (
        rows.find((r) => providerChargeID && r.ProviderChargeID === providerChargeID) ??
        rows.find((r) => r.Status === 'Captured') ??
        rows[0] ??
        null
    );
}

/** Refunds already booked against the payment. A bank return is not a refund and is not counted. */
async function loadHeldRefunds(paymentID: string, provider: IMetadataProvider, user: UserInfo): Promise<HeldRefund[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<HeldRefund>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter:
                `ReversesPaymentHeaderID = '${EscapeSQLString(paymentID)}' AND Status = 'Refunded' ` +
                `AND ReversalSource = 'Refund'`,
            Fields: ['Amount', 'ProviderRefundID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!result.Success) throw new Error(`Could not read the refunds held against payment ${paymentID}: ${result.ErrorMessage}`);
    return (result.Results ?? []).map((r) => ({ Amount: Number(r.Amount ?? 0), ProviderRefundID: r.ProviderRefundID ?? null }));
}
