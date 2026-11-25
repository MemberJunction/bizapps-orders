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
 * `Product Categories`, `Event Products`). Those are read-mostly, mutated through `BaseEntity.Save()`, and
 * `BaseEngine` refreshes the in-memory arrays on save/delete (and on remote-invalidate when the
 * GraphQL subscription carries `RecordData`). Transactional rows — orders, payments, subscriptions —
 * still do NOT belong here.
 *
 * REFRESH IS AUTOMATIC. `BaseEngine` subscribes to entity save/delete events, so an administrator
 * adding a product is visible without a restart. `Config()` is idempotent and cheap after the first
 * call. `@RegisterForStartup` loads the cache with MJAPI so the first confirm does not pay the
 * catalog query.
 *
 * THE ONE THING THAT DEFEATS IT IS A WRITE THIS PROCESS NEVER SEES. A raw `INSERT`/`UPDATE`, a
 * loader running in another process, or another API replica without Redis invalidation fires no
 * event here. `ChargeEngine` deliberately does NOT read charge types from here when `Basis` may
 * change in the same transaction. For products, server lookups that cannot proceed without the row
 * go through {@link OrdersEngine.EnsureProducts} / {@link OrdersEngine.RequireProduct}, which
 * reload the catalog once on a miss (golive #301).
 *
 * Misses that would be fatal (`PaymentProviderResolver`) still fall through to a query.
 *
 * @module @mj-biz-apps/orders-entities
 */
import {
    BaseEngine,
    BaseEnginePropertyConfig,
    BaseEntity,
    RegisterForStartup,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import type { Observable } from 'rxjs';
import type {
    mjBizAppsOrdersChargeTypeEntity,
    mjBizAppsOrdersEventProductEntity,
    mjBizAppsOrdersPaymentProviderTypeEntity,
    mjBizAppsOrdersPaymentTermsTypeEntity,
    mjBizAppsOrdersPaymentTypeEntity,
    mjBizAppsOrdersProductCategoryEntity,
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductPriceEntity,
    mjBizAppsOrdersProductTypeEntity,
    mjBizAppsOrdersRevenueRecognitionTypeEntity,
    mjBizAppsOrdersSubscriptionTypeEntity,
} from '../generated/entity_subclasses';
import { ResolveSubscriptionTypeID } from '../subscription-type';

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/** Same codes the server reads: `GIFT_CARD_PRODUCT_TYPE_CODE`, and the IS-A child an event product carries. */
const GIFT_CARD_TYPE_CODE = 'giftcard';
const EVENT_PRODUCT_ENTITY = 'MJ_BizApps_Orders: Event Products';

/** See {@link OrdersEngine.ServicePeriodSource}. */
export type ServicePeriodSource = 'NotRequired' | 'Event' | 'Subscription' | 'Line';

/**
 * The lookup + catalog cache for BizApps Orders.
 *
 * Use `OrdersEngine.Instance` after `Config()`; every accessor is a synchronous property read.
 */
@RegisterForStartup({ deferred: typeof window !== 'undefined' })
export class OrdersEngine extends BaseEngine<OrdersEngine> {
    public static get Instance(): OrdersEngine {
        return super.getInstance<OrdersEngine>();
    }

    private _indexGeneration = 0;

    protected override NotifyDataChange(
        config: BaseEnginePropertyConfig,
        data: unknown[],
        changeType: 'refresh' | 'add' | 'update' | 'delete' = 'refresh',
        affectedEntity?: BaseEntity,
    ): void {
        super.NotifyDataChange(config, data, changeType, affectedEntity);
        this._indexGeneration++;
    }

    private _paymentTypes: mjBizAppsOrdersPaymentTypeEntity[] = [];
    private _paymentProviderTypes: mjBizAppsOrdersPaymentProviderTypeEntity[] = [];
    private _paymentTermsTypes: mjBizAppsOrdersPaymentTermsTypeEntity[] = [];
    private _chargeTypes: mjBizAppsOrdersChargeTypeEntity[] = [];
    private _productTypes: mjBizAppsOrdersProductTypeEntity[] = [];
    private _subscriptionTypes: mjBizAppsOrdersSubscriptionTypeEntity[] = [];
    private _revenueRecognitionTypes: mjBizAppsOrdersRevenueRecognitionTypeEntity[] = [];
    private _products: mjBizAppsOrdersProductEntity[] = [];
    private _productPrices: mjBizAppsOrdersProductPriceEntity[] = [];
    private _productCategories: mjBizAppsOrdersProductCategoryEntity[] = [];
    private _eventProducts: mjBizAppsOrdersEventProductEntity[] = [];
    /** The reload in flight, so concurrent misses share one query. See {@link EnsureProducts}. */
    private _productReload: Promise<void> | null = null;

    private _paymentTypesIndex: {
        byId: Map<string, mjBizAppsOrdersPaymentTypeEntity>;
        byCode: Map<string, mjBizAppsOrdersPaymentTypeEntity>;
    } | null = null;
    private _paymentTypesGen = -1;
    private _paymentTypesArray: mjBizAppsOrdersPaymentTypeEntity[] | null = null;
    private _paymentTypesLength = -1;

    private ensurePaymentTypesIndex(): {
        byId: Map<string, mjBizAppsOrdersPaymentTypeEntity>;
        byCode: Map<string, mjBizAppsOrdersPaymentTypeEntity>;
    } {
        const current = this.PaymentTypes;
        if (
            this._paymentTypesIndex &&
            this._paymentTypesGen === this._indexGeneration &&
            this._paymentTypesArray === current &&
            this._paymentTypesLength === current.length
        ) {
            return this._paymentTypesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersPaymentTypeEntity>();
        const byCode = new Map<string, mjBizAppsOrdersPaymentTypeEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
            const codeKey = (item.Code ?? '').trim().toLowerCase();
            if (codeKey && !byCode.has(codeKey)) {
                byCode.set(codeKey, item);
            }
        }

        this._paymentTypesIndex = { byId, byCode };
        this._paymentTypesGen = this._indexGeneration;
        this._paymentTypesArray = current;
        this._paymentTypesLength = current.length;
        return this._paymentTypesIndex;
    }

    private _paymentProviderTypesIndex: {
        byId: Map<string, mjBizAppsOrdersPaymentProviderTypeEntity>;
    } | null = null;
    private _paymentProviderTypesGen = -1;
    private _paymentProviderTypesArray: mjBizAppsOrdersPaymentProviderTypeEntity[] | null = null;
    private _paymentProviderTypesLength = -1;

    private ensurePaymentProviderTypesIndex(): {
        byId: Map<string, mjBizAppsOrdersPaymentProviderTypeEntity>;
    } {
        const current = this.PaymentProviderTypes;
        if (
            this._paymentProviderTypesIndex &&
            this._paymentProviderTypesGen === this._indexGeneration &&
            this._paymentProviderTypesArray === current &&
            this._paymentProviderTypesLength === current.length
        ) {
            return this._paymentProviderTypesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersPaymentProviderTypeEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
        }

        this._paymentProviderTypesIndex = { byId };
        this._paymentProviderTypesGen = this._indexGeneration;
        this._paymentProviderTypesArray = current;
        this._paymentProviderTypesLength = current.length;
        return this._paymentProviderTypesIndex;
    }

    private _paymentTermsTypesIndex: {
        byId: Map<string, mjBizAppsOrdersPaymentTermsTypeEntity>;
    } | null = null;
    private _paymentTermsTypesGen = -1;
    private _paymentTermsTypesArray: mjBizAppsOrdersPaymentTermsTypeEntity[] | null = null;
    private _paymentTermsTypesLength = -1;

    private ensurePaymentTermsTypesIndex(): {
        byId: Map<string, mjBizAppsOrdersPaymentTermsTypeEntity>;
    } {
        const current = this.PaymentTermsTypes;
        if (
            this._paymentTermsTypesIndex &&
            this._paymentTermsTypesGen === this._indexGeneration &&
            this._paymentTermsTypesArray === current &&
            this._paymentTermsTypesLength === current.length
        ) {
            return this._paymentTermsTypesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersPaymentTermsTypeEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
        }

        this._paymentTermsTypesIndex = { byId };
        this._paymentTermsTypesGen = this._indexGeneration;
        this._paymentTermsTypesArray = current;
        this._paymentTermsTypesLength = current.length;
        return this._paymentTermsTypesIndex;
    }

    private _chargeTypesIndex: {
        byId: Map<string, mjBizAppsOrdersChargeTypeEntity>;
        byCode: Map<string, mjBizAppsOrdersChargeTypeEntity>;
    } | null = null;
    private _chargeTypesGen = -1;
    private _chargeTypesArray: mjBizAppsOrdersChargeTypeEntity[] | null = null;
    private _chargeTypesLength = -1;

    private ensureChargeTypesIndex(): {
        byId: Map<string, mjBizAppsOrdersChargeTypeEntity>;
        byCode: Map<string, mjBizAppsOrdersChargeTypeEntity>;
    } {
        const current = this.ChargeTypes;
        if (
            this._chargeTypesIndex &&
            this._chargeTypesGen === this._indexGeneration &&
            this._chargeTypesArray === current &&
            this._chargeTypesLength === current.length
        ) {
            return this._chargeTypesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersChargeTypeEntity>();
        const byCode = new Map<string, mjBizAppsOrdersChargeTypeEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
            const codeKey = (item.Code ?? '').trim().toLowerCase();
            if (codeKey && !byCode.has(codeKey)) {
                byCode.set(codeKey, item);
            }
        }

        this._chargeTypesIndex = { byId, byCode };
        this._chargeTypesGen = this._indexGeneration;
        this._chargeTypesArray = current;
        this._chargeTypesLength = current.length;
        return this._chargeTypesIndex;
    }

    private _productTypesIndex: {
        byId: Map<string, mjBizAppsOrdersProductTypeEntity>;
        byCode: Map<string, mjBizAppsOrdersProductTypeEntity>;
    } | null = null;
    private _productTypesGen = -1;
    private _productTypesArray: mjBizAppsOrdersProductTypeEntity[] | null = null;
    private _productTypesLength = -1;

    private ensureProductTypesIndex(): {
        byId: Map<string, mjBizAppsOrdersProductTypeEntity>;
        byCode: Map<string, mjBizAppsOrdersProductTypeEntity>;
    } {
        const current = this.ProductTypes;
        if (
            this._productTypesIndex &&
            this._productTypesGen === this._indexGeneration &&
            this._productTypesArray === current &&
            this._productTypesLength === current.length
        ) {
            return this._productTypesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersProductTypeEntity>();
        const byCode = new Map<string, mjBizAppsOrdersProductTypeEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
            const codeKey = (item.Code ?? '').trim().toLowerCase();
            if (codeKey && !byCode.has(codeKey)) {
                byCode.set(codeKey, item);
            }
        }

        this._productTypesIndex = { byId, byCode };
        this._productTypesGen = this._indexGeneration;
        this._productTypesArray = current;
        this._productTypesLength = current.length;
        return this._productTypesIndex;
    }

    private _subscriptionTypesIndex: {
        byId: Map<string, mjBizAppsOrdersSubscriptionTypeEntity>;
    } | null = null;
    private _subscriptionTypesGen = -1;
    private _subscriptionTypesArray: mjBizAppsOrdersSubscriptionTypeEntity[] | null = null;
    private _subscriptionTypesLength = -1;

    private ensureSubscriptionTypesIndex(): {
        byId: Map<string, mjBizAppsOrdersSubscriptionTypeEntity>;
    } {
        const current = this.SubscriptionTypes;
        if (
            this._subscriptionTypesIndex &&
            this._subscriptionTypesGen === this._indexGeneration &&
            this._subscriptionTypesArray === current &&
            this._subscriptionTypesLength === current.length
        ) {
            return this._subscriptionTypesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersSubscriptionTypeEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
        }

        this._subscriptionTypesIndex = { byId };
        this._subscriptionTypesGen = this._indexGeneration;
        this._subscriptionTypesArray = current;
        this._subscriptionTypesLength = current.length;
        return this._subscriptionTypesIndex;
    }

    private _revenueRecognitionTypesIndex: {
        byId: Map<string, mjBizAppsOrdersRevenueRecognitionTypeEntity>;
    } | null = null;
    private _revenueRecognitionTypesGen = -1;
    private _revenueRecognitionTypesArray: mjBizAppsOrdersRevenueRecognitionTypeEntity[] | null = null;
    private _revenueRecognitionTypesLength = -1;

    private ensureRevenueRecognitionTypesIndex(): {
        byId: Map<string, mjBizAppsOrdersRevenueRecognitionTypeEntity>;
    } {
        const current = this.RevenueRecognitionTypes;
        if (
            this._revenueRecognitionTypesIndex &&
            this._revenueRecognitionTypesGen === this._indexGeneration &&
            this._revenueRecognitionTypesArray === current &&
            this._revenueRecognitionTypesLength === current.length
        ) {
            return this._revenueRecognitionTypesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersRevenueRecognitionTypeEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
        }

        this._revenueRecognitionTypesIndex = { byId };
        this._revenueRecognitionTypesGen = this._indexGeneration;
        this._revenueRecognitionTypesArray = current;
        this._revenueRecognitionTypesLength = current.length;
        return this._revenueRecognitionTypesIndex;
    }

    private _eventProductsIndex: {
        byId: Map<string, mjBizAppsOrdersEventProductEntity>;
    } | null = null;
    private _eventProductsGen = -1;
    private _eventProductsArray: mjBizAppsOrdersEventProductEntity[] | null = null;
    private _eventProductsLength = -1;

    private ensureEventProductsIndex(): {
        byId: Map<string, mjBizAppsOrdersEventProductEntity>;
    } {
        const current = this.EventProducts;
        if (
            this._eventProductsIndex &&
            this._eventProductsGen === this._indexGeneration &&
            this._eventProductsArray === current &&
            this._eventProductsLength === current.length
        ) {
            return this._eventProductsIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersEventProductEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
        }

        this._eventProductsIndex = { byId };
        this._eventProductsGen = this._indexGeneration;
        this._eventProductsArray = current;
        this._eventProductsLength = current.length;
        return this._eventProductsIndex;
    }

    private _productsIndex: {
        byId: Map<string, mjBizAppsOrdersProductEntity>;
        bySku: Map<string, mjBizAppsOrdersProductEntity>;
    } | null = null;
    private _productsGen = -1;
    private _productsArray: mjBizAppsOrdersProductEntity[] | null = null;
    private _productsLength = -1;

    private ensureProductsIndex(): {
        byId: Map<string, mjBizAppsOrdersProductEntity>;
        bySku: Map<string, mjBizAppsOrdersProductEntity>;
    } {
        const current = this.Products;
        if (
            this._productsIndex &&
            this._productsGen === this._indexGeneration &&
            this._productsArray === current &&
            this._productsLength === current.length
        ) {
            return this._productsIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersProductEntity>();
        const bySku = new Map<string, mjBizAppsOrdersProductEntity>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }
            const skuKey = (item.SKU ?? '').trim().toLowerCase();
            if (skuKey && !bySku.has(skuKey)) {
                bySku.set(skuKey, item);
            }
        }

        this._productsIndex = { byId, bySku };
        this._productsGen = this._indexGeneration;
        this._productsArray = current;
        this._productsLength = current.length;
        return this._productsIndex;
    }

    private _productPricesIndex: {
        byId: Map<string, mjBizAppsOrdersProductPriceEntity>;
        byProductId: Map<string, mjBizAppsOrdersProductPriceEntity[]>;
        baseByProductId: Map<string, mjBizAppsOrdersProductPriceEntity[]>;
        byCategoryId: Map<string, mjBizAppsOrdersProductPriceEntity[]>;
    } | null = null;
    private _productPricesGen = -1;
    private _productPricesArray: mjBizAppsOrdersProductPriceEntity[] | null = null;
    private _productPricesLength = -1;

    private ensureProductPricesIndex(): {
        byId: Map<string, mjBizAppsOrdersProductPriceEntity>;
        byProductId: Map<string, mjBizAppsOrdersProductPriceEntity[]>;
        baseByProductId: Map<string, mjBizAppsOrdersProductPriceEntity[]>;
        byCategoryId: Map<string, mjBizAppsOrdersProductPriceEntity[]>;
    } {
        const current = this.ProductPrices;
        if (
            this._productPricesIndex &&
            this._productPricesGen === this._indexGeneration &&
            this._productPricesArray === current &&
            this._productPricesLength === current.length
        ) {
            return this._productPricesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersProductPriceEntity>();
        const byProductId = new Map<string, mjBizAppsOrdersProductPriceEntity[]>();
        const baseByProductId = new Map<string, mjBizAppsOrdersProductPriceEntity[]>();
        const byCategoryId = new Map<string, mjBizAppsOrdersProductPriceEntity[]>();

        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
            }

            const prodIdKey = uuidKey(item.ProductID);
            if (prodIdKey) {
                let prodList = byProductId.get(prodIdKey);
                if (!prodList) {
                    prodList = [];
                    byProductId.set(prodIdKey, prodList);
                }
                prodList.push(item);

                if (!item.PriceListID && (!item.Status || item.Status === 'Active')) {
                    let baseList = baseByProductId.get(prodIdKey);
                    if (!baseList) {
                        baseList = [];
                        baseByProductId.set(prodIdKey, baseList);
                    }
                    baseList.push(item);
                }
            }

            const catIdKey = uuidKey((item as { ProductCategoryID?: string | null }).ProductCategoryID);
            if (catIdKey) {
                let catList = byCategoryId.get(catIdKey);
                if (!catList) {
                    catList = [];
                    byCategoryId.set(catIdKey, catList);
                }
                catList.push(item);
            }
        }

        for (const baseList of baseByProductId.values()) {
            baseList.sort((a, b) => Number(b.Priority || 0) - Number(a.Priority || 0));
        }

        this._productPricesIndex = { byId, byProductId, baseByProductId, byCategoryId };
        this._productPricesGen = this._indexGeneration;
        this._productPricesArray = current;
        this._productPricesLength = current.length;
        return this._productPricesIndex;
    }

    private _productCategoriesIndex: {
        byId: Map<string, mjBizAppsOrdersProductCategoryEntity>;
        parentById: Map<string, string | null>;
    } | null = null;
    private _productCategoriesGen = -1;
    private _productCategoriesArray: mjBizAppsOrdersProductCategoryEntity[] | null = null;
    private _productCategoriesLength = -1;

    private ensureProductCategoriesIndex(): {
        byId: Map<string, mjBizAppsOrdersProductCategoryEntity>;
        parentById: Map<string, string | null>;
    } {
        const current = this.ProductCategories;
        if (
            this._productCategoriesIndex &&
            this._productCategoriesGen === this._indexGeneration &&
            this._productCategoriesArray === current &&
            this._productCategoriesLength === current.length
        ) {
            return this._productCategoriesIndex;
        }

        const byId = new Map<string, mjBizAppsOrdersProductCategoryEntity>();
        const parentById = new Map<string, string | null>();
        for (const item of current) {
            const idKey = uuidKey(item.ID);
            if (idKey && !byId.has(idKey)) {
                byId.set(idKey, item);
                parentById.set(idKey, (item.ParentProductCategoryID as string | null | undefined) ?? null);
            }
        }

        this._productCategoriesIndex = { byId, parentById };
        this._productCategoriesGen = this._indexGeneration;
        this._productCategoriesArray = current;
        this._productCategoriesLength = current.length;
        return this._productCategoriesIndex;
    }

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
                { Type: 'entity', PropertyName: '_revenueRecognitionTypes', EntityName: 'MJ_BizApps_Orders: Revenue Recognition Types' },
                { Type: 'entity', PropertyName: '_products', EntityName: 'MJ_BizApps_Orders: Products' },
                { Type: 'entity', PropertyName: '_productPrices', EntityName: 'MJ_BizApps_Orders: Product Prices' },
                { Type: 'entity', PropertyName: '_productCategories', EntityName: 'MJ_BizApps_Orders: Product Categories' },
                { Type: 'entity', PropertyName: '_eventProducts', EntityName: EVENT_PRODUCT_ENTITY },
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
    public get RevenueRecognitionTypes(): mjBizAppsOrdersRevenueRecognitionTypeEntity[] {
        return this.GetConfigData<mjBizAppsOrdersRevenueRecognitionTypeEntity>('_revenueRecognitionTypes');
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

    /** The event record each event product carries (IS-A child of Product, sharing its ID). */
    public get EventProducts(): mjBizAppsOrdersEventProductEntity[] {
        return this.GetConfigData<mjBizAppsOrdersEventProductEntity>('_eventProducts');
    }

    public get Products$(): Observable<mjBizAppsOrdersProductEntity[]> {
        return this.ObserveProperty<mjBizAppsOrdersProductEntity>('_products');
    }
    public get ProductPrices$(): Observable<mjBizAppsOrdersProductPriceEntity[]> {
        return this.ObserveProperty<mjBizAppsOrdersProductPriceEntity>('_productPrices');
    }

    public PaymentTypeByID(id: string | null | undefined): mjBizAppsOrdersPaymentTypeEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensurePaymentTypesIndex().byId.get(key);
    }
    public PaymentTypeByCode(code: string | null | undefined): mjBizAppsOrdersPaymentTypeEntity | undefined {
        const key = (code ?? '').trim().toLowerCase();
        if (!key) return undefined;
        return this.ensurePaymentTypesIndex().byCode.get(key);
    }
    public ChargeTypeByCode(code: string | null | undefined): mjBizAppsOrdersChargeTypeEntity | undefined {
        const key = (code ?? '').trim().toLowerCase();
        if (!key) return undefined;
        return this.ensureChargeTypesIndex().byCode.get(key);
    }
    public ChargeTypeByID(id: string | null | undefined): mjBizAppsOrdersChargeTypeEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensureChargeTypesIndex().byId.get(key);
    }
    public PaymentProviderTypeByID(id: string | null | undefined): mjBizAppsOrdersPaymentProviderTypeEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensurePaymentProviderTypesIndex().byId.get(key);
    }
    public PaymentTermsTypeByID(id: string | null | undefined): mjBizAppsOrdersPaymentTermsTypeEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensurePaymentTermsTypesIndex().byId.get(key);
    }
    public ProductTypeByID(id: string | null | undefined): mjBizAppsOrdersProductTypeEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensureProductTypesIndex().byId.get(key);
    }
    public ProductTypeByCode(code: string | null | undefined): mjBizAppsOrdersProductTypeEntity | undefined {
        const key = (code ?? '').trim().toLowerCase();
        if (!key) return undefined;
        return this.ensureProductTypesIndex().byCode.get(key);
    }
    public SubscriptionTypeByID(id: string | null | undefined): mjBizAppsOrdersSubscriptionTypeEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensureSubscriptionTypesIndex().byId.get(key);
    }
    public RevenueRecognitionTypeByID(id: string | null | undefined): mjBizAppsOrdersRevenueRecognitionTypeEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensureRevenueRecognitionTypesIndex().byId.get(key);
    }

    /**
     * The subscription type a line of this product starts at confirm, resolved by
     * {@link ResolveSubscriptionTypeID}. Undefined when the product sells no subscription or the
     * cache has not loaded.
     */
    public SubscriptionTypeForProduct(productID: string | null | undefined): mjBizAppsOrdersSubscriptionTypeEntity | undefined {
        const id = this.ResolveSubscriptionTypeID(productID);
        return id ? this.SubscriptionTypeByID(id) : undefined;
    }

    /**
     * Product.RevenueRecognitionTypeID when set, otherwise the product type's
     * DefaultRevenueRecognitionTypeID. Null means booking cannot tell upfront vs over time.
     */
    public ResolveRevenueRecognitionTypeID(productID: string | null | undefined): string | null {
        const product = this.ProductByID(productID);
        if (!product) return null;
        const explicit = product.RevenueRecognitionTypeID?.trim();
        if (explicit) return explicit;
        return this.ProductTypeByID(product.ProductTypeID)?.DefaultRevenueRecognitionTypeID?.trim() || null;
    }
    /**
     * Product.SubscriptionTypeID when set, otherwise the product type's DefaultSubscriptionTypeID:
     * the type confirm builds a term from (golive #339). Null means the line is not a subscription.
     */
    public ResolveSubscriptionTypeID(productID: string | null | undefined): string | null {
        const product = this.ProductByID(productID);
        if (!product) return null;
        return ResolveSubscriptionTypeID(product.SubscriptionTypeID, this.ProductTypeByID(product.ProductTypeID)?.DefaultSubscriptionTypeID);
    }
    public EventProductByID(id: string | null | undefined): mjBizAppsOrdersEventProductEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensureEventProductsIndex().byId.get(key);
    }
    public ProductByID(id: string | null | undefined): mjBizAppsOrdersProductEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensureProductsIndex().byId.get(key);
    }

    /**
     * Make sure every given product is in the cache, reloading the catalog ONCE if any is missing.
     *
     * WHY. The cache loads once per process and then only learns of rows saved through this
     * process's entity layer (or a Redis remote-invalidate). A product written anywhere else — a
     * catalog loader, raw SQL, another replica — is invisible until a restart, and every
     * synchronous lookup treats it as absent: the order line saves with no company, the service
     * period source reads `NotRequired`, the recognition type reads null (golive #301).
     *
     * One reload per call, not a retry loop: a product still missing afterwards does not exist (or
     * cannot be read), and the caller decides whether that is fatal. Concurrent misses share the
     * reload in flight. A call where every product is already cached costs no query.
     */
    public async EnsureProducts(
        productIDs: ReadonlyArray<string | null | undefined>,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        await this.Config(false, contextUser, provider);
        if (!productIDs.some((id) => !!id && !this.ProductByID(id))) return;
        if (!this._productReload) {
            this._productReload = this.reloadProducts().finally(() => {
                this._productReload = null;
            });
        }
        await this._productReload;
    }

    /**
     * The product, from the cache or from one reload on a miss; throws naming the product when it
     * still is not there. For server paths that cannot proceed without the row. See {@link EnsureProducts}.
     */
    public async RequireProduct(
        productID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<mjBizAppsOrdersProductEntity> {
        await this.EnsureProducts([productID], contextUser, provider);
        const product = this.ProductByID(productID);
        if (!product) {
            throw new Error(
                `Product ${productID} was not found in the product catalog, even after reloading it from the database.`,
            );
        }
        return product;
    }

    /**
     * Re-read Products straight from the database (`bypassCache`), leaving the rest of the cache
     * alone. Products only: Event Products rows are read by the server from the database when it
     * stamps an event line, and the price tables are not what a missing product breaks.
     */
    private async reloadProducts(): Promise<void> {
        const config = this.Configs.find((c) => c.PropertyName === '_products');
        if (!config) {
            throw new Error('OrdersEngine has no Products config to reload; was Config() called?');
        }
        await this.LoadSingleConfig(config, this.ContextUser, true);
        // A failed read leaves the old rows in place and only logs; say so here rather than let the
        // caller report the product as missing when the catalog could not be read at all.
        if (!this.configLoadedSuccessfully('_products')) {
            throw new Error('Could not reload the product catalog from the database; see the server log for the cause.');
        }
    }

    public ProductBySKU(sku: string | null | undefined): mjBizAppsOrdersProductEntity | undefined {
        const key = (sku ?? '').trim().toLowerCase();
        if (!key) return undefined;
        return this.ensureProductsIndex().bySku.get(key);
    }
    public ProductPriceByID(id: string | null | undefined): mjBizAppsOrdersProductPriceEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensureProductPricesIndex().byId.get(key);
    }
    public ProductCategoryByID(id: string | null | undefined): mjBizAppsOrdersProductCategoryEntity | undefined {
        const key = uuidKey(id);
        if (!key) return undefined;
        return this.ensureProductCategoriesIndex().byId.get(key);
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

    /**
     * Where a line of this product gets the service period its recognition type needs.
     *
     * `NotRequired` — the recognition type does not ask for one (`RequiresServicePeriod = 0`), or the
     * product is a gift card, which recognises when the card is spent rather than on dates.
     * `Event` — the product has an Event Products row, and the order save stamps it from those dates.
     * `Subscription` — the order save stamps it from the subscription term.
     * `Line` — nothing supplies it: the person entering the order has to.
     *
     * Unknown product → `NotRequired`, so a screen whose cache has not loaded does not refuse a confirm
     * the server would accept. The server's refusal is the recognition driver at confirm
     * (`RequireServicePeriod`), which runs after the stamping.
     */
    public ServicePeriodSource(productID: string | null | undefined): ServicePeriodSource {
        const product = this.ProductByID(productID);
        if (!product) return 'NotRequired';
        const type = this.ProductTypeByID(product.ProductTypeID);
        if ((type?.Code ?? '').trim().toLowerCase() === GIFT_CARD_TYPE_CODE) return 'NotRequired';
        const revRec = this.RevenueRecognitionTypeByID(this.ResolveRevenueRecognitionTypeID(productID));
        if (!revRec?.RequiresServicePeriod) return 'NotRequired';
        if (this.ResolveSubscriptionTypeID(productID)) return 'Subscription';
        // The ROW, not the product type: the order save stamps the window from the Event Products row
        // (`applyEventServicePeriod`), so an event-type product loaded without one has no dates to
        // stamp and has to be asked for them like any other line.
        if (this.EventProductByID(productID)) return 'Event';
        return 'Line';
    }

    /**
     * True when the product's recognition type is percentage of completion (`ScheduleBasis =
     * 'OnMeasurement'`): revenue follows attested progress, so a line's service dates are an expected
     * window, not something recognition reads (bc-aidp-next-golive#455).
     */
    public IsProgressMeasured(productID: string | null | undefined): boolean {
        const revRec = this.RevenueRecognitionTypeByID(this.ResolveRevenueRecognitionTypeID(productID));
        return revRec?.ScheduleBasis === 'OnMeasurement';
    }

    /** Active base-channel (no list) prices on a product, highest priority first. */
    public BaseProductPrices(productID: string | null | undefined): mjBizAppsOrdersProductPriceEntity[] {
        const id = uuidKey(productID);
        if (!id) return [];
        const bucket = this.ensureProductPricesIndex().baseByProductId.get(id);
        return bucket ? [...bucket] : [];
    }

    /** Prices hanging on this product or any of the given categories (inherit walk). */
    public ProductPricesFor(
        productID: string | null | undefined,
        categoryIDs: readonly string[] = [],
    ): mjBizAppsOrdersProductPriceEntity[] {
        const index = this.ensureProductPricesIndex();
        const pid = uuidKey(productID);
        const results: mjBizAppsOrdersProductPriceEntity[] = [];
        const seen = new Set<mjBizAppsOrdersProductPriceEntity>();

        if (pid) {
            const productPrices = index.byProductId.get(pid);
            if (productPrices) {
                for (const p of productPrices) {
                    if (!seen.has(p)) {
                        seen.add(p);
                        results.push(p);
                    }
                }
            }
        }

        for (const catId of categoryIDs) {
            const catKey = uuidKey(catId);
            if (!catKey) continue;
            const catPrices = index.byCategoryId.get(catKey);
            if (catPrices) {
                for (const p of catPrices) {
                    if (!seen.has(p)) {
                        seen.add(p);
                        results.push(p);
                    }
                }
            }
        }

        return results;
    }

    /** Category and ancestors, nearest first. */
    public CategoryChain(startCategoryID: string | null | undefined): string[] {
        if (!startCategoryID) return [];
        const parent = this.ensureProductCategoriesIndex().parentById;
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
