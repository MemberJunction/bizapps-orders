/**
 * EXPORTING THE ACCOUNTING TAB (bc-aidp-next-golive#371).
 *
 * The request is for Export on both views, with the By-line rows carrying "account, debit, credit
 * and all dimensions". Those three live on the journal LINE, while the By-line table on screen
 * shows one row per ENTRY with its lines already summed -- so the export is deliberately a longer
 * sheet than the table it sits under, and that difference is what most of this file pins.
 *
 * Pure, like the builders: no DOM, no provider, no Angular fixture.
 */
import { describe, expect, it } from 'vitest';
import {
    BuildOrderJournalEntryRows,
    BuildOrderJournalLineExport,
    BuildOrderJournalRollup,
    BuildOrderJournalRollupExport,
    type OrderJournalData,
} from '../orders-queries';

/**
 * Two entries in one company. The booking's two lines carry dimensions; the payment's cash line
 * carries NONE, which is the ragged case `finish` exists for -- and `l3` carries only Product, so
 * the dimension columns are not uniform even among the rows that have some.
 */
const data = (): OrderJournalData => ({
    Journals: [
        {
            ID: 'je-book', CompanyID: 'co-a', Company: 'North', EntryNumber: 'JE-1',
            EntryType: 'Order Booking', Description: 'Booking', EffectiveDate: '2026-08-25',
            JournalEntryBatchID: 'batch-posted', LinkedRecordID: 'line-1',
        },
        {
            ID: 'je-pay', CompanyID: 'co-a', Company: 'North', EntryNumber: 'JE-2',
            EntryType: 'Payment Receipt', Description: 'Payment fee', EffectiveDate: '2026-11-01',
            JournalEntryBatchID: null, LinkedRecordID: 'pay-1',
        },
    ],
    Lines: [
        { ID: 'l1', JournalEntryID: 'je-book', GLAccountID: 'gl-ar', GLAccount: 'AR', DebitAmount: 895, CreditAmount: 0 },
        { ID: 'l2', JournalEntryID: 'je-book', GLAccountID: 'gl-def', GLAccount: 'Deferred', DebitAmount: 0, CreditAmount: 895 },
        { ID: 'l3', JournalEntryID: 'je-pay', GLAccountID: 'gl-fee', GLAccount: 'Fees', DebitAmount: 25, CreditAmount: 0 },
        { ID: 'l4', JournalEntryID: 'je-pay', GLAccountID: 'gl-cash', GLAccount: 'Cash', DebitAmount: 0, CreditAmount: 25 },
    ],
    Dims: [
        { JournalEntryLineID: 'l1', DimensionID: 'd-prod', DimensionValueID: 'v-ev', Dimension: 'Product', DimensionValue: 'Events' },
        { JournalEntryLineID: 'l1', DimensionID: 'd-vent', DimensionValueID: 'v-na', Dimension: 'Venture', DimensionValue: 'NA' },
        { JournalEntryLineID: 'l2', DimensionID: 'd-prod', DimensionValueID: 'v-ev', Dimension: 'Product', DimensionValue: 'Events' },
        { JournalEntryLineID: 'l2', DimensionID: 'd-arr', DimensionValueID: 'v-new', Dimension: 'ARR-Type', DimensionValue: 'New' },
        { JournalEntryLineID: 'l3', DimensionID: 'd-prod', DimensionValueID: 'v-ev', Dimension: 'Product', DimensionValue: 'Events' },
    ],
    Accounts: [
        { ID: 'gl-ar', Code: '1100', Name: 'Accounts Receivable' },
        { ID: 'gl-def', Code: '2300', Name: 'Deferred Revenue' },
        { ID: 'gl-fee', Code: '6100', Name: 'Merchant Fees' },
        { ID: 'gl-cash', Code: '1000', Name: 'Cash' },
    ],
    Batches: {
        'batch-posted': { ID: 'batch-posted', JournalEntryBatchNumber: 'BATCH-1', Status: 'Posted', PostingDate: '2026-08-31' },
    },
    SharedPaymentOrderCounts: {},
});

describe('By line exports one row per GL LINE, not per entry', () => {
    it('produces four rows from two entries, which the on-screen table shows as two', () => {
        const sheet = BuildOrderJournalLineExport(data(), {});
        expect(sheet.Rows).toHaveLength(4);
        expect(BuildOrderJournalEntryRows(data(), {})).toHaveLength(2);
    });

    it('carries the account on every row, which the entry-grain rows cannot', () => {
        const sheet = BuildOrderJournalLineExport(data(), {});
        expect(sheet.Rows.map((r) => r['Account code'])).toEqual(['1100', '2300', '6100', '1000']);
        expect(sheet.Rows.map((r) => r['Account name'])).toEqual([
            'Accounts Receivable', 'Deferred Revenue', 'Merchant Fees', 'Cash',
        ]);
    });

    it('keeps debit and credit per line rather than summed to the entry', () => {
        const sheet = BuildOrderJournalLineExport(data(), {});
        expect(sheet.Rows.map((r) => [r.Debit, r.Credit])).toEqual([[895, 0], [0, 895], [25, 0], [0, 25]]);
    });

    it('names the entry type the issue asks for, per row', () => {
        const sheet = BuildOrderJournalLineExport(data(), {});
        expect(sheet.Rows.map((r) => r['Entry type'])).toEqual([
            'Order Booking', 'Order Booking', 'Payment Receipt', 'Payment Receipt',
        ]);
    });

    it('writes dates as ISO, so a spreadsheet reads them as dates and not as text', () => {
        const row = BuildOrderJournalLineExport(data(), {}).Rows[0];
        expect(row['Effective date']).toBe('2026-08-25');
        expect(row['Posting date']).toBe('2026-08-31');
    });

    it('says "Not batched" rather than leaving the status blank, as the table does', () => {
        const payRow = BuildOrderJournalLineExport(data(), {}).Rows[2];
        expect(payRow.Batch).toBe('');
        expect(payRow['Batch status']).toBe('Not batched');
    });
});

/**
 * THE RAGGED-DIMENSION CASE. Most sheet writers take their columns from the FIRST row, so a later
 * row carrying a dimension the first one lacks either loses its column or slides into the wrong
 * one. Every row must carry every column, with absent meaning empty.
 */
describe('dimension columns are complete and uniform across rows', () => {
    it('collects every dimension that appears anywhere, sorted, after the fixed columns', () => {
        const sheet = BuildOrderJournalLineExport(data(), {});
        expect(sheet.Columns.slice(-3)).toEqual(['ARR-Type', 'Product', 'Venture']);
        expect(sheet.Columns[0]).toBe('Entry number');
    });

    it('gives EVERY row EVERY column, so nothing shifts when a line has fewer dimensions', () => {
        const sheet = BuildOrderJournalLineExport(data(), {});
        for (const row of sheet.Rows) {
            expect(Object.keys(row).sort()).toEqual([...sheet.Columns].sort());
        }
    });

    it('fills a dimension a line does not carry with an empty string, not undefined', () => {
        const sheet = BuildOrderJournalLineExport(data(), {});
        expect(sheet.Rows[0].Venture).toBe('NA');
        expect(sheet.Rows[1].Venture).toBe('');
        expect(sheet.Rows[1]['ARR-Type']).toBe('New');
        expect(sheet.Rows[3].Product).toBe('');
    });
});

/**
 * The export must obey the SAME As-of and basis controls as the screen. An export that silently
 * covered a different period than the one on display is worse than none: it ties out against the
 * wrong period and nothing on the sheet says so.
 */
describe('the As-of date and the basis apply to the sheet exactly as to the screen', () => {
    it('drops the November payment once As-of is 2026-09-30', () => {
        const sheet = BuildOrderJournalLineExport(data(), { AsOf: '2026-09-30' });
        expect(sheet.Rows).toHaveLength(2);
        expect(new Set(sheet.Rows.map((r) => r['Entry number']))).toEqual(new Set(['JE-1']));
    });

    it('drops the unbatched payment on the posting basis, which the screen also drops', () => {
        const sheet = BuildOrderJournalLineExport(data(), { Basis: 'posting' });
        expect(sheet.Rows.map((r) => r['Entry number'])).toEqual(['JE-1', 'JE-1']);
    });

    it('is empty, with no columns, when the filter leaves nothing', () => {
        const sheet = BuildOrderJournalLineExport(data(), { AsOf: '2020-01-01' });
        expect(sheet).toEqual({ Columns: [], Rows: [] });
    });
});

describe('Rolled up exports the cards, not a second derivation of them', () => {
    it('writes one row per rollup row, with the same figures the cards show', () => {
        const rollup = BuildOrderJournalRollup(data(), {});
        const sheet = BuildOrderJournalRollupExport(rollup);
        const cardRows = rollup.Cards.flatMap((c) => c.Rows);
        expect(sheet.Rows).toHaveLength(cardRows.length);
        expect(sheet.Rows.map((r) => r.Debit)).toEqual(cardRows.map((r) => r.Debit));
        expect(sheet.Rows.map((r) => r.Credit)).toEqual(cardRows.map((r) => r.Credit));
    });

    it('carries the dimensions onto the sheet, uniformly', () => {
        const sheet = BuildOrderJournalRollupExport(BuildOrderJournalRollup(data(), {}));
        expect(sheet.Columns).toContain('Product');
        for (const row of sheet.Rows) {
            expect(Object.keys(row).sort()).toEqual([...sheet.Columns].sort());
        }
    });

    it('is empty for an empty rollup rather than throwing', () => {
        expect(BuildOrderJournalRollupExport({
            Cards: [], TotalDebit: 0, TotalCredit: 0, JournalCount: 0,
            ExcludedAfterAsOf: 0, ExcludedNotPosted: 0, SharedPaymentNotes: [],
        })).toEqual({ Columns: [], Rows: [] });
    });
});
