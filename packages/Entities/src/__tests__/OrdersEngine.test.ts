import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEngine,
    BaseEnginePropertyConfig,
    BaseEntity,
    PermissionConstrainedError,
    StartupManager,
    type IMetadataProvider,
} from '@memberjunction/core';
import {
    LoadOrdersEngine,
    OrdersEngine,
    OrdersEngineReady,
} from '../pricing/OrdersEngine.js';

type Row = Record<string, unknown>;

function seed(data: {
    paymentTypes?: Row[];
    paymentProviderTypes?: Row[];
    paymentTermsTypes?: Row[];
    chargeTypes?: Row[];
    types?: Row[];
    subTypes?: Row[];
    revRec?: Row[];
    products?: Row[];
    prices?: Row[];
    categories?: Row[];
    eventProducts?: Row[];
}): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._paymentTypes = data.paymentTypes ?? [];
    engine._paymentProviderTypes = data.paymentProviderTypes ?? [];
    engine._paymentTermsTypes = data.paymentTermsTypes ?? [];
    engine._chargeTypes = data.chargeTypes ?? [];
    engine._productTypes = data.types ?? [];
    engine._subscriptionTypes = data.subTypes ?? [];
    engine._revenueRecognitionTypes = data.revRec ?? [];
    engine._products = data.products ?? [];
    engine._productPrices = data.prices ?? [];
    engine._productCategories = data.categories ?? [];
    engine._eventProducts = data.eventProducts ?? [];
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

    it('inherits DefaultSubscriptionTypeID when the product left it blank', () => {
        seed({
            products: [
                { ID: 'p-blank', ProductTypeID: 'type-mem', SubscriptionTypeID: null },
                { ID: 'p-explicit', ProductTypeID: 'type-mem', SubscriptionTypeID: ' ST-PRODUCT ' },
                { ID: 'p-merch', ProductTypeID: 'type-merch', SubscriptionTypeID: null },
            ],
            types: [
                { ID: 'type-mem', DefaultSubscriptionTypeID: 'ST-TYPE' },
                { ID: 'type-merch', DefaultSubscriptionTypeID: null },
            ],
            subTypes: [{ ID: 'ST-TYPE' }],
        });
        expect(OrdersEngine.Instance.ResolveSubscriptionTypeID('p-blank')).toBe('ST-TYPE');
        expect(OrdersEngine.Instance.ResolveSubscriptionTypeID('p-explicit')).toBe('ST-PRODUCT');
        expect(OrdersEngine.Instance.ResolveSubscriptionTypeID('p-merch')).toBeNull();
        expect(OrdersEngine.Instance.ResolveSubscriptionTypeID('missing')).toBeNull();
        // The entity form reads the same rule, from the cache.
        expect(OrdersEngine.Instance.SubscriptionTypeForProduct('p-blank')?.ID).toBe('ST-TYPE');
        expect(OrdersEngine.Instance.SubscriptionTypeForProduct('p-merch')).toBeUndefined();
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

    it('registers for startup with deferred=false on server (Node) and preserves AdditionalLoading', () => {
        const reg = StartupManager.Instance.GetRegistrations().find((r) =>
            Object.is(r.constructor, OrdersEngine),
        );
        expect(reg).toBeDefined();
        expect(reg?.options.deferred).toBe(false);
        expect(Reflect.get(OrdersEngine.prototype, 'AdditionalLoading')).toBe(
            Reflect.get(BaseEngine.prototype, 'AdditionalLoading'),
        );
    });

    it('supports O(1) indexed lookups across all engine collections', () => {
        seed({
            paymentTypes: [
                { ID: 'pt-1', Code: 'CreditCard', Name: 'Credit Card' },
                { ID: 'pt-2', Code: 'ACH', Name: 'ACH' },
            ],
            paymentProviderTypes: [{ ID: 'ppt-1', Name: 'Stripe' }],
            paymentTermsTypes: [{ ID: 'ptt-1', Name: 'Net 30' }],
            chargeTypes: [{ ID: 'ct-1', Code: 'Shipping', Name: 'Shipping Fee' }],
            types: [{ ID: 'type-1', Code: 'Membership', Name: 'Membership' }],
            subTypes: [{ ID: 'st-1', Name: 'Annual' }],
            revRec: [{ ID: 'rr-1', Code: 'UpFront', ScheduleBasis: 'Immediate' }],
            eventProducts: [{ ID: 'ep-1', Name: 'Keynote' }],
            products: [{ ID: 'prod-1', SKU: 'SKU-001', Name: 'Main Product' }],
            prices: [{ ID: 'price-1', ProductID: 'prod-1', PriceListID: null, Status: 'Active', Priority: 10 }],
            categories: [{ ID: 'cat-1', Name: 'Electronics', ParentProductCategoryID: null }],
        });

        const engine = OrdersEngine.Instance;

        // PaymentTypes
        expect(engine.PaymentTypeByID('PT-1')?.Name).toBe('Credit Card');
        expect(engine.PaymentTypeByID('missing')).toBeUndefined();
        expect(engine.PaymentTypeByID('')).toBeUndefined();
        expect(engine.PaymentTypeByID('   ')).toBeUndefined();
        expect(engine.PaymentTypeByID(null)).toBeUndefined();
        expect(engine.PaymentTypeByCode('creditcard')?.ID).toBe('pt-1');
        expect(engine.PaymentTypeByCode(' CREDITCARD ')?.ID).toBe('pt-1');
        expect(engine.PaymentTypeByCode('missing')).toBeUndefined();
        expect(engine.PaymentTypeByCode('')).toBeUndefined();
        expect(engine.PaymentTypeByCode('   ')).toBeUndefined();
        expect(engine.PaymentTypeByCode(null)).toBeUndefined();

        // PaymentProviderTypes
        expect(engine.PaymentProviderTypeByID('PPT-1')?.Name).toBe('Stripe');
        expect(engine.PaymentProviderTypeByID('missing')).toBeUndefined();
        expect(engine.PaymentProviderTypeByID('')).toBeUndefined();
        expect(engine.PaymentProviderTypeByID(null)).toBeUndefined();

        // PaymentTermsTypes
        expect(engine.PaymentTermsTypeByID('PTT-1')?.Name).toBe('Net 30');
        expect(engine.PaymentTermsTypeByID('missing')).toBeUndefined();
        expect(engine.PaymentTermsTypeByID('')).toBeUndefined();
        expect(engine.PaymentTermsTypeByID(null)).toBeUndefined();

        // ChargeTypes
        expect(engine.ChargeTypeByID('CT-1')?.Name).toBe('Shipping Fee');
        expect(engine.ChargeTypeByID('missing')).toBeUndefined();
        expect(engine.ChargeTypeByID('')).toBeUndefined();
        expect(engine.ChargeTypeByID(null)).toBeUndefined();
        expect(engine.ChargeTypeByCode('shipping')?.ID).toBe('ct-1');
        expect(engine.ChargeTypeByCode(' SHIPPING ')?.ID).toBe('ct-1');
        expect(engine.ChargeTypeByCode('missing')).toBeUndefined();
        expect(engine.ChargeTypeByCode('')).toBeUndefined();
        expect(engine.ChargeTypeByCode(null)).toBeUndefined();

        // ProductTypes
        expect(engine.ProductTypeByID('TYPE-1')?.Name).toBe('Membership');
        expect(engine.ProductTypeByID('missing')).toBeUndefined();
        expect(engine.ProductTypeByID('')).toBeUndefined();
        expect(engine.ProductTypeByID(null)).toBeUndefined();
        expect(engine.ProductTypeByCode('membership')?.ID).toBe('type-1');
        expect(engine.ProductTypeByCode(' MEMBERSHIP ')?.ID).toBe('type-1');
        expect(engine.ProductTypeByCode('missing')).toBeUndefined();
        expect(engine.ProductTypeByCode('')).toBeUndefined();
        expect(engine.ProductTypeByCode(null)).toBeUndefined();

        // SubscriptionTypes
        expect(engine.SubscriptionTypeByID('ST-1')?.Name).toBe('Annual');
        expect(engine.SubscriptionTypeByID('missing')).toBeUndefined();
        expect(engine.SubscriptionTypeByID('')).toBeUndefined();
        expect(engine.SubscriptionTypeByID(null)).toBeUndefined();

        // RevenueRecognitionTypes
        expect(engine.RevenueRecognitionTypeByID('RR-1')?.Code).toBe('UpFront');
        expect(engine.RevenueRecognitionTypeByID('missing')).toBeUndefined();
        expect(engine.RevenueRecognitionTypeByID('')).toBeUndefined();
        expect(engine.RevenueRecognitionTypeByID(null)).toBeUndefined();

        // EventProducts
        expect(engine.EventProductByID('EP-1')?.Name).toBe('Keynote');
        expect(engine.EventProductByID('missing')).toBeUndefined();
        expect(engine.EventProductByID('')).toBeUndefined();
        expect(engine.EventProductByID(null)).toBeUndefined();

        // Products
        expect(engine.ProductByID('PROD-1')?.Name).toBe('Main Product');
        expect(engine.ProductByID('missing')).toBeUndefined();
        expect(engine.ProductByID('')).toBeUndefined();
        expect(engine.ProductByID(null)).toBeUndefined();
        expect(engine.ProductBySKU('sku-001')?.ID).toBe('prod-1');
        expect(engine.ProductBySKU('missing')).toBeUndefined();
        expect(engine.ProductBySKU('')).toBeUndefined();
        expect(engine.ProductBySKU(null)).toBeUndefined();

        // ProductPrices
        expect(engine.ProductPriceByID('PRICE-1')?.ProductID).toBe('prod-1');
        expect(engine.ProductPriceByID('missing')).toBeUndefined();
        expect(engine.ProductPriceByID('')).toBeUndefined();
        expect(engine.ProductPriceByID(null)).toBeUndefined();

        // ProductCategories
        expect(engine.ProductCategoryByID('CAT-1')?.Name).toBe('Electronics');
        expect(engine.ProductCategoryByID('missing')).toBeUndefined();
        expect(engine.ProductCategoryByID('')).toBeUndefined();
        expect(engine.ProductCategoryByID(null)).toBeUndefined();
    });

    it('BaseProductPrices returns a defensive copy so caller mutations do not corrupt the cache', () => {
        seed({
            prices: [
                { ID: 'price-1', ProductID: 'prod-1', PriceListID: null, Status: 'Active', Priority: 1 },
                { ID: 'price-2', ProductID: 'prod-1', PriceListID: null, Status: 'Active', Priority: 5 },
            ],
        });

        const copy1 = OrdersEngine.Instance.BaseProductPrices('prod-1');
        expect(copy1.map((p) => p.ID)).toEqual(['price-2', 'price-1']);

        // Mutating the returned array must not mutate the internal cached bucket
        copy1.pop();
        copy1.reverse();
        expect(copy1).toHaveLength(1);

        const copy2 = OrdersEngine.Instance.BaseProductPrices('prod-1');
        expect(copy2.map((p) => p.ID)).toEqual(['price-2', 'price-1']);
        expect(OrdersEngine.Instance.BaseProductPrices('')).toEqual([]);
        expect(OrdersEngine.Instance.BaseProductPrices(null)).toEqual([]);
    });

    it('ProductPricesFor deduplicates across repeated categoryIDs and overlapping product/category matches', () => {
        seed({
            prices: [
                { ID: 'p-both', ProductID: 'prod-1', ProductCategoryID: 'cat-1' },
                { ID: 'p-cat', ProductID: null, ProductCategoryID: 'cat-1' },
                { ID: 'p-prod', ProductID: 'prod-1', ProductCategoryID: null },
            ],
        });

        const prices = OrdersEngine.Instance.ProductPricesFor('prod-1', ['cat-1', 'cat-1', 'CAT-1']);
        const ids = prices.map((p) => p.ID);
        expect(ids).toHaveLength(3);
        expect(ids.sort()).toEqual(['p-both', 'p-cat', 'p-prod']);
        expect(OrdersEngine.Instance.ProductPricesFor(null, [])).toEqual([]);
    });

    it('invalidates cached indexes when NotifyDataChange is called after an in-place mutation', () => {
        const product = { ID: 'prod-1', SKU: 'OLD-SKU', Name: 'Product 1' };
        const products = [product];
        seed({ products });

        expect(OrdersEngine.Instance.ProductBySKU('OLD-SKU')?.ID).toBe('prod-1');

        // Mutate entity in place without changing array reference or array length
        product.SKU = 'NEW-SKU';

        // NotifyDataChange invalidates the cache by incrementing _indexGeneration
        const config = new BaseEnginePropertyConfig({
            Type: 'entity',
            PropertyName: '_products',
            EntityName: 'MJ_BizApps_Orders: Products',
        });
        (OrdersEngine.Instance as unknown as {
            NotifyDataChange: (
                config: BaseEnginePropertyConfig,
                data: unknown[],
                changeType?: 'refresh' | 'add' | 'update' | 'delete',
                affectedEntity?: BaseEntity,
            ) => void;
        }).NotifyDataChange(config, products, 'update', product as unknown as BaseEntity);

        expect(OrdersEngine.Instance.ProductBySKU('OLD-SKU')).toBeUndefined();
        expect(OrdersEngine.Instance.ProductBySKU('NEW-SKU')?.ID).toBe('prod-1');
    });

    it('propagates PermissionConstrainedError lazily per-collection without failing unrelated lookups', () => {
        seed({
            products: [{ ID: 'prod-1', SKU: 'P1' }],
        });

        // Mock PaymentTypes getter to throw PermissionConstrainedError
        vi.spyOn(OrdersEngine.Instance, 'PaymentTypes', 'get').mockImplementation(() => {
            throw new PermissionConstrainedError('OrdersEngine', ['MJ_BizApps_Orders: Payment Types']);
        });

        // Looking up ProductByID does NOT touch PaymentTypes, so it succeeds
        expect(OrdersEngine.Instance.ProductByID('prod-1')?.SKU).toBe('P1');

        // Accessing PaymentTypeByID touches PaymentTypes and throws PermissionConstrainedError
        expect(() => OrdersEngine.Instance.PaymentTypeByID('pt-1')).toThrow(PermissionConstrainedError);
    });
});
