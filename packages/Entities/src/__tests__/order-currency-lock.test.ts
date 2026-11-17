/**
 * An order's currency can change only while it is Draft or Quoted and has never been confirmed
 * (golive #492); the booking rate is written only by the server's booking save.
 *
 * `OrderHeaderEntity` cannot be constructed cheaply, so `Object.create` holds one without metadata,
 * and the fields are plain stand-ins carrying `Dirty` and `OldValue`.
 */
import { describe, expect, it } from 'vitest';
import { ValidationResult } from '@memberjunction/core';
import { OrderHeaderEntity } from '../OrderHeaderEntity';
import { CurrencyChangeRefusal } from '../order-currency';

type HeaderUnderTest = {
    refuseLockedCurrencyEdit(result: ValidationResult): void;
    refuseCallerBookingRate(result: ValidationResult): void;
    CurrencyLocked: boolean;
};

function header(opts: { saved?: boolean; status: string; confirmedAt?: Date | null; dirty: string[]; booking?: boolean }): HeaderUnderTest {
    const instance = Object.create(OrderHeaderEntity.prototype) as HeaderUnderTest;
    const old: Record<string, unknown> = { Status: opts.status, ConfirmedAt: opts.confirmedAt ?? null };
    Object.defineProperty(instance, 'IsSaved', { value: opts.saved ?? true });
    Object.defineProperty(instance, 'OrderNumber', { value: 'ORD-1' });
    Object.defineProperty(instance, 'CurrencyCode', { value: 'AUD' });
    Object.defineProperty(instance, 'bookingInFlight', { value: opts.booking ?? false });
    Object.defineProperty(instance, 'GetFieldByName', {
        value: (name: string) => ({ Dirty: opts.dirty.includes(name), OldValue: old[name] ?? null, Value: null }),
    });
    return instance;
}

function refusal(h: HeaderUnderTest, rule: 'refuseLockedCurrencyEdit' | 'refuseCallerBookingRate'): string | null {
    const result = new ValidationResult();
    result.Success = true;
    h[rule](result);
    return result.Success ? null : result.Errors.map((e) => e.Message).join(' ');
}

describe('changing an order currency', () => {
    it('is allowed on a Draft or Quoted order', () => {
        expect(refusal(header({ status: 'Draft', dirty: ['CurrencyCode'] }), 'refuseLockedCurrencyEdit')).toBeNull();
        expect(refusal(header({ status: 'Quoted', dirty: ['CurrencyCode'] }), 'refuseLockedCurrencyEdit')).toBeNull();
        expect(refusal(header({ saved: false, status: 'Draft', dirty: ['CurrencyCode'] }), 'refuseLockedCurrencyEdit')).toBeNull();
    });

    it('is refused once the order is confirmed', () => {
        const h = header({ status: 'Confirmed', confirmedAt: new Date(), dirty: ['CurrencyCode'] });
        expect(h.CurrencyLocked).toBe(true);
        expect(refusal(h, 'refuseLockedCurrencyEdit')).toContain('ORD-1 has been confirmed');
    });

    it('stays refused on a confirmed order that was voided', () => {
        const h = header({ status: 'Voided', confirmedAt: new Date(), dirty: ['CurrencyCode'] });
        expect(refusal(h, 'refuseLockedCurrencyEdit')).toContain('has been confirmed');
    });

    it('lets other edits through on a confirmed order', () => {
        expect(refusal(header({ status: 'Confirmed', confirmedAt: new Date(), dirty: ['Notes'] }), 'refuseLockedCurrencyEdit')).toBeNull();
    });

    it('names the status of an unconfirmed order that is not open', () => {
        expect(CurrencyChangeRefusal({ OrderNumber: 'ORD-1', SavedStatus: 'Voided', WasConfirmed: false })).toContain('ORD-1 is Voided');
    });
});

describe('the booking rate', () => {
    it('cannot be set by a caller', () => {
        expect(refusal(header({ status: 'Draft', dirty: ['BookingExchangeRate'] }), 'refuseCallerBookingRate')).toContain('BookingExchangeRate');
        expect(refusal(header({ status: 'Confirmed', confirmedAt: new Date(), dirty: ['BookingRateDate'] }), 'refuseCallerBookingRate')).toContain('BookingRateDate');
    });

    it("is written by the server's booking save", () => {
        expect(refusal(header({ status: 'Draft', dirty: ['BookingExchangeRate', 'BookingRateDate'], booking: true }), 'refuseCallerBookingRate')).toBeNull();
    });
});
