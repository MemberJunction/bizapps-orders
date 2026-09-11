/**
 * The As-of date, the date basis, and the origin resolver — golive #183 items 3, 4 and 5.
 *
 * All pure. The whole point of the shape these functions have is that "what is included" can be
 * decided without a DOM, a database or an Angular fixture — the accounting tab loads once and then
 * only calls these.
 */
import { describe, expect, it } from 'vitest';
import {
    BuildOrderJournalEntryRows,
    BuildOrderJournalRollup,
    CountSharedPaymentOrders,
    ExcludedEntriesLabel,
    FilterOrderJournals,
    GetOrderJournalOrigins,
    IsRecognitionEntry,
    LoadOrderJournalData,
    type OrderJournalData,
} from '../orders-queries';

/** Booking 8/25 (unbatched), release 11/12 (unbatched), payment 9/01 in a Posted batch dated 9/02. */
const data = (): OrderJournalData => ({
    Journals: [
        {
            ID: 'je-book',
            CompanyID: 'co-a',
            Company: 'North',
            EntryNumber: 'JE-1',
            Description: 'Booking',
            EffectiveDate: '2026-08-25',
            JournalEntryBatchID: null,
            LinkedRecordID: 'line-1',
        },
        {
            ID: 'je-pay',
            CompanyID: 'co-a',
            Company: 'North',
            EntryNumber: 'JE-2',
            Description: 'Payment fee',
            EffectiveDate: '2026-09-01',
            JournalEntryBatchID: 'batch-posted',
            LinkedRecordID: 'pay-1',
        },
        {
            ID: 'je-release',
            CompanyID: 'co-a',
            Company: 'North',
            EntryNumber: 'JE-3',
            Description: 'Recognize event revenue',
            EffectiveDate: '2026-11-12',
            JournalEntryBatchID: 'batch-pending',
            LinkedRecordID: 'line-1',
        },
    ],
    Lines: [
        { ID: 'l1', JournalEntryID: 'je-book', GLAccountID: 'gl-ar', GLAccount: 'AR', DebitAmount: 895, CreditAmount: 0 },
        { ID: 'l2', JournalEntryID: 'je-book', GLAccountID: 'gl-def', GLAccount: 'Deferred', DebitAmount: 0, CreditAmount: 895 },
        { ID: 'l3', JournalEntryID: 'je-pay', GLAccountID: 'gl-fee', GLAccount: 'Fees', DebitAmount: 25, CreditAmount: 0 },
        { ID: 'l4', JournalEntryID: 'je-pay', GLAccountID: 'gl-cash', GLAccount: 'Cash', DebitAmount: 0, CreditAmount: 25 },
        { ID: 'l5', JournalEntryID: 'je-release', GLAccountID: 'gl-def', GLAccount: 'Deferred', DebitAmount: 895, CreditAmount: 0 },
        { ID: 'l6', JournalEntryID: 'je-release', GLAccountID: 'gl-rev', GLAccount: 'Sales', DebitAmount: 0, CreditAmount: 895 },
    ],
    Dims: [],
    Accounts: [],
    Batches: {
        'batch-posted': { ID: 'batch-posted', JournalEntryBatchNumber: 'BATCH-1', Status: 'Posted', PostingDate: '2026-09-02' },
        'batch-pending': { ID: 'batch-pending', JournalEntryBatchNumber: 'BATCH-2', Status: 'Pending', PostingDate: '2026-11-30' },
    },
    SharedPaymentOrderCounts: { 'pay-1': 2 },
});

describe('FilterOrderJournals — effective-date basis', () => {
    it('includes future entries when no As-of date is set (the lifetime default)', () => {
        const result = FilterOrderJournals(data(), {});
        expect(result.Journals.map((j) => j.ID)).toEqual(['je-book', 'je-pay', 'je-release']);
        expect(result.ExcludedAfterAsOf).toBe(0);
        expect(result.ExcludedNotPosted).toBe(0);
    });

    it('excludes the November release once As-of is today, and counts it', () => {
        const result = FilterOrderJournals(data(), { AsOf: '2026-09-10' });
        expect(result.Journals.map((j) => j.ID)).toEqual(['je-book', 'je-pay']);
        expect(result.ExcludedAfterAsOf).toBe(1);
    });

    it('includes an entry dated exactly on the As-of date — "on or before"', () => {
        const result = FilterOrderJournals(data(), { AsOf: '2026-08-25' });
        expect(result.Journals.map((j) => j.ID)).toEqual(['je-book']);
        expect(result.ExcludedAfterAsOf).toBe(2);
    });

    it('reads a Date the same as an ISO string, so the date input and the driver agree', () => {
        const result = FilterOrderJournals(data(), { AsOf: new Date('2026-09-10T00:00:00Z') });
        expect(result.Journals.map((j) => j.ID)).toEqual(['je-book', 'je-pay']);
    });
});

describe('FilterOrderJournals — posting-date basis', () => {
    it('keeps only entries whose batch is Posted, whatever the As-of date', () => {
        const result = FilterOrderJournals(data(), { Basis: 'posting' });
        expect(result.Journals.map((j) => j.ID)).toEqual(['je-pay']);
        // One entry has no batch at all, one sits in a Pending batch. Neither has reached the GL.
        expect(result.ExcludedNotPosted).toBe(2);
        expect(result.ExcludedAfterAsOf).toBe(0);
    });

    it('dates a posted entry by its BATCH posting date, not its own effective date', () => {
        // je-pay is effective 9/01 but posts on 9/02, so an As-of of 9/01 must exclude it.
        expect(FilterOrderJournals(data(), { Basis: 'posting', AsOf: '2026-09-01' }).Journals).toHaveLength(0);
        expect(FilterOrderJournals(data(), { Basis: 'posting', AsOf: '2026-09-02' }).Journals).toHaveLength(1);
        expect(FilterOrderJournals(data(), { Basis: 'effective', AsOf: '2026-09-01' }).Journals).toHaveLength(2);
    });
});

describe('BuildOrderJournalRollup', () => {
    it('shows the event order gross, with Deferred Revenue carrying both columns', () => {
        const rollup = BuildOrderJournalRollup(data(), {});
        const deferred = rollup.Cards[0].Rows.find((row) => row.AccountName === 'Deferred');
        expect(deferred?.Debit).toBe(895);
        expect(deferred?.Credit).toBe(895);
        expect(rollup.JournalCount).toBe(3);
        expect(rollup.TotalDebit).toBe(rollup.TotalCredit);
    });

    it('drops the excluded entries from the figures and reports how many', () => {
        const rollup = BuildOrderJournalRollup(data(), { AsOf: '2026-09-10' });
        const deferred = rollup.Cards[0].Rows.find((row) => row.AccountName === 'Deferred');
        expect(deferred?.Credit).toBe(895);
        expect(deferred?.Debit).toBe(0);
        expect(rollup.ExcludedAfterAsOf).toBe(1);
        expect(ExcludedEntriesLabel(rollup, '2026-09-10')).toBe('1 entry scheduled after 2026-09-10');
    });

    it('reports a shared payment fee in full rather than pro-rating it', () => {
        const rollup = BuildOrderJournalRollup(data(), {});
        expect(rollup.SharedPaymentNotes).toEqual([
            'JE-2 is shared with 2 other orders and is shown here in full, not pro-rated.',
        ]);
    });

    it('says nothing at all when nothing is hidden', () => {
        expect(ExcludedEntriesLabel(BuildOrderJournalRollup(data(), {}), null)).toBeNull();
    });

    it('names both exclusion reasons when both apply', () => {
        const rollup = BuildOrderJournalRollup(data(), { Basis: 'posting', AsOf: '2026-09-01' });
        expect(ExcludedEntriesLabel(rollup, '2026-09-01')).toBe(
            '1 entry scheduled after 2026-09-01, 2 entries not yet posted',
        );
    });

    it('returns an empty rollup, not a crash, when the order has no journals', () => {
        const rollup = BuildOrderJournalRollup({ ...data(), Journals: [] }, {});
        expect(rollup.Cards).toEqual([]);
        expect(rollup.JournalCount).toBe(0);
    });
});

describe('BuildOrderJournalEntryRows', () => {
    it('lists every included entry unnetted, with its batch context', () => {
        const rows = BuildOrderJournalEntryRows(data(), {});
        expect(rows.map((r) => r.EntryNumber)).toEqual(['JE-1', 'JE-2', 'JE-3']);
        expect(rows[0]).toMatchObject({ BatchNumber: '', BatchStatus: '', BatchPostingDate: null, Debit: 895, Credit: 895 });
        expect(rows[1]).toMatchObject({ BatchNumber: 'BATCH-1', BatchStatus: 'Posted', BatchPostingDate: '2026-09-02' });
        expect(rows[2]).toMatchObject({ BatchNumber: 'BATCH-2', BatchStatus: 'Pending' });
    });

    it('agrees with the rollup about what is included — same snapshot, same filter', () => {
        const options = { AsOf: '2026-09-10' };
        expect(BuildOrderJournalEntryRows(data(), options)).toHaveLength(
            BuildOrderJournalRollup(data(), options).JournalCount,
        );
    });

    it('tags the shared payment entry and only that one', () => {
        const rows = BuildOrderJournalEntryRows(data(), {});
        expect(rows.map((r) => r.SharedWithOtherOrders)).toEqual([0, 2, 0]);
    });
});

describe('CountSharedPaymentOrders', () => {
    it('counts the OTHER orders a payment settles, never this one', () => {
        const counts = CountSharedPaymentOrders(
            [
                { PaymentHeaderID: 'pay-1', OrderHeaderID: 'ord-mine' },
                { PaymentHeaderID: 'pay-1', OrderHeaderID: 'ord-other' },
                { PaymentHeaderID: 'pay-1', OrderHeaderID: 'ord-other' },
                { PaymentHeaderID: 'pay-2', OrderHeaderID: 'ord-mine' },
            ],
            'ord-mine',
        );
        expect(counts).toEqual({ 'pay-1': 1 });
    });

    it('matches order ids case-insensitively, so UUID casing cannot fake a shared payment', () => {
        const counts = CountSharedPaymentOrders(
            [{ PaymentHeaderID: 'PAY-1', OrderHeaderID: 'ORD-MINE' }],
            'ord-mine',
        );
        expect(counts).toEqual({});
    });

    it('ignores allocation lines with no payment or no order', () => {
        const counts = CountSharedPaymentOrders(
            [
                { PaymentHeaderID: null, OrderHeaderID: 'ord-other' },
                { PaymentHeaderID: 'pay-1', OrderHeaderID: null },
            ],
            'ord-mine',
        );
        expect(counts).toEqual({});
    });
});

describe('IsRecognitionEntry', () => {
    it('recognises a recognition entry by description or by entry type', () => {
        expect(IsRecognitionEntry({ Description: 'Recognize event revenue' })).toBe(true);
        expect(IsRecognitionEntry({ EntryType: 'RevenueRecognition' })).toBe(true);
        expect(IsRecognitionEntry({ Description: 'Booking', EntryType: 'OrderBooking' })).toBe(false);
        expect(IsRecognitionEntry({})).toBe(false);
    });
});

describe('the empty-origin contract', () => {
    it('resolves no origins, and makes no query, for an order with no lines and no id', async () => {
        // An `IN ()` is not valid SQL and a missing filter shows another order's ledger, so the
        // only safe answer to "nothing to look up" is an empty list — never a wildcard.
        await expect(GetOrderJournalOrigins('', [], undefined)).resolves.toEqual({
            IDs: [],
            LineAndTermIDs: [],
            SharedPaymentOrderCounts: {},
        });
    });

    it('loads nothing, and makes no query, when there are no origins', async () => {
        const loaded = await LoadOrderJournalData({ IDs: [], LineAndTermIDs: [], SharedPaymentOrderCounts: {} });
        expect(loaded.Journals).toEqual([]);
        expect(BuildOrderJournalRollup(loaded, {}).Cards).toEqual([]);
        expect(BuildOrderJournalEntryRows(loaded, {})).toEqual([]);
    });
});
