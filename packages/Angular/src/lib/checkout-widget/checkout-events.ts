/**
 * The DOM events the public checkout element dispatches for its host page (#294).
 *
 * Host pages track a checkout funnel — Google Tag Manager, GA4, their own scripts — by listening on
 * `<mj-orders-checkout>` or on `document`. Every event bubbles and is `composed`, so it crosses a
 * shadow root. These builders are the element's public contract, kept pure so it is testable.
 *
 * NO PERSONAL DATA IN ANY DETAIL. The events reach every script on the host page, so no detail
 * carries the buyer's e-mail, name or anything they typed beyond the promotion code.
 */

/** The element's state, as `checkout-state-change` reports it. */
export type CheckoutElementState = 'LOADING' | 'CHECKOUT' | 'PROCESSING' | 'PASSWORD' | 'SUCCESS' | 'ERROR';

export const CHECKOUT_STATE_CHANGE_EVENT = 'checkout-state-change';
export const CHECKOUT_COMPLETE_EVENT = 'checkout-complete';
export const CHECKOUT_ERROR_EVENT = 'checkout-error';
/** The buyer pressed Cancel; the form has been reset. */
export const CHECKOUT_CANCEL_EVENT = 'checkout-cancel';
/** The checkout asks its container to close, e.g. a modal on the host page. Sent with Cancel. */
export const CHECKOUT_CLOSED_EVENT = 'closed';

export interface CheckoutStateChangeDetail {
    state: CheckoutElementState;
}

/** The `checkout-complete` detail. Shaped for GA4: `amount` in major units, `currency` upper-case. */
export interface CheckoutCompleteDetail {
    sessionId: string;
    productName: string | null;
    productId: string | null;
    amount: number | null;
    currency: string | null;
    coupon: string | null;
}

export interface CheckoutErrorDetail {
    message: string;
}

export interface CheckoutCompleteSource {
    sessionId: string;
    productName?: unknown;
    productId?: unknown;
    /** The order's charged total from `/complete`, already in major units. */
    totalGross?: unknown;
    currency?: unknown;
    /** The promotion code the buyer applied, if any. */
    coupon?: unknown;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function BuildCheckoutCompleteDetail(source: CheckoutCompleteSource): CheckoutCompleteDetail {
    const amount = typeof source.totalGross === 'number' && Number.isFinite(source.totalGross) ? source.totalGross : null;
    const currency = text(source.currency);
    return {
        sessionId: source.sessionId,
        productName: text(source.productName),
        productId: text(source.productId),
        amount: amount === null ? null : Math.round(amount * 100) / 100,
        currency: currency === null ? null : currency.toUpperCase(),
        coupon: text(source.coupon),
    };
}

/** A bubbling, composed CustomEvent — the only shape the element dispatches. */
export function CheckoutElementEvent<T>(name: string, detail: T): CustomEvent<T> {
    return new CustomEvent<T>(name, { detail, bubbles: true, composed: true });
}
