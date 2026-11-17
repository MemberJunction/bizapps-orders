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

import { RequireUUID } from './sql-guards.js';

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
