import { describe, expect, it } from 'vitest';
import { DescribeDisplacedTermStart, ParseDisplacedTermStart } from '../displaced-term-start';

/**
 * A confirm that extends a subscription the customer already holds replaces the line's stated
 * start — golive #299. The replaced date is recorded on the `Extended` event, and these pin how the
 * order screen reads it back.
 */
const LINE_ID = '8C1F2A0E-7B4D-4E3A-9F6B-2D5C8A1E0B47';
const lines = [{ ID: LINE_ID, LineNumber: 2, Product: 'Annual Report' }];

const displaced = JSON.stringify({
    TermNumber: 2,
    Action: 'ExtendExisting',
    StartOverrideIgnored: true,
    OrderLineID: LINE_ID.toLowerCase(),
    RequestedStartDate: '2026-10-01',
    TermStartDate: '2027-10-01',
    TermEndDate: '2028-09-30',
});

describe('ParseDisplacedTermStart', () => {
    it('reads the stated and settled dates and names the line, matching its id in either case', () => {
        expect(ParseDisplacedTermStart(displaced, lines)).toEqual({
            OrderLineID: LINE_ID.toLowerCase(),
            LineNumber: 2,
            Product: 'Annual Report',
            StatedStart: '2026-10-01',
            SettledStart: '2027-10-01',
            SettledEnd: '2028-09-30',
        });
    });

    it('still reports the move when the line is not loaded', () => {
        const d = ParseDisplacedTermStart(displaced, []);
        expect(d?.LineNumber).toBeNull();
        expect(d?.SettledStart).toBe('2027-10-01');
    });

    it('ignores an ordinary extension that records no displaced start', () => {
        expect(ParseDisplacedTermStart(JSON.stringify({ TermNumber: 2, Action: 'ExtendExisting' }), lines)).toBeNull();
    });

    it('ignores a record whose dates agree', () => {
        const same = JSON.stringify({ ...JSON.parse(displaced), TermStartDate: '2026-10-01' });
        expect(ParseDisplacedTermStart(same, lines)).toBeNull();
    });

    it('ignores empty and malformed event data', () => {
        expect(ParseDisplacedTermStart(null, lines)).toBeNull();
        expect(ParseDisplacedTermStart('', lines)).toBeNull();
        expect(ParseDisplacedTermStart('{not json', lines)).toBeNull();
    });
});

describe('DescribeDisplacedTermStart', () => {
    it('states the dates the line now carries and the date that was entered', () => {
        const d = ParseDisplacedTermStart(displaced, lines)!;
        expect(DescribeDisplacedTermStart(d)).toBe(
            'Line 2 (Annual Report) runs 2027-10-01 to 2028-09-30, not from 2026-10-01 as entered. The customer ' +
                'already holds this product, so the line was added as the next term of that subscription.',
        );
    });
});
