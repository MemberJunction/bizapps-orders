/**
 * A refused booking reports each distinct error once (bc-aidp-next-golive#328). One order line at a
 * price of zero staged a release per recognition period, and the message repeated the same refusal
 * once per draft.
 *
 * The person confirming reads a sentence naming the line, its product and what to change, not
 * accounting's pipeline codes (bizapps-orders#742); the codes stay in the server log.
 */
import { describe, expect, it } from 'vitest';
import { BookingErrorLogText, DescribeBookingErrors } from '../booking-errors.js';

const ZERO = 'Line amounts must be greater than zero; this line has 0.';
const membership = () => ({ LineNumber: 2, Product: 'Annual Membership' });

describe('BookingErrorLogText', () => {
    it('says a refusal repeated across drafts once, naming the order line once', () => {
        const errors = Array.from({ length: 36 }, (_, i) => ({ Code: 'MALFORMED_DRAFT', Message: ZERO, DraftIndex: i + 1 }));
        expect(BookingErrorLogText(errors, () => 2)).toBe(`MALFORMED_DRAFT (order line 2): ${ZERO}`);
    });

    it('names every line a shared refusal applies to', () => {
        const errors = [0, 1, 2].map((i) => ({ Code: 'MALFORMED_DRAFT', Message: ZERO, DraftIndex: i }));
        const lines = [2, 3, 2];
        expect(BookingErrorLogText(errors, (i) => lines[i])).toBe(`MALFORMED_DRAFT (order lines 2, 3): ${ZERO}`);
    });

    it('keeps distinct refusals apart, in the order they came', () => {
        const errors = [
            { Code: 'PERIOD_CLOSED', Message: 'the period is closed' },
            { Code: 'MALFORMED_DRAFT', Message: ZERO },
            { Code: 'PERIOD_CLOSED', Message: 'the period is closed' },
        ];
        expect(BookingErrorLogText(errors)).toBe(`PERIOD_CLOSED: the period is closed; MALFORMED_DRAFT: ${ZERO}`);
    });

    it('falls back to the draft index when the line is not known, and to ERROR without a code', () => {
        expect(BookingErrorLogText([{ Message: 'x', DraftIndex: 4 }], () => undefined)).toBe('ERROR (order line 4): x');
        expect(BookingErrorLogText(undefined)).toBe('');
    });
});

describe('DescribeBookingErrors', () => {
    it('turns a zero amount into one sentence naming the line and product, without the code', () => {
        const errors = Array.from({ length: 12 }, (_, i) => ({ Code: 'MALFORMED_DRAFT', Message: ZERO, DraftIndex: i }));
        const text = DescribeBookingErrors(errors, membership);
        expect(text).toBe(
            'Order line 2 (Annual Membership) would post an amount of zero to the ledger. Check its price and ' +
                'service dates: a line needs a price above zero, and service dates that cover at least one recognition period.',
        );
        expect(text).not.toMatch(/MALFORMED_DRAFT/);
    });

    it('names every line one refusal applies to in one sentence, even when the amounts differ', () => {
        const errors = [
            { Code: 'ACCOUNT_INACTIVE', Message: 'GL account a is inactive.', DraftIndex: 0 },
            { Code: 'ACCOUNT_INACTIVE', Message: 'GL account b is inactive.', DraftIndex: 1 },
        ];
        const lines = [
            { LineNumber: 1, Product: 'Field Guide' },
            { LineNumber: 3, Product: 'Summit Ticket' },
        ];
        expect(DescribeBookingErrors(errors, (i) => lines[i])).toBe(
            'Order lines 1 (Field Guide) and 3 (Summit Ticket) book to an inactive GL account. Set the product\'s GL ' +
                "accounts (or its product type's) to active accounts, or ask accounting to reactivate the account.",
        );
    });

    it('says what to change for each pipeline code', () => {
        const say = (Code: string, Message = 'detail') => DescribeBookingErrors([{ Code, Message, DraftIndex: 0 }], membership);
        expect(say('ACCOUNT_UNKNOWN')).toMatch(/^Order line 2 \(Annual Membership\) books to a GL account that does not exist/);
        expect(say('DIMENSION_VALUE_UNKNOWN')).toMatch(/GL dimension tag accounting does not recognize\. Change the tag/);
        expect(say('MULTI_COMPANY_DRAFT')).toMatch(/more than one company\. Set the product's GL accounts/);
        expect(say('UNBALANCED')).toMatch(/^The ledger entry for order line 2 \(Annual Membership\) does not balance/);
        expect(say('MALFORMED_DRAFT', 'This line has no GL account.')).toBe(
            "Order line 2 (Annual Membership): accounting refused its ledger entry. This line has no GL account. Check the product's GL accounts and revenue recognition type.",
        );
        expect(say('ENTRY_TYPE_INACTIVE', "The journal entry type 'OrderBooking' is inactive.")).toBe(
            "The journal entry type 'OrderBooking' is inactive. Nothing on the order needs to change.",
        );
        expect(say('INTERNAL_ERROR', 'timeout')).toBe('Accounting could not book order line 2 (Annual Membership). timeout.');
    });

    it('accepts a bare line number, and says nothing for no errors', () => {
        expect(DescribeBookingErrors([{ Code: 'ACCOUNT_UNKNOWN', Message: 'x', DraftIndex: 0 }], () => 5)).toMatch(/^Order line 5 books/);
        expect(DescribeBookingErrors(undefined)).toBe('');
    });
});
