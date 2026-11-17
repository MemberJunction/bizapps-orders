/**
 * @fileoverview The exchange rate an order in a foreign currency books at (golive #492).
 *
 * An order's amounts are in its `CurrencyCode`; NULL means the selling company's functional
 * currency. When an order in another currency is first confirmed, the spot rate from that currency
 * to the functional one, on the confirm day or the latest day before it, is stored on the order with
 * its date. Everything later that converts the order's amounts uses that one rate, so the ledger and
 * the order never disagree about what the sale was worth.
 *
 * No rate, no confirm: an order booked without one would have no defensible functional amount, and
 * guessing one (a stale rate, 1.0) books revenue nobody can trace.
 *
 * The rates are finance's `CurrencySpotRate` rows in accounting, read here with a view. Accounting
 * is adding a spot-rate lookup helper; once it publishes, `LoadSpotRate` can call it instead.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';

import { PostingCurrencyOf, type PostingCurrency } from './OrderCurrencyPosting.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_HEADER_ENTITY_NAME = 'MJ_BizApps_Orders: Order Headers';

export const ACCOUNTING_COMPANY_PROFILE_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
export const CURRENCY_SPOT_RATE_ENTITY = 'MJ_BizApps_Accounting: Currency Spot Rates';

/** A spot rate: units of the functional currency per one unit of the order's currency, on `RateDate`. */
export interface SpotRateFacts {
    Rate: number;
    /** `YYYY-MM-DD`. */
    RateDate: string;
}

export type BookingRateDecision =
    /** The order is in its company's functional currency: no rate is stored. */
    | { Kind: 'Functional' }
    | { Kind: 'Rate'; Rate: number; RateDate: string }
    | { Kind: 'Refused'; Message: string };

/** Upper-cased and trimmed, or null when blank. Currency codes are stored upper-case (CK_Currency_Code). */
export function NormalizeCurrencyCode(code: string | null | undefined): string | null {
    const trimmed = (code ?? '').trim().toUpperCase();
    return trimmed.length ? trimmed : null;
}

/**
 * Decide what the confirm stores, from facts already read.
 *
 * @param input.OrderCurrency The order's `CurrencyCode`; null means functional.
 * @param input.FunctionalCurrency The selling company's functional currency; null when it has no accounting profile.
 * @param input.ConfirmDay The business day of the confirm, `YYYY-MM-DD`.
 * @param input.SpotRate The latest active rate from the order's currency to the functional one on or before that day.
 */
export function DecideBookingRate(input: {
    OrderNumber: string | null;
    OrderCurrency: string | null;
    FunctionalCurrency: string | null;
    ConfirmDay: string;
    SpotRate: SpotRateFacts | null;
}): BookingRateDecision {
    const order = `Order ${input.OrderNumber ?? ''}`.replace(/\s+$/, '');
    const currency = NormalizeCurrencyCode(input.OrderCurrency);
    if (!currency) return { Kind: 'Functional' };

    const functional = NormalizeCurrencyCode(input.FunctionalCurrency);
    if (!functional) {
        return {
            Kind: 'Refused',
            Message:
                `${order} is in ${currency}, but its selling company has no functional currency set in its accounting profile, ` +
                `so there is nothing to convert it to. Set the company's functional currency before confirming.`,
        };
    }
    if (currency === functional) return { Kind: 'Functional' };

    const rate = input.SpotRate;
    if (!rate || !(Number(rate.Rate) > 0)) {
        return {
            Kind: 'Refused',
            Message:
                `${order} cannot be confirmed: no ${currency} to ${functional} exchange rate is recorded on or before ${input.ConfirmDay}. ` +
                `Enter the rate in Accounting's currency spot rates, then confirm again.`,
        };
    }
    return { Kind: 'Rate', Rate: Number(rate.Rate), RateDate: rate.RateDate };
}

/** The selling company's functional currency, from its accounting profile (which shares the company's ID). */
export async function LoadFunctionalCurrency(companyID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<{ FunctionalCurrencyCode: string | null }>(
        {
            EntityName: ACCOUNTING_COMPANY_PROFILE_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(companyID, 'CompanyID')}'`,
            Fields: ['FunctionalCurrencyCode'],
            ResultType: 'simple',
        },
        user,
    );
    if (!result.Success) throw new Error(`Could not read the selling company's accounting profile: ${result.ErrorMessage ?? 'unknown error'}`);
    return NormalizeCurrencyCode(result.Results?.[0]?.FunctionalCurrencyCode);
}

/**
 * The latest active spot rate from `fromCode` to `toCode` on or before `day`.
 *
 * Two sources can record a rate for the same day; the source name breaks the tie, so the answer
 * is the same on every read.
 */
export async function LoadSpotRate(
    fromCode: string,
    toCode: string,
    day: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<SpotRateFacts | null> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a day: ${day}`);
    const result = await RunView.FromMetadataProvider(provider).RunView<{ Rate: number | string; RateDate: string | Date }>(
        {
            EntityName: CURRENCY_SPOT_RATE_ENTITY,
            ExtraFilter:
                `FromCurrencyCode = '${EscapeSQLString(fromCode)}' AND ToCurrencyCode = '${EscapeSQLString(toCode)}' ` +
                `AND RateDate <= '${day}' AND IsActive = 1`,
            OrderBy: 'RateDate DESC, Source',
            Fields: ['Rate', 'RateDate'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        user,
    );
    if (!result.Success) throw new Error(`Could not read exchange rates: ${result.ErrorMessage ?? 'unknown error'}`);
    const row = result.Results?.[0];
    if (!row) return null;
    const rateDate = row.RateDate instanceof Date ? row.RateDate.toISOString().slice(0, 10) : String(row.RateDate).slice(0, 10);
    return { Rate: Number(row.Rate), RateDate: rateDate };
}

/** Read what the confirm needs and decide. An order with no currency of its own reads nothing. */
export async function ResolveBookingRate(
    input: { OrderNumber: string | null; CurrencyCode: string | null; CompanyID: string | null; ConfirmDay: string },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<BookingRateDecision> {
    const currency = NormalizeCurrencyCode(input.CurrencyCode);
    if (!currency) return { Kind: 'Functional' };
    const functional = input.CompanyID ? await LoadFunctionalCurrency(input.CompanyID, provider, user) : null;
    const spotRate = functional && functional !== currency ? await LoadSpotRate(currency, functional, input.ConfirmDay, provider, user) : null;
    return DecideBookingRate({
        OrderNumber: input.OrderNumber,
        OrderCurrency: currency,
        FunctionalCurrency: functional,
        ConfirmDay: input.ConfirmDay,
        SpotRate: spotRate,
    });
}

/**
 * The posting currency of a booked order: its currency and booking rate, or null for an order in
 * functional currency. Read by the acts that post against an order after it was booked (term moves,
 * amount changes, instalment invoices), which convert at the rate its confirm stored.
 */
export async function LoadPostingCurrency(orderHeaderID: string, provider: IMetadataProvider, user: UserInfo): Promise<PostingCurrency | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<{ CurrencyCode: string | null; BookingExchangeRate: number | null }>(
        {
            EntityName: ORDER_HEADER_ENTITY_NAME,
            ExtraFilter: `ID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            Fields: ['CurrencyCode', 'BookingExchangeRate'],
            ResultType: 'simple',
        },
        user,
    );
    if (!result.Success) throw new Error(`Could not read the order's currency: ${result.ErrorMessage ?? 'unknown error'}`);
    const row = result.Results?.[0];
    if (!row) throw new Error(`Order ${orderHeaderID} was not found, so its currency cannot be read.`);
    return PostingCurrencyOf(row);
}

// ─── Reversals keep the currency and rate of what they reverse ─────────────────────────────────

/** The currency facts of an order a reversal line points back to. */
export interface ReversalOriginCurrency {
    OrderNumber: string | null;
    CurrencyCode: string | null;
    BookingExchangeRate: number | null;
    /** `YYYY-MM-DD`, or null with no rate. */
    BookingRateDate: string | null;
}

export type ReversalCurrencyDecision =
    /** No line reverses anything: the order takes its own rate. */
    | { Kind: 'None' }
    | { Kind: 'Inherit'; CurrencyCode: string | null; Rate: number | null; RateDate: string | null }
    | { Kind: 'Refused'; Message: string };

/**
 * The currency and booking rate of an order whose lines reverse lines of other orders (a return, a
 * credit memo, a gateway refund's credit).
 *
 * A reversal gives back what the origin booked, so it is in the origin's currency at the origin's
 * rate: the mirrored entries then take back exactly the functional amounts the origin posted, and
 * the credit memo prints in the currency the customer was invoiced in. Reading today's spot rate
 * instead would book the return at a different value than the sale, with nothing to say why.
 *
 * Refused when the order states another currency than its origin's, or when its lines reverse
 * orders in different currencies or at different rates: one order has one rate.
 */
export function DecideReversalCurrency(
    order: { OrderNumber: string | null; CurrencyCode: string | null },
    origins: ReversalOriginCurrency[],
): ReversalCurrencyDecision {
    if (origins.length === 0) return { Kind: 'None' };
    const label = `Order ${order.OrderNumber ?? ''}`.trimEnd();
    const describe = (o: ReversalOriginCurrency) =>
        o.BookingExchangeRate == null
            ? `${NormalizeCurrencyCode(o.CurrencyCode) ?? 'the functional currency'}`
            : `${NormalizeCurrencyCode(o.CurrencyCode)} at ${Number(o.BookingExchangeRate)}`;
    const distinct = new Map<string, ReversalOriginCurrency>();
    for (const o of origins) {
        const key = o.BookingExchangeRate == null ? 'functional' : `${NormalizeCurrencyCode(o.CurrencyCode)}@${Number(o.BookingExchangeRate)}`;
        if (!distinct.has(key)) distinct.set(key, o);
    }
    if (distinct.size > 1) {
        return {
            Kind: 'Refused',
            Message:
                `${label} reverses lines of orders booked in different currencies or at different rates ` +
                `(${[...distinct.values()].map(describe).join('; ')}). Reverse each order's lines on an order of their own.`,
        };
    }
    const origin = [...distinct.values()][0];
    const originCode = NormalizeCurrencyCode(origin.CurrencyCode);
    const stated = NormalizeCurrencyCode(order.CurrencyCode);
    if (stated && stated !== originCode) {
        return {
            Kind: 'Refused',
            Message:
                `${label} is in ${stated}, but it reverses order ${origin.OrderNumber ?? ''}, which is in ` +
                `${originCode ?? 'the functional currency'}. A reversal is in the currency of the order it reverses.`,
        };
    }
    if (origin.BookingExchangeRate == null) return { Kind: 'Inherit', CurrencyCode: originCode, Rate: null, RateDate: null };
    return { Kind: 'Inherit', CurrencyCode: originCode, Rate: Number(origin.BookingExchangeRate), RateDate: origin.BookingRateDate };
}

/** The currency facts of the orders `reversedLineIDs` belong to, one row per order. */
export async function LoadReversalOrigins(
    reversedLineIDs: string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ReversalOriginCurrency[]> {
    if (reversedLineIDs.length === 0) return [];
    const rv = RunView.FromMetadataProvider(provider);
    const ids = [...new Set(reversedLineIDs.map((id) => RequireUUID(id, 'ReversesOrderLineID').toLowerCase()))];
    const lines = await rv.RunView<{ OrderHeaderID: string }>(
        {
            EntityName: 'MJ_BizApps_Orders: Order Lines',
            ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(', ')})`,
            Fields: ['OrderHeaderID'],
            ResultType: 'simple',
        },
        user,
    );
    if (!lines.Success) throw new Error(`Could not read the lines being reversed: ${lines.ErrorMessage ?? 'unknown error'}`);
    const orderIDs = [...new Set((lines.Results ?? []).map((l) => RequireUUID(l.OrderHeaderID, 'OrderHeaderID').toLowerCase()))];
    if (orderIDs.length === 0) return [];
    const orders = await rv.RunView<{ OrderNumber: string | null; CurrencyCode: string | null; BookingExchangeRate: number | null; BookingRateDate: string | Date | null }>(
        {
            EntityName: ORDER_HEADER_ENTITY_NAME,
            ExtraFilter: `ID IN (${orderIDs.map((id) => `'${id}'`).join(', ')})`,
            Fields: ['OrderNumber', 'CurrencyCode', 'BookingExchangeRate', 'BookingRateDate'],
            ResultType: 'simple',
        },
        user,
    );
    if (!orders.Success) throw new Error(`Could not read the orders being reversed: ${orders.ErrorMessage ?? 'unknown error'}`);
    return (orders.Results ?? []).map((o) => ({
        OrderNumber: o.OrderNumber,
        CurrencyCode: o.CurrencyCode,
        BookingExchangeRate: o.BookingExchangeRate == null ? null : Number(o.BookingExchangeRate),
        BookingRateDate:
            o.BookingRateDate == null
                ? null
                : o.BookingRateDate instanceof Date
                  ? o.BookingRateDate.toISOString().slice(0, 10)
                  : String(o.BookingRateDate).slice(0, 10),
    }));
}
