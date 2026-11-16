/**
 * A reversal voids the origin's staged recognition instead of mirroring it, when the entry is still
 * Pending in no batch and the mirror cancels it exactly (golive #378, D14 as amended). Everything else
 * is mirrored as before.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { JELineDraft, OrderLineDraft } from '../OrderJournalEntryFactory.js';
import { Cancels, LoadOriginRecognition, PlanRecognitionVoids, type OriginRecognitionEntry } from '../RecognitionVoids.js';

const DEFERRED = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const SALES = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const AR = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const ORIGIN_LINE = '33333333-3333-4333-8333-333333333333';
const RETURN_LINE = '44444444-4444-4444-8444-444444444444';
const TERM = '22222222-2222-4222-8222-222222222222';
const BATCH = 'bbbbbbbb-0000-4000-8000-000000000001';

const MONTHS = ['2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15'];

/** The origin's release for `day`: Dr Deferred / Cr Sales. */
function origin(day: string, amount: number, status = 'Pending', batch: string | null = null): OriginRecognitionEntry {
    return {
        ID: `je-${day}`,
        EntryNumber: `JE-${day}`,
        EffectiveDate: day,
        Status: status,
        JournalEntryBatchID: batch,
        ReversesJournalEntryID: null,
        ReversedByJournalEntryID: null,
        Lines: [
            { GLAccountID: DEFERRED, DebitAmount: amount, CreditAmount: null },
            { GLAccountID: SALES, DebitAmount: null, CreditAmount: amount },
        ],
    };
}

/** The reversing line's mirror for `day`: Dr Sales / Cr Deferred, as the factory books it. */
function mirror(day: string, amount: number, lineID = RETURN_LINE): OrderLineDraft {
    const lines: JELineDraft[] = [
        { GLAccountID: DEFERRED, CreditAmount: amount },
        { GLAccountID: SALES, DebitAmount: amount },
    ];
    return {
        OrderLineID: lineID,
        IsBooking: false,
        RecognitionEntry: { RecognitionDate: new Date(`${day}T00:00:00Z`), Amount: amount, PeriodStart: new Date(), PeriodEnd: new Date() },
        Draft: { EffectiveDate: day, EntryType: 'RevenueRecognition', LinkedEntityID: 'line-entity', LinkedRecordID: lineID, Lines: lines },
    };
}

/** The return's booking reversal: Dr Deferred / Cr AR. Never voided. */
function bookingReversal(amount: number): OrderLineDraft {
    return {
        OrderLineID: RETURN_LINE,
        IsBooking: true,
        Draft: {
            EffectiveDate: '2026-11-10',
            EntryType: 'OrderBooking',
            Lines: [
                { GLAccountID: DEFERRED, DebitAmount: amount },
                { GLAccountID: AR, CreditAmount: amount },
            ],
        },
    };
}

const byLine = (entries: OriginRecognitionEntry[]) => new Map([[RETURN_LINE.toLowerCase(), entries]]);

describe('PlanRecognitionVoids — full return', () => {
    it('voids every staged month when all are Pending, and writes no mirrors', () => {
        const drafts = [bookingReversal(1500), ...MONTHS.map((d) => mirror(d, 250))];
        const plan = PlanRecognitionVoids(drafts, byLine(MONTHS.map((d) => origin(d, 250))));
        expect(plan.Kept).toEqual([drafts[0]]);
        expect(plan.Voids.map((v) => v.EntryNumber)).toEqual(MONTHS.map((d) => `JE-${d}`));
        expect(plan.Voids.every((v) => v.OrderLineID === RETURN_LINE)).toBe(true);
    });

    it('voids the Pending months and mirrors the Batched and GL-posted ones', () => {
        const staged = [
            origin(MONTHS[0], 250, 'GLPosted', BATCH),
            origin(MONTHS[1], 250, 'GLPosted', BATCH),
            origin(MONTHS[2], 250, 'Batched', BATCH),
            origin(MONTHS[3], 250, 'Pending', BATCH), // Pending but in a Pending batch: already swept up
            origin(MONTHS[4], 250),
            origin(MONTHS[5], 250),
        ];
        const drafts = [bookingReversal(1500), ...MONTHS.map((d) => mirror(d, 250))];
        const plan = PlanRecognitionVoids(drafts, byLine(staged));
        expect(plan.Kept.filter((d) => !d.IsBooking).map((d) => d.Draft.EffectiveDate)).toEqual(MONTHS.slice(0, 4));
        expect(plan.Voids.map((v) => v.JournalEntryID)).toEqual([`je-${MONTHS[4]}`, `je-${MONTHS[5]}`]);
    });

    it('mirrors an entry that is part of a reversal pair, or already voided', () => {
        const reversed = { ...origin(MONTHS[0], 250), ReversedByJournalEntryID: 'cccccccc-0000-4000-8000-000000000001' };
        const voided = origin(MONTHS[1], 250, 'Voided');
        const plan = PlanRecognitionVoids([mirror(MONTHS[0], 250), mirror(MONTHS[1], 250)], byLine([reversed, voided]));
        expect(plan.Voids).toEqual([]);
        expect(plan.Kept).toHaveLength(2);
    });
});

describe('PlanRecognitionVoids — cancel Immediately', () => {
    it('voids the whole months the cancellation takes back and mirrors the part month it cuts', () => {
        // Cancelled mid-September with the unused part refunded: September's mirror is the unused part
        // only, so it cannot void September's entry; October onward are whole months.
        const staged = MONTHS.map((d, i) => origin(d, 250, i < 2 ? 'GLPosted' : 'Pending', i < 2 ? BATCH : null));
        const drafts = [mirror(MONTHS[2], 125), mirror(MONTHS[3], 250), mirror(MONTHS[4], 250), mirror(MONTHS[5], 250)];
        const plan = PlanRecognitionVoids(drafts, byLine(staged));
        expect(plan.Kept.map((d) => [d.Draft.EffectiveDate, d.Draft.Lines[0].CreditAmount])).toEqual([[MONTHS[2], 125]]);
        expect(plan.Voids.map((v) => v.JournalEntryID)).toEqual(MONTHS.slice(3).map((d) => `je-${d}`));
    });
});

describe('PlanRecognitionVoids — partial return keeps netting', () => {
    it('mirrors every month when the return takes back only part of each', () => {
        const drafts = MONTHS.map((d) => mirror(d, 125));
        const plan = PlanRecognitionVoids(drafts, byLine(MONTHS.map((d) => origin(d, 250))));
        expect(plan.Voids).toEqual([]);
        expect(plan.Kept).toEqual(drafts);
    });

    it('lets one origin entry be claimed once, when two reversing lines would both match it', () => {
        const OTHER = '55555555-5555-4555-8555-555555555555';
        const staged = [origin(MONTHS[0], 250)];
        const map = new Map([[RETURN_LINE.toLowerCase(), staged], [OTHER.toLowerCase(), staged]]);
        const plan = PlanRecognitionVoids([mirror(MONTHS[0], 250), mirror(MONTHS[0], 250, OTHER)], map);
        expect(plan.Voids).toHaveLength(1);
        expect(plan.Kept.map((d) => d.OrderLineID)).toEqual([OTHER]);
    });

    it('leaves an order with no reversing lines untouched', () => {
        const drafts = [bookingReversal(100), mirror(MONTHS[0], 250)];
        expect(PlanRecognitionVoids(drafts, new Map())).toEqual({ Kept: drafts, Voids: [] });
    });
});

describe('Cancels', () => {
    it('is true only when every account returns to where it was, to the cent', () => {
        const o = origin(MONTHS[0], 250).Lines;
        expect(Cancels(o, mirror(MONTHS[0], 250).Draft.Lines)).toBe(true);
        expect(Cancels(o, mirror(MONTHS[0], 249.99).Draft.Lines)).toBe(false);
        expect(Cancels(o, [{ GLAccountID: DEFERRED, CreditAmount: 250 }, { GLAccountID: AR, DebitAmount: 250 }])).toBe(false);
        expect(Cancels([], [])).toBe(false);
    });
});

describe('LoadOriginRecognition', () => {
    it("reads the origin's entries through its terms and keys them by the reversing line", async () => {
        const filters: string[] = [];
        const provider = {
            RunView: vi.fn(async (params: { EntityName: string; ExtraFilter: string }) => {
                filters.push(params.ExtraFilter);
                if (params.EntityName.endsWith('Subscription Terms')) return { Success: true, Results: [{ ID: TERM, OrderLineID: ORIGIN_LINE }] };
                if (params.EntityName.endsWith('Journal Entry Types')) return { Success: true, Results: [{ ID: 'eeeeeeee-0000-4000-8000-000000000001' }] };
                if (params.EntityName.endsWith('Journal Entries')) {
                    return { Success: true, Results: [{ ID: 'dddddddd-0000-4000-8000-000000000001', EntryNumber: 'JE-1', EffectiveDate: new Date('2026-11-15T00:00:00Z'), Status: 'Pending', JournalEntryBatchID: null, ReversesJournalEntryID: null, ReversedByJournalEntryID: null, LinkedRecordID: TERM.toUpperCase() }] };
                }
                return { Success: true, Results: [{ JournalEntryID: 'DDDDDDDD-0000-4000-8000-000000000001', GLAccountID: DEFERRED, DebitAmount: 250, CreditAmount: null }] };
            }),
        } as unknown as IMetadataProvider;
        const out = await LoadOriginRecognition([{ ID: RETURN_LINE, ReversesOrderLineID: ORIGIN_LINE }, { ID: 'x', ReversesOrderLineID: null }], provider, { ID: 'u' } as UserInfo);
        const entries = out.get(RETURN_LINE.toLowerCase()) ?? [];
        expect(entries.map((e) => [e.EntryNumber, e.EffectiveDate, e.Lines.length])).toEqual([['JE-1', '2026-11-15', 1]]);
        expect(filters[2]).toContain(`LinkedRecordID IN ('${ORIGIN_LINE}','${TERM}')`);
        expect(out.has('x')).toBe(false);
    });

    it('reads nothing for an order that reverses nothing', async () => {
        const provider = { RunView: vi.fn() } as unknown as IMetadataProvider;
        expect((await LoadOriginRecognition([{ ID: 'a', ReversesOrderLineID: null }], provider, { ID: 'u' } as UserInfo)).size).toBe(0);
        expect((provider as unknown as { RunView: ReturnType<typeof vi.fn> }).RunView).not.toHaveBeenCalled();
    });
});
