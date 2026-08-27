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

export function formatStripeError(error: { code?: string; message?: string } | null | undefined): string {
    const msg = error?.message?.trim() || 'Payment failed.';
    const code = error?.code?.trim();
    return code && !msg.includes(code) ? `${msg} (${code})` : msg;
}
