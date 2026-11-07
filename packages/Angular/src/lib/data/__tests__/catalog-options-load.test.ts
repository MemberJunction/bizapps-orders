/**
 * GetCatalogOptions: which bundles the picker marks as containing a subscription.
 *
 * A bundle component that names no subscription type of its own inherits its product type's
 * default (golive #339), so the bundle line must still offer the term start.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    Products: [] as Array<Record<string, unknown>>,
    ProductTypes: [] as Array<Record<string, unknown>>,
    BundleItems: [] as Array<{ BundleProductID: string; ComponentProductID: string }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class Metadata {
        static Provider = {};
        CurrentUser = { ID: 'u' };
    }
    return {
        ...actual,
        Metadata,
        RunView: class {
            RunView = async () => ({ Success: true, Results: m.BundleItems });
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    // The inheritance rule stays real: the engine stand-in resolves through the shared function.
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    const productByID = (id: string | null | undefined) => m.Products.find((p) => p.ID === id);
    const productTypeByID = (id: string | null | undefined) => m.ProductTypes.find((t) => t.ID === id);
    return {
        ...actual,
        LoadOrdersEngine: async () => undefined,
        OrdersEngine: {
            Instance: {
                get Products() {
                    return m.Products;
                },
                BaseProductPrices: () => [],
                ProductByID: productByID,
                ProductTypeByID: productTypeByID,
                ResolveSubscriptionTypeID: (id: string | null | undefined) => {
                    const product = productByID(id);
                    if (!product) return null;
                    return actual.ResolveSubscriptionTypeID(
                        product.SubscriptionTypeID as string | null,
                        productTypeByID(product.ProductTypeID as string)?.DefaultSubscriptionTypeID as string | null,
                    );
                },
            },
        },
    };
});

import { GetCatalogOptions } from '../orders-queries';

const product = (ID: string, ProductTypeID: string, SubscriptionTypeID: string | null = null) => ({
    ID,
    Name: ID,
    SKU: ID,
    Status: 'Active',
    ProductType: ProductTypeID,
    ProductTypeID,
    CompanyID: 'co-1',
    Company: 'Meridian',
    IsTaxable: false,
    MaxQuantityPerLine: null,
    SubscriptionTypeID,
});

beforeEach(() => {
    m.ProductTypes = [
        { ID: 'type-membership', OrderLineExtensionEntity: null, DefaultSubscriptionTypeID: 'subtype-annual' },
        { ID: 'type-goods', OrderLineExtensionEntity: null, DefaultSubscriptionTypeID: null },
        { ID: 'type-bundle', OrderLineExtensionEntity: null, DefaultSubscriptionTypeID: null },
    ];
    m.Products = [
        product('KIT-INHERITS', 'type-bundle'),
        product('KIT-GOODS', 'type-bundle'),
        // Names no subscription type; its product type carries the default.
        product('MEMBERSHIP', 'type-membership'),
        product('MUG', 'type-goods'),
    ];
    m.BundleItems = [
        { BundleProductID: 'KIT-INHERITS', ComponentProductID: 'MEMBERSHIP' },
        { BundleProductID: 'KIT-INHERITS', ComponentProductID: 'MUG' },
        { BundleProductID: 'KIT-GOODS', ComponentProductID: 'MUG' },
    ];
});

describe('GetCatalogOptions', () => {
    it('marks a bundle whose component inherits its subscription type from its product type', async () => {
        const options = await GetCatalogOptions();
        const byID = (id: string) => options.find((o) => o.ID === id)!;

        expect(byID('KIT-INHERITS').ContainsSubscription).toBe(true);
        expect(byID('KIT-GOODS').ContainsSubscription).toBe(false);
        expect(byID('MEMBERSHIP').SubscriptionTypeID).toBe('subtype-annual');
        expect(byID('MUG').SubscriptionTypeID).toBeNull();
    });
});
