import { describe, expect, it } from 'vitest';

import { BuildValueEntryLines, type ValueEntryAccounts, type ValueEntryAmounts } from '../OrderJournalEntryFactory.js';
import { SplitExactly } from '../BundleBehavior.js';

const AR = 'acct-ar';
const CREDIT = 'acct-credit';
const DISCOUNT = 'acct-discount';
const TAX = 'acct-tax';

const accounts = (over: Partial<ValueEntryAccounts> = {}): ValueEntryAccounts => ({
    AR,
    Credit: CREDIT,
    CreditLabel: 'Deferred revenue',
    Discount: null,
    ChargeCredits: [],
    ...over,
});

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const debits = (lines: ReturnType<typeof BuildValueEntryLines>): number =>
    money(lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0));
const credits = (lines: ReturnType<typeof BuildValueEntryLines>): number =>
    money(lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0));

describe('BuildValueEntryLines', () => {
    it('balances with no discount: AR debit equals the revenue credit', () => {
        const lines = BuildValueEntryLines({ Net: 300, Tax: 0, Charges: 0, Discount: 0, Gross: 300 }, accounts(), 'Widget', []);
        expect(debits(lines)).toBe(credits(lines));
        expect(lines.find((l) => l.GLAccountID === AR)?.DebitAmount).toBe(300);
        expect(lines.find((l) => l.GLAccountID === CREDIT)?.CreditAmount).toBe(300);
    });

    it('credits GROSS and debits the contra when a discount account resolves', () => {
        const lines = BuildValueEntryLines(
            { Net: 270, Tax: 0, Charges: 0, Discount: 30, Gross: 300 },
            accounts({ Discount: DISCOUNT }),
            'Widget',
            [],
        );
        expect(lines.find((l) => l.GLAccountID === CREDIT)?.CreditAmount).toBe(300);
        expect(lines.find((l) => l.GLAccountID === DISCOUNT)?.DebitAmount).toBe(30);
        expect(debits(lines)).toBe(credits(lines));
    });

    it('nets the discount into the revenue credit when no contra account resolves (D11)', () => {
        const lines = BuildValueEntryLines({ Net: 270, Tax: 0, Charges: 0, Discount: 30, Gross: 300 }, accounts(), 'Widget', []);
        expect(lines.find((l) => l.GLAccountID === CREDIT)?.CreditAmount).toBe(270);
        expect(lines.some((l) => l.GLAccountID === DISCOUNT)).toBe(false);
        expect(debits(lines)).toBe(credits(lines));
    });

    it('debits AR for net + tax + charges and credits each charge its own account (D71)', () => {
        const lines = BuildValueEntryLines(
            { Net: 100, Tax: 8, Charges: 12, Discount: 0, Gross: 100 },
            accounts({ ChargeCredits: [{ GLAccountID: TAX, Amount: 8, Label: 'Sales tax' }, { GLAccountID: 'acct-ship', Amount: 12, Label: 'Shipping' }] }),
            'Widget',
            [],
        );
        expect(lines.find((l) => l.GLAccountID === AR)?.DebitAmount).toBe(120);
        expect(debits(lines)).toBe(credits(lines));
    });

    it('carries the line dimensions onto every leg, so the ledger stays reportable (D31)', () => {
        const dims = [{ DimensionID: 'd1', DimensionValueID: 'v1' }];
        const lines = BuildValueEntryLines(
            { Net: 100, Tax: 0, Charges: 0, Discount: 10, Gross: 110 },
            accounts({ Discount: DISCOUNT, ChargeCredits: [{ GLAccountID: TAX, Amount: 0, Label: 'Tax' }] }),
            'Widget',
            dims,
        );
        expect(lines.every((l) => l.Dimensions === dims)).toBe(true);
    });

    it('returns zero lines unfiltered — dropping them is the caller\'s rule, not the arithmetic\'s', () => {
        const lines = BuildValueEntryLines({ Net: 0, Tax: 0, Charges: 0, Discount: 0, Gross: 0 }, accounts(), 'Comped', []);
        expect(lines).toHaveLength(2);
        expect(lines[0].DebitAmount).toBe(0);
    });
});

describe('an instalment slice sums back to the whole line (gross is DERIVED, never sliced)', () => {
    // THE PROPERTY THAT MATTERS UNDER D91: invoicing every instalment must post, per account,
    // exactly what a non-scheduled order would have posted at confirm — to the penny.
    const line: ValueEntryAmounts = { Net: 1000.01, Tax: 80.02, Charges: 33.33, Discount: 111.11, Gross: 1111.12 };
    const instalments = [333.34, 333.33, 333.33];

    const sliceAll = (field: keyof ValueEntryAmounts): number[] => SplitExactly(line[field], instalments);

    it('each amount splits exactly across the instalments', () => {
        for (const field of ['Net', 'Tax', 'Charges', 'Discount', 'Gross'] as const) {
            const parts = sliceAll(field);
            expect(money(parts.reduce((s, p) => s + p, 0))).toBe(money(line[field]));
        }
    });

    // The charge credits that make the entry balance: AR is debited for net + tax + charges, so
    // tax and charges each need their own credit. Sliced with the same weights as everything else.
    const chargesFor = (amounts: ValueEntryAmounts) => [
        { GLAccountID: TAX, Amount: amounts.Tax, Label: 'Sales tax' },
        { GLAccountID: 'acct-ship', Amount: amounts.Charges, Label: 'Shipping' },
    ];

    it('1000.01 net / 111.11 discount over three instalments: each slice balances and they sum to the whole', () => {
        // THE COUNTER-EXAMPLE THAT FORCED gross TO BE DERIVED. Slicing all five amounts
        // independently gives slice 1 net 333.35 + discount 37.04 = 370.39 against a sliced gross
        // of 370.38 — a one-cent imbalance accounting refuses. Deriving gross from the net and
        // discount pieces keeps `net + discount = gross` true inside each slice AND in total.
        const whole = BuildValueEntryLines(line, accounts({ Discount: DISCOUNT, ChargeCredits: chargesFor(line) }), 'Widget', []);
        const sliced = instalments.map((_, i) => {
            const piece: ValueEntryAmounts = {
                Net: sliceAll('Net')[i],
                Tax: sliceAll('Tax')[i],
                Charges: sliceAll('Charges')[i],
                Discount: sliceAll('Discount')[i],
                // Derived, never sliced independently — see the emitter: three separate roundings
                // do not preserve net + discount = gross within a slice.
                Gross: money(sliceAll('Net')[i] + sliceAll('Discount')[i]),
            };
            return BuildValueEntryLines(piece, accounts({ Discount: DISCOUNT, ChargeCredits: chargesFor(piece) }), 'Widget', []);
        });

        const perAccount = (batch: ReturnType<typeof BuildValueEntryLines>[]): Map<string, number> => {
            const m = new Map<string, number>();
            for (const lines of batch) {
                for (const l of lines) {
                    m.set(l.GLAccountID, money((m.get(l.GLAccountID) ?? 0) + (l.DebitAmount ?? 0) - (l.CreditAmount ?? 0)));
                }
            }
            return m;
        };

        // Every account lands on exactly the figure the single confirm entry would have posted.
        const expected = perAccount([whole]);
        const actual = perAccount(sliced);
        expect([...expected.keys()].sort()).toEqual([...actual.keys()].sort());
        for (const [account, amount] of expected) {
            expect(actual.get(account)).toBe(amount);
        }
        // and each instalment's entry balances on its own, which is what accounting will refuse on
        expect(debits(whole)).toBe(credits(whole));
        for (const lines of sliced) expect(debits(lines)).toBe(credits(lines));
    });
});
