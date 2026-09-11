import { describe, expect, it } from 'vitest';
import { NetLines, type NettableLine } from '@mj-biz-apps/accounting-engine-base';
import {
    GroupOrderJournalByCompany,
    GrossLines,
    PresentOrderJournalRollup,
    type GrossGroup,
} from '../orders-queries';

const group = (
    over: Partial<GrossGroup> & Pick<GrossGroup, 'companyId' | 'glAccountId'>,
): GrossGroup => ({
    dims: [],
    dimKey: '',
    debit: 0,
    credit: 0,
    sourceLineCount: 1,
    ...over,
});

const line = (
    over: Partial<NettableLine> & Pick<NettableLine, 'companyId' | 'glAccountId'>,
): NettableLine => ({
    debit: 0,
    credit: 0,
    dims: [],
    ...over,
});

const labels = {
    Company: { 'co-a': 'North', 'co-b': 'South' },
    Account: {
        'gl-ar': { Code: '11200', Name: 'Accounts Receivable' },
        'gl-def': { Code: '23100', Name: 'Deferred Revenue' },
        'gl-rev': { Code: '40100', Name: 'Membership Revenue' },
    },
    Dimension: { 'dim-dept': 'Department' },
    DimensionValue: { 'val-sales': 'Sales' },
};

describe('PresentOrderJournalRollup', () => {
    it('puts each group on the debit or credit column', () => {
        const rows = PresentOrderJournalRollup(
            [
                group({ companyId: 'co-a', glAccountId: 'gl-ar', debit: 120 }),
                group({ companyId: 'co-a', glAccountId: 'gl-rev', credit: 120 }),
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

    it('keeps BOTH columns on an account that received and released the same money', () => {
        // The #183 regression guard at the presentation seam: a row is not a single side.
        const rows = PresentOrderJournalRollup(
            [group({ companyId: 'co-a', glAccountId: 'gl-def', debit: 895, credit: 895, sourceLineCount: 2 })],
            labels,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].Debit).toBe(895);
        expect(rows[0].Credit).toBe(895);
        expect(rows[0].AccountName).toBe('Deferred Revenue');
    });

    it('preserves the caller order rather than re-sorting', () => {
        const rows = PresentOrderJournalRollup(
            [
                group({ companyId: 'co-a', glAccountId: 'gl-ar', debit: 40 }),
                group({ companyId: 'co-a', glAccountId: 'gl-rev', credit: 40 }),
            ],
            labels,
        );
        expect(rows.map((r) => r.Side)).toEqual(['Debit', 'Credit']);
    });

    it('looks up labels case-insensitively so UUID casing cannot split a key', () => {
        const rows = PresentOrderJournalRollup(
            [group({ companyId: 'CO-A', glAccountId: 'GL-AR', debit: 10 })],
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
                    debit: 10,
                    dims: [{ DimensionID: 'dim-dept', DimensionValueID: 'val-sales' }],
                }),
            ],
            labels,
        );
        expect(rows[0].Dimensions).toEqual([{ Name: 'Department', Value: 'Sales' }]);
    });
});

describe('GrossLines', () => {
    it('KEEPS an account whose debits and credits cancel, with both columns populated', () => {
        // THE #183 REGRESSION GUARD. NetLines drops this group entirely, which is how ORD-000021's
        // Deferred Revenue row vanished and the screen read as if the money had gone to Sales.
        const groups = GrossLines([
            line({ companyId: 'co-a', glAccountId: 'gl-def', credit: 895 }),
            line({ companyId: 'co-a', glAccountId: 'gl-def', debit: 895 }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].debit).toBe(895);
        expect(groups[0].credit).toBe(895);
        expect(groups[0].sourceLineCount).toBe(2);
    });

    it('is exactly where it differs from NetLines — which drops the same group entirely', () => {
        // Side by side so the regression cannot come back by someone "simplifying" GrossLines into
        // a NetLines call. NetLines stays as it is: the server's batch engine needs that behaviour.
        const cancelling = [
            line({ companyId: 'co-a', glAccountId: 'gl-def', credit: 895 }),
            line({ companyId: 'co-a', glAccountId: 'gl-def', debit: 895 }),
        ];
        expect(NetLines(cancelling)).toEqual([]);
        expect(GrossLines(cancelling)).toHaveLength(1);
    });

    it('groups by company, account and dimension combo, order-independently', () => {
        const groups = GrossLines([
            line({
                companyId: 'co-a',
                glAccountId: 'gl-ar',
                debit: 10,
                dims: [
                    { DimensionID: 'dim-b', DimensionValueID: 'v2' },
                    { DimensionID: 'dim-a', DimensionValueID: 'v1' },
                ],
            }),
            line({
                companyId: 'co-a',
                glAccountId: 'gl-ar',
                debit: 5,
                dims: [
                    { DimensionID: 'dim-a', DimensionValueID: 'v1' },
                    { DimensionID: 'dim-b', DimensionValueID: 'v2' },
                ],
            }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].debit).toBe(15);
    });

    it('never merges across companies', () => {
        const groups = GrossLines([
            line({ companyId: 'co-a', glAccountId: 'gl-ar', debit: 10 }),
            line({ companyId: 'co-b', glAccountId: 'gl-ar', debit: 10 }),
        ]);
        expect(groups.map((g) => g.companyId)).toEqual(['co-a', 'co-b']);
    });

    it('reads the event order the way Andrew asked for: AR Dr, Deferred Dr and Cr, Sales Cr', () => {
        // ORD-000021: booking on 8/25 (Dr AR / Cr Deferred), release on 11/12 (Dr Deferred / Cr Sales).
        const rows = PresentOrderJournalRollup(
            GrossLines([
                line({ companyId: 'co-a', glAccountId: 'gl-ar', debit: 895 }),
                line({ companyId: 'co-a', glAccountId: 'gl-def', credit: 895 }),
                line({ companyId: 'co-a', glAccountId: 'gl-def', debit: 895 }),
                line({ companyId: 'co-a', glAccountId: 'gl-rev', credit: 895 }),
            ]),
            labels,
        );
        expect(rows.map((r) => [r.AccountName, r.Debit, r.Credit])).toEqual([
            ['Accounts Receivable', 895, 0],
            ['Deferred Revenue', 895, 895],
            ['Membership Revenue', 0, 895],
        ]);

        const [card] = GroupOrderJournalByCompany(rows);
        expect(card.TotalDebit).toBe(1790);
        expect(card.TotalCredit).toBe(1790);
    });
});

describe('GroupOrderJournalByCompany', () => {
    it('splits a mixed-company rollup into one card per company', () => {
        const rows = PresentOrderJournalRollup(
            [
                group({ companyId: 'co-a', glAccountId: 'gl-ar', debit: 100 }),
                group({ companyId: 'co-a', glAccountId: 'gl-rev', credit: 100 }),
                group({ companyId: 'co-b', glAccountId: 'gl-ar', debit: 40 }),
                group({ companyId: 'co-b', glAccountId: 'gl-rev', credit: 40 }),
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
