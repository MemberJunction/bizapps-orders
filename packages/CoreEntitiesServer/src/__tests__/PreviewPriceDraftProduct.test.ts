/**
 * `Orders.PreviewPrice` for a product that may not be sold yet.
 *
 * The product form's Activate check asks whether a Draft product has a price in force. Pricing
 * refuses any product that is not Active before it looks at a price, so the check passes
 * `IgnoreSellability`. These run the real operation and the real pricing walk; only the walk's
 * reads (product, rule resolution, company policy) and the line entity are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    product: { Name: 'SP-SVC', Status: 'Draft' as string },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        Metadata: class {
            async GetEntityObject() {
                const fields: Record<string, { Dirty: boolean }> = {};
                return {
                    NewRecord: () => true,
                    LineNumber: 1,
                    ProductID: null as string | null,
                    Quantity: 1,
                    UnitPrice: 0,
                    ExtendedAmount: null as number | null,
                    GetFieldByName: (name: string) => (fields[name] ??= { Dirty: false }),
                };
            }
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return {
        ...actual,
        LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
        OrdersEngine: {
            Instance: {
                ProductByID: () => ({ Name: mocks.product.Name, ProductCategoryID: null, CompanyID: 'co-1' }),
            },
        },
        ResolvePriceListForCustomer: vi.fn().mockResolvedValue(null),
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { OrderPricingService } from '@mj-biz-apps/orders-entities';
import { PreviewPriceOperation, type PreviewPriceInput, type PreviewPriceOutput } from '../PreviewPriceOperation.js';

const PRODUCT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3331';

const PRICE = {
    UnitPrice: 250,
    ExtendedAmount: 250,
    ProductPriceID: 'pp-1',
    PriceListID: null,
    ResolvedBy: 'default',
    Components: [{ ComponentType: 'Base', Label: 'Base price', Amount: 250, RunningTotal: 250 }],
};

/** The walk's private reads, stubbed on the prototype so the operation's own `new` picks them up. */
const walk = OrderPricingService.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
let resolved: typeof PRICE | null = PRICE;

function preview(input: Partial<PreviewPriceInput>): Promise<PreviewPriceOutput> {
    const op = new PreviewPriceOperation() as unknown as {
        InternalExecute(i: PreviewPriceInput, p: IMetadataProvider, u: UserInfo): Promise<PreviewPriceOutput>;
    };
    return op.InternalExecute(
        { ProductID: PRODUCT_ID, AsOf: '2026-11-06', ...input },
        {} as IMetadataProvider,
        { ID: 'user-1' } as UserInfo,
    );
}

describe('PreviewPrice for a Draft product', () => {
    beforeEach(() => {
        mocks.product.Status = 'Draft';
        resolved = PRICE;
        vi.spyOn(walk, 'loadProductForPricing').mockImplementation(async () => ({
            Name: mocks.product.Name,
            Status: mocks.product.Status,
            ProductCategoryID: null,
            CompanyID: 'co-1',
            AvailableFrom: null,
            AvailableTo: null,
        }));
        vi.spyOn(walk, 'resolutionContextFor').mockResolvedValue({});
        vi.spyOn(walk, 'resolveRetryingStaleCatalog').mockImplementation(async () => resolved);
        vi.spyOn(walk, 'refusesUnpricedLines').mockResolvedValue(true);
        vi.spyOn(walk, 'decidePromotions').mockResolvedValue(null);
        vi.spyOn(walk, 'decideCharges').mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('refuses it by default, as order pricing does', async () => {
        await expect(preview({})).rejects.toThrow(/cannot be sold: the product's status is 'Draft'/);
    });

    it('returns its price when sellability is ignored', async () => {
        const out = await preview({ IgnoreSellability: true });
        expect(out.Success).toBe(true);
        expect(out.UnitPrice).toBe(250);
        expect(out.ProductPriceID).toBe('pp-1');
        expect(out.Message).toMatch(/SP-SVC × 1 = 250 at base price/);
    });

    it('reports no price, as a refusal rather than a fault, when the product has none', async () => {
        resolved = null;
        const out = await preview({ IgnoreSellability: true });
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/cannot be priced: no price rule was found/);
    });

    it('still prices an Active product the same way with or without the flag', async () => {
        mocks.product.Status = 'Active';
        const [plain, ignoring] = await Promise.all([preview({}), preview({ IgnoreSellability: true })]);
        expect(plain).toEqual(ignoring);
        expect(plain.Success).toBe(true);
    });
});
