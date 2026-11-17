/**
 * Totals across several orders are in the functional currency (golive #492): each order converts at
 * its own booking rate, and a foreign order with no rate yet is left out and counted, never added as
 * if its amounts were functional.
 */
import { describe, expect, it } from 'vitest';
import { ForeignCurrencyOf, FunctionalRateOf, SumInFunctional, ToFunctionalAmount, UnconvertedNote } from '../order-currency';

const functional = { CurrencyCode: null, BookingExchangeRate: null };
const audBooked = { CurrencyCode: 'AUD', BookingExchangeRate: 0.65 };
const audDraft = { CurrencyCode: 'AUD', BookingExchangeRate: null };

describe('ForeignCurrencyOf', () => {
    it('is null for an order in the functional currency', () => {
        expect(ForeignCurrencyOf(functional)).toBeNull();
        expect(ForeignCurrencyOf({ CurrencyCode: '  ' })).toBeNull();
    });

    it('is the code for a foreign order, normalized', () => {
        expect(ForeignCurrencyOf({ CurrencyCode: ' aud ' })).toBe('AUD');
    });

    it('is null when the code names the company functional currency', () => {
        expect(ForeignCurrencyOf({ CurrencyCode: 'USD' }, 'usd')).toBeNull();
        expect(ForeignCurrencyOf({ CurrencyCode: 'USD' }, 'EUR')).toBe('USD');
    });
});

describe('FunctionalRateOf and ToFunctionalAmount', () => {
    it('is 1 for a functional order and the booking rate for a booked foreign one', () => {
        expect(FunctionalRateOf(functional)).toBe(1);
        expect(FunctionalRateOf(audBooked)).toBe(0.65);
        expect(FunctionalRateOf({ CurrencyCode: 'AUD', BookingExchangeRate: '0.65000000' })).toBe(0.65);
    });

    it('is null for a foreign order with no rate yet', () => {
        expect(FunctionalRateOf(audDraft)).toBeNull();
        expect(ToFunctionalAmount(100, audDraft)).toBeNull();
    });

    it('treats an order coded in its functional currency as functional even without a rate', () => {
        expect(FunctionalRateOf({ CurrencyCode: 'USD', BookingExchangeRate: null }, 'USD')).toBe(1);
    });

    it('converts to the cent', () => {
        expect(ToFunctionalAmount(13230, audBooked)).toBe(8599.5);
        expect(ToFunctionalAmount(10.01, { CurrencyCode: 'AUD', BookingExchangeRate: 0.333 })).toBe(3.33);
        expect(ToFunctionalAmount(null, functional)).toBe(0);
    });
});

describe('SumInFunctional', () => {
    it('adds functional amounts as they are and foreign ones at their own rate', () => {
        const total = SumInFunctional([
            { ...functional, Amount: 100 },
            { ...audBooked, Amount: 200 },
            { CurrencyCode: 'EUR', BookingExchangeRate: 1.1, Amount: 10 },
        ], (o) => o.Amount);
        expect(total).toEqual({ Total: 241, Unconverted: 0, UnconvertedCurrencies: [] });
    });

    it('leaves out a foreign order with no rate and says which currencies', () => {
        const total = SumInFunctional([
            { ...functional, Amount: 100 },
            { ...audDraft, Amount: 5000 },
            { CurrencyCode: 'eur', BookingExchangeRate: null, Amount: 7 },
            { ...audDraft, Amount: 1 },
        ], (o) => o.Amount);
        expect(total).toEqual({ Total: 100, Unconverted: 3, UnconvertedCurrencies: ['AUD', 'EUR'] });
    });

    it('reads each order\'s company functional currency when given one', () => {
        const total = SumInFunctional(
            [{ CurrencyCode: 'USD', BookingExchangeRate: null, Amount: 50, Company: 'us' }],
            (o) => o.Amount,
            (o) => (o.Company === 'us' ? 'USD' : null),
        );
        expect(total.Total).toBe(50);
        expect(total.Unconverted).toBe(0);
    });

    it('does not drift in floating point over many orders', () => {
        const rows = Array.from({ length: 1000 }, () => ({ ...functional, Amount: 0.1 }));
        expect(SumInFunctional(rows, (o) => o.Amount).Total).toBe(100);
    });
});

describe('UnconvertedNote', () => {
    it('is null when nothing was left out', () => {
        expect(UnconvertedNote({ Unconverted: 0, UnconvertedCurrencies: [] })).toBeNull();
    });

    it('names the count and currencies', () => {
        expect(UnconvertedNote({ Unconverted: 1, UnconvertedCurrencies: ['AUD'] })).toBe('Leaves out 1 AUD order with no exchange rate yet');
        expect(UnconvertedNote({ Unconverted: 2, UnconvertedCurrencies: ['AUD', 'EUR'] })).toBe('Leaves out 2 AUD/EUR orders with no exchange rate yet');
    });
});
