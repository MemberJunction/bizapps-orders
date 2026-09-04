/**
 * @fileoverview This app's metadata cache — lookup tables AND the product catalog, loaded once
 * and held in process.
 *
 * WHY THIS EXISTS. The tables below are read on nearly every write path and on the order-entry
 * catalog. Reading them per operation is the wrong shape twice over.
 *
 * The obvious cost is the round trip. The subtler one is a `RunView` that names `Fields`: when a
 * column is missing from CodeGen the call fails softly and the feature is silently off. A cache
 * turns that into a typed property read. If the field is missing the whole load fails loudly at
 * startup, once.
 *
 * WHAT BELONGS HERE. `*Type` tables, plus the product catalog (`Products`, `Product Prices`,
 * `Product Categories`). Those are read-mostly, mutated through `BaseEntity.Save()`, and
 * `BaseEngine` refreshes the in-memory arrays on save/delete (and on remote-invalidate when the
 * GraphQL subscription carries `RecordData`). Transactional rows — orders, payments, subscriptions —
 * still do NOT belong here.
 *
 * REFRESH IS AUTOMATIC. `BaseEngine` subscribes to entity save/delete events, so an administrator
 * adding a product is visible without a restart. `Config()` is idempotent and cheap after the first
 * call. `@RegisterForStartup` loads the cache with MJAPI so the first confirm does not pay the
 * catalog query.
 *
 * THE ONE THING THAT DEFEATS IT IS A RAW `UPDATE`. A statement outside the entity layer fires no
 * event. `ChargeEngine` deliberately does NOT read charge types from here when `Basis` may change
 * in the same transaction.
 *
 * Misses that would be fatal (`PaymentProviderResolver`) still fall through to a query.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { BaseEngine, RegisterForStartup, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import type {
    mjBizAppsOrdersChargeTypeEntity,
    mjBizAppsOrdersPaymentProviderTypeEntity,
    mjBizAppsOrdersPaymentTermsTypeEntity,
    mjBizAppsOrdersPaymentTypeEntity,
    mjBizAppsOrdersProductCategoryEntity,
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductPriceEntity,
    mjBizAppsOrdersProductTypeEntity,
    mjBizAppsOrdersSubscriptionTypeEntity,
} from '../generated/entity_subclasses';

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/**
 * The lookup + catalog cache for BizApps Orders.
 *
 * Use `OrdersEngine.Instance` after `Config()`; every accessor is a synchronous property read.
 */
@RegisterForStartup()
export class OrdersEngine extends BaseEngine<OrdersEngine> {
    public static get Instance(): OrdersEngine {
        return super.getInstance<OrdersEngine>();
    }

    private _paymentTypes: mjBizAppsOrdersPaymentTypeEntity[] = [];
    private _paymentProviderTypes: mjBizAppsOrdersPaymentProviderTypeEntity[] = [];
    private _paymentTermsTypes: mjBizAppsOrdersPaymentTermsTypeEntity[] = [];
    private _chargeTypes: mjBizAppsOrdersChargeTypeEntity[] = [];
    private _productTypes: mjBizAppsOrdersProductTypeEntity[] = [];
    private _subscriptionTypes: mjBizAppsOrdersSubscriptionTypeEntity[] = [];
    private _products: mjBizAppsOrdersProductEntity[] = [];
    private _productPrices: mjBizAppsOrdersProductPriceEntity[] = [];
    private _productCategories: mjBizAppsOrdersProductCategoryEntity[] = [];

    /**
     * Load (or refresh) the cache.
     *
     * `ResultType: 'entity_object'` on purpose: callers get typed entities, so reading a column that
     * does not exist is a COMPILE error rather than an `undefined` at run time.
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Load(
            [
                { Type: 'entity', PropertyName: '_paymentTypes', EntityName: 'MJ_BizApps_Orders: Payment Types' },
                { Type: 'entity', PropertyName: '_paymentProviderTypes', EntityName: 'MJ_BizApps_Orders: Payment Provider Types' },
                { Type: 'entity', PropertyName: '_paymentTermsTypes', EntityName: 'MJ_BizApps_Orders: Payment Terms Types' },
                { Type: 'entity', PropertyName: '_chargeTypes', EntityName: 'MJ_BizApps_Orders: Charge Types' },
                { Type: 'entity', PropertyName: '_productTypes', EntityName: 'MJ_BizApps_Orders: Product Types' },
                { Type: 'entity', PropertyName: '_subscriptionTypes', EntityName: 'MJ_BizApps_Orders: Subscription Types' },
                { Type: 'entity', PropertyName: '_products', EntityName: 'MJ_BizApps_Orders: Products' },
                { Type: 'entity', PropertyName: '_productPrices', EntityName: 'MJ_BizApps_Orders: Product Prices' },
                { Type: 'entity', PropertyName: '_productCategories', EntityName: 'MJ_BizApps_Orders: Product Categories' },
            ],
            provider as IMetadataProvider,
            forceRefresh,
            contextUser,
        );
    }

    public get PaymentTypes(): mjBizAppsOrdersPaymentTypeEntity[] {
        return this.GetConfigData<mjBizAppsOrdersPaymentTypeEntity>('_paymentTypes');
    }
    public get PaymentProviderTypes(): mjBizAppsOrdersPaymentProviderTypeEntity[] {
        return this.GetConfigData<mjBizAppsOrdersPaymentProviderTypeEntity>('_paymentProviderTypes');
    }
    public get PaymentTermsTypes(): mjBizAppsOrdersPaymentTermsTypeEntity[] {
        return this.GetConfigData<mjBizAppsOrdersPaymentTermsTypeEntity>('_paymentTermsTypes');
    }
    public get ChargeTypes(): mjBizAppsOrdersChargeTypeEntity[] {
        return this.GetConfigData<mjBizAppsOrdersChargeTypeEntity>('_chargeTypes');
    }
    public get ProductTypes(): mjBizAppsOrdersProductTypeEntity[] {
        return this.GetConfigData<mjBizAppsOrdersProductTypeEntity>('_productTypes');
    }
    public get SubscriptionTypes(): mjBizAppsOrdersSubscriptionTypeEntity[] {
        return this.GetConfigData<mjBizAppsOrdersSubscriptionTypeEntity>('_subscriptionTypes');
    }
    public get Products(): mjBizAppsOrdersProductEntity[] {
        return this.GetConfigData<mjBizAppsOrdersProductEntity>('_products');
    }
    public get ProductPrices(): mjBizAppsOrdersProductPriceEntity[] {
        return this.GetConfigData<mjBizAppsOrdersProductPriceEntity>('_productPrices');
    }
    public get ProductCategories(): mjBizAppsOrdersProductCategoryEntity[] {
        return this.GetConfigData<mjBizAppsOrdersProductCategoryEntity>('_productCategories');
    }

    public get Products$() {
        return this.ObserveProperty<mjBizAppsOrdersProductEntity>('_products');
    }
    public get ProductPrices$() {
        return this.ObserveProperty<mjBizAppsOrdersProductPriceEntity>('_productPrices');
    }

    public PaymentTypeByID(id: string | null | undefined): mjBizAppsOrdersPaymentTypeEntity | undefined {
        return byID(this.PaymentTypes, id);
    }
    public PaymentTypeByCode(code: string | null | undefined): mjBizAppsOrdersPaymentTypeEntity | undefined {
        if (!code) return undefined;
        const wanted = code.trim().toLowerCase();
        return this.PaymentTypes.find((t) => t.Code?.trim().toLowerCase() === wanted);
    }
    public ChargeTypeByCode(code: string | null | undefined): mjBizAppsOrdersChargeTypeEntity | undefined {
        if (!code) return undefined;
        const wanted = code.trim().toLowerCase();
        return this.ChargeTypes.find((t) => t.Code?.trim().toLowerCase() === wanted);
    }
    public ChargeTypeByID(id: string | null | undefined): mjBizAppsOrdersChargeTypeEntity | undefined {
        return byID(this.ChargeTypes, id);
    }
    public PaymentProviderTypeByID(id: string | null | undefined): mjBizAppsOrdersPaymentProviderTypeEntity | undefined {
        return byID(this.PaymentProviderTypes, id);
    }
    public PaymentTermsTypeByID(id: string | null | undefined): mjBizAppsOrdersPaymentTermsTypeEntity | undefined {
        return byID(this.PaymentTermsTypes, id);
    }
    public ProductTypeByID(id: string | null | undefined): mjBizAppsOrdersProductTypeEntity | undefined {
        return byID(this.ProductTypes, id);
    }
    public ProductTypeByCode(code: string | null | undefined): mjBizAppsOrdersProductTypeEntity | undefined {
        if (!code) return undefined;
        const wanted = code.trim().toLowerCase();
        return this.ProductTypes.find((t) => (t.Code ?? '').trim().toLowerCase() === wanted);
    }
    public SubscriptionTypeByID(id: string | null | undefined): mjBizAppsOrdersSubscriptionTypeEntity | undefined {
        return byID(this.SubscriptionTypes, id);
    }
    public ProductByID(id: string | null | undefined): mjBizAppsOrdersProductEntity | undefined {
        return byID(this.Products, id);
    }

    public ProductBySKU(sku: string | null | undefined): mjBizAppsOrdersProductEntity | undefined {
        const wanted = sku?.trim().toLowerCase();
        if (!wanted) return undefined;
        return this.Products.find((p) => (p.SKU ?? '').trim().toLowerCase() === wanted);
    }
    public ProductPriceByID(id: string | null | undefined): mjBizAppsOrdersProductPriceEntity | undefined {
        return byID(this.ProductPrices, id);
    }
    public ProductCategoryByID(id: string | null | undefined): mjBizAppsOrdersProductCategoryEntity | undefined {
        return byID(this.ProductCategories, id);
    }

    public ProductTypeCode(productID: string | null | undefined): string | null {
        const product = this.ProductByID(productID);
        if (!product) return null;
        return this.ProductTypeByID(product.ProductTypeID)?.Code ?? null;
    }

    public ProductRequiresFulfillment(productID: string | null | undefined): boolean {
        const product = this.ProductByID(productID);
        if (!product) return false;
        return !!this.ProductTypeByID(product.ProductTypeID)?.RequiresFulfillment;
    }

    /** Active base-channel (no list) prices on a product, highest priority first. */
    public BaseProductPrices(productID: string | null | undefined): mjBizAppsOrdersProductPriceEntity[] {
        const id = uuidKey(productID);
        if (!id) return [];
        return this.ProductPrices.filter(
            (p) => uuidKey(p.ProductID) === id && !p.PriceListID && (!p.Status || p.Status === 'Active'),
        ).sort((a, b) => Number(b.Priority || 0) - Number(a.Priority || 0));
    }

    /** Prices hanging on this product or any of the given categories (inherit walk). */
    public ProductPricesFor(
        productID: string | null | undefined,
        categoryIDs: readonly string[] = [],
    ): mjBizAppsOrdersProductPriceEntity[] {
        const pid = uuidKey(productID);
        const cats = new Set(categoryIDs.map(uuidKey).filter(Boolean));
        return this.ProductPrices.filter((p) => {
            if (pid && uuidKey(p.ProductID) === pid) return true;
            const cat = uuidKey((p as { ProductCategoryID?: string | null }).ProductCategoryID);
            return !!cat && cats.has(cat);
        });
    }

    /** Category and ancestors, nearest first. */
    public CategoryChain(startCategoryID: string | null | undefined): string[] {
        if (!startCategoryID) return [];
        const parent = new Map(
            this.ProductCategories.map((c) => [
                uuidKey(c.ID),
                (c.ParentProductCategoryID as string | null | undefined) ?? null,
            ]),
        );
        const chain: string[] = [];
        const seen = new Set<string>();
        let current: string | null = startCategoryID;
        while (current && !seen.has(uuidKey(current))) {
            seen.add(uuidKey(current));
            chain.push(current);
            current = parent.get(uuidKey(current)) ?? null;
        }
        return chain;
    }
}

function byID<T extends { ID?: string }>(rows: T[], id: string | null | undefined): T | undefined {
    if (!id) return undefined;
    const wanted = id.toLowerCase();
    return rows.find((r) => r.ID?.toLowerCase() === wanted);
}

/** Load the cache. Idempotent and cheap after the first call. */
export async function LoadOrdersEngine(provider: IMetadataProvider, user?: UserInfo | null): Promise<void> {
    await OrdersEngine.Instance.Config(false, user ?? undefined, provider);
}

/**
 * True when this provider can Config the engine (has `RunViews`). Unit tests that only mock
 * `RunView` fall through to their query stubs; production MJAPI/Explorer always return true.
 */
export async function OrdersEngineReady(
    provider: IMetadataProvider | IRunViewProvider | null | undefined,
    user?: UserInfo | null,
): Promise<boolean> {
    if (!provider || typeof (provider as { RunViews?: unknown }).RunViews !== 'function') return false;
    try {
        await LoadOrdersEngine(provider as IMetadataProvider, user);
        return true;
    } catch {
        return false;
    }
}
