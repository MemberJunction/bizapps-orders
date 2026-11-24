import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { PresetViewRef } from '../lib/data/preset-view';
import { MJOOverduePageComponent, OverdueGridScope } from '../lib/pages/receivables/overdue.page';
import { MatchesAttestationFilter } from '../lib/pages/receivables/progress.page';

const ORDER = '11111111-2222-3333-4444-555555555555';

/**
 * The Overdue worklist's grid reads the orders itself, so what the page lists reaches it as SQL: the
 * listed orders by ID. These pin what that SQL is, and that nothing but an ID gets into it.
 */
describe('Overdue worklist: the listed orders as the grid query', () => {
    it('names the orders by ID', () => {
        expect(OverdueGridScope([ORDER])).toBe(`ID IN ('${ORDER}')`);
    });

    it('lists nothing when the page lists nothing', () => {
        expect(OverdueGridScope([])).toBe('1 = 0');
    });

    it('refuses a value that is not an ID', () => {
        expect(() => OverdueGridScope([`x') OR 1=1 --`])).toThrow();
    });

    it('hands the grid a new view when what is listed changes, and the same one until then', () => {
        const page = Object.create(MJOOverduePageComponent.prototype) as MJOOverduePageComponent;
        const fields = { OrderEntityInfo: { ID: 'E1', Name: 'MJ_BizApps_Orders: Order Headers' }, overdueView: new PresetViewRef(), gridScope: '' };
        for (const [k, v] of Object.entries(fields)) Object.defineProperty(page, k, { value: v, writable: true });

        const all = page.OverdueView as unknown as { WhereClause: string };
        expect(page.OverdueView).toBe(all);
        expect(all.WhereClause).not.toContain('ID IN');

        (page as unknown as { gridScope: string }).gridScope = OverdueGridScope([ORDER]);
        const one = page.OverdueView as unknown as { WhereClause: string };
        expect(one).not.toBe(all);
        expect(one.WhereClause).toContain(`AND ID IN ('${ORDER}')`);
        expect(page.OverdueView).toBe(one);
    });
});

describe('Progress attestation: quick filter', () => {
    const monthStart = '2026-03-01';

    it('"Not attested this month" keeps lines last attested before the month, and never-attested ones', () => {
        expect(MatchesAttestationFilter({ LastMeasurementDate: '2026-02-28' }, 'due', monthStart)).toBe(true);
        expect(MatchesAttestationFilter({ LastMeasurementDate: null }, 'due', monthStart)).toBe(true);
        expect(MatchesAttestationFilter({ LastMeasurementDate: '2026-03-01' }, 'due', monthStart)).toBe(false);
    });

    it('"never" keeps only lines with no observation', () => {
        expect(MatchesAttestationFilter({ LastMeasurementDate: null }, 'never', monthStart)).toBe(true);
        expect(MatchesAttestationFilter({ LastMeasurementDate: '2025-01-01' }, 'never', monthStart)).toBe(false);
    });

    it('any other filter keeps everything', () => {
        expect(MatchesAttestationFilter({ LastMeasurementDate: '2026-03-05' }, 'all', monthStart)).toBe(true);
    });
});
