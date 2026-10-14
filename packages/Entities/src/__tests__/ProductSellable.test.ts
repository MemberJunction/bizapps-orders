/**
 * A product that may not be sold is refused whether the line's price is stated or engine-resolved.
 *
 * `applyResolvedPrice` is driven directly with the product load and the price walk stubbed, so the
 * test sees only the sellability decision. A stated price used to return before the check ran, so a
 * retired or out-of-window product booked whenever somebody typed a price.
 */
import { describe, expect, it, vi } from 'vitest';
import { OrderPricingService } from '../pricing/OrderPricingService.js';

type Product = { Name: string; Status: string; AvailableFrom: Date | null; AvailableTo: Date | null; CompanyID: string; ProductCategoryID: null };
type Line = { LineNumber: number; ProductID: string; UnitPrice: number; GetFieldByName: (n: string) => { Dirty: boolean } };
type Walk = {
    ctx: Record<string, unknown>;
    out: { PriceComponents: Map<unknown, unknown>; EngineDefaults: Map<unknown, unknown> };
    loadProductForPricing: (id: string) => Promise<Product | null>;
    resolveRetryingStaleCatalog: (ctx: unknown) => Promise<unknown>;
    resolutionContextFor: () => Promise<unknown>;
    applyResolvedPrice: (line: Line) => Promise<void>;
};

const PRODUCT: Product = { Name: 'Widget', Status: 'Active', AvailableFrom: null, AvailableTo: null, CompanyID: 'co-1', ProductCategoryID: null };

function walk(product: Product, orderDate = '2026-09-25', includeDefaults = false): Walk {
    const w = new OrderPricingService({ Provider: {} as never, User: {} as never }) as unknown as Walk;
    w.ctx = { CompanyID: 'co-1', OrderDate: orderDate, Lines: [], IncludeDefaultsForStatedLines: includeDefaults };
    w.out = { PriceComponents: new Map(), EngineDefaults: new Map() };
    w.loadProductForPricing = vi.fn(async () => product);
    w.resolutionContextFor = vi.fn(async () => ({}));
    w.resolveRetryingStaleCatalog = vi.fn(async () => ({ UnitPrice: 25, ProductPriceID: 'pp-1', ExtendedAmount: 25 }));
    return w;
}

/** A line with a typed price (dirty UnitPrice) or one left for the engine (clean, zero). */
function line(stated: boolean): Line {
    return { LineNumber: 1, ProductID: 'prod-1', UnitPrice: stated ? 10 : 0, GetFieldByName: () => ({ Dirty: stated }) };
}

const BOTH_PATHS = [
    ['stated price', true],
    ['engine price', false],
] as const;

describe('product sellability on every priced line', () => {
    describe.each(BOTH_PATHS)('%s', (_label, stated) => {
        it('refuses a product whose status is not Active', async () => {
            const w = walk({ ...PRODUCT, Status: 'Discontinued' });
            await expect(w.applyResolvedPrice(line(stated))).rejects.toThrow(/status is 'Discontinued', not 'Active'/);
        });

        it('refuses an order dated before AvailableFrom', async () => {
            const w = walk({ ...PRODUCT, AvailableFrom: new Date('2030-01-01') });
            await expect(w.applyResolvedPrice(line(stated))).rejects.toThrow(/not available until 2030-01-01, and this order is dated 2026-09-25/);
        });

        it('refuses an order dated after AvailableTo', async () => {
            const w = walk({ ...PRODUCT, AvailableTo: new Date('2021-12-31') });
            await expect(w.applyResolvedPrice(line(stated))).rejects.toThrow(/was available until 2021-12-31, and this order is dated 2026-09-25/);
        });

        it('accepts an order back-dated into a window that has since closed', async () => {
            const w = walk({ ...PRODUCT, AvailableFrom: new Date('2021-01-01'), AvailableTo: new Date('2021-12-31') }, '2021-06-15');
            await expect(w.applyResolvedPrice(line(stated))).resolves.toBeUndefined();
        });
    });

    it('keeps a stated price on a sellable product', async () => {
        const w = walk(PRODUCT);
        const l = line(true);
        await w.applyResolvedPrice(l);
        expect(l.UnitPrice).toBe(10);
        expect(w.resolveRetryingStaleCatalog).not.toHaveBeenCalled();
    });

    it('refuses a stated line even when the caller asked only for the default to compare against', async () => {
        // The default lookup swallows its own errors; the refusal must not be inside it.
        const w = walk({ ...PRODUCT, Status: 'Inactive' }, '2026-09-25', true);
        await expect(w.applyResolvedPrice(line(true))).rejects.toThrow(/cannot be sold/);
    });
});
