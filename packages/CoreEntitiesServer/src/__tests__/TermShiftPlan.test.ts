import { describe, expect, it } from 'vitest';
import { RevenueRecognitionDriver, type RevRecContext, type RevRecSchedule } from '../RevenueRecognition';
import type { StagedEntry } from '../TermExtensionPlan';
import { PlanTermShift, type TermShiftInput } from '../TermShiftPlan';

/**
 * #507: moving a booked term's start and end together re-spreads the whole amount from the new start, nets the
 * unposted slices, and corrects the past in the current open period instead of reopening it.
 */

const DEFERRED = 'AAAAAAAA-0000-0000-0000-000000000001';
const REVENUE = 'AAAAAAAA-0000-0000-0000-000000000002';
const DIM = [{ DimensionID: 'DDDDDDDD-0000-0000-0000-000000000001', DimensionValueID: 'EEEEEEEE-0000-0000-0000-000000000001' }];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function release(n: number, iso: string, amount: number, overrides: Partial<StagedEntry> = {}): StagedEntry {
    return {
        ID: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
        EntryNumber: `JE-${String(n).padStart(4, '0')}`,
        EffectiveDate: day(iso),
        Status: 'Pending',
        JournalEntryBatchID: null,
        Lines: [
            { GLAccountID: DEFERRED, DebitAmount: amount, CreditAmount: null, Description: 'Release deferred', Dimensions: DIM },
            { GLAccountID: REVENUE, DebitAmount: null, CreditAmount: amount, Description: 'Revenue', Dimensions: DIM },
        ],
        ...overrides,
    };
}

const monthsFrom = (start: string, count: number) => {
    const [y, m] = start.split('-').map(Number);
    return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10));
};

/** Twelve monthly releases of 100 from `start` — a 1,200 annual term recognised monthly. */
function monthlyYear(start: string, overrides: (i: number) => Partial<StagedEntry> = () => ({})): StagedEntry[] {
    return monthsFrom(start, 12).map((iso, i) => release(i + 1, iso, 100, overrides(i)));
}

/** A driver that returns twelve monthly slices from the service start, independent of the host's time zone. */
class MonthlyDriver extends RevenueRecognitionDriver {
    public BuildSchedule(context: RevRecContext): RevRecSchedule {
        const start = context.ServicePeriodStart!.toISOString().slice(0, 7);
        const dates = monthsFrom(start, 12);
        const amounts = this.AllocateEvenly(context.Amount, dates.length);
        return { Entries: dates.map((iso, i) => ({ RecognitionDate: day(iso), Amount: amounts[i], PeriodStart: day(iso), PeriodEnd: day(iso) })) };
    }
}

function input(overrides: Partial<TermShiftInput> = {}): TermShiftInput {
    return {
        Entries: monthlyYear('2026-01'),
        EffectiveDate: day('2026-04-01'),
        NewStartDate: day('2026-03-01'),
        NewEndDate: day('2027-02-28'),
        Driver: new MonthlyDriver(),
        PeriodMonths: 1,
        LinkedEntityID: 'FFFFFFFF-0000-0000-0000-000000000001',
        LinkedRecordID: 'FFFFFFFF-0000-0000-0000-000000000002',
        Label: 'term 1 of SUB-000001 moved to start 2026-03-01',
        ProductName: 'Membership',
        ...overrides,
    };
}

function plan(overrides: Partial<TermShiftInput> = {}) {
    const result = PlanTermShift(input(overrides));
    if (typeof result === 'string') throw new Error(result);
    return result;
}

const debit = (d: { Lines: { DebitAmount?: number }[] }, i = 0) => d.Lines[i].DebitAmount ?? 0;
const sum = (drafts: { Lines: { DebitAmount?: number }[] }[]) => drafts.reduce((s, d) => s + debit(d), 0);

describe('PlanTermShift — start moved later, after recognition began', () => {
    // Jan–Dec 2026 moved two months later to Mar 2026–Feb 2027, effective 1 April. Jan–Mar recognised 300;
    // under the new dates only March (100) belonged before April, so 200 is reversed in the open period.
    it('offsets every unposted slice from the effective day on, each on its own date', () => {
        const p = plan();
        expect(p.Targets.map((t) => t.EntryNumber)).toEqual(['JE-0004', 'JE-0005', 'JE-0006', 'JE-0007', 'JE-0008', 'JE-0009', 'JE-0010', 'JE-0011', 'JE-0012']);
        expect(p.Offsets.map((o) => o.EffectiveDate)).toEqual(p.Targets.map((t) => t.EffectiveDate.toISOString().slice(0, 10)));
        expect(p.Offsets[0].Lines[0]).toMatchObject({ GLAccountID: DEFERRED, CreditAmount: 100 });
        expect(p.Offsets[0].Lines[1]).toMatchObject({ GLAccountID: REVENUE, DebitAmount: 100 });
    });

    it('reverses what the past recognised too early, dated the effective day', () => {
        const p = plan();
        expect(p.RecognisedBefore).toBe(300);
        expect(p.CorrectionAmount).toBe(-200);
        expect(p.Correction?.EffectiveDate).toBe('2026-04-01');
        expect(p.Correction?.Lines[0]).toMatchObject({ GLAccountID: REVENUE, DebitAmount: 200 });
        expect(p.Correction?.Lines[1]).toMatchObject({ GLAccountID: DEFERRED, CreditAmount: 200 });
    });

    it('writes the new slices from the effective day to the new end', () => {
        const p = plan();
        expect(p.Schedule.map((d) => d.EffectiveDate)).toEqual(monthsFrom('2026-04', 11));
        expect(sum(p.Schedule)).toBe(1100);
    });

    it('comes to the term\'s whole amount: recognised before, the correction and the new slices', () => {
        const p = plan();
        expect(p.Total).toBe(1200);
        expect(p.RecognisedBefore + p.CorrectionAmount + sum(p.Schedule)).toBe(1200);
    });
});

describe('PlanTermShift — start moved earlier', () => {
    // Apr 2026–Mar 2027 moved to Jan–Dec 2026, effective 1 April: nothing was recognised before April, but the
    // new dates place January to March before it, so 300 is caught up in the open period.
    it('catches up the missed periods in the open period, never on their own dates', () => {
        const p = plan({ Entries: monthlyYear('2026-04'), NewStartDate: day('2026-01-01'), NewEndDate: day('2026-12-31') });
        expect(p.RecognisedBefore).toBe(0);
        expect(p.CorrectionAmount).toBe(300);
        expect(p.Correction?.EffectiveDate).toBe('2026-04-01');
        expect(p.Correction?.Lines[0]).toMatchObject({ GLAccountID: DEFERRED, DebitAmount: 300 });
        expect(p.Correction?.Lines[1]).toMatchObject({ GLAccountID: REVENUE, CreditAmount: 300 });
        expect(p.Schedule.map((d) => d.EffectiveDate)).toEqual(monthsFrom('2026-04', 9));
        expect(p.Schedule.every((d) => d.EffectiveDate >= '2026-04-01')).toBe(true);
    });
});

describe('PlanTermShift — a term that has not started', () => {
    it('re-spreads from the new start with no correction', () => {
        const p = plan({ Entries: monthlyYear('2026-06'), NewStartDate: day('2026-08-01'), NewEndDate: day('2027-07-31') });
        expect(p.Correction).toBeNull();
        expect(p.Targets).toHaveLength(12);
        expect(p.Schedule.map((d) => d.EffectiveDate)).toEqual(monthsFrom('2026-08', 12));
    });

    it('gives the new start month a full month: the first slice is a full share, dated the new start', () => {
        const p = plan({ Entries: monthlyYear('2026-06'), NewStartDate: day('2026-08-01'), NewEndDate: day('2027-07-31') });
        expect(p.Schedule[0].EffectiveDate).toBe('2026-08-01');
        expect(debit(p.Schedule[0])).toBe(100);
    });
});

describe('PlanTermShift — refusals and edge cases', () => {
    it('refuses when a slice that would need an offset is already batched', () => {
        const entries = monthlyYear('2026-01', (i) => (i === 5 ? { JournalEntryBatchID: 'BBBBBBBB-0000-0000-0000-000000000001' } : {}));
        expect(PlanTermShift(input({ Entries: entries }))).toMatch(/JE-0006.*journal-entry batch/);
    });

    it('leaves batched slices before the effective day alone', () => {
        const entries = monthlyYear('2026-01', (i) => (i < 3 ? { Status: 'Posted', JournalEntryBatchID: 'BBBBBBBB-0000-0000-0000-000000000001' } : {}));
        const p = plan({ Entries: entries });
        expect(p.Targets.every((t) => !t.JournalEntryBatchID)).toBe(true);
        expect(p.CorrectionAmount).toBe(-200);
    });

    it('plans nothing for a term with no staged entries', () => {
        const p = plan({ Entries: [] });
        expect(p.Targets).toEqual([]);
        expect(p.Schedule).toEqual([]);
        expect(p.Correction).toBeNull();
    });

    it('refuses a term that would end before it starts', () => {
        expect(PlanTermShift(input({ NewStartDate: day('2026-05-01'), NewEndDate: day('2026-04-01') }))).toMatch(/cannot end before it starts/);
    });

    it('refuses staged entries when the recognition type defers nothing', () => {
        expect(PlanTermShift(input({ Driver: null }))).toMatch(/defers nothing/);
    });

    it('nets a term amended before: an earlier offset and re-spread count once', () => {
        // The first three slices of an earlier schedule, each offset and replaced by a 150 slice in May.
        const offset = (n: number, iso: string) => {
            const e = release(n, iso, 100);
            return { ...e, Lines: e.Lines.map((l) => ({ ...l, DebitAmount: l.CreditAmount, CreditAmount: l.DebitAmount })) };
        };
        const entries = [
            ...monthlyYear('2026-01'),
            offset(101, '2026-04-01'),
            offset(102, '2026-05-01'),
            release(103, '2026-05-01', 200),
        ];
        const p = plan({ Entries: entries });
        expect(p.Total).toBe(1200);
        expect(p.RecognisedBefore + p.CorrectionAmount + sum(p.Schedule)).toBe(1200);
    });
});
