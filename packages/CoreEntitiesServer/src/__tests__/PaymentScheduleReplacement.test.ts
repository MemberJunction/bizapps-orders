import { describe, expect, it } from 'vitest';
import {
    NormaliseReplacementRows,
    PlanScheduleReplacement,
    type ExistingScheduleRow,
    type ScheduleReplacementPlan,
    type ScheduleReplacementRow,
} from '../PaymentScheduleReplacement.js';
import { ScheduleShortfalls } from '../PaymentScheduleBehavior.js';

const CO = 'cccccccc-0000-4000-8000-000000000001';
const OTHER = 'cccccccc-0000-4000-8000-000000000002';
const QUOTED = { OrderNumber: 'ORD-1', Status: 'Quoted', CompanyID: CO };
const CONFIRMED = { ...QUOTED, Status: 'Confirmed' };

const FOUR: ScheduleReplacementRow[] = [
    { DueDate: '2026-10-15', Amount: 2500 },
    { DueDate: '2027-01-15', Amount: 2500 },
    { DueDate: '2027-04-15', Amount: 2500 },
    { DueDate: '2027-07-15', Amount: 2500.03 },
];

const row = (n: number, status: string, due: string, amount: number, extra: Partial<ExistingScheduleRow> = {}): ExistingScheduleRow => ({
    ID: `row-${n}`,
    CompanyID: CO,
    InstallmentNumber: n,
    DueDate: due,
    Amount: amount,
    Status: status,
    ...extra,
});

function plan(order = QUOTED, existing: ExistingScheduleRow[] = [], supplied = FOUR): ScheduleReplacementPlan {
    const out = PlanScheduleReplacement(order, existing, supplied);
    if ('Refused' in out) throw new Error(`refused: ${out.Message}`);
    return out;
}

describe('NormaliseReplacementRows', () => {
    it('accepts days and Dates, rounds to the cent, trims descriptions', () => {
        const out = NormaliseReplacementRows([
            { DueDate: '2026-10-15', Amount: 10.005, Description: '  Q1 ' },
            { DueDate: new Date('2027-01-15T00:00:00Z'), Amount: 5 },
        ]);
        expect(out).toEqual([
            { DueDate: '2026-10-15', Amount: 10.01, Description: 'Q1' },
            { DueDate: '2027-01-15', Amount: 5, Description: null },
        ]);
    });

    it.each([
        [{ DueDate: null, Amount: 1 }, 'no valid due date'],
        [{ DueDate: '2026-02-30', Amount: 1 }, 'no valid due date'],
        [{ DueDate: '2026-10-15', Amount: null }, 'greater than zero'],
        [{ DueDate: '2026-10-15', Amount: 0 }, 'greater than zero'],
        [{ DueDate: '2026-10-15', Amount: 0.004 }, 'greater than zero'],
        [{ DueDate: '11/01/2026', Amount: 1 }, 'no valid due date'],
        [{ DueDate: '2026-11-01 junk', Amount: 1 }, 'no valid due date'],
        [{ DueDate: '2026-11-01T00:00:00Z', Amount: 1 }, 'no valid due date'],
        [{ DueDate: new Date('nonsense'), Amount: 1 }, 'no valid due date'],
        [{ DueDate: '2026-10-15', Amount: '5' }, 'greater than zero'],
        [{ DueDate: '2026-10-15', Amount: true }, 'greater than zero'],
        [{ DueDate: '2026-10-15', Amount: [5] }, 'greater than zero'],
    ])('refuses %j', (bad, words) => {
        const out = NormaliseReplacementRows([bad]);
        expect('Refused' in out && out.Code).toBe('INVALID_ROW');
        expect('Refused' in out && out.Message).toContain(words);
    });
});

describe('PlanScheduleReplacement', () => {
    it('creates one row per supplied row on an order with none, numbered by due date', () => {
        const p = plan(QUOTED, [], [...FOUR].reverse());
        expect(p.Insert.map((r) => [r.InstallmentNumber, r.DueDate])).toEqual([
            [1, '2026-10-15'],
            [2, '2027-01-15'],
            [3, '2027-04-15'],
            [4, '2027-07-15'],
        ]);
        expect(p.Delete).toEqual([]);
        expect(p.Update).toEqual([]);
    });

    it('writes nothing when the order already has the schedule', () => {
        const existing = FOUR.map((r, i) => row(i + 1, 'Scheduled', r.DueDate, r.Amount, { Description: null }));
        expect(plan(QUOTED, existing).Unchanged).toBe(true);
    });

    it('re-dates and re-amounts Scheduled rows in place, deleting only the surplus', () => {
        const existing = [
            row(1, 'Scheduled', '2026-10-15', 5000),
            row(2, 'Scheduled', '2027-01-15', 2500),
            row(3, 'Scheduled', '2027-04-15', 2500.03),
        ];
        const p = plan(QUOTED, existing, [
            { DueDate: '2026-11-01', Amount: 6000 },
            { DueDate: '2027-02-01', Amount: 4000.03 },
        ]);
        expect(p.Delete).toEqual(['row-3']);
        expect(p.Update.map((u) => [u.ID, u.InstallmentNumber, u.DueDate, u.Amount])).toEqual([
            ['row-1', 1, '2026-11-01', 6000],
            ['row-2', 2, '2027-02-01', 4000.03],
        ]);
        expect(p.Insert).toEqual([]);
    });

    it('keeps an invoiced row that the list repeats, and numbers new rows around it', () => {
        const existing = [
            row(1, 'Invoiced', '2026-10-15', 2500, { DocumentNumber: 'ORD-1-1' }),
            row(2, 'Scheduled', '2027-01-15', 7500.03),
        ];
        const p = plan(CONFIRMED, existing);
        expect(p.Final.map((r) => [r.InstallmentNumber, r.DueDate, r.Amount, r.Kept])).toEqual([
            [1, '2026-10-15', 2500, true],
            [2, '2027-01-15', 2500, false],
            [3, '2027-04-15', 2500, false],
            [4, '2027-07-15', 2500.03, false],
        ]);
        expect(p.Update).toEqual([{ ID: 'row-2', InstallmentNumber: 2, DueDate: '2027-01-15', Amount: 2500, Description: null }]);
        expect(p.Insert.map((r) => r.InstallmentNumber)).toEqual([3, 4]);
    });

    it('refuses a list that changes an invoiced row, naming it', () => {
        const existing = [row(1, 'Paid', '2026-10-15', 2500, { DocumentNumber: 'ORD-1-1' }), row(2, 'Scheduled', '2027-01-15', 7500.03)];
        const out = PlanScheduleReplacement(CONFIRMED, existing, [
            { DueDate: '2026-10-15', Amount: 2600 },
            { DueDate: '2027-01-15', Amount: 7400.03 },
        ]);
        expect('Refused' in out && out.Code).toBe('INVOICED_ROW_CHANGED');
        expect('Refused' in out && out.Message).toContain('Instalment 1 of order ORD-1 (due 2026-10-15, 2500.00) was invoiced as ORD-1-1');
    });

    it('never reuses a cancelled row or its number', () => {
        const existing = [row(1, 'Canceled', '2026-10-15', 100), row(2, 'Scheduled', '2026-12-01', 9900)];
        const p = plan(QUOTED, existing, [{ DueDate: '2026-12-01', Amount: 10000 }]);
        expect(p.Update).toEqual([{ ID: 'row-2', InstallmentNumber: 2, DueDate: '2026-12-01', Amount: 10000, Description: null }]);
        expect(p.Final.map((r) => r.ID)).toEqual(['row-2']);
    });

    it('moves each reused row to a number at or below the one it holds', () => {
        const existing = [
            row(1, 'Invoiced', '2026-10-15', 100, { DocumentNumber: 'ORD-1-1' }),
            row(3, 'Scheduled', '2027-01-01', 100),
            row(5, 'Scheduled', '2027-02-01', 100),
            row(6, 'Scheduled', '2027-03-01', 100),
        ];
        const p = plan(CONFIRMED, existing, [
            { DueDate: '2026-10-15', Amount: 100 },
            { DueDate: '2027-01-01', Amount: 150 },
            { DueDate: '2027-02-01', Amount: 150 },
        ]);
        expect(p.Delete).toEqual(['row-6']);
        for (const u of p.Update) {
            const before = existing.find((r) => r.ID === u.ID)!;
            expect(u.InstallmentNumber).toBeLessThanOrEqual(before.InstallmentNumber);
        }
        expect(p.Update.map((u) => [u.ID, u.InstallmentNumber])).toEqual([
            ['row-3', 2],
            ['row-5', 3],
        ]);
    });

    it('refuses on a voided order', () => {
        const out = PlanScheduleReplacement({ ...QUOTED, Status: 'Voided' }, [], FOUR);
        expect('Refused' in out && out.Code).toBe('ORDER_VOIDED');
    });

    it('refuses on an order still billed per product company', () => {
        const out = PlanScheduleReplacement(CONFIRMED, [row(1, 'Invoiced', '2026-10-15', 100, { CompanyID: OTHER })], FOUR);
        expect('Refused' in out && out.Code).toBe('PER_COMPANY_SCHEDULE');
    });

    it('refuses to add a schedule to a confirmed order billed in full', () => {
        const out = PlanScheduleReplacement(CONFIRMED, [], FOUR);
        expect('Refused' in out && out.Code).toBe('BILLED_WITHOUT_SCHEDULE');
    });

    it('refuses to remove the schedule of a confirmed order', () => {
        const out = PlanScheduleReplacement(CONFIRMED, [row(1, 'Scheduled', '2026-10-15', 10000.03)], []);
        expect('Refused' in out && out.Code).toBe('SCHEDULE_REQUIRED');
    });

    it('removes the schedule of an order not yet confirmed', () => {
        const p = plan(QUOTED, [row(1, 'Scheduled', '2026-10-15', 10000.03)], []);
        expect(p.Delete).toEqual(['row-1']);
        expect(p.Final).toEqual([]);
    });

    it('leaves the tie to ScheduleShortfalls on the final rows', () => {
        const lines = [{ CompanyID: CO, LineTotalGross: 10000.03 }];
        expect(ScheduleShortfalls(plan().Final, lines, CO)).toEqual([]);
        const short = plan(QUOTED, [], FOUR.slice(0, 3)).Final;
        expect(ScheduleShortfalls(short, lines, CO)).toEqual([
            { CompanyID: CO, Scheduled: 7500, Lines: 10000.03, Difference: 2500.03 },
        ]);
    });

    // Each of these fails if the planner drops one of its checks: the Description comparison and the
    // InstallmentNumber comparison in sameRow, the used-row guard in matchFrozenRows, and the Canceled
    // filter before the company and booked-order checks.
    it('writes a description-only edit', () => {
        const existing = [row(1, 'Scheduled', '2026-10-15', 10000.03, { Description: 'Old' })];
        const p = plan(QUOTED, existing, [{ DueDate: '2026-10-15', Amount: 10000.03, Description: 'New' }]);
        expect(p.Unchanged).toBe(false);
        expect(p.Update).toEqual([{ ID: 'row-1', InstallmentNumber: 1, DueDate: '2026-10-15', Amount: 10000.03, Description: 'New' }]);
    });

    it('renumbers a lone Scheduled row #5 to 1', () => {
        const p = plan(QUOTED, [row(5, 'Scheduled', '2026-10-15', 10000.03)], [{ DueDate: '2026-10-15', Amount: 10000.03 }]);
        expect(p.Unchanged).toBe(false);
        expect(p.Update).toEqual([{ ID: 'row-5', InstallmentNumber: 1, DueDate: '2026-10-15', Amount: 10000.03, Description: null }]);
    });

    it('needs one supplied row for each of two identical invoiced rows', () => {
        const existing = [
            row(1, 'Invoiced', '2026-10-15', 5000, { DocumentNumber: 'ORD-1-1' }),
            row(2, 'Invoiced', '2026-10-15', 5000, { DocumentNumber: 'ORD-1-2' }),
        ];
        const one = PlanScheduleReplacement(CONFIRMED, existing, [{ DueDate: '2026-10-15', Amount: 5000 }]);
        expect('Refused' in one && one.Code).toBe('INVOICED_ROW_CHANGED');
        expect('Refused' in one && one.Message).toContain('Instalment 2');
        const both = plan(CONFIRMED, existing, [
            { DueDate: '2026-10-15', Amount: 5000 },
            { DueDate: '2026-10-15', Amount: 5000 },
        ]);
        expect(both.Unchanged).toBe(true);
        expect(both.Final.map((r) => r.ID)).toEqual(['row-1', 'row-2']);
    });

    it('ignores a cancelled row from another company', () => {
        const existing = [row(1, 'Canceled', '2026-10-15', 100, { CompanyID: OTHER }), row(2, 'Scheduled', '2026-12-01', 9900)];
        const p = plan(QUOTED, existing, [{ DueDate: '2026-12-01', Amount: 10000 }]);
        expect(p.Update.map((u) => [u.ID, u.InstallmentNumber, u.Amount])).toEqual([['row-2', 2, 10000]]);
    });

    it('treats a confirmed order with only cancelled rows as billed without a schedule', () => {
        const out = PlanScheduleReplacement(CONFIRMED, [row(1, 'Canceled', '2026-10-15', 10000.03)], FOUR);
        expect('Refused' in out && out.Code).toBe('BILLED_WITHOUT_SCHEDULE');
    });
});

describe('a row a payment names', () => {
    const paid = (n: number, due: string, amount: number, amountPaid: number) =>
        row(n, 'Scheduled', due, amount, { AmountPaid: amountPaid, NamedByPayment: true });

    it('refuses to re-date it, naming the instalment', () => {
        // Reuse is by position: prepending a row would move #1 (and its payment) to 2026-11-01.
        const out = PlanScheduleReplacement(QUOTED, [paid(1, '2026-12-01', 500, 500)], [
            { DueDate: '2026-11-01', Amount: 300 },
            { DueDate: '2026-12-01', Amount: 500 },
        ]);
        expect('Refused' in out && out.Code).toBe('PAID_ROW_CHANGED');
        expect('Refused' in out && out.Message).toContain('Instalment 1 of order ORD-1 (due 2026-12-01, 500.00) has a payment applied to it (500.00 paid)');
        expect('Refused' in out && out.Message).toContain('moves it to 2026-11-01');
    });

    it('refuses to lower it below what is paid', () => {
        const out = PlanScheduleReplacement(QUOTED, [paid(1, '2026-12-01', 500, 400)], [{ DueDate: '2026-12-01', Amount: 399.99 }]);
        expect('Refused' in out && out.Code).toBe('PAID_ROW_CHANGED');
        expect('Refused' in out && out.Message).toContain('lowers it to 399.99');
    });

    it('refuses to delete it', () => {
        const out = PlanScheduleReplacement(QUOTED, [row(1, 'Scheduled', '2026-11-01', 500), paid(2, '2026-12-01', 500, 100)], [
            { DueDate: '2026-11-01', Amount: 1000 },
        ]);
        expect('Refused' in out && out.Code).toBe('PAID_ROW_CHANGED');
        expect('Refused' in out && out.Message).toContain('Instalment 2');
        expect('Refused' in out && out.Message).toContain('removes it');
    });

    it('allows a higher amount, a lower one still covering the payment, a new description and a new number', () => {
        const raised = plan(QUOTED, [paid(1, '2026-12-01', 500, 500)], [{ DueDate: '2026-12-01', Amount: 600, Description: 'Q4' }]);
        expect(raised.Update).toEqual([{ ID: 'row-1', InstallmentNumber: 1, DueDate: '2026-12-01', Amount: 600, Description: 'Q4' }]);
        const lowered = plan(QUOTED, [paid(1, '2026-12-01', 500, 400)], [{ DueDate: '2026-12-01', Amount: 400 }]);
        expect(lowered.Update.map((u) => u.Amount)).toEqual([400]);
        const renumbered = plan(QUOTED, [paid(3, '2026-12-01', 500, 500)], [{ DueDate: '2026-12-01', Amount: 500 }]);
        expect(renumbered.Update.map((u) => u.InstallmentNumber)).toEqual([1]);
    });

    it('does not limit a row whose AmountPaid comes only from payments that name no instalment', () => {
        const p = plan(QUOTED, [row(1, 'Scheduled', '2026-12-01', 500, { AmountPaid: 500 })], [{ DueDate: '2026-11-01', Amount: 300 }]);
        expect(p.Update.map((u) => [u.DueDate, u.Amount])).toEqual([['2026-11-01', 300]]);
    });
});
