import { describe, expect, it } from 'vitest';
import { CreditMemoEntry, CreditMemoNumber, ScheduleShare, SplitCreditMemo, type CreditMemoEntryInput } from '../AmountChangePlan';

/**
 * #662: an amount change the uninvoiced instalments cannot absorb in full is credited on a credit memo. The memo
 * carries the rest of the reduction in the reduction's own net-to-tax proportion, posts deferred revenue and tax
 * against the receivable, and is numbered after its order.
 */

describe('SplitCreditMemo — the memo as net and tax', () => {
    it('is the whole reduction when nothing came off the instalments', () => {
        expect(SplitCreditMemo(324, 300, 324)).toEqual({ Gross: 324, Net: 300, Tax: 24 });
    });

    it('keeps the reduction’s proportion for a part', () => {
        expect(SplitCreditMemo(108, 300, 324)).toEqual({ Gross: 108, Net: 100, Tax: 8 });
    });

    it('rounds the net and gives the tax the rest, so the two sum to the memo', () => {
        const split = SplitCreditMemo(100, 333.33, 360);
        expect(split.Net).toBe(92.59);
        expect(split.Tax).toBe(7.41);
        expect(split.Net + split.Tax).toBeCloseTo(100, 2);
    });

    it('is zero when no memo is needed', () => {
        expect(SplitCreditMemo(0, 300, 324)).toEqual({ Gross: 0, Net: 0, Tax: 0 });
    });

    it('refuses a memo larger than the reduction', () => {
        expect(() => SplitCreditMemo(400, 300, 324)).toThrow(/more than the 324.00 reduction/);
    });
});

describe('ScheduleShare — what a change took off the instalment billing', () => {
    it('is the whole reduction when no memo was issued, as before credit memos', () => {
        expect(ScheduleShare(324, 0, 300)).toEqual({ Net: 300, Tax: 24, Gross: 324 });
    });

    it('is the reduction less the memo’s part', () => {
        expect(ScheduleShare(216, 108, 300)).toEqual({ Net: 200, Tax: 16, Gross: 216 });
    });

    it('is nothing when the memo took it all', () => {
        expect(ScheduleShare(0, 324, 300)).toEqual({ Net: 0, Tax: 0, Gross: 0 });
    });
});

describe('CreditMemoEntry — deferred revenue and tax against the receivable', () => {
    const input: CreditMemoEntryInput = {
        Split: { Gross: 324, Net: 300, Tax: 24 },
        EffectiveDate: '2026-10-12',
        EntryType: 'Invoice',
        DocumentNumber: 'ORD-000042-CM1',
        Label: 'term 1 of SUB-000004 reduced to 900.00',
        ProductName: 'Annual plan',
        LinkedEntityID: 'ENTITY',
        LinkedRecordID: 'LINE',
        Accounts: { AR: 'AR', Deferred: 'DEFERRED' },
        TaxCredits: [
            { GLAccountID: 'STATE', Amount: 72, Label: 'State tax' },
            { GLAccountID: 'COUNTY', Amount: 24, Label: 'County tax' },
        ],
        Dimensions: [],
    };

    it('balances, splitting the tax over the line’s tax accounts', () => {
        const entry = CreditMemoEntry(input);
        if (typeof entry === 'string') throw new Error(entry);
        expect(entry.EffectiveDate).toBe('2026-10-12');
        expect(entry.Lines.map((l) => [l.GLAccountID, l.DebitAmount ?? 0, l.CreditAmount ?? 0])).toEqual([
            ['DEFERRED', 300, 0],
            ['STATE', 18, 0],
            ['COUNTY', 6, 0],
            ['AR', 0, 324],
        ]);
    });

    it('rounds the tax pieces so they sum to exactly the memo’s tax', () => {
        const entry = CreditMemoEntry({
            ...input,
            Split: { Gross: 110.01, Net: 100, Tax: 10.01 },
            TaxCredits: [
                { GLAccountID: 'A', Amount: 1, Label: 'A' },
                { GLAccountID: 'B', Amount: 1, Label: 'B' },
                { GLAccountID: 'C', Amount: 1, Label: 'C' },
            ],
        });
        if (typeof entry === 'string') throw new Error(entry);
        const debits = entry.Lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0);
        const credits = entry.Lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0);
        expect(debits).toBeCloseTo(110.01, 2);
        expect(credits).toBe(110.01);
    });

    it('posts no tax lines for an untaxed line', () => {
        const entry = CreditMemoEntry({ ...input, Split: { Gross: 300, Net: 300, Tax: 0 }, TaxCredits: [] });
        if (typeof entry === 'string') throw new Error(entry);
        expect(entry.Lines.map((l) => l.GLAccountID)).toEqual(['DEFERRED', 'AR']);
    });

    it('refuses tax with no account to take it back from', () => {
        expect(CreditMemoEntry({ ...input, TaxCredits: [] })).toMatch(/no account to take it back from/);
    });

    it('refuses an empty memo', () => {
        expect(CreditMemoEntry({ ...input, Split: { Gross: 0, Net: 0, Tax: 0 } })).toMatch(/no credit memo/);
    });
});

describe('CreditMemoNumber — numbered after the order', () => {
    it('starts at 1', () => {
        expect(CreditMemoNumber('ORD-000042', [])).toBe('ORD-000042-CM1');
    });

    it('takes the next after the highest, ignoring other orders’ numbers', () => {
        expect(CreditMemoNumber('ORD-000042', ['ORD-000042-CM1', 'ORD-000042-CM3', 'ORD-000043-CM9', null])).toBe('ORD-000042-CM4');
    });
});
