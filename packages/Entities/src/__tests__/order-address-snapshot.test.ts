/**
 * The order keeps the customer's address as it was at the time of sale (golive #263).
 *
 * Two things are asserted here: the snapshot records what the Address row said, and a confirmed
 * order refuses a change to where it was sold before the round trip, as triggers 51015 / 51016 do
 * at the database.
 */
import { describe, expect, it } from 'vitest';
import { ValidationResult } from '@memberjunction/core';
import { BuildAddressSnapshot, ParseAddressSnapshot } from '../order-address-snapshot';
import { OrderHeaderEntity } from '../OrderHeaderEntity';

const ADDRESS_ID = '6f1c7a52-2d1b-4c0e-9a57-3a4f0b1c2d3e';

describe('BuildAddressSnapshot / ParseAddressSnapshot', () => {
    it('keeps every postal field and the source row', () => {
        const json = BuildAddressSnapshot({
            ID: ADDRESS_ID,
            Line1: '100 Main St',
            Line2: 'Suite 4',
            Line3: null,
            City: 'Springfield',
            StateProvince: 'IL',
            PostalCode: '62701',
            Country: 'US',
        });

        expect(ParseAddressSnapshot(json)).toEqual({
            AddressID: ADDRESS_ID,
            Line1: '100 Main St',
            Line2: 'Suite 4',
            Line3: null,
            City: 'Springfield',
            StateProvince: 'IL',
            PostalCode: '62701',
            Country: 'US',
        });
    });

    it('stores a blank field as null', () => {
        const snapshot = ParseAddressSnapshot(BuildAddressSnapshot({ ID: ADDRESS_ID, Line1: '1 A St', Line2: '  ', City: 'X', Country: 'US' }));

        expect(snapshot?.Line2).toBeNull();
        expect(snapshot?.StateProvince).toBeNull();
    });

    it('answers null when there is no snapshot', () => {
        expect(ParseAddressSnapshot(null)).toBeNull();
        expect(ParseAddressSnapshot(undefined)).toBeNull();
        expect(ParseAddressSnapshot('')).toBeNull();
    });

    it('refuses a value that is not a snapshot rather than falling back to the live address', () => {
        expect(() => ParseAddressSnapshot('{"City":"Springfield"}')).toThrow(/expected shape/);
        expect(() => ParseAddressSnapshot('[]')).toThrow(/expected shape/);
    });
});

/** The private rule these tests drive, and the state it reads. */
type AddressRuleOrder = {
    refuseBookedAddressEdits(result: ValidationResult): void;
};

interface FakeLine {
    IsSaved: boolean;
    LineNumber: number;
    GetFieldByName(name: string): { Dirty: boolean };
}

function fakeLine(lineNumber: number, dirty: string[] = []): FakeLine {
    return {
        IsSaved: true,
        LineNumber: lineNumber,
        GetFieldByName: (name: string) => ({ Dirty: dirty.includes(name) }),
    };
}

function order(opts: { booked: boolean; bookingInFlight?: boolean; dirty?: string[]; lines?: FakeLine[] }): AddressRuleOrder {
    const instance = Object.create(OrderHeaderEntity.prototype) as AddressRuleOrder;
    const dirty = opts.dirty ?? [];
    Object.defineProperty(instance, 'MoneyLocked', { value: opts.booked });
    Object.defineProperty(instance, 'OrderNumber', { value: 'ORD-000123' });
    Object.defineProperty(instance, 'Lines', { value: { Items: opts.lines ?? [] } });
    Object.assign(instance, {
        bookingInFlight: opts.bookingInFlight ?? false,
        FieldIsDirty: (...names: string[]) => names.some((n) => dirty.includes(n)),
    });
    return instance;
}

function run(instance: AddressRuleOrder): ValidationResult {
    const result = new ValidationResult();
    result.Success = true;
    instance.refuseBookedAddressEdits(result);
    return result;
}

describe('OrderHeaderEntity refuses address changes on a confirmed order', () => {
    it('refuses a new bill-to or ship-to address', () => {
        const result = run(order({ booked: true, dirty: ['BillToAddressID', 'ShipToAddressID'] }));

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['BillToAddressID', 'ShipToAddressID']);
        expect(result.Errors[0].Message).toMatch(/ORD-000123 is confirmed.*bill-to address/);
    });

    it('refuses a new ship-to address on a saved line, attributed to the line', () => {
        const result = run(order({ booked: true, lines: [fakeLine(1), fakeLine(2, ['ShipToAddressID'])] }));

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['Lines[1].ShipToAddressID']);
    });

    it('leaves a draft free to change its addresses', () => {
        const result = run(order({ booked: false, dirty: ['BillToAddressID', 'ShipToAddressID'], lines: [fakeLine(1, ['ShipToAddressID'])] }));

        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('refuses a snapshot written by anything but the booking save, on any order', () => {
        const result = run(order({ booked: false, dirty: ['BillToAddressSnapshot'] }));

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['BillToAddressSnapshot']);
    });

    it('lets the booking save write the snapshots', () => {
        const result = run(order({ booked: false, bookingInFlight: true, dirty: ['BillToAddressSnapshot', 'ShipToAddressSnapshot'] }));

        expect(result.Success).toBe(true);
    });
});
