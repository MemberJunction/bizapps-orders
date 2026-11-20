/**
 * An order from an unmatched provider payment (#481), the pure half. No network, no database.
 */
import { describe, expect, it } from 'vitest';
import type { GatewayCharge } from '../BasePaymentProvider.js';
import {
    CheckChargeForOrder,
    CheckProviderPaymentInput,
    ProviderPaymentIdempotencyKey,
} from '../ProviderPaymentOrder.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const PRODUCT_ID = '21111111-2222-4333-8444-555555555555';
const PERSON_ID = '31111111-2222-4333-8444-555555555555';

const charge = (over: Partial<GatewayCharge> = {}): GatewayCharge => ({
    ProviderChargeID: 'ch_1',
    ProviderIntentID: 'pi_1',
    Amount: 250,
    AmountRefunded: 0,
    CurrencyCode: 'USD',
    Status: 'succeeded',
    CreatedAt: new Date('2026-10-08T15:00:00Z'),
    ...over,
});

describe('CheckChargeForOrder', () => {
    it('accepts a succeeded, unrefunded charge in the company currency', () => {
        expect(CheckChargeForOrder(charge(), 'USD')).toBeNull();
        expect(CheckChargeForOrder(charge({ CurrencyCode: 'usd' }), ' usd ')).toBeNull();
    });

    it('refuses a charge that has not succeeded', () => {
        expect(CheckChargeForOrder(charge({ Status: 'pending' }), 'USD')?.Code).toBe('ChargeNotSucceeded');
        expect(CheckChargeForOrder(charge({ Status: 'failed' }), 'USD')?.Code).toBe('ChargeNotSucceeded');
    });

    it('refuses a charge with any refund, partial or whole', () => {
        expect(CheckChargeForOrder(charge({ AmountRefunded: 0.01 }), 'USD')?.Code).toBe('ChargeRefunded');
        expect(CheckChargeForOrder(charge({ AmountRefunded: 250 }), 'USD')?.Code).toBe('ChargeRefunded');
    });

    it('refuses a zero charge, a charge with no intent, and another currency', () => {
        expect(CheckChargeForOrder(charge({ Amount: 0 }), 'USD')?.Code).toBe('ChargeHasNoAmount');
        expect(CheckChargeForOrder(charge({ ProviderIntentID: null }), 'USD')?.Code).toBe('ChargeHasNoIntent');
        expect(CheckChargeForOrder(charge({ CurrencyCode: 'EUR' }), 'USD')?.Code).toBe('CurrencyMismatch');
    });
});

describe('ProviderPaymentIdempotencyKey', () => {
    it('is the same for one charge whatever the id casing, and differs per charge and provider', () => {
        expect(ProviderPaymentIdempotencyKey(PROVIDER_ID.toUpperCase(), 'ch_1')).toBe(ProviderPaymentIdempotencyKey(PROVIDER_ID, 'ch_1'));
        expect(ProviderPaymentIdempotencyKey(PROVIDER_ID, 'ch_1')).not.toBe(ProviderPaymentIdempotencyKey(PROVIDER_ID, 'ch_2'));
        expect(ProviderPaymentIdempotencyKey(PROVIDER_ID, 'ch_1')).not.toBe(ProviderPaymentIdempotencyKey(PRODUCT_ID, 'ch_1'));
    });

    it('fits PaymentHeader.IdempotencyKey for the longest charge id accepted', () => {
        expect(ProviderPaymentIdempotencyKey(PROVIDER_ID, 'c'.repeat(100)).length).toBeLessThanOrEqual(200);
    });
});

describe('CheckProviderPaymentInput', () => {
    const ok = { PaymentProviderID: PROVIDER_ID, ProviderChargeID: ' ch_1 ', ProductID: PRODUCT_ID, BillToPersonID: PERSON_ID };

    it('trims the charge id and treats an empty organization as none', () => {
        expect(CheckProviderPaymentInput({ ...ok, BillToOrganizationID: '' })).toEqual({ ...ok, ProviderChargeID: 'ch_1', BillToOrganizationID: null });
    });

    it('refuses a missing or oversized charge id and malformed ids', () => {
        expect(CheckProviderPaymentInput({ ...ok, ProviderChargeID: '  ' })).toMatch(/ProviderChargeID is required/);
        expect(CheckProviderPaymentInput({ ...ok, ProviderChargeID: 'c'.repeat(101) })).toMatch(/longer than 100/);
        expect(CheckProviderPaymentInput({ ...ok, ProductID: "x' OR 1=1 --" })).toMatch(/ProductID/);
        expect(CheckProviderPaymentInput({ ...ok, BillToOrganizationID: 'nope' })).toMatch(/BillToOrganizationID/);
        expect(CheckProviderPaymentInput(null)).toMatch(/ProviderChargeID is required/);
    });
});
