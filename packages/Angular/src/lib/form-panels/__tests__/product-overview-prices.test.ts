import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { BuildRevenueBandApplicability } from '@mj-biz-apps/orders-entities';
import { ActiveOverviewPrices, OverviewPriceScope, type OverviewPriceRow } from '../catalog-overviews.panels';

const M = 1_000_000;
const band = (min: number | null, max: number | null) => BuildRevenueBandApplicability({ Min: min, Max: max });
const row = (o: Partial<OverviewPriceRow> & { Name: string }): OverviewPriceRow => ({
    PriceList: null,
    Amount: 100,
    Status: 'Active',
    Priority: 10,
    Applicability: null,
    EffectiveTo: null,
    ...o,
});

describe('Product overview: active prices', () => {
    it('lists live prices highest priority first, then lowest revenue band first, then by name', () => {
        const rows = [
            row({ Name: '$5M+ rev', Applicability: band(5 * M, null) }),
            row({ Name: 'Under $2M rev', Applicability: band(0, 2 * M) }),
            row({ Name: 'Old rate', Status: 'Inactive', Priority: 99 }),
            row({ Name: 'Ended', EffectiveTo: new Date('2020-01-01T00:00:00Z'), Priority: 99 }),
            row({ Name: 'Override', Priority: 50 }),
            row({ Name: '$2M-$5M rev', Applicability: band(2 * M, 5 * M) }),
        ];
        expect(ActiveOverviewPrices(rows).map((r) => r.Name)).toEqual(['Override', 'Under $2M rev', '$2M-$5M rev', '$5M+ rev']);
    });

    it('says who a price applies to in plain words', () => {
        expect(OverviewPriceScope(row({ Name: 'a' }))).toBe('All customers');
        expect(OverviewPriceScope(row({ Name: 'b', Applicability: band(2 * M, 5 * M) }))).toBe('Annual revenue $2M – $5M');
        expect(OverviewPriceScope(row({ Name: 'c', PriceList: 'Member Pricing', Applicability: band(null, 2 * M) }))).toBe(
            'Member Pricing · Annual revenue Under $2M',
        );
        expect(OverviewPriceScope(row({ Name: 'd', Applicability: '{"logic":"and","filters":[{"field":"Order.OrderType","operator":"eq","value":"Renewal"}]}' }))).toBe('Conditional');
    });
});
