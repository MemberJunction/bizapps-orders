/**
 * The accounting tab's Export (golive #371): By line exports one row per journal line, Rolled up one
 * row per rollup row, and both follow the same As-of date and basis as the screen.
 */
import { describe, expect, it } from 'vitest';
import {
    BuildOrderJournalLineExport,
    BuildOrderJournalRollup,
    BuildOrderJournalRollupExport,
    type OrderJournalData,
} from '../orders-queries';

/** Booking 8/25 (unbatched) with Product + Venture on its lines; recognition 11/12 in a Posted batch. */
const data = (): OrderJournalData => ({
    Journals: [
        {
            ID: 'JE-BOOK',
            CompanyID: 'co-a',
            Company: 'North',
            EntryNumber: 'JE-1',
            EntryType: 'Order Booking',
            Description: 'Booking',
            EffectiveDate: '2026-08-25',
            JournalEntryBatchID: null,
            LinkedRecordID: 'line-1',
        },
        {
            ID: 'je-rec',
            CompanyID: 'co-a',
            Company: 'North',
            EntryNumber: 'JE-2',
            EntryType: 'Revenue Recognition',
            Description: 'Recognize month 1',
            EffectiveDate: '2026-11-12',
            JournalEntryBatchID: 'BATCH-P',
            LinkedRecordID: 'line-1',
        },
    ],
    Lines: [
        { ID: 'L1', JournalEntryID: 'je-book', GLAccountID: 'gl-ar', GLAccount: 'AR', DebitAmount: 895, CreditAmount: null },
        { ID: 'l2', JournalEntryID: 'je-book', GLAccountID: 'gl-def', GLAccount: 'Deferred', DebitAmount: null, CreditAmount: 895 },
        { ID: 'l3', JournalEntryID: 'je-rec', GLAccountID: 'gl-def', GLAccount: 'Deferred', DebitAmount: 74.58, CreditAmount: 0 },
        { ID: 'l4', JournalEntryID: 'je-rec', GLAccountID: 'gl-rev', GLAccount: 'Sales', DebitAmount: 0, CreditAmount: 74.58 },
    ],
    Dims: [
        { JournalEntryLineID: 'l1', DimensionID: 'dim-prod', DimensionValueID: 'v-pro', Dimension: 'Product', DimensionValue: 'Pro' },
        { JournalEntryLineID: 'l1', DimensionID: 'dim-ven', DimensionValueID: 'v-ven', Dimension: 'Venture', DimensionValue: 'Events' },
        { JournalEntryLineID: 'l4', DimensionID: 'dim-prod', DimensionValueID: 'v-pro', Dimension: 'Product', DimensionValue: 'Pro' },
    ],
    Accounts: [
        { ID: 'gl-ar', Code: '11200', Name: 'Accounts Receivable' },
        { ID: 'gl-def', Code: '23100', Name: 'Deferred Revenue' },
    ],
    Batches: {
        'batch-p': { ID: 'batch-p', JournalEntryBatchNumber: 'BATCH-1', Status: 'Posted', PostingDate: '2026-11-30' },
    },
    SharedPaymentOrderCounts: {},
});

describe('BuildOrderJournalLineExport', () => {
    it('writes one row per journal line, repeating the entry fields', () => {
        const result = BuildOrderJournalLineExport(data());
        expect(result.Rows).toHaveLength(4);
        expect(result.Rows[0]).toMatchObject({
            EntryNumber: 'JE-1',
            EntryType: 'Order Booking',
            Company: 'North',
            EffectiveDate: '2026-08-25',
            PostingDate: null,
            Batch: '',
            BatchStatus: 'Not batched',
            AccountCode: '11200',
            AccountName: 'Accounts Receivable',
            Debit: 895,
            Credit: 0,
        });
        expect(result.Rows[2]).toMatchObject({
            EntryNumber: 'JE-2',
            EntryType: 'Revenue Recognition',
            PostingDate: '2026-11-30',
            Batch: 'BATCH-1',
            BatchStatus: 'Posted',
        });
    });

    it('falls back to the line’s account name when the account was not loaded', () => {
        const row = BuildOrderJournalLineExport(data()).Rows[3];
        expect(row).toMatchObject({ AccountCode: '', AccountName: 'Sales', Credit: 74.58 });
    });

    it('adds one column per dimension found, sorted, blank where a line has none', () => {
        const result = BuildOrderJournalLineExport(data());
        const dimColumns = result.Columns.filter((column) => column.name.startsWith('Dim'));
        expect(dimColumns.map((column) => column.displayName)).toEqual(['Product', 'Venture']);
        expect(result.Rows[0]).toMatchObject({ Dim1: 'Pro', Dim2: 'Events' });
        expect(result.Rows[1]).toMatchObject({ Dim1: null, Dim2: null });
        expect(result.Rows[3]).toMatchObject({ Dim1: 'Pro', Dim2: null });
    });

    it('follows the As-of date', () => {
        const result = BuildOrderJournalLineExport(data(), { AsOf: '2026-09-01' });
        expect(result.Rows.map((row) => row.EntryNumber)).toEqual(['JE-1', 'JE-1']);
    });

    it('follows the posting basis: unposted entries are left out', () => {
        const result = BuildOrderJournalLineExport(data(), { Basis: 'posting' });
        expect(result.Rows.map((row) => row.EntryNumber)).toEqual(['JE-2', 'JE-2']);
    });

    it('types dates and amounts so Excel gets real cells', () => {
        const byName = new Map(BuildOrderJournalLineExport(data()).Columns.map((column) => [column.name, column]));
        expect(byName.get('EffectiveDate')?.dataType).toBe('dateonly');
        expect(byName.get('PostingDate')?.dataType).toBe('dateonly');
        expect(byName.get('Debit')).toMatchObject({ dataType: 'number', numberFormat: '#,##0.00' });
    });

    it('returns no rows and no dimension columns when nothing is in view', () => {
        const result = BuildOrderJournalLineExport(data(), { AsOf: '2026-01-01' });
        expect(result.Rows).toEqual([]);
        expect(result.Columns.some((column) => column.name.startsWith('Dim'))).toBe(false);
    });
});

describe('BuildOrderJournalRollupExport', () => {
    it('flattens the rollup cards into one row per account and dimension set', () => {
        const rollup = BuildOrderJournalRollup(data());
        const result = BuildOrderJournalRollupExport(rollup);
        const shown = rollup.Cards.flatMap((card) => card.Rows);
        expect(result.Rows).toHaveLength(shown.length);
        const deferred = result.Rows.find((row) => row.AccountCode === '23100');
        expect(deferred).toMatchObject({ Company: 'North', Debit: 74.58, Credit: 895, SourceLineCount: 2 });
    });

    it('carries the dimensions as columns', () => {
        const result = BuildOrderJournalRollupExport(BuildOrderJournalRollup(data()));
        expect(result.Columns.filter((column) => column.name.startsWith('Dim')).map((column) => column.displayName)).toEqual([
            'Product',
            'Venture',
        ]);
        expect(result.Rows.find((row) => row.AccountCode === '11200')).toMatchObject({ Dim1: 'Pro', Dim2: 'Events' });
    });

    it('follows the same As-of date as the rollup it is given', () => {
        const result = BuildOrderJournalRollupExport(BuildOrderJournalRollup(data(), { AsOf: '2026-09-01' }));
        expect(result.Rows.reduce((sum, row) => sum + Number(row.Debit), 0)).toBe(895);
    });
});
