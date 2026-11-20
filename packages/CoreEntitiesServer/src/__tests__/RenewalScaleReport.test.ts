/**
 * golive #468: what a Spawn Renewals candidate reports about the prior line's length against the
 * renewal term. A longer line is cut to the term's share and the preview shows the unscaled price and
 * both lengths; a shorter line renews at its own price and carries a review note.
 */
import { describe, expect, it } from 'vitest';
import { PriorLineScaling } from '@mj-biz-apps/orders-entities';
import { RenewalScaleReport } from '../SpawnRenewalsOperation.js';

const price = (BaseSource: 'PriorPrice' | 'PriorList' | 'SuccessorList') => ({ BaseSource }) as never;

describe('RenewalScaleReport (golive #468)', () => {
    it('reports the unscaled price and both lengths for a 24-month line renewing for 12', () => {
        const report = RenewalScaleReport({ PriorLineScale: PriorLineScaling(24, 12), PriorUnitPrice: 48000, Price: price('PriorPrice') });
        expect(report).toEqual({ PriorUnitPrice: 48000, PriorLineMonths: 24, RenewalTermMonths: 12 });
    });

    it('flags a 3-month line for review and does not report a scaled price', () => {
        const report = RenewalScaleReport({ PriorLineScale: PriorLineScaling(3, 12), PriorUnitPrice: 27300, Price: price('PriorPrice') });
        expect(report.PriorUnitPrice).toBeUndefined();
        expect(report.PriorLineMonths).toBe(3);
        expect(report.RenewalTermMonths).toBe(12);
        expect(report.PriceReview).toMatch(/covered 3 months and this renewal covers 12/);
    });

    it('reports nothing when the lengths match, or the base is a list price', () => {
        expect(RenewalScaleReport({ PriorLineScale: PriorLineScaling(12, 12), PriorUnitPrice: 1, Price: price('PriorPrice') })).toEqual({});
        expect(RenewalScaleReport({ PriorLineScale: PriorLineScaling(24, 12), PriorUnitPrice: 1, Price: price('SuccessorList') })).toEqual({});
    });
});
