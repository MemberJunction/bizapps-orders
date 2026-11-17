import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The exchange rate an order in a foreign currency books at (golive #492).
 *
 * The confirm reads the selling company's functional currency and the latest spot rate on or before
 * the confirm day, and stores the rate with its date; no rate refuses the confirm. `RunView` is
 * mocked by entity name, and the business day is fixed, so what is under test is what the confirm
 * does with the rows. `Object.create` holds the server entity without metadata, as the sibling
 * tests do.
 */

const mocks = vi.hoisted(() => ({
    profiles: [] as Array<{ FunctionalCurrencyCode: string | null }>,
    rates: [] as Array<{ Rate: number; RateDate: string }>,
    rateFilters: [] as string[],
    originLines: [] as Array<{ OrderHeaderID: string }>,
    savedReversals: [] as Array<{ ReversesOrderLineID: string }>,
    originOrders: [] as Array<{ OrderNumber: string; CurrencyCode: string | null; BookingExchangeRate: number | null; BookingRateDate: string | null }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            static FromMetadataProvider() {
                return {
                    RunView: (params: { EntityName: string; ExtraFilter: string }) => {
                        if (params.EntityName.endsWith('Accounting Company Profiles')) {
                            return Promise.resolve({ Success: true, Results: mocks.profiles });
                        }
                        if (params.EntityName.endsWith('Order Lines')) {
                            if (params.ExtraFilter.includes('ReversesOrderLineID IS NOT NULL')) {
                                return Promise.resolve({ Success: true, Results: mocks.savedReversals });
                            }
                            return Promise.resolve({ Success: true, Results: mocks.originLines });
                        }
                        if (params.EntityName.endsWith('Order Headers')) {
                            return Promise.resolve({ Success: true, Results: mocks.originOrders });
                        }
                        if (params.EntityName.endsWith('Currency Spot Rates')) {
                            mocks.rateFilters.push(params.ExtraFilter);
                            return Promise.resolve({ Success: true, Results: mocks.rates });
                        }
                        return Promise.resolve({ Success: false, Results: [], ErrorMessage: `unexpected ${params.EntityName}` });
                    },
                };
            }
        },
    };
});

vi.mock('../PaymentGatedAccess.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../PaymentGatedAccess.js')>()),
    BusinessDay: () => Promise.resolve('2026-11-17'),
}));

import type { BaseEntityResult } from '@memberjunction/core';
import { OrderEntityServer } from '../OrderEntityServer.js';
import { DecideBookingRate } from '../OrderBookingRate.js';

const COMPANY = 'a1b2c3d4-0000-4000-8000-000000000001';

type Confirmable = {
    passesBookingRate(): Promise<boolean>;
    BookingExchangeRate: number | null;
    BookingRateDate: Date | null;
};

function order(currency: string | null, reverses: string[] = [], id: string | null = null): { order: Confirmable; refusals: string[] } {
    const refusals: string[] = [];
    const o = Object.create(OrderEntityServer.prototype) as Confirmable;
    const define = (name: string, value: unknown) => Object.defineProperty(o, name, { value, writable: true, configurable: true });
    define('OrderNumber', 'ORD-1');
    define('ID', id);
    define('CurrencyCode', currency);
    define('CompanyID', COMPANY);
    define('IsSaved', true);
    define('Fields', []);
    define('ProviderToUse', {});
    define('ContextCurrentUser', { ID: 'user' });
    define('BookingExchangeRate', null);
    define('BookingRateDate', null);
    define('Lines', { Items: reverses.map((id) => ({ ReversesOrderLineID: id })) });
    define('RegisterResultHistoryEntry', (r: BaseEntityResult) => refusals.push(r.Message));
    return { order: o, refusals };
}

beforeEach(() => {
    mocks.profiles = [{ FunctionalCurrencyCode: 'USD' }];
    mocks.rates = [];
    mocks.rateFilters = [];
    mocks.originLines = [];
    mocks.originOrders = [];
    mocks.savedReversals = [];
});

describe('confirming an order in a foreign currency', () => {
    it('stores the latest spot rate on or before the confirm day, with its date', async () => {
        mocks.rates = [{ Rate: 0.6512, RateDate: '2026-11-14' }];
        const { order: o, refusals } = order('AUD');

        expect(await o.passesBookingRate()).toBe(true);
        expect(refusals).toEqual([]);
        expect(o.BookingExchangeRate).toBe(0.6512);
        expect(o.BookingRateDate?.toISOString().slice(0, 10)).toBe('2026-11-14');
        // foreign to functional, on or before the confirm day
        expect(mocks.rateFilters[0]).toContain("FromCurrencyCode = 'AUD'");
        expect(mocks.rateFilters[0]).toContain("ToCurrencyCode = 'USD'");
        expect(mocks.rateFilters[0]).toContain("RateDate <= '2026-11-17'");
    });

    it('refuses the confirm without a rate, naming the currency and the day', async () => {
        const { order: o, refusals } = order('AUD');

        expect(await o.passesBookingRate()).toBe(false);
        expect(refusals).toHaveLength(1);
        expect(refusals[0]).toContain('AUD to USD');
        expect(refusals[0]).toContain('2026-11-17');
        expect(o.BookingExchangeRate).toBeNull();
        expect(o.BookingRateDate).toBeNull();
    });

    it('stores no rate for an order in the functional currency, and reads none', async () => {
        const { order: o } = order('usd');
        o.BookingExchangeRate = 2;
        o.BookingRateDate = new Date('2026-01-01T00:00:00Z');

        expect(await o.passesBookingRate()).toBe(true);
        expect(o.BookingExchangeRate).toBeNull();
        expect(o.BookingRateDate).toBeNull();
        expect(mocks.rateFilters).toEqual([]);
    });

    it('stores no rate for an order with no currency of its own', async () => {
        const { order: o } = order(null);
        expect(await o.passesBookingRate()).toBe(true);
        expect(o.BookingExchangeRate).toBeNull();
    });
});

describe('DecideBookingRate', () => {
    const base = { OrderNumber: 'ORD-1', ConfirmDay: '2026-11-17', SpotRate: null };

    it('refuses a foreign currency when the selling company has no functional currency', () => {
        const decision = DecideBookingRate({ ...base, OrderCurrency: 'AUD', FunctionalCurrency: null });
        expect(decision.Kind).toBe('Refused');
    });

    it('treats a non-positive rate as no rate', () => {
        const decision = DecideBookingRate({ ...base, OrderCurrency: 'AUD', FunctionalCurrency: 'USD', SpotRate: { Rate: 0, RateDate: '2026-11-17' } });
        expect(decision.Kind).toBe('Refused');
    });
});

describe('confirming a reversal of an order in a foreign currency', () => {
    const ORIGIN_LINE = 'a1b2c3d4-0000-4000-8000-0000000000aa';
    const ORIGIN_ORDER = 'a1b2c3d4-0000-4000-8000-0000000000bb';

    it('takes the origin currency and booking rate, and reads no spot rate', async () => {
        mocks.originLines = [{ OrderHeaderID: ORIGIN_ORDER }];
        mocks.originOrders = [{ OrderNumber: 'ORD-0', CurrencyCode: 'AUD', BookingExchangeRate: 0.6543, BookingRateDate: '2026-10-01' }];
        mocks.rates = [{ Rate: 0.7, RateDate: '2026-11-14' }];
        const { order: o, refusals } = order(null, [ORIGIN_LINE]);

        expect(await o.passesBookingRate()).toBe(true);
        expect(refusals).toEqual([]);
        expect((o as unknown as { CurrencyCode: string }).CurrencyCode).toBe('AUD');
        expect(o.BookingExchangeRate).toBe(0.6543);
        expect(o.BookingRateDate?.toISOString().slice(0, 10)).toBe('2026-10-01');
        expect(mocks.rateFilters).toEqual([]);
    });

    it('reads what a saved draft reverses when its lines are not loaded', async () => {
        mocks.savedReversals = [{ ReversesOrderLineID: ORIGIN_LINE }];
        mocks.originLines = [{ OrderHeaderID: ORIGIN_ORDER }];
        mocks.originOrders = [{ OrderNumber: 'ORD-0', CurrencyCode: 'AUD', BookingExchangeRate: 0.6543, BookingRateDate: '2026-10-01' }];
        mocks.rates = [{ Rate: 0.7, RateDate: '2026-11-14' }];
        const { order: o } = order(null, [], 'a1b2c3d4-0000-4000-8000-0000000000cc');

        expect(await o.passesBookingRate()).toBe(true);
        expect(o.BookingExchangeRate).toBe(0.6543);
    });

    it('refuses a reversal stated in a different currency from its origin', async () => {
        mocks.originLines = [{ OrderHeaderID: ORIGIN_ORDER }];
        mocks.originOrders = [{ OrderNumber: 'ORD-0', CurrencyCode: 'AUD', BookingExchangeRate: 0.6543, BookingRateDate: '2026-10-01' }];
        const { order: o, refusals } = order('GBP', [ORIGIN_LINE]);

        expect(await o.passesBookingRate()).toBe(false);
        expect(refusals[0]).toContain('A reversal is in the currency of the order it reverses');
    });
});
