/**
 * Unit tests for whether a tender books its processor fee as its own ledger leg (D82).
 *
 * WHY THIS DECISION IS WORTH ITS OWN TESTS. It decides whether a journal entry exists, and both
 * answers are quietly wrong in different ways:
 *
 *   ON when it should be off puts a `Dr Processing Fee / Cr Cash` entry against every payment, which
 *   cannot reconcile — the processor batches into payouts and deducts costs that never attach to any
 *   payment, so Cash ends up right in aggregate only if every other category is captured too.
 *
 *   OFF when somebody asked for it on silently drops a real expense. Nothing fails; the fee simply
 *   never appears, and the first person to notice is whoever compares the P&L to the statement.
 *
 * THE MATCH IS THE FRAGILE PART. The configured value is hand-typed by an administrator into an
 * application setting. `creditcard` failing to match `CreditCard`, or a trailing space defeating a
 * comma-separated list, changes how money is booked — silently, and only for the tender that was
 * mistyped, so a smoke test on one payment type would not find it.
 */
import { describe, it, expect } from 'vitest';
import { ShouldBookFeeInline } from '../OrdersSettings.js';

describe('ShouldBookFeeInline — the default is OFF', () => {
    it('books nothing when no tender is configured', () => {
        // The shipped default. Every payment type must answer false, or the accrual model is not
        // actually the default it claims to be.
        for (const code of ['CreditCard', 'ACH', 'Wire', 'Check', 'Cash', 'GiftCard', 'AccountCredit']) {
            expect(ShouldBookFeeInline(code, []), code).toBe(false);
        }
    });

    it('books nothing for a tender that was not listed', () => {
        expect(ShouldBookFeeInline('Check', ['CreditCard', 'ACH'])).toBe(false);
    });
});

describe('ShouldBookFeeInline — opting a tender in', () => {
    it('books for a listed tender', () => {
        expect(ShouldBookFeeInline('CreditCard', ['CreditCard'])).toBe(true);
    });

    it('books for one of several', () => {
        expect(ShouldBookFeeInline('ACH', ['CreditCard', 'ACH'])).toBe(true);
    });

    it('opts in ONLY the tenders named — the switch is per type, not global', () => {
        // The whole point of keying on the tender: a deployment can attribute card fees per payment
        // while leaving bank debits to the month-end accrual, or the reverse.
        const configured = ['CreditCard'];
        expect(ShouldBookFeeInline('CreditCard', configured)).toBe(true);
        expect(ShouldBookFeeInline('ACH', configured)).toBe(false);
    });
});

describe('ShouldBookFeeInline — matching what an administrator actually typed', () => {
    it.each([
        ['creditcard', 'all lower'],
        ['CREDITCARD', 'all upper'],
        ['CreditCard', 'as seeded'],
        ['cReDiTcArD', 'mixed'],
    ])('matches %s (%s) against the seeded code', (typed) => {
        expect(ShouldBookFeeInline(typed, ['CreditCard'])).toBe(true);
    });

    it('matches when the CONFIGURED side carries the odd casing', () => {
        // Either side can be the hand-typed one — the setting is edited by a person, and the code
        // arrives from the database.
        expect(ShouldBookFeeInline('CreditCard', ['creditcard'])).toBe(true);
    });

    it('tolerates whitespace around a comma-separated entry', () => {
        // `CreditCard, ACH` is how a person writes a list. A match that required exact bytes would
        // book fees for the first tender and silently not for the second.
        expect(ShouldBookFeeInline('ACH', ['CreditCard', ' ACH '])).toBe(true);
        expect(ShouldBookFeeInline(' ACH ', ['ACH'])).toBe(true);
    });

    it('does NOT match a partial or adjacent code', () => {
        // Substring matching would make 'ACH' opt in a hypothetical 'ACHDebit', which is a different
        // tender with a different fee.
        expect(ShouldBookFeeInline('ACHDebit', ['ACH'])).toBe(false);
        expect(ShouldBookFeeInline('ACH', ['ACHDebit'])).toBe(false);
    });
});

describe('ShouldBookFeeInline — absent and malformed input', () => {
    it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['', 'empty'],
        ['   ', 'whitespace only'],
    ])('answers false for a %s tender code (%s)', (code) => {
        // A payment whose tender cannot be read must not book a fee on a guess. False is the safe
        // answer here in the strict sense: it omits an expense rather than inventing a ledger entry
        // against an unknown tender, and the month-end accrual catches it either way.
        expect(ShouldBookFeeInline(code, ['CreditCard', 'ACH'])).toBe(false);
    });

    it('ignores blank entries in the configured list', () => {
        // `CreditCard,,ACH` or a trailing comma. A blank entry must not match a blank code and turn
        // the feature on for everything.
        expect(ShouldBookFeeInline('', ['CreditCard', '', 'ACH'])).toBe(false);
        expect(ShouldBookFeeInline('ACH', ['CreditCard', '', 'ACH'])).toBe(true);
    });
});
