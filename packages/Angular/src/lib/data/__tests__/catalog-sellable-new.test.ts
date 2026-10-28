import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, RunView } from '@memberjunction/core';

/**
 * bc-aidp-next-golive#360: products kept for existing orders, imports and renewals (IsSellableNew = 0)
 * stay Active, so pricing keeps accepting them, but the add-product pickers stop offering them.
 */
const { PRODUCTS } = vi.hoisted(() => ({ PRODUCTS: [
    { ID: 'p-sell', Name: 'Annual Membership', Status: 'Active', IsSellableNew: true, CompanyID: 'c1', Company: 'Northwind', ProductTypeID: 't1' },
    { ID: 'p-catch', Name: 'Northwind Catch-All', Status: 'Active', IsSellableNew: false, CompanyID: 'c1', Company: 'Northwind', ProductTypeID: 't1' },
    { ID: 'p-old', Name: 'Retired Thing', Status: 'Discontinued', IsSellableNew: true, CompanyID: 'c1', Company: 'Northwind', ProductTypeID: 't1' },
] }));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    const engine = {
        Products: PRODUCTS,
        BaseProductPrices: () => [],
        ProductTypeByID: () => undefined,
        ProductByID: (id: string) => PRODUCTS.find((p) => p.ID === id),
    };
    return {
        ...actual,
        LoadOrdersEngine: async () => undefined,
        OrdersEngine: { Instance: engine },
    };
});

import { GetCatalogOptions, GetProducts } from '../orders-queries';

beforeEach(() => {
    vi.spyOn(Metadata.prototype, 'CurrentUser', 'get').mockReturnValue({} as never);
});
afterEach(() => vi.restoreAllMocks());

describe('the add-product catalog and IsSellableNew', () => {
    it('leaves out a product not sold new', async () => {
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({ Success: true, Results: [] } as never);
        const ids = (await GetCatalogOptions()).map((o) => o.ID);
        expect(ids).toEqual(['p-sell']);
    });

    it('keeps it among the Active products other readers see', async () => {
        const ids = (await GetProducts()).map((p) => p.ID);
        expect(ids).toContain('p-catch');
    });
});
