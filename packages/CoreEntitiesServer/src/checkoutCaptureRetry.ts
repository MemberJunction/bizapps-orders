/**
 * Classify a failed checkout CapturePayment as terminal vs transient so the
 * payment webhook 500s (Stripe retries) only when a later attempt might work.
 *
 * Unclassified defaults to transient: convergence matters more than tidiness,
 * and the event-age bound makes that bias affordable.
 */
import type { WebhookEvent } from './BasePaymentProvider.js';

/** Stripe retries ~3 days; stop 500ing well inside that envelope. */
export const CHECKOUT_CAPTURE_RETRY_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Grep / alert marker when a settled checkout payment will never book on retry. */
export const CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER = '[CHECKOUT-CAPTURE-TERMINAL]';

/**
 * CapturePayment `Blockers[].Code` values that will not change on replay.
 * `CaptureFailed` is deliberately absent — it wraps a thrown save-path error.
 */
export const TERMINAL_CAPTURE_BLOCKER_CODES: ReadonlySet<string> = new Set([
    'BadCompanyID',
    'BadPaymentIntentID',
    'BadPayerID',
    'BadOrderID',
    'NonPositiveAmount',
    'NonPositiveAllocation',
    'NoAllocations',
    'AllocationMismatch',
    'PayerAmbiguous',
    'OrderNotFound',
    'PaymentNotFound',
    'UnknownTender',
    'ReversalTender',
    'OrderCompanyMismatch',
]);

export const TERMINAL_CAPTURE_PRECHECKS: ReadonlySet<string> = new Set([
    'no bill-to party',
    'payment intent not found',
    'no context user',
]);

export function isTerminalCapturePrecheck(message: string): boolean {
    return TERMINAL_CAPTURE_PRECHECKS.has(message);
}

/** True when a later CapturePayment might succeed. Empty / unknown codes retry. */
export function isCaptureRefusalRetryable(blockerCodes: readonly string[]): boolean {
    if (!blockerCodes.length) {
        return true;
    }
    return blockerCodes.some((code) => !TERMINAL_CAPTURE_BLOCKER_CODES.has(code));
}

/**
 * Missing OccurredAt does NOT disable retries (the bound cannot be applied, and
 * that is logged by the caller). Present-and-older-than-window → stop 500ing.
 */
export function webhookEventExceedsRetryWindow(
    event: Pick<WebhookEvent, 'OccurredAt'>,
    nowMs: number = Date.now(),
    windowMs: number = CHECKOUT_CAPTURE_RETRY_WINDOW_MS,
): boolean {
    if (!event.OccurredAt) {
        return false;
    }
    return nowMs - event.OccurredAt.getTime() > windowMs;
}
