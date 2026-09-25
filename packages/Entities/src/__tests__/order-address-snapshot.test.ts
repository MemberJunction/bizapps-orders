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

/** Field state as BaseEntity reports it: which fields changed, and what each held before. */
type FieldState = { dirty?: string[]; old?: Record<string, string | null> };

function fieldsOf(state: FieldState) {
    const dirty = state.dirty ?? [];
    return (name: string) => ({ Dirty: dirty.includes(name), OldValue: state.old?.[name] ?? null });
}

interface FakeLine {
    IsSaved: boolean;
    LineNumber: number;
    GetFieldByName(name: string): { Dirty: boolean; OldValue: string | null };
}

function fakeLine(lineNumber: number, state: FieldState = {}): FakeLine {
    return { IsSaved: true, LineNumber: lineNumber, GetFieldByName: fieldsOf(state) };
}

const SET = { BillToAddressID: 'a-1', ShipToAddressID: 'a-2' };

function order(opts: FieldState & { booked: boolean; stamped?: boolean; lines?: FakeLine[] }): AddressRuleOrder {
    const instance = Object.create(OrderHeaderEntity.prototype) as AddressRuleOrder;
    const dirty = opts.dirty ?? [];
    Object.defineProperty(instance, 'MoneyLocked', { value: opts.booked });
    Object.defineProperty(instance, 'OrderNumber', { value: 'ORD-000123' });
    Object.defineProperty(instance, 'Lines', { value: { Items: opts.lines ?? [] } });
    Object.assign(instance, {
        addressSnapshotsStamped: opts.stamped ?? false,
        FieldIsDirty: (...names: string[]) => names.some((n) => dirty.includes(n)),
        GetFieldByName: fieldsOf(opts),
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
    it('refuses replacing or clearing a bill-to or ship-to address that is set', () => {
        const result = run(order({ booked: true, dirty: ['BillToAddressID', 'ShipToAddressID'], old: SET }));

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['BillToAddressID', 'ShipToAddressID']);
        expect(result.Errors[0].Message).toMatch(/ORD-000123 is confirmed.*bill-to address cannot be replaced or cleared/);
    });

    it('lets an empty address be filled after confirm', () => {
        const result = run(order({ booked: true, dirty: ['BillToAddressID', 'ShipToAddressID'], old: {} }));

        expect(result.Success).toBe(true);
    });

    it('refuses replacing a saved line ship-to, attributed to the line', () => {
        const result = run(order({
            booked: true,
            lines: [fakeLine(1), fakeLine(2, { dirty: ['ShipToAddressID'], old: { ShipToAddressID: 'a-3' } })],
        }));

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['Lines[1].ShipToAddressID']);
    });

    it('lets an empty line ship-to be filled after confirm', () => {
        const result = run(order({ booked: true, lines: [fakeLine(1, { dirty: ['ShipToAddressID'] })] }));

        expect(result.Success).toBe(true);
    });

    it('leaves a draft free to change its addresses', () => {
        const result = run(order({
            booked: false,
            dirty: ['BillToAddressID', 'ShipToAddressID'],
            old: SET,
            lines: [fakeLine(1, { dirty: ['ShipToAddressID'], old: { ShipToAddressID: 'a-3' } })],
        }));

        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('refuses a header or line snapshot the server did not write, on any order', () => {
        const result = run(order({
            booked: false,
            dirty: ['BillToAddressSnapshot'],
            lines: [fakeLine(1, { dirty: ['ShipToAddressSnapshot'] })],
        }));

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['BillToAddressSnapshot', 'Lines[0].ShipToAddressSnapshot']);
    });

    it('lets the server write the snapshots', () => {
        const result = run(order({
            booked: true,
            stamped: true,
            dirty: ['BillToAddressSnapshot', 'ShipToAddressSnapshot'],
            lines: [fakeLine(1, { dirty: ['ShipToAddressSnapshot'] })],
        }));

        expect(result.Success).toBe(true);
    });
});
