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
import { BaseEngine, RegisterForStartup, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
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
    private _revenueRecognitionTypes: mjBizAppsOrdersRevenueRecognitionTypeEntity[] = [];
    private _products: mjBizAppsOrdersProductEntity[] = [];
    private _productPrices: mjBizAppsOrdersProductPriceEntity[] = [];
    private _productCategories: mjBizAppsOrdersProductCategoryEntity[] = [];
    private _eventProducts: mjBizAppsOrdersEventProductEntity[] = [];
    /** The reload in flight, so concurrent misses share one query. See {@link EnsureProducts}. */
    private _productReload: Promise<void> | null = null;

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
    public RevenueRecognitionTypeByID(id: string | null | undefined): mjBizAppsOrdersRevenueRecognitionTypeEntity | undefined {
        return byID(this.RevenueRecognitionTypes, id);
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
    public EventProductByID(id: string | null | undefined): mjBizAppsOrdersEventProductEntity | undefined {
        return byID(this.EventProducts, id);
    }
    public ProductByID(id: string | null | undefined): mjBizAppsOrdersProductEntity | undefined {
        return byID(this.Products, id);
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
        if (product.SubscriptionTypeID) return 'Subscription';
        // The ROW, not the product type: the order save stamps the window from the Event Products row
        // (`applyEventServicePeriod`), so an event-type product loaded without one has no dates to
        // stamp and has to be asked for them like any other line.
        if (this.EventProductByID(productID)) return 'Event';
        return 'Line';
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
