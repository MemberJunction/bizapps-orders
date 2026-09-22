/**
 * Reversing a scheduled order (D92 §6).
 *
 * Three rules, and the order they apply in is the whole design: withdraw what was never billed,
 * credit back what was billed and not earned, and refuse rather than strand what was earned and
 * not billed. Andrew's worked Scenario 1 — a 12,000 contract billed quarterly in advance, reversed
 * after five months — is the case these were written against and is asserted at the end.
 */
import { describe, expect, it } from 'vitest';
import {
    CreditMemoByLine,
    InstalmentsToCancel,
    BuildCreditMemoLines,
    RefuseEarnedNotBilled,
    type ContractLineBalance,
    type ReversalScheduleRow,
} from '../ContractBalance.js';

const CO = '11111111-1111-1111-1111-111111111111';

const row = (over: Partial<ReversalScheduleRow> & { ID: string; InstallmentNumber: number }): ReversalScheduleRow => ({
    CompanyID: CO,
    DueDate: '2026-07-01',
    Status: 'Scheduled',
    DocumentNumber: null,
    ...over,
});

const billed = (id: string, n: number, due: string): ReversalScheduleRow =>
    row({ ID: id, InstallmentNumber: n, DueDate: due, Status: 'Invoiced', DocumentNumber: `ORD-1-${n}` });

const line = (id: string, b: number, r: number, num?: number): ContractLineBalance => ({
    OrderLineID: id,
    LineNumber: num ?? 1,
    BilledToDate: b,
    RecognizedToDate: r,
});

describe('InstalmentsToCancel', () => {
    it('withdraws the instalments nobody has been billed for', () => {
        const rows = [billed('a', 1, '2026-07-01'), row({ ID: 'b', InstallmentNumber: 2, DueDate: '2026-10-01' })];
        expect(InstalmentsToCancel(rows)).toEqual(['b']);
    });

    it('never withdraws a row the customer holds an invoice for, whatever its status says', () => {
        // A fully paid instalment reads 'Paid', not 'Invoiced' — the document number is the test.
        const rows = [row({ ID: 'a', InstallmentNumber: 1, Status: 'Paid', DocumentNumber: 'ORD-1-1' })];
        expect(InstalmentsToCancel(rows)).toEqual([]);
    });

    it('is a no-op on rows already cancelled, so reversing twice does not error', () => {
        const rows = [row({ ID: 'a', InstallmentNumber: 1, Status: 'Canceled' })];
        expect(InstalmentsToCancel(rows)).toEqual([]);
    });

    it('returns nothing for an order with no schedule at all', () => {
        expect(InstalmentsToCancel([])).toEqual([]);
    });
});

describe('CreditMemoByLine', () => {
    it('credits back what was billed and not yet earned', () => {
        expect(CreditMemoByLine([line('L1', 6000, 5000)])).toEqual(new Map([['L1', 1000]]));
    });

    it('omits a line that has earned everything it billed', () => {
        expect(CreditMemoByLine([line('L1', 5000, 5000)]).size).toBe(0);
    });

    it('omits a line that earned MORE than it billed — that is the refusal case, not a credit', () => {
        expect(CreditMemoByLine([line('L1', 4000, 5000)]).size).toBe(0);
    });

    it('omits a line that billed nothing', () => {
        expect(CreditMemoByLine([line('L1', 0, 0)]).size).toBe(0);
    });

    it('handles several lines independently, to the penny', () => {
        const memo = CreditMemoByLine([line('L1', 33.33, 11.11, 1), line('L2', 66.67, 66.67, 2), line('L3', 10, 0, 3)]);
        expect([...memo.entries()]).toEqual([['L1', 22.22], ['L3', 10]]);
    });
});

describe('RefuseEarnedNotBilled', () => {
    const AS_OF = '2026-12-01';

    it('lets an advance-billed order through — Deferred, not Unbilled', () => {
        expect(RefuseEarnedNotBilled([line('L1', 6000, 5000)], [], AS_OF)).toBeNull();
    });

    it('lets a fully settled line through', () => {
        expect(RefuseEarnedNotBilled([line('L1', 5000, 5000)], [], AS_OF)).toBeNull();
    });

    it('refuses when a line earned more than it billed, and names the instalment to issue', () => {
        const rows = [billed('a', 1, '2026-07-01'), row({ ID: 'b', InstallmentNumber: 2, DueDate: '2026-10-01' })];
        const message = RefuseEarnedNotBilled([line('L1', 4000, 5000, 2)], rows, AS_OF);
        expect(message).toContain('line 2 (1000.00)');
        expect(message).toContain('Issue instalment 2');
        expect(message).toContain('2026-10-01');
    });

    it('picks the EARLIEST due-but-unissued instalment when several are overdue', () => {
        const rows = [
            row({ ID: 'c', InstallmentNumber: 3, DueDate: '2026-11-01' }),
            row({ ID: 'b', InstallmentNumber: 2, DueDate: '2026-10-01' }),
        ];
        expect(RefuseEarnedNotBilled([line('L1', 4000, 5000)], rows, AS_OF)).toContain('Issue instalment 2');
    });

    it('ignores an instalment that is not due yet — it cannot be the answer', () => {
        const rows = [row({ ID: 'b', InstallmentNumber: 2, DueDate: '2027-01-01' })];
        const message = RefuseEarnedNotBilled([line('L1', 4000, 5000)], rows, AS_OF);
        expect(message).toContain('no instalment is due to bill it with');
        expect(message).not.toContain('Issue instalment');
    });

    it('says so plainly when the schedule cannot cover what was delivered', () => {
        expect(RefuseEarnedNotBilled([line('L1', 0, 500)], [], AS_OF)).toContain('correct the schedule');
    });

    it('names every stranded line, not just the first', () => {
        const message = RefuseEarnedNotBilled([line('L1', 0, 100, 1), line('L2', 0, 250, 2)], [], AS_OF);
        expect(message).toContain('line 1 (100.00)');
        expect(message).toContain('line 2 (250.00)');
    });
});

describe("Andrew's Scenario 1 — 12,000 billed quarterly in advance, reversed at month five", () => {
    // Two instalments of 3,000 issued (months 1 and 4), two still scheduled. Five months of a
    // 12-month service recognised at 1,000 a month.
    const rows = [
        billed('q1', 1, '2026-01-01'),
        billed('q2', 2, '2026-04-01'),
        row({ ID: 'q3', InstallmentNumber: 3, DueDate: '2026-07-01' }),
        row({ ID: 'q4', InstallmentNumber: 4, DueDate: '2026-10-01' }),
    ];
    const lines = [line('L1', 6000, 5000)];
    const asOf = '2026-05-31';

    it('is not refused: billing ran ahead of recognition, which is the ordinary state', () => {
        expect(RefuseEarnedNotBilled(lines, rows, asOf)).toBeNull();
    });

    it('withdraws the two unissued instalments and leaves the two issued ones alone', () => {
        expect(InstalmentsToCancel(rows)).toEqual(['q3', 'q4']);
    });

    it('credits back exactly the 1,000 of Deferred, leaving the 5,000 recognised', () => {
        expect(CreditMemoByLine(lines)).toEqual(new Map([['L1', 1000]]));
    });
});

describe('BuildCreditMemoLines', () => {
    const ACCOUNTS = { AR: 'ar-account', Deferred: 'deferred-account' };
    const DIMS = [{ DimensionID: 'd1', DimensionValueID: 'v1' }];

    it('gives back the deferred balance on both legs, so the entry balances by construction', () => {
        const lines = BuildCreditMemoLines(1000, ACCOUNTS, 'Widget A', DIMS);
        expect(lines).toEqual([
            { GLAccountID: 'deferred-account', DebitAmount: 1000, Description: 'Deferred Revenue — credit memo, Widget A', Dimensions: DIMS },
            { GLAccountID: 'ar-account', CreditAmount: 1000, Description: 'AR — credit memo, Widget A', Dimensions: DIMS },
        ]);
    });

    it('posts nothing when the line has no billed-and-unearned balance', () => {
        expect(BuildCreditMemoLines(0, ACCOUNTS, 'Widget A', DIMS)).toEqual([]);
        expect(BuildCreditMemoLines(-50, ACCOUNTS, 'Widget A', DIMS)).toEqual([]);
    });

    it('carries the line dimensions onto both legs', () => {
        for (const l of BuildCreditMemoLines(10, ACCOUNTS, 'x', DIMS)) expect(l.Dimensions).toBe(DIMS);
    });

    it('rounds to the penny', () => {
        const [debit, credit] = BuildCreditMemoLines(33.335, ACCOUNTS, 'x', DIMS);
        expect(debit.DebitAmount).toBe(33.34);
        expect(credit.CreditAmount).toBe(33.34);
    });
});
