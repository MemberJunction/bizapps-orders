/**
 * A refused booking reports each distinct error once (bc-aidp-next-golive#328). One order line at a
 * price of zero staged a release per recognition period, and the message repeated the same refusal
 * once per draft.
 */
import { describe, expect, it } from 'vitest';
import { DescribeBookingErrors } from '../booking-errors.js';

const ZERO = 'line amount must be a finite number > 0, got 0';

describe('DescribeBookingErrors', () => {
    it('says a refusal repeated across drafts once, naming the order line once', () => {
        const errors = Array.from({ length: 36 }, (_, i) => ({ Code: 'MALFORMED_DRAFT', Message: ZERO, DraftIndex: i + 1 }));
        expect(DescribeBookingErrors(errors, () => 2)).toBe(`MALFORMED_DRAFT (order line 2): ${ZERO}`);
    });

    it('names every line a shared refusal applies to', () => {
        const errors = [
            { Code: 'MALFORMED_DRAFT', Message: ZERO, DraftIndex: 0 },
            { Code: 'MALFORMED_DRAFT', Message: ZERO, DraftIndex: 1 },
            { Code: 'MALFORMED_DRAFT', Message: ZERO, DraftIndex: 2 },
        ];
        const lines = [2, 3, 2];
        expect(DescribeBookingErrors(errors, (i) => lines[i])).toBe(`MALFORMED_DRAFT (order lines 2, 3): ${ZERO}`);
    });

    it('keeps distinct refusals apart, in the order they came', () => {
        const errors = [
            { Code: 'PERIOD_CLOSED', Message: 'the period is closed' },
            { Code: 'MALFORMED_DRAFT', Message: ZERO },
            { Code: 'PERIOD_CLOSED', Message: 'the period is closed' },
        ];
        expect(DescribeBookingErrors(errors)).toBe(`PERIOD_CLOSED: the period is closed; MALFORMED_DRAFT: ${ZERO}`);
    });

    it('falls back to the draft index when the line is not known, and to ERROR without a code', () => {
        expect(DescribeBookingErrors([{ Message: 'x', DraftIndex: 4 }], () => undefined)).toBe('ERROR (order line 4): x');
        expect(DescribeBookingErrors(undefined)).toBe('');
    });
});
