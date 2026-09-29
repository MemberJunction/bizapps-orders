import { describe, expect, it } from 'vitest';
import {
    AddMonths,
    BuildPaymentSchedule,
    DefaultScheduleWeights,
    ExplainShortfalls,
    ScheduleShortfalls,
    ScheduledCompanyIDs,
    type ScheduleTimingFacts,
} from '../PaymentScheduleBehavior.js';

const CO_A = '00000000-0000-0000-0000-00000000000a';
const CO_B = '00000000-0000-0000-0000-00000000000b';

describe('BuildPaymentSchedule', () => {
    it('ties by construction, front-loading the odd cent', () => {
        const rows = BuildPaymentSchedule({ Total: 100, Count: 3, Cadence: 'Quarterly', FirstDueDate: '2026-01-31' });
        expect(rows.map((r) => r.Amount)).toEqual([33.34, 33.33, 33.33]);
        expect(rows.reduce((s, r) => s + r.Amount, 0)).toBeCloseTo(100, 2);
        expect(rows.map((r) => r.InstallmentNumber)).toEqual([1, 2, 3]);
    });

    it('steps the due date by the cadence, clamping to the month end', () => {
        const rows = BuildPaymentSchedule({ Total: 90, Count: 3, Cadence: 'Monthly', FirstDueDate: '2026-01-31' });
        expect(rows.map((r) => r.DueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
        expect(BuildPaymentSchedule({ Total: 10, Count: 2, Cadence: 'Annual', FirstDueDate: '2028-02-29' })[1].DueDate).toBe('2029-02-28');
    });

    it('honours weights, so the SOP shapes come out exactly', () => {
        const rows = BuildPaymentSchedule({ Total: 75_000, Count: 3, Cadence: 'SemiAnnual', FirstDueDate: '2026-09-01', Weights: DefaultScheduleWeights('OneTime', 75_000) });
        expect(rows.map((r) => r.Amount)).toEqual([37_500, 18_750, 18_750]);
        const big = BuildPaymentSchedule({ Total: 120_000, Count: 4, Cadence: 'Quarterly', FirstDueDate: '2026-09-01', Weights: DefaultScheduleWeights('OneTime', 120_000) });
        expect(big.map((r) => r.Amount)).toEqual([36_000, 28_000, 28_000, 28_000]);
    });

    it('refuses nonsense rather than emitting a schedule that cannot tie', () => {
        expect(() => BuildPaymentSchedule({ Total: 100, Count: 0, Cadence: 'Monthly', FirstDueDate: '2026-01-01' })).toThrow();
        expect(() => BuildPaymentSchedule({ Total: 0, Count: 1, Cadence: 'Monthly', FirstDueDate: '2026-01-01' })).toThrow();
        expect(() => BuildPaymentSchedule({ Total: 100, Count: 2, Cadence: 'Monthly', FirstDueDate: '2026-01-01', Weights: [1] })).toThrow();
    });
});

describe('DefaultScheduleWeights', () => {
    it('follows the SOP tiers', () => {
        expect(DefaultScheduleWeights('OneTime', 10_000)).toEqual([1]);
        expect(DefaultScheduleWeights('OneTime', 50_000)).toEqual([50, 25, 25]);
        expect(DefaultScheduleWeights('OneTime', 250_000)).toHaveLength(4);
        expect(DefaultScheduleWeights('Recurring', 250_000)).toEqual([1]);
        expect(DefaultScheduleWeights('Recurring', 250_000, true)).toEqual([1, 1]);
        // Semi-annual needs BOTH the size and the request.
        expect(DefaultScheduleWeights('Recurring', 50_000, true)).toEqual([1]);
    });
});

describe('AddMonths', () => {
    it('is calendar arithmetic, not 30-day arithmetic', () => {
        expect(AddMonths('2026-01-15', 1)).toBe('2026-02-15');
        expect(AddMonths('2026-11-30', 3)).toBe('2027-02-28');
    });
});

describe('ScheduleShortfalls', () => {
    const lines = [
        { CompanyID: CO_A, LineTotalGross: 60 },
        { CompanyID: CO_A, LineTotalGross: 40 },
        { CompanyID: CO_B, LineTotalGross: 200 },
    ];

    it('is empty with no rows — the implicit instalment needs nothing', () => {
        expect(ScheduleShortfalls([], lines)).toEqual([]);
    });

    it('is empty when every company ties, ignoring cancelled rows and case', () => {
        const rows = [
            { CompanyID: CO_A.toUpperCase(), Amount: 50, Status: 'Scheduled' },
            { CompanyID: CO_A, Amount: 50, Status: 'Invoiced' },
            { CompanyID: CO_A, Amount: 999, Status: 'Canceled' },
            { CompanyID: CO_B, Amount: 200, Status: 'Scheduled' },
        ];
        expect(ScheduleShortfalls(rows, lines)).toEqual([]);
    });

    it('names the company and the amount when it does not tie, including a company with no rows at all', () => {
        const rows = [{ CompanyID: CO_A, Amount: 90, Status: 'Scheduled' }];
        const out = ScheduleShortfalls(rows, lines);
        expect(out).toEqual([
            { CompanyID: CO_A, Scheduled: 90, Lines: 100, Difference: 10 },
            { CompanyID: CO_B, Scheduled: 0, Lines: 200, Difference: 200 },
        ]);
        const text = ExplainShortfalls('ORD-7', out, (id) => (id === CO_A ? 'Acme' : 'Beta'));
        expect(text).toContain('ORD-7');
        expect(text).toContain('Acme: 90.00 scheduled against 100.00 of lines (10.00 unscheduled)');
        expect(text).toContain('Beta: 0.00 scheduled against 200.00 of lines (200.00 unscheduled)');
    });

    it('tolerates half a cent and nothing more', () => {
        expect(ScheduleShortfalls([{ CompanyID: CO_B, Amount: 200.004, Status: 'Scheduled' }], lines.slice(2))).toEqual([]);
        expect(ScheduleShortfalls([{ CompanyID: CO_B, Amount: 200.01, Status: 'Scheduled' }], lines.slice(2))).toHaveLength(1);
    });
});

describe('ScheduledCompanyIDs', () => {
    const row = (over: Partial<ScheduleTimingFacts> = {}): ScheduleTimingFacts => ({
        CompanyID: CO_A,
        Amount: 100,
        Status: 'Scheduled',
        DueDate: '2027-07-01',
        ...over,
    });

    it('is EMPTY for no rows — which is what makes every order that exists today book unchanged', () => {
        expect(ScheduledCompanyIDs([]).size).toBe(0);
    });

    it('names each company that has a live row, lower-cased', () => {
        const ids = ScheduledCompanyIDs([row(), row({ CompanyID: CO_B.toUpperCase() })]);
        expect([...ids].sort()).toEqual([CO_A, CO_B]);
    });

    it('counts a row live whatever its status, so long as it has not been cancelled', () => {
        for (const Status of ['Scheduled', 'Invoiced', 'Paid', 'WrittenOff']) {
            expect(ScheduledCompanyIDs([row({ Status })]).has(CO_A)).toBe(true);
        }
    });

    it('ignores a Canceled row — a company whose only row was cancelled books normally', () => {
        expect(ScheduledCompanyIDs([row({ Status: 'Canceled' })]).size).toBe(0);
        expect(ScheduledCompanyIDs([row({ Status: 'Canceled' }), row()]).has(CO_A)).toBe(true);
    });

    it('does NOT depend on the due date — D92 asks whether a company is billed by instalment, not when', () => {
        const past = ScheduledCompanyIDs([row({ DueDate: '2020-01-01' })]);
        const future = ScheduledCompanyIDs([row({ DueDate: '2099-01-01' })]);
        expect(past.has(CO_A)).toBe(true);
        expect(future.has(CO_A)).toBe(true);
    });

    it('agrees with the tie check about which rows are live', () => {
        // Both read LIVE_STATUSES, so a row that counts toward the tie also makes its company
        // scheduled. If these ever diverged, a company could tie yet book at confirm anyway.
        const rows = [row({ Status: 'Canceled' })];
        expect(ScheduleShortfalls(rows, [{ CompanyID: CO_A, LineTotalGross: 0 }])).toEqual([]);
        expect(ScheduledCompanyIDs(rows).size).toBe(0);
    });
});
