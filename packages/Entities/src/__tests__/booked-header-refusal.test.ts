/**
 * A booked header refuses its frozen columns at Validate() — golive #262.
 *
 * Trigger 51013 is the backstop, but a trigger rollback under the CRUD procedure's INSERT-EXEC
 * surfaces as "Cannot use the ROLLBACK statement within an INSERT-EXEC statement", naming neither
 * the column nor the rule. So the entity refuses first, with a message a user can act on.
 *
 * `OrderHeaderEntity` cannot be constructed cheaply (see order-header-default-date.test.ts), so
 * `Object.create` holds one without metadata, and the fields are plain stand-ins carrying exactly
 * what the refusal reads: `Dirty` and `OldValue`.
 */
import { describe, expect, it } from 'vitest';
import { ValidationResult } from '@memberjunction/core';
import { OrderHeaderEntity } from '../OrderHeaderEntity';

type FieldStub = { Dirty: boolean; OldValue: unknown };
type HeaderUnderTest = { refuseBookedMoneyEdits(result: ValidationResult): void };

function header(opts: { booked: boolean; fields: Record<string, FieldStub> }): HeaderUnderTest {
    const instance = Object.create(OrderHeaderEntity.prototype) as HeaderUnderTest;
    const empty = { Items: [], Removed: [], IsLoaded: false, Dirty: false };
    Object.defineProperty(instance, 'MoneyLocked', { value: opts.booked });
    Object.defineProperty(instance, 'Status', { value: 'Confirmed' });
    Object.defineProperty(instance, 'Lines', { value: empty });
    Object.defineProperty(instance, 'Charges', { value: empty });
    Object.defineProperty(instance, 'Adjustments', { value: empty });
    Object.defineProperty(instance, 'GetFieldByName', { value: (name: string) => opts.fields[name] });
    return instance;
}

function refusal(opts: { booked: boolean; fields: Record<string, FieldStub> }): string | null {
    const result = new ValidationResult();
    result.Success = true;
    header(opts).refuseBookedMoneyEdits(result);
    return result.Success ? null : result.Errors.map((e) => e.Message).join(' ');
}

const changed = (oldValue: unknown): FieldStub => ({ Dirty: true, OldValue: oldValue });

describe('a booked header', () => {
    it.each(['OrderDate', 'OrderType', 'CompanyID', 'ReversesOrderHeaderID'])('refuses a change to %s, naming it', (name) => {
        const message = refusal({ booked: true, fields: { [name]: changed('before') } });
        expect(message).toContain('booked');
        expect(message).toContain(name);
    });

    it.each(['BillToPersonID', 'BillToOrganizationID'])('refuses replacing a set %s', (name) => {
        const message = refusal({ booked: true, fields: { [name]: changed('person-at-checkout') } });
        expect(message).toContain(name);
    });

    it.each(['BillToPersonID', 'BillToOrganizationID'])('lets an empty %s be filled', (name) => {
        expect(refusal({ booked: true, fields: { [name]: changed(null) } })).toBeNull();
    });

    it('is silent when only unfrozen columns changed', () => {
        expect(refusal({ booked: true, fields: { Notes: changed('old note'), ShipToPersonID: changed('p1') } })).toBeNull();
    });
});

describe('an open header', () => {
    it('refuses nothing', () => {
        const fields = { OrderDate: changed('2026-09-01'), BillToPersonID: changed('p1'), CompanyID: changed('c1') };
        expect(refusal({ booked: false, fields })).toBeNull();
    });
});
