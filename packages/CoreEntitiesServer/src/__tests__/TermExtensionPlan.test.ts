import { describe, expect, it } from 'vitest';
import { EvenOverTimeDriver, RevenueRecognitionDriver, type RevRecContext, type RevRecSchedule } from '../RevenueRecognition';
import { NetRelease, PlanTermExtension, type StagedEntry, type TermExtensionInput } from '../TermExtensionPlan';

/**
 * Golive #221, case B: extending a term at no charge nets against the staged schedule and re-spreads
 * what is left, prospectively, from the first replaced slice to the new end.
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

/** Twelve monthly releases of 100 across 2026 — a 1,200 annual term recognised monthly. */
function monthlyYear(): StagedEntry[] {
    return Array.from({ length: 12 }, (_, i) => release(i + 1, `2026-${String(i + 1).padStart(2, '0')}-01`, 100));
}

/** A driver that returns fixed slice dates, so these tests do not depend on the host's time zone. */
class FixedDatesDriver extends RevenueRecognitionDriver {
    public constructor(private readonly dates: string[]) {
        super();
    }
    public BuildSchedule(context: RevRecContext): RevRecSchedule {
        const amounts = this.AllocateEvenly(context.Amount, this.dates.length);
        return {
            Entries: this.dates.map((iso, i) => ({ RecognitionDate: day(iso), Amount: amounts[i], PeriodStart: day(iso), PeriodEnd: day(iso) })),
        };
    }
}

const monthsFrom = (start: string, count: number) => {
    const [y, m] = start.split('-').map(Number);
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(Date.UTC(y, m - 1 + i, 1));
        return d.toISOString().slice(0, 10);
    });
};

function input(overrides: Partial<TermExtensionInput> = {}): TermExtensionInput {
    return {
        Entries: monthlyYear(),
        EffectiveDate: day('2026-04-01'),
        CurrentEndDate: day('2026-12-31'),
        NewEndDate: day('2027-03-31'),
        Driver: new FixedDatesDriver(monthsFrom('2026-04', 12)),
        PeriodMonths: 1,
        LinkedEntityID: 'FFFFFFFF-0000-0000-0000-000000000001',
        LinkedRecordID: 'FFFFFFFF-0000-0000-0000-000000000002',
        Label: 'term 1 of SUB-000001 extended to 2027-03-31',
        ProductName: 'Membership',
        ...overrides,
    };
}

function plan(overrides: Partial<TermExtensionInput> = {}) {
    const result = PlanTermExtension(input(overrides));
    if (typeof result === 'string') throw new Error(result);
    return result;
}

describe('PlanTermExtension — 12 months extended to 15 at the same price', () => {
    it('replaces only the slices dated on or after the effective date; earned months stay', () => {
        const p = plan();
        expect(p.Targets.map((t) => t.EntryNumber)).toEqual(
            ['JE-0004', 'JE-0005', 'JE-0006', 'JE-0007', 'JE-0008', 'JE-0009', 'JE-0010', 'JE-0011', 'JE-0012'],
        );
        expect(p.Remaining).toBe(900);
    });

    it('mirrors each replaced slice on its own date, so each period nets to zero before the new schedule', () => {
        const p = plan();
        expect(p.Offsets).toHaveLength(9);
        p.Offsets.forEach((offset, i) => {
            expect(offset.EffectiveDate).toBe(p.Targets[i].EffectiveDate.toISOString().slice(0, 10));
            expect(offset.EntryType).toBe('RevenueRecognition');
            expect(offset.Lines).toEqual([
                { GLAccountID: DEFERRED, CreditAmount: 100, Description: 'Release deferred', Dimensions: DIM },
                { GLAccountID: REVENUE, DebitAmount: 100, Description: 'Revenue', Dimensions: DIM },
            ]);
            expect(offset.Description).toContain(`Offset of ${p.Targets[i].EntryNumber}`);
        });
    });

    it('spreads the unrecognised 900 over the twelve months from April to the new end, with no catch-up', () => {
        const p = plan();
        expect(p.RespreadStart?.toISOString().slice(0, 10)).toBe('2026-04-01');
        expect(p.Respread.map((d) => d.EffectiveDate)).toEqual(monthsFrom('2026-04', 12));
        expect(p.Respread.every((d) => d.Lines[0].DebitAmount === 75 && d.Lines[1].CreditAmount === 75)).toBe(true);
        expect(p.Respread[0].Lines.map((l) => l.GLAccountID)).toEqual([DEFERRED, REVENUE]);
        expect(p.Respread[0].Lines[0].Dimensions).toEqual(DIM);
    });

    it('links every entry it writes to the term, so a later amendment of the same term finds them', () => {
        const p = plan();
        for (const d of [...p.Offsets, ...p.Respread]) {
            expect(d.LinkedEntityID).toBe('FFFFFFFF-0000-0000-0000-000000000001');
            expect(d.LinkedRecordID).toBe('FFFFFFFF-0000-0000-0000-000000000002');
        }
    });

    it('nets each period to the new schedule: every month from April recognises exactly 75', () => {
        const p = plan();
        const byMonth = new Map<string, number>();
        const post = (date: string, lines: { GLAccountID: string; CreditAmount?: number | null; DebitAmount?: number | null }[]) => {
            const revenue = lines.filter((l) => l.GLAccountID === REVENUE).reduce((s, l) => s + Number(l.CreditAmount ?? 0) - Number(l.DebitAmount ?? 0), 0);
            byMonth.set(date, (byMonth.get(date) ?? 0) + revenue);
        };
        for (const e of monthlyYear()) post(e.EffectiveDate.toISOString().slice(0, 10), e.Lines);
        for (const d of [...p.Offsets, ...p.Respread]) post(d.EffectiveDate, d.Lines);
        expect(byMonth.get('2026-01-01')).toBe(100);
        expect(byMonth.get('2026-03-01')).toBe(100);
        for (const month of monthsFrom('2026-04', 12)) expect(byMonth.get(month)).toBe(75);
        expect([...byMonth.values()].reduce((a, b) => a + b, 0)).toBe(1200);
    });
});

describe('PlanTermExtension — refusals', () => {
    it('refuses when a slice it would replace is already in a journal-entry batch', () => {
        const entries = monthlyYear();
        entries[5] = { ...entries[5], Status: 'Batched', JournalEntryBatchID: 'BBBBBBBB-0000-0000-0000-000000000001' };
        const result = PlanTermExtension(input({ Entries: entries }));
        expect(typeof result).toBe('string');
        expect(result).toMatch(/JE-0006.*already in a journal-entry batch/);
    });

    it('does not mind a batched slice dated before the effective date: that revenue is earned', () => {
        const entries = monthlyYear();
        entries[0] = { ...entries[0], Status: 'GLPosted', JournalEntryBatchID: 'BBBBBBBB-0000-0000-0000-000000000001' };
        expect(plan({ Entries: entries }).Targets).toHaveLength(9);
    });

    it('refuses a new end that is not later than the current end', () => {
        expect(PlanTermExtension(input({ NewEndDate: day('2026-12-31') }))).toMatch(/must move the term end later/);
        expect(PlanTermExtension(input({ NewEndDate: day('2026-10-31') }))).toMatch(/must move the term end later/);
    });

    it('refuses staged entries that do not net to one deferred-to-revenue release', () => {
        const entries = monthlyYear();
        entries[11] = release(12, '2026-12-01', 100, {
            Lines: [
                { GLAccountID: DEFERRED, DebitAmount: 100, CreditAmount: null, Description: null, Dimensions: DIM },
                { GLAccountID: 'AAAAAAAA-0000-0000-0000-000000000009', DebitAmount: null, CreditAmount: 100, Description: null, Dimensions: DIM },
            ],
        });
        expect(PlanTermExtension(input({ Entries: entries }))).toMatch(/do not net to a single release/);
    });
});

describe('PlanTermExtension — edge cases', () => {
    it('writes nothing when every slice is already dated before the effective date', () => {
        const p = plan({ EffectiveDate: day('2027-01-15') , CurrentEndDate: day('2026-12-31'), NewEndDate: day('2027-03-31') });
        expect(p).toEqual({ Targets: [], Offsets: [], Respread: [], Remaining: 0, RespreadStart: null });
    });

    it('writes nothing for a term with no staged entries (a recognition type that defers nothing)', () => {
        expect(plan({ Entries: [], Driver: null })).toEqual({ Targets: [], Offsets: [], Respread: [], Remaining: 0, RespreadStart: null });
    });

    it('re-amends a term that was amended before: earlier offsets and re-spread net to one release', () => {
        const first = plan();
        // The ledger after the first amendment, as a second one would read it back.
        const stored: StagedEntry[] = [
            ...monthlyYear(),
            ...first.Offsets.map((d, i) => ({
                ID: `10000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
                EntryNumber: `JE-1${String(i).padStart(3, '0')}`,
                EffectiveDate: day(d.EffectiveDate),
                Status: 'Pending',
                JournalEntryBatchID: null,
                Lines: d.Lines.map((l) => ({ GLAccountID: l.GLAccountID, DebitAmount: l.DebitAmount ?? null, CreditAmount: l.CreditAmount ?? null, Description: l.Description ?? null, Dimensions: l.Dimensions ?? [] })),
            })),
            ...first.Respread.map((d, i) => ({
                ID: `20000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
                EntryNumber: `JE-2${String(i).padStart(3, '0')}`,
                EffectiveDate: day(d.EffectiveDate),
                Status: 'Pending',
                JournalEntryBatchID: null,
                Lines: d.Lines.map((l) => ({ GLAccountID: l.GLAccountID, DebitAmount: l.DebitAmount ?? null, CreditAmount: l.CreditAmount ?? null, Description: l.Description ?? null, Dimensions: l.Dimensions ?? [] })),
            })),
        ];
        const second = plan({
            Entries: stored,
            EffectiveDate: day('2026-07-01'),
            CurrentEndDate: day('2027-03-31'),
            NewEndDate: day('2027-06-30'),
            Driver: new FixedDatesDriver(monthsFrom('2026-07', 12)),
        });
        // July onwards under the first amendment: nine months of 75.
        expect(second.Remaining).toBe(675);
        expect(second.Respread).toHaveLength(12);
        expect(second.Respread.reduce((s, d) => s + (d.Lines[0].DebitAmount ?? 0), 0)).toBe(675);
        expect(second.Respread[0].Lines.map((l) => l.GLAccountID)).toEqual([DEFERRED, REVENUE]);
    });

    it('keeps the new schedule summing exactly to what it replaces when the split does not divide evenly', () => {
        const p = plan({ Driver: new FixedDatesDriver(monthsFrom('2026-04', 7)) });
        const total = p.Respread.reduce((s, d) => s + (d.Lines[0].DebitAmount ?? 0), 0);
        expect(Math.round(total * 100) / 100).toBe(900);
    });

    it('cuts the new schedule with the real straight-line driver', () => {
        const p = plan({ Driver: new EvenOverTimeDriver(), PeriodMonths: 1 });
        expect(p.Respread.length).toBeGreaterThanOrEqual(11);
        expect(Math.round(p.Respread.reduce((s, d) => s + (d.Lines[0].DebitAmount ?? 0), 0) * 100) / 100).toBe(900);
    });
});

describe('NetRelease', () => {
    it('is zero when the entries cancel out', () => {
        const a = release(1, '2026-05-01', 100);
        const b = { ...release(2, '2026-05-01', 100), Lines: a.Lines.map((l) => ({ ...l, DebitAmount: l.CreditAmount, CreditAmount: l.DebitAmount })) };
        const net = NetRelease([a, b]);
        expect(typeof net === 'string' ? net : net.Amount).toBe(0);
    });
});
