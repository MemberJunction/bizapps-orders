import { describe, expect, it } from 'vitest';
import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';
import { NetReversedRecognition } from '../revrec-netting';

const TERM = '22222222-2222-2222-2222-222222222222';
const ORIGIN_LINE = '33333333-3333-3333-3333-333333333333';
const RETURN_LINE = '44444444-4444-4444-4444-444444444444';

/** A recognition entry of `amount`, as the factory books one: one line each side. */
function je(id: string, linked: string, day: string, amount: number, description = 'recognize Sidecar', status = 'Pending'): mjBizAppsAccountingJournalEntryEntity {
    return {
        ID: id,
        Status: status,
        LinkedRecordID: linked,
        EffectiveDate: new Date(`${day}T00:00:00Z`),
        Description: `Order ORD-1 line 1 — ${description}`,
        EntryType: 'RevenueRecognition',
        ReversedByJournalEntryID: null,
        ReversesJournalEntryID: null,
        Lines: {
            IsAvailable: true,
            Items: [
                { DebitAmount: amount, CreditAmount: null },
                { DebitAmount: null, CreditAmount: amount },
            ],
        },
    } as unknown as mjBizAppsAccountingJournalEntryEntity;
}

const reversals = new Map([[RETURN_LINE, ORIGIN_LINE]]);
const originTerms = new Map([[ORIGIN_LINE, [TERM]]]);

describe('NetReversedRecognition (golive #474)', () => {
    it('drops the months a return takes back in full, with the return\'s entries', () => {
        const entries = [
            je('nov', TERM, '2026-11-12', 1000),
            je('dec', TERM, '2026-12-12', 1000),
            je('nov-r', RETURN_LINE, '2026-11-12', 1000, 'unrecognize Sidecar'),
            je('dec-r', RETURN_LINE, '2026-12-12', 1000, 'unrecognize Sidecar'),
        ];
        const out = NetReversedRecognition(entries, reversals, originTerms);
        expect(out.Entries).toEqual([]);
        expect(out.OffsetMonths).toBe(2);
        expect(out.PartlyOffsetMonths).toBe(0);
    });

    it('keeps the months before the reversal took effect', () => {
        const entries = [
            je('oct', TERM, '2026-10-12', 1000),
            je('nov', TERM, '2026-11-12', 1000),
            je('nov-r', RETURN_LINE, '2026-11-12', 1000, 'unrecognize Sidecar'),
        ];
        const out = NetReversedRecognition(entries, reversals, originTerms);
        expect(out.Entries.map((e) => e.ID)).toEqual(['oct']);
        expect(out.OffsetMonths).toBe(1);
    });

    it('keeps a month only partly taken back at its full amount, and counts it', () => {
        const entries = [je('nov', TERM, '2026-11-12', 1000), je('nov-r', RETURN_LINE, '2026-11-12', 400, 'unrecognize Sidecar')];
        const out = NetReversedRecognition(entries, reversals, originTerms);
        expect(out.Entries.map((e) => e.ID)).toEqual(['nov']);
        expect(out.OffsetMonths).toBe(0);
        expect(out.PartlyOffsetMonths).toBe(1);
    });

    it('matches across case and on the month, whatever day the mirror carries', () => {
        const entries = [je('nov', TERM.toUpperCase(), '2026-11-12', 1000), je('nov-r', RETURN_LINE.toUpperCase(), '2026-11-30', 1000, 'unrecognize Sidecar')];
        const out = NetReversedRecognition(entries, reversals, originTerms);
        expect(out.Entries).toEqual([]);
    });

    it('changes nothing when nothing reverses the subscription', () => {
        const entries = [je('nov', TERM, '2026-11-12', 1000)];
        const out = NetReversedRecognition(entries, new Map(), originTerms);
        expect(out.Entries).toEqual(entries);
        expect(out.OffsetMonths).toBe(0);
    });

    it('leaves voided months out and counts them as taken back, with no mirror to net (golive #378)', () => {
        const entries = [
            je('oct', TERM, '2026-10-12', 1000, 'recognize Sidecar', 'GLPosted'),
            je('oct-r', RETURN_LINE, '2026-10-12', 1000, 'unrecognize Sidecar'),
            je('nov', TERM, '2026-11-12', 1000, 'recognize Sidecar', 'Voided'),
            je('dec', TERM, '2026-12-12', 1000, 'recognize Sidecar', 'Voided'),
        ];
        const out = NetReversedRecognition(entries, reversals, originTerms);
        expect(out.Entries).toEqual([]);
        expect(out.OffsetMonths).toBe(3);
        expect(out.PartlyOffsetMonths).toBe(0);
    });

    it('leaves a voided entry out even when nothing reverses the subscription', () => {
        const entries = [je('nov', TERM, '2026-11-12', 1000), je('dec', TERM, '2026-12-12', 1000, 'recognize Sidecar', 'Voided')];
        const out = NetReversedRecognition(entries, new Map(), originTerms);
        expect(out.Entries.map((e) => e.ID)).toEqual(['nov']);
    });
});
