import type { CheckoutSubmissionEvent } from './checkout-widget.component';

/**
 * Maps a widget submission onto the anonymous draft line.
 * Extension payloads are the introspected field maps from ProductType.OrderLineExtensionEntity
 * (any companion entity — Event Order Lines is only one example). No product-type-specific keys.
 */
export function buildCheckoutDraftLine(
    productId: string,
    event: CheckoutSubmissionEvent
): Record<string, unknown> {
    const line: Record<string, unknown> = {
        ProductID: productId,
        Quantity: event.quantity,
    };
    const fields = event.extensionData?.fields;
    const units = event.extensionData?.units;
    if ((fields && Object.keys(fields).length > 0) || (units && units.length > 0)) {
        line.ExtensionData = {
            EntityName: event.extensionData?.entityName,
            Fields: fields,
            Units: units,
        };
    }
    return line;
}

/** Gateway already collected — skip Stripe.js confirm and go straight to complete. */
export function intentAlreadyCollected(status: unknown): boolean {
    const s = String(status ?? '').toLowerCase();
    return s === 'succeeded';
}

/**
 * Stripe.js "A processing error occurred." on a retried Pay is usually
 * `payment_intent_unexpected_state`: the PI was already confirmed (first attempt
 * succeeded at Stripe, complete then failed locally). Treat as already paid and
 * let complete retrieve status from the gateway.
 */
export function stripeConfirmAlreadyCollected(error: { code?: string; message?: string; decline_code?: string } | null | undefined): boolean {
    const code = String(error?.code ?? '').toLowerCase();
    const msg = String(error?.message ?? '').toLowerCase();
    if (code === 'payment_intent_unexpected_state') {
        return true;
    }
    return msg.includes('already succeeded') || msg.includes('already been confirmed') || msg.includes('already been captured');
}

/**
 * Buyer-facing text for a failed Stripe confirmation: the gateway's message only.
 * The error code is for support, and the host logs the full error to the console.
 */
export function formatStripeError(error: { message?: string } | null | undefined): string {
    return error?.message?.trim() || 'Payment failed.';
}

/**
 * The notice to stop on before payment when a member token earned no discount (#324), or null to
 * carry on. Shown once: the buyer sees why the price is the standard rate, and submitting again
 * pays it. A buyer with no token, or whose discount applied, never stops here.
 */
export function memberDiscountNotice(draft: Record<string, unknown> | null | undefined, alreadyShown: boolean): string | null {
    const message = draft?.['MemberDiscountMessage'];
    if (alreadyShown || typeof message !== 'string' || !message) {
        return null;
    }
    return `${message} Submit again to continue at the standard rate.`;
}
