/**
 * Resolving a charge-without-payment finance exception with an order (#567), the pure half and the
 * refusals made before anything is booked. No network, no database.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ChargeMismatchDedupeKey } from '../ChargeReconciliation.js';
import {
    ChargeExceptionResolutionNote,
    CheckChargeExceptionForOrder,
    CheckResolveChargeExceptionInput,
    ParseChargeMismatchDedupeKey,
    type ChargeExceptionRow,
} from '../ChargeExceptionResolution.js';
import { PAYMENT_PROVIDER_ENTITY } from '../entity-names.js';
import { ResolveChargeException, type BookExceptionCharge } from '../ResolveChargeExceptionOperation.js';

const TYPE = 'PROVIDER_CHARGE_MISMATCH';
const EXCEPTION_ID = '01111111-2222-4333-8444-555555555555';
const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const PRODUCT_ID = '21111111-2222-4333-8444-555555555555';
const PERSON_ID = '31111111-2222-4333-8444-555555555555';

const row = (over: Partial<ChargeExceptionRow> = {}): ChargeExceptionRow => ({
    ID: EXCEPTION_ID,
    Status: 'Open',
    TypeCode: TYPE,
    SourceEntity: PAYMENT_PROVIDER_ENTITY,
    SourceRecordID: PROVIDER_ID,
    DedupeKey: 'ChargeWithoutPayment|ch_1|250',
    ...over,
});

describe('ParseChargeMismatchDedupeKey', () => {
    it('reads back every key reconciliation writes', () => {
        const key = ChargeMismatchDedupeKey({ Kind: 'ChargeWithoutPayment', ProviderChargeID: 'ch_abc', Amount: 1234.5, Detail: '' });
        expect(ParseChargeMismatchDedupeKey(key)).toEqual({ Kind: 'ChargeWithoutPayment', Reference: 'ch_abc', Amount: 1234.5 });
        const refund = ChargeMismatchDedupeKey({ Kind: 'RefundNotBooked', ProviderChargeID: 'ch_r', Amount: 10, Detail: '' });
        expect(ParseChargeMismatchDedupeKey(refund)?.Kind).toBe('RefundNotBooked');
    });

    it('keeps an empty reference as null', () => {
        expect(ParseChargeMismatchDedupeKey('PaymentWithoutCharge||5')).toEqual({ Kind: 'PaymentWithoutCharge', Reference: null, Amount: 5 });
    });

    it('keeps a reference holding the separator whole', () => {
        expect(ParseChargeMismatchDedupeKey('ChargeWithoutPayment|ch|odd|7')?.Reference).toBe('ch|odd');
    });

    it('refuses anything that is not a charge-mismatch key', () => {
        for (const key of [null, undefined, '', 'ChargeWithoutPayment', 'ChargeWithoutPayment|ch_1', 'Other|ch_1|5', 'ChargeWithoutPayment|ch_1|', 'ChargeWithoutPayment|ch_1|abc']) {
            expect(ParseChargeMismatchDedupeKey(key)).toBeNull();
        }
    });
});

describe('CheckChargeExceptionForOrder', () => {
    it('names the provider and charge of an open charge-without-payment exception', () => {
        expect(CheckChargeExceptionForOrder(row(), TYPE)).toEqual({ PaymentProviderID: PROVIDER_ID, ProviderChargeID: 'ch_1' });
    });

    it('refuses an exception already cleared', () => {
        expect(CheckChargeExceptionForOrder(row({ Status: 'Corrected' }), TYPE)).toMatchObject({ Code: 'NotOpen' });
        expect(CheckChargeExceptionForOrder(row({ Status: 'Reviewed' }), TYPE)).toMatchObject({ Code: 'NotOpen' });
    });

    it('refuses another type of exception', () => {
        expect(CheckChargeExceptionForOrder(row({ TypeCode: 'OVERLAPPING_SUBSCRIPTION' }), TYPE)).toMatchObject({ Code: 'WrongType' });
    });

    it('refuses the other two kinds of mismatch', () => {
        expect(CheckChargeExceptionForOrder(row({ DedupeKey: 'RefundNotBooked|ch_1|10' }), TYPE)).toMatchObject({ Code: 'WrongKind' });
        expect(CheckChargeExceptionForOrder(row({ DedupeKey: 'PaymentWithoutCharge|ch_1|10' }), TYPE)).toMatchObject({ Code: 'WrongKind' });
    });

    it('refuses a charge Orders opened, raised against its intent or payment', () => {
        expect(CheckChargeExceptionForOrder(row({ SourceEntity: 'MJ_BizApps_Orders: Payment Intents' }), TYPE)).toMatchObject({ Code: 'OpenedByOrders' });
        expect(CheckChargeExceptionForOrder(row({ SourceEntity: 'MJ_BizApps_Orders: Payment Headers' }), TYPE)).toMatchObject({ Code: 'OpenedByOrders' });
    });

    it('refuses a key it cannot read or a source that is not an ID', () => {
        expect(CheckChargeExceptionForOrder(row({ DedupeKey: 'nonsense' }), TYPE)).toMatchObject({ Code: 'UnreadableKey' });
        expect(CheckChargeExceptionForOrder(row({ DedupeKey: 'ChargeWithoutPayment||250' }), TYPE)).toMatchObject({ Code: 'UnreadableKey' });
        expect(CheckChargeExceptionForOrder(row({ SourceRecordID: "x' OR 1=1 --" }), TYPE)).toMatchObject({ Code: 'UnreadableKey' });
    });
});

describe('CheckResolveChargeExceptionInput', () => {
    it('accepts the IDs, with or without an organization', () => {
        const input = { FinanceExceptionID: EXCEPTION_ID, ProductID: PRODUCT_ID, BillToPersonID: PERSON_ID };
        expect(CheckResolveChargeExceptionInput(input)).toEqual({ ...input, BillToOrganizationID: null });
        expect(CheckResolveChargeExceptionInput({ ...input, BillToOrganizationID: PROVIDER_ID })).toMatchObject({ BillToOrganizationID: PROVIDER_ID });
    });

    it('refuses a missing or malformed ID', () => {
        expect(typeof CheckResolveChargeExceptionInput({ FinanceExceptionID: 'x', ProductID: PRODUCT_ID, BillToPersonID: PERSON_ID })).toBe('string');
        expect(typeof CheckResolveChargeExceptionInput({ FinanceExceptionID: EXCEPTION_ID, ProductID: '', BillToPersonID: PERSON_ID })).toBe('string');
        expect(typeof CheckResolveChargeExceptionInput(null)).toBe('string');
    });
});

describe('ChargeExceptionResolutionNote', () => {
    it('names the order, the payment and the charge', () => {
        expect(ChargeExceptionResolutionNote('ch_1', { OrderNumber: 'ORD-1', PaymentNumber: 'PAY-1' })).toBe(
            'Booked as order ORD-1, payment PAY-1 from provider charge ch_1.',
        );
        expect(ChargeExceptionResolutionNote('ch_1', { OrderHeaderID: 'abc' })).toBe('Booked as order abc from provider charge ch_1.');
    });
});

describe('ResolveChargeException refuses before booking', () => {
    const user = { ID: PERSON_ID } as unknown as UserInfo;
    const input = { FinanceExceptionID: EXCEPTION_ID, ProductID: PRODUCT_ID, BillToPersonID: PERSON_ID };

    it('books nothing for a caller who cannot clear finance exceptions', async () => {
        const book = vi.fn<BookExceptionCharge>();
        const provider = { Authorizations: [] } as unknown as IMetadataProvider;
        const out = await ResolveChargeException(input, book, provider, user);
        expect(out).toMatchObject({ Success: false, Cleared: false, Code: 'NotAuthorized' });
        expect(book).not.toHaveBeenCalled();
    });

    it('books nothing for malformed input', async () => {
        const book = vi.fn<BookExceptionCharge>();
        const out = await ResolveChargeException({ ...input, ProductID: 'nope' }, book, {} as IMetadataProvider, user);
        expect(out).toMatchObject({ Success: false, Code: 'BadInput' });
        expect(book).not.toHaveBeenCalled();
    });
});
