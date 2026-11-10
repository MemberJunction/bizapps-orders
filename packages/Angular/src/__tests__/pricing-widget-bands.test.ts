import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { BuildRevenueBandApplicability } from '@mj-biz-apps/orders-entities';
import { BizAppsProductPricingWidgetComponent } from '../lib/custom/Product/widgets/product-pricing-widget.component';
import '../public-api';

const M = 1_000_000;

interface FakePrice {
    ID: string;
    Name: string;
    Amount: number;
    Priority: number;
    Status: 'Active' | 'Inactive';
    EffectiveFrom: Date;
    EffectiveTo: Date | null;
    PriceListID: string | null;
    ProductID: string;
    Applicability: string | null;
    PricingModel: string;
    FeeType: string;
    MinQuantity: number | null;
    MaxQuantity: number | null;
    PackageQuantity: number | null;
    Description: string | null;
}

function price(overrides: Partial<FakePrice> & { ID: string }): FakePrice {
    return {
        Name: overrides.ID,
        Amount: 100,
        Priority: 10,
        Status: 'Active',
        EffectiveFrom: new Date('2026-01-01T00:00:00Z'),
        EffectiveTo: null,
        PriceListID: null,
        ProductID: 'prod-1',
        Applicability: null,
        PricingModel: 'PerUnit',
        FeeType: 'Standard',
        MinQuantity: null,
        MaxQuantity: null,
        PackageQuantity: null,
        Description: null,
        ...overrides,
    };
}

function widgetWith(prices: FakePrice[]): BizAppsProductPricingWidgetComponent {
    const widget = new BizAppsProductPricingWidgetComponent();
    widget.Product = { ID: 'prod-1', IsSaved: true } as unknown as mjBizAppsOrdersProductEntity;
    widget.AllPriceRecords = prices as never[];
    return widget;
}

const band = (min: number | null, max: number | null) => BuildRevenueBandApplicability({ Min: min, Max: max });

describe('Pricing widget: revenue bands, retirement and the quote tester', () => {
    it('reads a band When as a revenue range sentence', () => {
        const widget = widgetWith([]);
        expect(widget.WhenSentence(price({ ID: 'a', Applicability: band(2 * M, 5 * M) }) as never)).toBe(
            'Customer annual revenue $2M – $5M',
        );
        expect(widget.WhenSentence(price({ ID: 'b', Applicability: band(null, 2 * M) }) as never)).toBe(
            'Customer annual revenue Under $2M',
        );
        expect(widget.WhenSentence(price({ ID: 'c', Applicability: band(250 * M, null) }) as never)).toBe(
            'Customer annual revenue $250M and up',
        );
    });

    it('treats an inactive price, or one whose Effective To has passed, as retired', () => {
        const widget = widgetWith([]);
        expect(widget.IsRetired(price({ ID: 'live' }) as never)).toBe(false);
        expect(widget.IsRetired(price({ ID: 'off', Status: 'Inactive' }) as never)).toBe(true);
        expect(widget.StatusTextFor(price({ ID: 'off', Status: 'Inactive' }) as never)).toBe('Inactive');
        expect(widget.IsRetired(price({ ID: 'ended', EffectiveTo: new Date('2020-01-01T00:00:00Z') }) as never)).toBe(true);
        expect(widget.StatusTextFor(price({ ID: 'ended', EffectiveTo: new Date('2020-01-01T00:00:00Z') }) as never)).toMatch(/^Expired /);
        expect(widget.IsRetired(price({ ID: 'ending', EffectiveTo: new Date('2999-12-31T00:00:00Z') }) as never)).toBe(false);
        expect(widget.StatusTextFor(price({ ID: 'ending', EffectiveTo: new Date('2999-12-31T00:00:00Z') }) as never)).toMatch(/^Expires /);
    });

    it('hides retired prices from the cards until asked for', () => {
        const widget = widgetWith([price({ ID: 'live', Priority: 20 }), price({ ID: 'off', Status: 'Inactive', Priority: 10 })]);
        expect(widget.VisiblePrices.map((c) => c.ID)).toEqual(['live']);
        expect(widget.RetiredCount).toBe(1);
        widget.ShowRetired = true;
        expect(widget.VisiblePrices.map((c) => c.ID)).toEqual(['live', 'off']);
        expect(widget.VisiblePrices[1].Retired).toBe(true);
        expect(widget.VisiblePrices[1].StatusText).toBe('Inactive');
    });

    describe('RunQuote', () => {
        const ladder = [
            price({ ID: 'b1', Name: 'Under $2M rev', Amount: 10_000, Applicability: band(0, 2 * M) }),
            price({ ID: 'b2', Name: '$2M-$5M rev', Amount: 12_500, Applicability: band(2 * M, 5 * M) }),
            price({ ID: 'b3', Name: '$5M+ rev', Amount: 17_500, Applicability: band(5 * M, null) }),
        ];

        it('picks the band the sample revenue falls in', () => {
            const widget = widgetWith(ladder);
            widget.QuoteRevenueMillions = 3;
            widget.RunQuote();
            expect(widget.QuoteResult.AmountText).toBe('$12,500.00');
            expect(widget.QuoteResult.Why).toContain('$2M-$5M rev');
            expect(widget.QuoteResult.Skipped).toHaveLength(2);
            expect(widget.QuoteResult.Skipped[0]).toContain('conditions not met');
        });

        it('takes the lower edge as inclusive and the upper as exclusive', () => {
            const widget = widgetWith(ladder);
            widget.QuoteRevenueMillions = 5;
            widget.RunQuote();
            expect(widget.QuoteResult.Why).toContain('$5M+ rev');
        });

        it('reports every band as undecidable when the revenue is unknown', () => {
            const widget = widgetWith(ladder);
            widget.QuoteRevenueMillions = null;
            widget.RunQuote();
            expect(widget.QuoteResult.AmountText).toBe('—');
            expect(widget.QuoteResult.Skipped).toHaveLength(3);
            for (const s of widget.QuoteResult.Skipped) expect(s).toContain('requires annual revenue');
        });

        it('applies the resolver status, date and quantity checks before When', () => {
            const widget = widgetWith([
                price({ ID: 'off', Name: 'Old', Amount: 1, Status: 'Inactive', Priority: 99 }),
                price({ ID: 'future', Name: 'Next year', Amount: 2, EffectiveFrom: new Date('2999-01-01T00:00:00Z'), Priority: 98 }),
                price({ ID: 'bulk', Name: 'Bulk', Amount: 3, MinQuantity: 10, Priority: 97 }),
                price({ ID: 'base', Name: 'Base', Amount: 4, Priority: 1 }),
            ]);
            widget.SimQuantity = 1;
            widget.RunQuote();
            expect(widget.QuoteResult.AmountText).toBe('$4.00');
            expect(widget.QuoteResult.Skipped.join('\n')).toMatch(/Old: its status is 'Inactive'/);
            expect(widget.QuoteResult.Skipped.join('\n')).toMatch(/Next year: it is not in force until/);
            expect(widget.QuoteResult.Skipped.join('\n')).toMatch(/Bulk: it needs a quantity of at least 10/);
        });

        it('reports a priority tie as the refusal pricing would give', () => {
            const widget = widgetWith([
                price({ ID: 'a', Name: 'A', Amount: 1, Priority: 10 }),
                price({ ID: 'b', Name: 'B', Amount: 2, Priority: 10 }),
            ]);
            widget.RunQuote();
            expect(widget.QuoteResult.AmountText).toBe('Conflict');
            expect(widget.QuoteResult.Why).toContain('both apply at priority 10');
        });
    });

    it('orders same-priority bands lowest band first, whatever order they were saved in', () => {
        const widget = widgetWith([
            price({ ID: 'top', Name: '$5M+ rev', Applicability: band(5 * M, null) }),
            price({ ID: 'low', Name: 'Under $2M rev', Applicability: band(0, 2 * M) }),
            price({ ID: 'mid', Name: '$2M-$5M rev', Applicability: band(2 * M, 5 * M) }),
            price({ ID: 'first', Name: 'Override', Priority: 50 }),
        ]);
        expect(widget.VisiblePrices.map((c) => c.ID)).toEqual(['first', 'low', 'mid', 'top']);
    });

    it('shows a price list tab only when it prices this product, or in Edit', () => {
        const widget = widgetWith([]);
        widget.Channels = [
            { ID: null, Name: 'Standard', Icon: '', TierCount: 3 },
            { ID: 'pl-1', Name: 'Member Pricing', Icon: '', TierCount: 0 },
        ];
        expect(widget.VisibleChannels.map((c) => c.Name)).toEqual(['Standard']);
        expect(widget.ShowChannelBar).toBe(false);
        widget.EditMode = true;
        expect(widget.VisibleChannels.map((c) => c.Name)).toEqual(['Standard', 'Member Pricing']);
        expect(widget.ShowChannelBar).toBe(true);
    });

    it('keeps the grid flag for callers that still read it', () => {
        const widget = widgetWith([]);
        expect(widget.IsAdvancedGridView).toBe(false);
        widget.SetView('grid');
        expect(widget.IsAdvancedGridView).toBe(true);
        widget.ToggleAdvancedView();
        expect(widget.ViewMode).toBe('cards');
    });
});
