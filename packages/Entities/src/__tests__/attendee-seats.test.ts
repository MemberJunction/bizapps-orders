/**
 * One attendee per seat for an event that requires attendee information (#590).
 */
import { describe, expect, it } from 'vitest';
import { AttendeeSeatCap, AttendeeSeatShortfalls, type AttendeeSeatLineFacts } from '../attendee-seats';

function line(overrides: Partial<AttendeeSeatLineFacts> = {}): AttendeeSeatLineFacts {
    return {
        LineNumber: 1,
        ProductName: 'Annual Summit',
        Quantity: 1,
        RequiresAttendee: true,
        HasAttendee: true,
        IsReversal: false,
        ...overrides,
    };
}

describe('AttendeeSeatShortfalls', () => {
    it('passes one seat naming its attendee', () => {
        expect(AttendeeSeatShortfalls([line()])).toEqual([]);
    });

    it('refuses a seat with no attendee', () => {
        expect(AttendeeSeatShortfalls([line({ HasAttendee: false })])).toEqual([
            'Line 1 (Annual Summit) has no attendee; this event needs the attendee named',
        ]);
    });

    it('refuses several seats on one line even when an attendee is named', () => {
        expect(AttendeeSeatShortfalls([line({ Quantity: 5 })])).toEqual([
            'Line 1 (Annual Summit) is for 5 seats; this event needs each attendee named, so add one line per seat',
        ]);
    });

    it('ignores products that do not require attendees, whatever the quantity', () => {
        expect(AttendeeSeatShortfalls([line({ RequiresAttendee: false, Quantity: 5, HasAttendee: false })])).toEqual([]);
    });

    it('exempts reversal lines', () => {
        expect(AttendeeSeatShortfalls([line({ IsReversal: true, Quantity: -1, HasAttendee: false })])).toEqual([]);
    });

    it('reports every offending line, naming a line without a number generically', () => {
        const problems = AttendeeSeatShortfalls([
            line({ LineNumber: 1 }),
            line({ LineNumber: 2, HasAttendee: false }),
            line({ LineNumber: null, ProductName: null, Quantity: 2 }),
        ]);
        expect(problems).toHaveLength(2);
        expect(problems[0]).toMatch(/^Line 2 /);
        expect(problems[1]).toMatch(/^A line is for 2 seats/);
    });
});

describe('AttendeeSeatCap', () => {
    it('caps an attendee-required event at one seat per line, over the product cap', () => {
        expect(AttendeeSeatCap(true, 10)).toBe(1);
        expect(AttendeeSeatCap(true, null)).toBe(1);
    });

    it('leaves any other product at its own cap', () => {
        expect(AttendeeSeatCap(false, 10)).toBe(10);
        expect(AttendeeSeatCap(false, undefined)).toBeNull();
    });
});
