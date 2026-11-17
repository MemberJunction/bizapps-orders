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

// ── Amounts from several orders ──────────────────────────────────────────────────────────────────

/** The order facts that decide what one unit of its amounts is worth in the functional currency. */
export interface OrderCurrencyFacts {
    /** The order's contract currency; null or blank means the selling company's functional currency. */
    CurrencyCode?: string | null;
    /** Functional currency per one unit of `CurrencyCode`, stored when the order was first confirmed. */
    BookingExchangeRate?: number | string | null;
}

/** Upper-cased and trimmed, or null when blank. */
function currencyOf(code: string | null | undefined): string | null {
    const trimmed = (code ?? '').trim().toUpperCase();
    return trimmed.length ? trimmed : null;
}

/**
 * The currency to print beside an order's amounts, or null when they are in the functional currency
 * and print as they always have (golive #492).
 *
 * @param functionalCurrency The selling company's functional currency, when the caller knows it. An
 *   order whose code equals it is a functional-currency order and shows no code.
 */
export function ForeignCurrencyOf(order: OrderCurrencyFacts, functionalCurrency?: string | null): string | null {
    const code = currencyOf(order.CurrencyCode);
    if (!code) return null;
    return code === currencyOf(functionalCurrency) ? null : code;
}

/**
 * Units of the functional currency per one unit of the order's amounts, or null when that is not
 * known yet (golive #492).
 *
 * 1 for an order in the functional currency. For an order in another currency, its booking rate,
 * which exists once the order has been confirmed. A foreign order not yet confirmed has no rate, and
 * no rate is guessed: adding its amounts as if they were functional would overstate or understate a
 * total by the exchange rate.
 */
export function FunctionalRateOf(order: OrderCurrencyFacts, functionalCurrency?: string | null): number | null {
    if (!ForeignCurrencyOf(order, functionalCurrency)) return 1;
    const rate = Number(order.BookingExchangeRate ?? NaN);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** An amount of an order in the functional currency, to the cent; null when the order has no rate yet. */
export function ToFunctionalAmount(
    amount: number | null | undefined,
    order: OrderCurrencyFacts,
    functionalCurrency?: string | null,
): number | null {
    const rate = FunctionalRateOf(order, functionalCurrency);
    if (rate === null) return null;
    return Math.round((Number(amount ?? 0) * rate + Number.EPSILON) * 100) / 100;
}

/** A sum of amounts from several orders, in the functional currency, and what it had to leave out. */
export interface FunctionalTotal {
    /** The functional-currency total of every order that could be converted, to the cent. */
    Total: number;
    /** Orders left out because they are in a foreign currency and have no booking rate yet. */
    Unconverted: number;
    /** The currencies of the orders left out, sorted. */
    UnconvertedCurrencies: string[];
}

/**
 * Sum one amount across several orders in the functional currency (golive #492).
 *
 * Each order's amount is converted at its own booking rate. An order with no rate yet is left out
 * and counted in `Unconverted`, so a screen can say the total is incomplete instead of adding foreign
 * amounts as if they were functional.
 *
 * @param amountOf The amount to add for one order, in the order's own currency.
 * @param functionalOf The selling company's functional currency for one order, when known.
 */
export function SumInFunctional<T extends OrderCurrencyFacts>(
    orders: readonly T[],
    amountOf: (order: T) => number | null | undefined,
    functionalOf?: (order: T) => string | null | undefined,
): FunctionalTotal {
    let cents = 0;
    let unconverted = 0;
    const currencies = new Set<string>();
    for (const order of orders) {
        const functional = functionalOf?.(order) ?? null;
        const amount = ToFunctionalAmount(amountOf(order), order, functional);
        if (amount === null) {
            unconverted++;
            const code = ForeignCurrencyOf(order, functional);
            if (code) currencies.add(code);
            continue;
        }
        cents += Math.round(amount * 100);
    }
    return { Total: cents / 100, Unconverted: unconverted, UnconvertedCurrencies: [...currencies].sort() };
}

/**
 * The sentence a screen shows under a total that left orders out, or null when it left none out.
 *
 * @example
 * UnconvertedNote({ Total: 100, Unconverted: 2, UnconvertedCurrencies: ['AUD'] })
 * // 'Leaves out 2 AUD orders with no exchange rate yet'
 */
export function UnconvertedNote(total: Pick<FunctionalTotal, 'Unconverted' | 'UnconvertedCurrencies'>): string | null {
    if (!total.Unconverted) return null;
    const currencies = total.UnconvertedCurrencies.length ? `${total.UnconvertedCurrencies.join('/')} ` : '';
    const noun = total.Unconverted === 1 ? 'order' : 'orders';
    return `Leaves out ${total.Unconverted} ${currencies}${noun} with no exchange rate yet`;
}
