/**
 * When the Finance Exception form offers to book a charge as an order (#567).
 */
import { describe, expect, it } from 'vitest';
import {
    CanBookChargeAsOrder,
    CanSubmitBooking,
    ChargeWithoutPaymentChargeID,
    CHARGE_MISMATCH_TYPE_CODE,
    PAYMENT_PROVIDER_ENTITY,
    type ChargeExceptionLike,
} from '../charge-exception-view';

const row = (over: Partial<ChargeExceptionLike> = {}): ChargeExceptionLike => ({
    Status: 'Open',
    SourceEntity: PAYMENT_PROVIDER_ENTITY,
    DedupeKey: 'ChargeWithoutPayment|ch_1|250',
    ...over,
});

describe('ChargeWithoutPaymentChargeID', () => {
    it('reads the charge from a charge-without-payment key', () => {
        expect(ChargeWithoutPaymentChargeID('ChargeWithoutPayment|ch_1|250')).toBe('ch_1');
    });

    it('is null for any other key', () => {
        for (const key of [null, undefined, '', 'ChargeWithoutPayment|', 'ChargeWithoutPayment||5', 'RefundNotBooked|ch_1|5']) {
            expect(ChargeWithoutPaymentChargeID(key)).toBeNull();
        }
    });
});

describe('CanBookChargeAsOrder', () => {
    it('offers it on an open charge-without-payment exception raised against the provider', () => {
        expect(CanBookChargeAsOrder(row(), CHARGE_MISMATCH_TYPE_CODE)).toBe(true);
    });

    it('hides it on a cleared exception, another type, another kind, or a charge Orders opened', () => {
        expect(CanBookChargeAsOrder(row({ Status: 'Corrected' }), CHARGE_MISMATCH_TYPE_CODE)).toBe(false);
        expect(CanBookChargeAsOrder(row(), 'OVERLAPPING_SUBSCRIPTION')).toBe(false);
        expect(CanBookChargeAsOrder(row(), null)).toBe(false);
        expect(CanBookChargeAsOrder(row({ DedupeKey: 'RefundNotBooked|ch_1|5' }), CHARGE_MISMATCH_TYPE_CODE)).toBe(false);
        expect(CanBookChargeAsOrder(row({ SourceEntity: 'MJ_BizApps_Orders: Payment Intents' }), CHARGE_MISMATCH_TYPE_CODE)).toBe(false);
        expect(CanBookChargeAsOrder(null, CHARGE_MISMATCH_TYPE_CODE)).toBe(false);
    });
});

describe('CanSubmitBooking', () => {
    it('needs a product and a person; the organization is optional', () => {
        expect(CanSubmitBooking('p', 'q')).toBe(true);
        expect(CanSubmitBooking(null, 'q')).toBe(false);
        expect(CanSubmitBooking('p', '')).toBe(false);
    });
});
