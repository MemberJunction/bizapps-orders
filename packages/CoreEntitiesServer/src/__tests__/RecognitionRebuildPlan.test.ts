/**
 * Rebuilding a booked line's recognition (golive #495): Pending, unbatched releases are voided and what they were
 * going to release is staged again under the product's current type; batched or posted releases stay.
 */
import { describe, expect, it } from 'vitest';
import { PlanRecognitionRebuild, type RecognitionRebuildInput, type RecognitionRebuildPlan } from '../RecognitionRebuildPlan.js';
import { AllBackEndDriver, EvenOverTimeDriver } from '../RevenueRecognition.js';
import type { StagedEntry } from '../TermExtensionPlan.js';

const DEFERRED = 'gl-deferred';
const SALES = 'gl-sales';
const DISCOUNTS = 'gl-discounts';
const DIM = [{ DimensionID: 'dim-venture', DimensionValueID: 'v-1' }];

function release(id: string, iso: string, amount: number, opts: { discount?: number; status?: string; batch?: string } = {}): StagedEntry {
    const discount = opts.discount ?? 0;
    return {
        ID: id,
        EntryNumber: `JE-${id}`,
        EffectiveDate: new Date(`${iso}T00:00:00Z`),
        Status: opts.status ?? 'Pending',
        JournalEntryBatchID: opts.batch ?? null,
        Lines: [
            { GLAccountID: DEFERRED, DebitAmount: amount, CreditAmount: null, Description: 'Release deferred — Consulting', Dimensions: DIM },
            ...(discount ? [{ GLAccountID: DISCOUNTS, DebitAmount: discount, CreditAmount: null, Description: 'Discount — Consulting', Dimensions: DIM }] : []),
            { GLAccountID: SALES, DebitAmount: null, CreditAmount: amount + discount, Description: 'Revenue — Consulting', Dimensions: DIM },
        ],
    };
}

function input(entries: StagedEntry[], overrides: Partial<RecognitionRebuildInput> = {}): RecognitionRebuildInput {
    return {
        Entries: entries,
        Net: 90000,
        Driver: new EvenOverTimeDriver(),
        ServicePeriodStart: new Date('2026-11-11T00:00:00Z'),
        ServicePeriodEnd: new Date('2027-04-30T00:00:00Z'),
        BookingDate: new Date('2026-11-19T00:00:00Z'),
        ProductName: 'Consulting',
        Label: 'Order ORD-1 line 1',
        LinkedEntityID: 'ol',
        LinkedRecordID: 'line-1',
        ...overrides,
    };
}

function plan(i: RecognitionRebuildInput): RecognitionRebuildPlan {
    const p = PlanRecognitionRebuild(i);
    if (typeof p === 'string') throw new Error(p);
    return p;
}

const sum = (xs: { Amount: number }[]) => Math.round(xs.reduce((t, x) => t + x.Amount, 0) * 100) / 100;

describe('PlanRecognitionRebuild', () => {
    it('spreads one on-completion release straight-line over the service period', () => {
        const p = plan(input([release('a', '2027-04-30', 90000)]));
        expect(p.VoidIDs).toEqual(['a']);
        expect(p.Kept).toEqual([]);
        expect(p.Created.length).toBeGreaterThan(1);
        expect(sum(p.Created)).toBe(90000);
        expect(p.AmountReplaced).toBe(90000);
        for (const d of p.Drafts) {
            const debits = d.Lines.reduce((t, l) => t + (l.DebitAmount ?? 0), 0);
            const credits = d.Lines.reduce((t, l) => t + (l.CreditAmount ?? 0), 0);
            expect(Math.round(debits * 100)).toBe(Math.round(credits * 100));
            expect(d.EntryType).toBe('RevenueRecognition');
            expect(d.LinkedRecordID).toBe('line-1');
            expect(d.Lines.every((l) => l.Dimensions?.[0]?.DimensionValueID === 'v-1')).toBe(true);
        }
    });

    it('keeps batched and posted releases and spreads the rest after the last of them', () => {
        const entries = [
            release('a', '2026-11-30', 15000, { status: 'GLPosted' }),
            release('b', '2026-12-31', 15000, { batch: 'batch-1' }),
            release('c', '2027-01-31', 15000),
            release('d', '2027-02-28', 15000),
            release('e', '2027-03-31', 15000),
            release('f', '2027-04-30', 15000),
        ];
        const p = plan(input(entries, { Driver: new AllBackEndDriver() }));
        expect(p.Kept.map((k) => k.EntryNumber)).toEqual(['JE-a', 'JE-b']);
        expect(p.VoidIDs).toEqual(['c', 'd', 'e', 'f']);
        expect(p.Created).toEqual([expect.objectContaining({ EffectiveDate: '2027-04-30', Amount: 60000 })]);
    });

    it('shares the voided entries\' discount across the new ones, to the cent', () => {
        const p = plan(input([release('a', '2027-04-30', 90000, { discount: 10000 })]));
        const discount = p.Drafts.flatMap((d) => d.Lines).filter((l) => l.GLAccountID === DISCOUNTS).reduce((t, l) => t + (l.DebitAmount ?? 0), 0);
        expect(Math.round(discount * 100) / 100).toBe(10000);
    });

    it('refuses a line with nothing staged, nothing pending, or entries that do not add up to its net', () => {
        expect(PlanRecognitionRebuild(input([]))).toMatch(/recognized when it was booked/);
        expect(PlanRecognitionRebuild(input([release('a', '2027-04-30', 90000, { status: 'GLPosted' })]))).toMatch(/nothing left to rebuild/);
        expect(PlanRecognitionRebuild(input([release('a', '2027-04-30', 80000)]))).toMatch(/add up to 80000\.00, not its net of 90000\.00/);
    });

    it('refuses when the schedule already follows the type', () => {
        expect(PlanRecognitionRebuild(input([release('a', '2027-04-30', 90000)], { Driver: new AllBackEndDriver() }))).toMatch(/already follows/);
    });

    it('refuses when no service period is left after the kept entries', () => {
        const entries = [release('a', '2027-04-30', 45000, { status: 'GLPosted' }), release('b', '2027-04-30', 45000)];
        expect(PlanRecognitionRebuild(input(entries))).toMatch(/no period is left/);
    });

    it('ignores voided entries', () => {
        const p = plan(input([release('x', '2026-11-30', 15000, { status: 'Voided' }), release('a', '2027-04-30', 90000)]));
        expect(p.VoidIDs).toEqual(['a']);
    });
});
