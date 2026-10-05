import { describe, expect, it } from 'vitest';
import {
    AddMonths,
    BuildPaymentSchedule,
    CompanySlices,
    DefaultScheduleWeights,
    ExplainShortfalls,
    RenewalDueDate,
    RenewalScheduleRows,
    ScheduleCoverage,
    ScheduleShortfalls,
    ScheduledCompanyIDs,
    type ScheduleTimingFacts,
} from '../PaymentScheduleBehavior.js';

const CO_A = '00000000-0000-0000-0000-00000000000a';
const CO_B = '00000000-0000-0000-0000-00000000000b';
const CO_C = '00000000-0000-0000-0000-00000000000c';

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
        expect(ScheduleShortfalls([], lines, CO_A)).toEqual([]);
    });

    it('accepts a pre-golive-#311 per-company schedule where every company ties, ignoring cancelled rows and case', () => {
        const rows = [
            { CompanyID: CO_A.toUpperCase(), Amount: 50, Status: 'Scheduled' },
            { CompanyID: CO_A, Amount: 50, Status: 'Invoiced' },
            { CompanyID: CO_A, Amount: 999, Status: 'Canceled' },
            { CompanyID: CO_B, Amount: 200, Status: 'Scheduled' },
        ];
        expect(ScheduleShortfalls(rows, lines, CO_A)).toEqual([]);
    });

    it('ties the order company\'s rows to the whole order when no product company has rows of its own (golive #311)', () => {
        const rows = [
            { CompanyID: CO_C, Amount: 150, Status: 'Scheduled' },
            { CompanyID: CO_C, Amount: 150, Status: 'Scheduled' },
        ];
        expect(ScheduleShortfalls(rows, lines, CO_C)).toEqual([]);
        expect(ScheduleShortfalls(rows, lines, CO_C.toUpperCase())).toEqual([]);
    });

    it('names the order company and the whole order when its rows do not tie', () => {
        const rows = [{ CompanyID: CO_A, Amount: 90, Status: 'Scheduled' }];
        const out = ScheduleShortfalls(rows, lines, CO_A);
        expect(out).toEqual([{ CompanyID: CO_A, Scheduled: 90, Lines: 300, Difference: 210 }]);
        const text = ExplainShortfalls('ORD-7', out, (id) => (id === CO_A ? 'Acme' : 'Beta'));
        expect(text).toContain('ORD-7');
        expect(text).toContain('Acme: 90.00 scheduled against 300.00 of lines (210.00 unscheduled)');
    });

    it('reports a product company\'s own rows that do not tie, and the order company\'s remainder', () => {
        const rows = [
            { CompanyID: CO_B, Amount: 150, Status: 'Invoiced' },
            { CompanyID: CO_A, Amount: 100, Status: 'Scheduled' },
        ];
        expect(ScheduleShortfalls(rows, lines, CO_A)).toEqual([{ CompanyID: CO_B, Scheduled: 150, Lines: 200, Difference: 50 }]);
    });

    it('reports rows for a company that covers no lines', () => {
        const rows = [
            { CompanyID: CO_A, Amount: 300, Status: 'Scheduled' },
            { CompanyID: CO_C, Amount: 5, Status: 'Scheduled' },
        ];
        expect(ScheduleShortfalls(rows, lines, CO_A)).toEqual([{ CompanyID: CO_C, Scheduled: 5, Lines: 0, Difference: -5 }]);
    });

    it('tolerates half a cent and nothing more', () => {
        expect(ScheduleShortfalls([{ CompanyID: CO_B, Amount: 200.004, Status: 'Scheduled' }], lines.slice(2), CO_B)).toEqual([]);
        expect(ScheduleShortfalls([{ CompanyID: CO_B, Amount: 200.01, Status: 'Scheduled' }], lines.slice(2), CO_B)).toHaveLength(1);
    });
});

describe('ScheduleCoverage (golive #311)', () => {
    it('puts every line company under the order company when only the order company has rows', () => {
        const map = ScheduleCoverage([{ CompanyID: CO_C, Amount: 1, Status: 'Scheduled' }], [CO_A, CO_B.toUpperCase()], CO_C);
        expect([...map]).toEqual([
            [CO_A, CO_C],
            [CO_B, CO_C],
        ]);
    });

    it('leaves a product company with live rows of its own on them, and ignores its cancelled rows', () => {
        const rows = [
            { CompanyID: CO_B, Amount: 1, Status: 'Invoiced' },
            { CompanyID: CO_A, Amount: 1, Status: 'Canceled' },
        ];
        const map = ScheduleCoverage(rows, [CO_A, CO_B], CO_C);
        expect(map.get(CO_B)).toBe(CO_B);
        expect(map.get(CO_A)).toBe(CO_C);
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
        expect(ScheduledCompanyIDs([], CO_A, [CO_A]).size).toBe(0);
    });

    it('names each company that has a live row of its own, lower-cased (a pre-golive-#311 schedule)', () => {
        const ids = ScheduledCompanyIDs([row(), row({ CompanyID: CO_B.toUpperCase() })], CO_A, [CO_A, CO_B]);
        expect([...ids].sort()).toEqual([CO_A, CO_B]);
    });

    it('names every line company once the order company has a live row, even one with no lines itself (golive #311)', () => {
        const ids = ScheduledCompanyIDs([row({ CompanyID: CO_C })], CO_C, [CO_A, CO_B.toUpperCase()]);
        expect([...ids].sort()).toEqual([CO_A, CO_B]);
    });

    it('counts a row live whatever its status, so long as it has not been cancelled', () => {
        for (const Status of ['Scheduled', 'Invoiced', 'Paid', 'WrittenOff']) {
            expect(ScheduledCompanyIDs([row({ Status })], CO_A, [CO_A]).has(CO_A)).toBe(true);
        }
    });

    it('ignores a Canceled row — a company whose only row was cancelled books normally', () => {
        expect(ScheduledCompanyIDs([row({ Status: 'Canceled' })], CO_A, [CO_A]).size).toBe(0);
        expect(ScheduledCompanyIDs([row({ Status: 'Canceled' }), row()], CO_A, [CO_A]).has(CO_A)).toBe(true);
    });

    it('does NOT depend on the due date — D92 asks whether a company is billed by instalment, not when', () => {
        const past = ScheduledCompanyIDs([row({ DueDate: '2020-01-01' })], CO_A, [CO_A]);
        const future = ScheduledCompanyIDs([row({ DueDate: '2099-01-01' })], CO_A, [CO_A]);
        expect(past.has(CO_A)).toBe(true);
        expect(future.has(CO_A)).toBe(true);
    });

    it('agrees with the tie check about which rows are live', () => {
        // Both read LIVE_STATUSES, so a row that counts toward the tie also makes its company
        // scheduled. If these ever diverged, a company could tie yet book at confirm anyway.
        const rows = [row({ Status: 'Canceled' })];
        expect(ScheduleShortfalls(rows, [{ CompanyID: CO_A, LineTotalGross: 0 }], CO_A)).toEqual([]);
        expect(ScheduledCompanyIDs(rows, CO_A, [CO_A]).size).toBe(0);
    });
});

describe('RenewalScheduleRows (#305, golive #311)', () => {
    it('writes one row from the order company for the whole gross, due on the invoice day, and ties', () => {
        const lines = [
            { CompanyID: CO_A, LineTotalGross: 1000.01 },
            { CompanyID: CO_B, LineTotalGross: 40 },
            { CompanyID: CO_A, LineTotalGross: 199.99 },
        ];
        const rows = RenewalScheduleRows(lines, '2026-12-21', CO_C);
        expect(rows).toEqual([{ CompanyID: CO_C, InstallmentNumber: 1, DueDate: '2026-12-21', Amount: 1240 }]);
        expect(ScheduleShortfalls(rows.map((r) => ({ ...r, Status: 'Scheduled' })), lines, CO_C)).toEqual([]);
    });

    it('gives a zero-gross order no row, and that still ties', () => {
        const lines = [{ CompanyID: CO_A, LineTotalGross: 0 }];
        expect(RenewalScheduleRows(lines, '2026-12-21', CO_A)).toEqual([]);
    });
});

describe('CompanySlices (golive #311)', () => {
    const lines = [
        { CompanyID: CO_A, LineTotalGross: 1000 },
        { CompanyID: CO_B, LineTotalGross: 250 },
        { CompanyID: CO_B, LineTotalGross: 0.01 },
    ];
    const row = (ID: string, InstallmentNumber: number, Amount: number, over: Record<string, unknown> = {}) => ({
        ID,
        CompanyID: CO_C,
        InstallmentNumber,
        Amount,
        AmountPaid: 0,
        Status: 'Scheduled',
        ...over,
    });

    it('divides each order-company row among the product companies, tying both ways', () => {
        const rows = [row('r1', 1, 416.67), row('r2', 2, 416.67), row('r3', 3, 416.67)];
        const out = CompanySlices(rows, lines, CO_C);
        expect(out).toHaveLength(6);
        for (const r of rows) {
            const parts = out.filter((p) => p.ID === r.ID);
            expect(parts.map((p) => p.CompanyID).sort()).toEqual([CO_A, CO_B]);
            expect(Math.round(parts.reduce((s, p) => s + p.Amount, 0) * 100)).toBe(Math.round(r.Amount * 100));
        }
        const total = (company: string) => Math.round(out.filter((p) => p.CompanyID === company).reduce((s, p) => s + p.Amount, 0) * 100) / 100;
        expect(total(CO_A)).toBe(1000);
        expect(total(CO_B)).toBe(250.01);
    });

    it('keeps the row identity on every piece', () => {
        const out = CompanySlices([row('r1', 1, 1250.01, { DocumentNumber: 'ORD-1', DueDate: '2027-01-01' })], lines, CO_C);
        for (const p of out) {
            expect(p).toMatchObject({ ID: 'r1', InstallmentNumber: 1, Status: 'Scheduled', DocumentNumber: 'ORD-1', DueDate: '2027-01-01' });
        }
    });

    it('divides AmountPaid in proportion to the pieces', () => {
        const out = CompanySlices([row('r1', 1, 1250.01, { AmountPaid: 625 })], lines, CO_C);
        const paid = out.map((p) => p.AmountPaid);
        expect(Math.round(paid.reduce((s, p) => s + p, 0) * 100)).toBe(62500);
        expect(out.find((p) => p.CompanyID === CO_A)?.AmountPaid).toBe(500);
    });

    it('stamps the one company on an order that covers one, and leaves the amounts alone', () => {
        const single = [{ CompanyID: CO_A, LineTotalGross: 300 }];
        const rows = [row('r1', 1, 100, { AmountPaid: 40 }), row('r2', 2, 200)];
        expect(CompanySlices(rows, single, CO_C)).toEqual(rows.map((r) => ({ ...r, CompanyID: CO_A })));
        const own = rows.map((r) => ({ ...r, CompanyID: CO_A }));
        expect(CompanySlices(own, single, CO_A)).toEqual(own);
    });

    it('passes cancelled rows and a product company\'s own rows through unchanged', () => {
        const rows = [
            row('cancelled', 1, 999, { Status: 'Canceled' }),
            row('legacy', 1, 250.01, { CompanyID: CO_B, Status: 'Invoiced' }),
            row('order', 2, 1000),
        ];
        const out = CompanySlices(rows, lines, CO_C);
        expect(out.find((p) => p.ID === 'cancelled')).toEqual(rows[0]);
        expect(out.filter((p) => p.ID === 'legacy')).toEqual([rows[1]]);
        expect(out.filter((p) => p.ID === 'order')).toEqual([{ ...rows[2], CompanyID: CO_A }]);
    });

    it('splits by gross, still summing to each row, when the schedule does not tie', () => {
        const out = CompanySlices([row('r1', 1, 100)], lines, CO_C);
        expect(out.map((p) => p.Amount)).toEqual([80, 20]);
    });
});

describe('RenewalDueDate (#305 review)', () => {
    // The reviewer's example: a Jan 1 term, renewal placed Oct 3, Net 30 (the order is due Jan 31).
    it('is the invoice day plus the terms the order resolved', () => {
        expect(RenewalDueDate('2026-10-03', '2027-01-01', '2027-01-31')).toBe('2026-11-02');
    });

    it('never falls after the order date, so confirm still issues it', () => {
        expect(RenewalDueDate('2026-12-20', '2027-01-01', '2027-01-31')).toBe('2027-01-01');
    });

    it('is the invoice day itself when the order is due on receipt', () => {
        expect(RenewalDueDate('2026-10-03', '2027-01-01', '2027-01-01')).toBe('2026-10-03');
    });

    it('reads Date cells as well as strings', () => {
        expect(RenewalDueDate('2026-10-03', new Date('2027-01-01T00:00:00Z'), new Date('2027-01-16T00:00:00Z'))).toBe('2026-10-18');
    });

    it('refuses an order with no resolved due date rather than guessing', () => {
        expect(() => RenewalDueDate('2026-10-03', '2027-01-01', null)).toThrow(/resolved due date/);
    });
});
