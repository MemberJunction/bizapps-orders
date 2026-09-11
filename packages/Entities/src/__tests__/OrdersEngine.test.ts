import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import {
    LoadOrdersEngine,
    OrdersEngine,
    OrdersEngineReady,
} from '../pricing/OrdersEngine.js';

type Row = Record<string, unknown>;

function seed(data: {
    products?: Row[];
    prices?: Row[];
    types?: Row[];
    subTypes?: Row[];
    revRec?: Row[];
    categories?: Row[];
}): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = data.products ?? [];
    engine._productPrices = data.prices ?? [];
    engine._productTypes = data.types ?? [];
    engine._subscriptionTypes = data.subTypes ?? [];
    engine._revenueRecognitionTypes = data.revRec ?? [];
    engine._productCategories = data.categories ?? [];
}

describe('OrdersEngine catalog cache', () => {
    beforeEach(() => seed({}));
    afterEach(() => {
        seed({});
        vi.restoreAllMocks();
    });

    it('finds a product by SKU case-insensitively and ignores surrounding space', () => {
        seed({
            products: [
                { ID: 'PROD-1', SKU: '  Conf-2027  ', Name: 'Summit' },
                { ID: 'PROD-2', SKU: 'OTHER', Name: 'Other' },
            ],
        });
        expect(OrdersEngine.Instance.ProductBySKU('conf-2027')?.ID).toBe('PROD-1');
        expect(OrdersEngine.Instance.ProductBySKU(' CONF-2027 ')?.ID).toBe('PROD-1');
        expect(OrdersEngine.Instance.ProductBySKU('nope')).toBeUndefined();
        expect(OrdersEngine.Instance.ProductBySKU('')).toBeUndefined();
        expect(OrdersEngine.Instance.ProductBySKU(null)).toBeUndefined();
    });

    it('matches IDs case-insensitively', () => {
        seed({
            products: [{ ID: 'AaA', SKU: 'X', ProductTypeID: 'TYPE-1' }],
            types: [{ ID: 'type-1', Code: 'Membership' }],
        });
        expect(OrdersEngine.Instance.ProductByID('aaa')?.SKU).toBe('X');
        expect(OrdersEngine.Instance.ProductTypeByID('Type-1')?.Code).toBe('Membership');
        expect(OrdersEngine.Instance.ProductTypeCode('AAA')).toBe('Membership');
    });

    it('inherits DefaultRevenueRecognitionTypeID when the product left it blank', () => {
        seed({
            products: [
                {
                    ID: 'p-blank',
                    ProductTypeID: 'type-mem',
                    RevenueRecognitionTypeID: '  ',
                },
                {
                    ID: 'p-explicit',
                    ProductTypeID: 'type-mem',
                    RevenueRecognitionTypeID: '  RR-PRODUCT  ',
                },
            ],
            types: [
                {
                    ID: 'type-mem',
                    DefaultRevenueRecognitionTypeID: 'RR-TYPE',
                    DefaultSubscriptionTypeID: 'ST-TYPE',
                },
            ],
        });
        expect(OrdersEngine.Instance.ResolveRevenueRecognitionTypeID('p-blank')).toBe('RR-TYPE');
        expect(OrdersEngine.Instance.ResolveRevenueRecognitionTypeID('p-explicit')).toBe('RR-PRODUCT');
        expect(OrdersEngine.Instance.ResolveRevenueRecognitionTypeID('missing')).toBeNull();
    });

    it('returns active base-channel prices highest priority first', () => {
        seed({
            prices: [
                { ID: 'low', ProductID: 'prod-1', PriceListID: null, Status: 'Active', Priority: 1 },
                { ID: 'high', ProductID: 'prod-1', PriceListID: null, Status: 'Active', Priority: 5 },
                { ID: 'list', ProductID: 'prod-1', PriceListID: 'pl-1', Status: 'Active', Priority: 9 },
                { ID: 'inactive', ProductID: 'prod-1', PriceListID: null, Status: 'Inactive', Priority: 9 },
                { ID: 'other', ProductID: 'prod-2', PriceListID: null, Status: 'Active', Priority: 9 },
                { ID: 'blank-status', ProductID: 'prod-1', PriceListID: null, Status: '', Priority: 3 },
            ],
        });
        expect(OrdersEngine.Instance.BaseProductPrices('PROD-1').map((p) => p.ID)).toEqual([
            'high',
            'blank-status',
            'low',
        ]);
    });

    it('returns prices hanging on the product or on the given categories', () => {
        seed({
            prices: [
                { ID: 'own', ProductID: 'prod-1', ProductCategoryID: null },
                { ID: 'near', ProductID: null, ProductCategoryID: 'cat-near' },
                { ID: 'other', ProductID: null, ProductCategoryID: 'cat-other' },
            ],
        });
        expect(OrdersEngine.Instance.ProductPricesFor('prod-1', ['cat-near']).map((p) => p.ID).sort()).toEqual([
            'near',
            'own',
        ]);
    });

    it('walks the category chain nearest-first and stops on a cycle', () => {
        seed({
            categories: [
                { ID: 'leaf', ParentProductCategoryID: 'mid' },
                { ID: 'mid', ParentProductCategoryID: 'root' },
                { ID: 'root', ParentProductCategoryID: null },
                { ID: 'loop-a', ParentProductCategoryID: 'loop-b' },
                { ID: 'loop-b', ParentProductCategoryID: 'loop-a' },
            ],
        });
        expect(OrdersEngine.Instance.CategoryChain('leaf')).toEqual(['leaf', 'mid', 'root']);
        expect(OrdersEngine.Instance.CategoryChain('loop-a')).toEqual(['loop-a', 'loop-b']);
        expect(OrdersEngine.Instance.CategoryChain(null)).toEqual([]);
    });

    it('reads RequiresFulfillment from the product type', () => {
        seed({
            products: [{ ID: 'goods', ProductTypeID: 't-goods' }, { ID: 'svc', ProductTypeID: 't-svc' }],
            types: [
                { ID: 't-goods', RequiresFulfillment: true },
                { ID: 't-svc', RequiresFulfillment: false },
            ],
        });
        expect(OrdersEngine.Instance.ProductRequiresFulfillment('goods')).toBe(true);
        expect(OrdersEngine.Instance.ProductRequiresFulfillment('svc')).toBe(false);
        expect(OrdersEngine.Instance.ProductRequiresFulfillment('missing')).toBe(false);
    });

    it('LoadOrdersEngine calls Config(false, user, provider)', async () => {
        const spy = vi.spyOn(OrdersEngine.Instance, 'Config').mockResolvedValue(undefined);
        const provider = { PlatformKey: 'test' } as unknown as IMetadataProvider;
        const user = { ID: 'u-1' } as never;
        await LoadOrdersEngine(provider, user);
        expect(spy).toHaveBeenCalledWith(false, user, provider);
    });

    it('OrdersEngineReady is false without RunViews and swallows Config failures', async () => {
        expect(await OrdersEngineReady(null)).toBe(false);
        expect(await OrdersEngineReady({} as never)).toBe(false);
        const spy = vi.spyOn(OrdersEngine.Instance, 'Config').mockResolvedValue(undefined);
        expect(await OrdersEngineReady({ RunViews: async () => [] } as never)).toBe(true);
        spy.mockRejectedValueOnce(new Error('catalog load failed'));
        expect(await OrdersEngineReady({ RunViews: async () => [] } as never)).toBe(false);
    });
});
