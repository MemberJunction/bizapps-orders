/**
 * @fileoverview Which orders a person entered, read from `OrderHeader.Origin`.
 *
 * `Origin` defaults to `Direct`, which is every order entered by staff: the order screen, fast
 * entry, a deal closed in Sales, an API call. Checkout sets `Widget`, and an order created from a
 * provider's payment sets `ProviderPayment`; on those the prices come from the catalog or the
 * payment, not from a person.
 *
 * @module @mj-biz-apps/orders-entities
 */

/** The origin an order carries when nothing set one: entered by a person. */
export const HAND_ENTERED_ORDER_ORIGIN = 'Direct';

/** True when the order was entered by a person rather than created by checkout or a payment. */
export function IsHandEnteredOrigin(origin: string | null | undefined): boolean {
    const value = (origin ?? '').trim();
    return value === '' || value.toLowerCase() === HAND_ENTERED_ORDER_ORIGIN.toLowerCase();
}
