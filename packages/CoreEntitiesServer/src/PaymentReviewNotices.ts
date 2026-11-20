/**
 * One notice per external payment that newly needs a person (#1033).
 *
 * The poll re-decides every non-final payment on each pass, so a payment that waits for a person is
 * seen again every hour. Reporting that as a failed run told the job's owner about the same payments
 * every hour. Instead, a payment is announced once: on the pass that moves it INTO a waiting
 * disposition, or from one waiting disposition to another. The disposition the `ExternalPayment` row
 * held before the pass is the record of what was already announced, so no new column is needed.
 *
 * Delivery goes through MJ's `NotificationEngine` as the `Payment Needs Review` type (shipped in
 * `metadata/notification-types/`): in-app and email by default, and the recipient can change either
 * in their notification preferences. The engine writes the in-app row before it starts the email and
 * never lets a failed email undo it, so a host with no email provider still gets the in-app notice.
 *
 * Best-effort and never thrown: the payments are already recorded when this runs, and a notice that
 * cannot be sent is a log line, not a failed poll.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { LogError, type UserInfo } from '@memberjunction/core';
import { NotificationEngine, type SendNotificationParams } from '@memberjunction/notifications';
import type { ExternalPaymentDisposition, ExternalPaymentOutcome } from '@mj-biz-apps/orders-entities';

/** The `MJ: User Notification Types` name; the record ships in `metadata/notification-types/`. */
export const PAYMENT_NEEDS_REVIEW_NOTIFICATION_TYPE = 'Payment Needs Review';

/** Where a person acts on a waiting payment. */
export const PAYMENT_REVIEW_LOCATION = 'Orders → Receivables → Invoicing queue → Payment exceptions (the External Payments list)';

/** The dispositions that wait for a person. */
export type WaitingDisposition = Extract<ExternalPaymentDisposition, 'Unmatched' | 'Refused' | 'Reapplied' | 'ReversalNeeded'>;

const WHY: Record<WaitingDisposition, string> = {
    Unmatched: 'it could not be matched to invoices Orders issued, so nothing was recorded',
    Refused: 'recording it was refused, so nothing was recorded',
    Reapplied: 'it was re-applied to different invoices on the rail after it was recorded here, so the allocation here is out of date',
    ReversalNeeded: 'it was recorded here and then voided or refunded on the rail, so the recorded payment needs reversing',
};

export function IsWaitingDisposition(d: ExternalPaymentDisposition | null | undefined): d is WaitingDisposition {
    return d != null && Object.prototype.hasOwnProperty.call(WHY, d);
}

/**
 * Whether this pass moved the payment into a waiting disposition, or from one waiting disposition to
 * another. A payment still in the disposition its row already held was announced on an earlier pass.
 *
 * A payment the rail itself reports Unmatched (HubSpot, which cannot name a payment's deal yet) is
 * left out: every such payment is Unmatched by design, and the run already treats it as expected.
 */
export function IsNewlyWaiting(
    priorDisposition: ExternalPaymentDisposition | null | undefined,
    outcome: Pick<ExternalPaymentOutcome, 'Disposition'>,
    railReportedUnmatched: boolean,
): boolean {
    if (!IsWaitingDisposition(outcome.Disposition)) return false;
    if (outcome.Disposition === 'Unmatched' && railReportedUnmatched) return false;
    return priorDisposition !== outcome.Disposition;
}

/** A payment that newly needs a person, and the rail it came from. */
export interface PaymentReviewItem {
    Outcome: ExternalPaymentOutcome;
    RailName: string;
}

const amountText = (n: number): string => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The notification for one payment and one recipient. */
export function PaymentReviewNotification(item: PaymentReviewItem, userId: string): SendNotificationParams {
    const o = item.Outcome;
    const disposition = o.Disposition as WaitingDisposition;
    const why = WHY[disposition];
    const amount = amountText(o.Amount);
    return {
        userId,
        typeNameOrId: PAYMENT_NEEDS_REVIEW_NOTIFICATION_TYPE,
        title: `Payment ${o.ExternalPaymentRef} (${amount}) needs review`,
        message: `${item.RailName} payment ${o.ExternalPaymentRef} for ${amount} is ${disposition}: ${why}. ${o.Reason} Review it in ${PAYMENT_REVIEW_LOCATION}.`,
        resourceConfiguration: { type: 'ExternalPayment', paymentProviderId: o.PaymentProviderID, externalPaymentRef: o.ExternalPaymentRef },
        templateData: {
            PaymentRef: o.ExternalPaymentRef,
            Amount: amount,
            RailName: item.RailName,
            Disposition: disposition,
            Why: why,
            Reason: o.Reason,
            WhereToAct: PAYMENT_REVIEW_LOCATION,
        },
    };
}

/** The engine call, as a seam so specs need neither a database nor the engine. */
export type PaymentReviewSend = (params: SendNotificationParams, contextUser: UserInfo) => Promise<{ success: boolean; errors?: string[] }>;

async function sendThroughEngine(params: SendNotificationParams, contextUser: UserInfo): Promise<{ success: boolean; errors?: string[] }> {
    await NotificationEngine.Instance.Config(false, contextUser);
    return NotificationEngine.Instance.SendNotification(params, contextUser);
}

/**
 * Send one notice per item to each recipient. Never throws; each failure is logged and counted.
 * A send that returns `success: false` (for example a host not yet seeded with the type) counts as failed.
 */
export async function SendPaymentReviewNotices(
    items: readonly PaymentReviewItem[],
    recipientUserIDs: readonly string[],
    contextUser: UserInfo,
    send: PaymentReviewSend = sendThroughEngine,
): Promise<{ Sent: number; Failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const item of items) {
        for (const userId of recipientUserIDs) {
            const ref = item.Outcome.ExternalPaymentRef;
            try {
                const result = await send(PaymentReviewNotification(item, userId), contextUser);
                if (result.success) {
                    sent++;
                } else {
                    failed++;
                    LogError(`Orders.PollExternalPayments: the review notice for payment ${ref} was not sent: ${(result.errors ?? []).join('; ') || 'no reason given'}`);
                }
            } catch (err) {
                failed++;
                LogError(`Orders.PollExternalPayments: the review notice for payment ${ref} failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    return { Sent: sent, Failed: failed };
}
