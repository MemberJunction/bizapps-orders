import { describe, expect, it } from 'vitest';
import type { NetGroup } from '@mj-biz-apps/accounting-engine-base';
import { GroupOrderJournalByCompany, PresentOrderJournalRollup } from '../orders-queries';

const group = (over: Partial<NetGroup> & Pick<NetGroup, 'companyId' | 'glAccountId' | 'net' | 'side'>): NetGroup => ({
    dims: [],
    dimKey: '',
    sourceLineCount: 1,
    ...over,
});

const labels = {
    Company: { 'co-a': 'North', 'co-b': 'South' },
    Account: {
        'gl-ar': { Code: '11200', Name: 'Accounts Receivable' },
        'gl-rev': { Code: '40100', Name: 'Membership Revenue' },
    },
    Dimension: { 'dim-dept': 'Department' },
    DimensionValue: { 'val-sales': 'Sales' },
};

describe('PresentOrderJournalRollup', () => {
    it('puts the absolute amount on the debit or credit column', () => {
        const rows = PresentOrderJournalRollup(
            [
                group({ companyId: 'co-a', glAccountId: 'gl-ar', net: 120, side: 'Debit' }),
                group({ companyId: 'co-a', glAccountId: 'gl-rev', net: -120, side: 'Credit' }),
            ],
            labels,
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].Debit).toBe(120);
        expect(rows[0].Credit).toBe(0);
        expect(rows[0].AccountCode).toBe('11200');
        expect(rows[0].AccountName).toBe('Accounts Receivable');
        expect(rows[1].Debit).toBe(0);
        expect(rows[1].Credit).toBe(120);
    });

    it('preserves NetLines order rather than re-sorting', () => {
        const rows = PresentOrderJournalRollup(
            [
                group({ companyId: 'co-a', glAccountId: 'gl-ar', net: 40, side: 'Debit' }),
                group({ companyId: 'co-a', glAccountId: 'gl-rev', net: -40, side: 'Credit' }),
            ],
            labels,
        );
        expect(rows.map((r) => r.Side)).toEqual(['Debit', 'Credit']);
    });

    it('looks up labels case-insensitively so UUID casing cannot split a key', () => {
        const rows = PresentOrderJournalRollup(
            [group({ companyId: 'CO-A', glAccountId: 'GL-AR', net: 10, side: 'Debit' })],
            labels,
        );
        expect(rows[0].Company).toBe('North');
        expect(rows[0].AccountCode).toBe('11200');
        expect(rows[0].AccountName).toBe('Accounts Receivable');
    });

    it('labels dimension tags from the lookup', () => {
        const rows = PresentOrderJournalRollup(
            [
                group({
                    companyId: 'co-a',
                    glAccountId: 'gl-ar',
                    net: 10,
                    side: 'Debit',
                    dims: [{ DimensionID: 'dim-dept', DimensionValueID: 'val-sales' }],
                }),
            ],
            labels,
        );
        expect(rows[0].Dimensions).toEqual([{ Name: 'Department', Value: 'Sales' }]);
    });
});

describe('GroupOrderJournalByCompany', () => {
    it('splits a mixed-company rollup into one card per company', () => {
        const rows = PresentOrderJournalRollup(
            [
                group({ companyId: 'co-a', glAccountId: 'gl-ar', net: 100, side: 'Debit' }),
                group({ companyId: 'co-a', glAccountId: 'gl-rev', net: -100, side: 'Credit' }),
                group({ companyId: 'co-b', glAccountId: 'gl-ar', net: 40, side: 'Debit' }),
                group({ companyId: 'co-b', glAccountId: 'gl-rev', net: -40, side: 'Credit' }),
            ],
            labels,
        );
        const cards = GroupOrderJournalByCompany(rows);
        expect(cards).toHaveLength(2);
        expect(cards[0].Company).toBe('North');
        expect(cards[0].Rows.map((r) => r.Side)).toEqual(['Debit', 'Credit']);
        expect(cards[0].TotalDebit).toBe(100);
        expect(cards[0].TotalCredit).toBe(100);
        expect(cards[1].Company).toBe('South');
        expect(cards[1].TotalDebit).toBe(40);
    });
});
