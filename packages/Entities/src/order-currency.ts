/**
 * The currency an order is contracted in, and when it may change (golive #492).
 *
 * An order's amounts are in its `CurrencyCode`; NULL means the selling company's functional
 * currency. The currency is part of what the customer agreed to, so it changes only while the order
 * is still being negotiated (Draft or Quoted) and never once it has been confirmed: the first
 * confirm stores the exchange rate the order books at, and every later conversion reads that rate.
 *
 * @module @mj-biz-apps/orders-entities
 */

import { IsEditable } from './OrderStatusBehavior';

/** Written only by the server's booking save. */
export const ORDER_BOOKING_RATE_FIELDS = ['BookingExchangeRate', 'BookingRateDate'] as const;

/**
 * Refusal for a change to a saved order's currency, or null when the change is allowed.
 *
 * @param facts.SavedStatus The status on disk before this save.
 * @param facts.WasConfirmed Whether the order was confirmed before this save (its `ConfirmedAt` on disk is set).
 */
export function CurrencyChangeRefusal(facts: { OrderNumber: string | null; SavedStatus: string | null; WasConfirmed: boolean }): string | null {
    if (!facts.WasConfirmed && IsEditable(facts.SavedStatus ?? '')) return null;
    const order = `Order ${facts.OrderNumber ?? ''}`.trimEnd();
    return facts.WasConfirmed
        ? `${order} has been confirmed, so its currency cannot change: it booked at the exchange rate of its currency on the day it was confirmed.`
        : `${order} is ${facts.SavedStatus}, so its currency cannot change. Only a Draft or Quoted order's currency can be changed.`;
}
