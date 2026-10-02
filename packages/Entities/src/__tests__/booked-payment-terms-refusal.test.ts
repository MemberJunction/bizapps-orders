/**
 * A booked header refuses a direct change to its payment terms at Validate() — #309.
 *
 * On a confirmed order the terms change only through an approved Terms concession, which the server
 * applies under a sanction this shared class never grants. Trigger 51018 is the backstop.
 *
 * `OrderHeaderEntity` cannot be constructed cheaply (see order-header-default-date.test.ts), so
 * `Object.create` holds one without metadata, and the fields are plain stand-ins carrying `Dirty`.
 */
import { describe, expect, it } from 'vitest';
import { ValidationResult } from '@memberjunction/core';
import { OrderHeaderEntity } from '../OrderHeaderEntity';

type HeaderUnderTest = { refuseBookedPaymentTermsEdit(result: ValidationResult): void };

function refusal(opts: { booked: boolean; dirty: string[]; sanctioned?: boolean }): string | null {
    const instance = Object.create(OrderHeaderEntity.prototype) as HeaderUnderTest;
    Object.defineProperty(instance, 'MoneyLocked', { value: opts.booked });
    Object.defineProperty(instance, 'OrderNumber', { value: 'ORD-1' });
    Object.defineProperty(instance, 'PaymentTermsTypeID', { value: 'terms-60' });
    Object.defineProperty(instance, 'GetFieldByName', {
        value: (name: string) => ({ Dirty: opts.dirty.includes(name), OldValue: 'before' }),
    });
    if (opts.sanctioned) Object.defineProperty(instance, 'PaymentTermsChangeSanctioned', { value: () => true });

    const result = new ValidationResult();
    result.Success = true;
    instance.refuseBookedPaymentTermsEdit(result);
    return result.Success ? null : result.Errors.map((e) => e.Message).join(' ');
}

describe('a booked header', () => {
    it('refuses a direct change to its payment terms, pointing at the amendment', () => {
        const message = refusal({ booked: true, dirty: ['PaymentTermsTypeID'] });
        expect(message).toContain('ORD-1 is confirmed');
        expect(message).toContain('Orders.AmendArrangement');
    });

    it('lets its due date be corrected', () => {
        expect(refusal({ booked: true, dirty: ['DueDate'] })).toBeNull();
    });

    it('admits the change the server sanctions for an approved Terms concession', () => {
        expect(refusal({ booked: true, dirty: ['PaymentTermsTypeID', 'DueDate'], sanctioned: true })).toBeNull();
    });
});

describe('an open header', () => {
    it('lets its payment terms be edited', () => {
        expect(refusal({ booked: false, dirty: ['PaymentTermsTypeID'] })).toBeNull();
    });
});
