import { describe, expect, it } from 'vitest';
import {
    AddMonths,
    BuildPaymentSchedule,
    DecideDefaultSchedule,
    DefaultScheduleRows,
    DefaultScheduleWeights,
    ExplainShortfalls,
    RenewalDueDate,
    RenewalScheduleRows,
    ResolveInvoiceLeadDays,
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

describe('RenewalScheduleRows (#305)', () => {
    it('writes one row per company for its whole gross, due on the invoice day, and ties', () => {
        const lines = [
            { CompanyID: CO_A, LineTotalGross: 1000.01 },
            { CompanyID: CO_B, LineTotalGross: 40 },
            { CompanyID: CO_A, LineTotalGross: 199.99 },
        ];
        const rows = RenewalScheduleRows(lines, '2026-12-21');
        expect(rows).toEqual([
            { CompanyID: CO_A, InstallmentNumber: 1, DueDate: '2026-12-21', Amount: 1200 },
            { CompanyID: CO_B, InstallmentNumber: 1, DueDate: '2026-12-21', Amount: 40 },
        ]);
        expect(ScheduleShortfalls(rows.map((r) => ({ ...r, Status: 'Scheduled' })), lines)).toEqual([]);
    });

    it('gives a zero-gross company no row, and that still ties', () => {
        const lines = [{ CompanyID: CO_A, LineTotalGross: 0 }];
        expect(RenewalScheduleRows(lines, '2026-12-21')).toEqual([]);
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

describe('ResolveInvoiceLeadDays', () => {
    const unset = { Product: null, Categories: [], Type: null };

    it('the product wins over its category', () => {
        expect(ResolveInvoiceLeadDays({ ...unset, Product: 10, Categories: [90], Type: 60 }, 30)).toBe(10);
    });
    it('a sub-category wins over its parent category', () => {
        expect(ResolveInvoiceLeadDays({ ...unset, Categories: [45, 90] }, 30)).toBe(45);
    });
    it('an unset sub-category inherits the nearest ancestor that states one', () => {
        expect(ResolveInvoiceLeadDays({ ...unset, Categories: [null, undefined, 60, 45] }, 30)).toBe(60);
    });
    it('a category wins over the product type', () => {
        expect(ResolveInvoiceLeadDays({ ...unset, Categories: [null, 90], Type: 60 }, 30)).toBe(90);
    });
    it('the product type wins over the setting', () => {
        expect(ResolveInvoiceLeadDays({ ...unset, Categories: [null, null], Type: 60 }, 30)).toBe(60);
    });
    it('all unset falls to the setting', () => {
        expect(ResolveInvoiceLeadDays({ Product: undefined, Categories: [null, null], Type: undefined }, 30)).toBe(30);
        expect(ResolveInvoiceLeadDays(unset, 30)).toBe(30);
    });
    it('zero is a stated value at every level, not "unset"', () => {
        expect(ResolveInvoiceLeadDays({ Product: 0, Categories: [90], Type: 60 }, 30)).toBe(0);
        expect(ResolveInvoiceLeadDays({ ...unset, Categories: [0, 90], Type: 60 }, 30)).toBe(0);
        expect(ResolveInvoiceLeadDays({ ...unset, Type: 0 }, 30)).toBe(0);
    });
});

describe('DefaultScheduleRows', () => {
    const line = (over: Partial<Parameters<typeof DefaultScheduleRows>[0][number]> = {}) => ({
        CompanyID: CO_A,
        LineTotalGross: 5500,
        ServicePeriodStart: '2027-09-26' as string | null,
        LeadDays: 30,
        ...over,
    });

    it('a start beyond the lead gets one row for the whole gross, due start less lead (ORD-000039)', () => {
        expect(DefaultScheduleRows([line()], '2026-09-26')).toEqual([
            { InstallmentNumber: 1, DueDate: '2027-08-27', Amount: 5500, CompanyID: CO_A },
        ]);
    });

    it('counts calendar days across a month and a leap day', () => {
        expect(DefaultScheduleRows([line({ ServicePeriodStart: '2028-03-15', LeadDays: 30 })], '2027-01-01')[0].DueDate).toBe('2028-02-14');
        expect(DefaultScheduleRows([line({ ServicePeriodStart: '2027-01-01', LeadDays: 90 })], '2026-01-01')[0].DueDate).toBe('2026-10-03');
    });

    it('a start within the lead gets nothing — including the day the lead lands exactly on the order date', () => {
        expect(DefaultScheduleRows([line({ ServicePeriodStart: '2026-10-15' })], '2026-09-26')).toEqual([]);
        expect(DefaultScheduleRows([line({ ServicePeriodStart: '2026-10-26' })], '2026-09-26')).toEqual([]);
        expect(DefaultScheduleRows([line({ ServicePeriodStart: '2026-10-27' })], '2026-09-26')[0].DueDate).toBe('2026-09-27');
    });

    it('a Date cell reads as its calendar day', () => {
        const rows = DefaultScheduleRows([line({ ServicePeriodStart: new Date('2027-09-26T00:00:00Z') as unknown as string })], '2026-09-26');
        expect(rows[0].DueDate).toBe('2027-08-27');
    });

    it('lines with no service period never trigger it, but still count toward the company gross', () => {
        expect(DefaultScheduleRows([line({ ServicePeriodStart: null })], '2026-09-26')).toEqual([]);
        const rows = DefaultScheduleRows([line({ LineTotalGross: 1000 }), line({ ServicePeriodStart: null, LineTotalGross: 250.5 })], '2026-09-26');
        expect(rows.map((r) => r.Amount)).toEqual([1250.5]);
    });

    it('is due on the earliest of each dated line\'s own start less its own lead', () => {
        const rows = DefaultScheduleRows(
            [line({ ServicePeriodStart: '2027-03-01', LeadDays: 30 }), line({ ServicePeriodStart: '2027-04-01', LeadDays: 90 })],
            '2026-09-26',
        );
        // 2027-03-01 − 30 = 2027-01-30; 2027-04-01 − 90 = 2027-01-01. The old earliest-start/lowest-lead
        // pairing said 2027-01-30, billing the 90-day line after its own lead.
        expect(rows[0].DueDate).toBe('2027-01-01');
        expect(rows[0].Amount).toBe(11000);
    });

    it('Robert #344 (2): a long-lead line already inside its lead holds the whole company to confirm', () => {
        const lines = [
            line({ LineTotalGross: 1200, ServicePeriodStart: '2026-08-10', LeadDays: 90 }), // own due 2026-05-12, already passed
            line({ LineTotalGross: 300, ServicePeriodStart: '2027-01-17', LeadDays: 30 }), // own due 2026-12-18
        ];
        // The old rule wrote one 1,500 row due 2026-07-11. Now: no row, both book at confirm.
        expect(DefaultScheduleRows(lines, '2026-07-01')).toEqual([]);
    });

    it('90 on the category moves the due date 90 days ahead of the start', () => {
        expect(DefaultScheduleRows([line({ LeadDays: 90 })], '2026-09-26')[0].DueDate).toBe('2027-06-28');
    });

    it('each company gets its own row, and a company within its lead gets none', () => {
        const rows = DefaultScheduleRows(
            [
                line({ CompanyID: CO_A, LineTotalGross: 100 }),
                line({ CompanyID: CO_B, LineTotalGross: 200, ServicePeriodStart: '2027-12-01' }),
                line({ CompanyID: CO_B.toUpperCase(), LineTotalGross: 50, ServicePeriodStart: null }),
            ],
            '2026-09-26',
        );
        expect(rows).toEqual([
            { InstallmentNumber: 1, DueDate: '2027-08-27', Amount: 100, CompanyID: CO_A },
            { InstallmentNumber: 1, DueDate: '2027-11-01', Amount: 250, CompanyID: CO_B },
        ]);
        expect(DefaultScheduleRows([line({ CompanyID: CO_A }), line({ CompanyID: CO_B, ServicePeriodStart: '2026-10-01' })], '2026-09-26').map((r) => r.CompanyID)).toEqual([CO_A]);
    });

    it('a company whose lines come to nothing gets no row', () => {
        expect(DefaultScheduleRows([line({ LineTotalGross: 0 })], '2026-09-26')).toEqual([]);
        expect(DefaultScheduleRows([line({ LineTotalGross: -5500 })], '2026-09-26')).toEqual([]);
    });

    it('refuses an order day that is not YYYY-MM-DD', () => {
        expect(() => DefaultScheduleRows([line()], '9/26/2026')).toThrow(/YYYY-MM-DD/);
    });

    // A spawned renewal (#305) is dated its term start and already carries its own row before
    // confirm, so confirm skips the default. Even without that row, a line starting on the order
    // date can never clear the lead, so the default can never add a second row to a renewal.
    it('a renewal-shaped order (service starts on the order date) gets nothing at any lead, including zero', () => {
        for (const lead of [0, 30, 90]) {
            expect(DefaultScheduleRows([line({ ServicePeriodStart: '2027-01-01', LeadDays: lead })], '2027-01-01')).toEqual([]);
        }
    });
});

describe('mixed companies, only some qualify (Robert #344 (1))', () => {
    const orderDay = '2026-07-01';
    const lines = (bStart: string | null) => [
        { CompanyID: CO_A, LineTotalGross: 1200, ServicePeriodStart: '2027-01-01', LeadDays: 30 },
        { CompanyID: CO_B, LineTotalGross: 300, ServicePeriodStart: bStart, LeadDays: 30 },
    ];

    for (const [label, bStart] of [['undated', null], ['within its lead', '2026-07-15']] as const) {
        it(`B ${label}: A gets one row due 2026-12-02, B none, and the scoped re-check passes`, () => {
            const drafts = DefaultScheduleRows(lines(bStart), orderDay);
            expect(drafts).toEqual([{ InstallmentNumber: 1, DueDate: '2026-12-02', Amount: 1200, CompanyID: CO_A }]);

            const rows = drafts.map((d) => ({ CompanyID: d.CompanyID, Amount: d.Amount, Status: 'Scheduled', DueDate: d.DueDate }));
            const defaulted = new Set(drafts.map((d) => d.CompanyID.toLowerCase()));
            // Confirm re-verifies only the companies that got a row: nothing short, so confirm goes ahead.
            expect(ScheduleShortfalls(rows, lines(bStart), defaulted)).toEqual([]);
            // B is not billed by instalment, so the factory books its receivable at confirm as before.
            expect([...ScheduledCompanyIDs(rows)]).toEqual([CO_A]);
            // The strict every-company check (hand-entered schedules) still names B.
            expect(ScheduleShortfalls(rows, lines(bStart))).toEqual([{ CompanyID: CO_B, Scheduled: 0, Lines: 300, Difference: 300 }]);
        });
    }

    it('the scoped check still refuses a defaulted company that does not tie', () => {
        const rows = [{ CompanyID: CO_A, Amount: 1100, Status: 'Scheduled' }];
        expect(ScheduleShortfalls(rows, lines(null), new Set([CO_A]))).toEqual([{ CompanyID: CO_A, Scheduled: 1100, Lines: 1200, Difference: 100 }]);
    });
});

describe('DecideDefaultSchedule (#344 review)', () => {
    const base = { HasSchedule: false, IsReversal: false, PaidAtConfirm: false, HasDatedLines: true };

    it('writes only for an unscheduled, unpaid, non-reversal order with a dated line', () => {
        expect(DecideDefaultSchedule(base)).toEqual({ Write: true });
    });

    it('skips each blocking input on its own, naming it', () => {
        expect(DecideDefaultSchedule({ ...base, HasSchedule: true })).toEqual({ Write: false, Reason: 'HasSchedule' });
        expect(DecideDefaultSchedule({ ...base, IsReversal: true })).toEqual({ Write: false, Reason: 'Reversal' });
        expect(DecideDefaultSchedule({ ...base, PaidAtConfirm: true })).toEqual({ Write: false, Reason: 'PaidAtConfirm' });
        expect(DecideDefaultSchedule({ ...base, HasDatedLines: false })).toEqual({ Write: false, Reason: 'NoDatedLines' });
    });

    it('writes for exactly one of all sixteen input combinations', () => {
        const bools = [false, true];
        let writes = 0;
        for (const HasSchedule of bools) for (const IsReversal of bools) for (const PaidAtConfirm of bools) for (const HasDatedLines of bools) {
            if (DecideDefaultSchedule({ HasSchedule, IsReversal, PaidAtConfirm, HasDatedLines }).Write) writes++;
        }
        expect(writes).toBe(1);
    });
});
