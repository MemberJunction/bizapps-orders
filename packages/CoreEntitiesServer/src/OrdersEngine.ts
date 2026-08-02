/**
 * @fileoverview This app's metadata cache — the small, rarely-changing lookup tables, loaded once
 * and held in process.
 *
 * WHY THIS EXISTS. The tables below are LOOKUPS: a handful of rows each, edited by an administrator
 * a few times a year, and read on nearly every write path. Reading them per operation is the wrong
 * shape twice over.
 *
 * The obvious cost is the round trip. The subtler and more damaging one is what the round trip looks
 * like at the call site. `PaymentHeaderEntityServer` used to answer "does this tender book its
 * processor fee inline?" with a `RunView` naming a single column:
 *
 *     RunView({ EntityName: PAYMENT_TYPE_ENTITY, ExtraFilter: `ID='${id}'`, Fields: ['BookProcessingFeeInline'] })
 *
 * That reads as a careful, minimal query. It is actually a hidden dependency on CodeGen having run:
 * `Fields` names a column that must exist in the base view AND be registered as an `EntityField`, and
 * when it is not, `RunView` does not throw — it returns unsuccessfully, the caller takes its
 * defensive branch, and the feature is silently off. That is exactly what happened when the column
 * was added by a migration whose CodeGen output was never committed: a documented switch that could
 * not be turned on, in a system where nothing failed.
 *
 * A cache turns that into an ordinary property read on a typed entity object. If the field is
 * missing the whole load fails loudly at startup, once, instead of every call site quietly choosing
 * a default.
 *
 * WHAT BELONGS HERE AND WHAT DOES NOT. Small, bounded, read-mostly reference data — the `*Type`
 * tables and their siblings. Transactional tables do NOT belong here at any size: an order, a
 * payment or a subscription is read for a specific row at a specific moment, and a cached copy is a
 * stale answer waiting to be believed.
 *
 * REFRESH IS AUTOMATIC. `BaseEngine` subscribes to entity save/delete events, so an administrator
 * adding a payment type through the API is visible without a restart. `Config()` is idempotent and
 * cheap after the first call, which is why the entity servers can simply call it on their paths
 * rather than co-ordinating a startup order.
 *
 * CONNECTS TO:
 *   CODE: PaymentHeaderEntityServer.feeBooksInline · PaymentProviderResolver
 *   PLAN: D36 (PaymentType), D37 (PaymentProviderType), D63 (settings live in OrdersSettings)
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import { BaseEngine, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    mjBizAppsOrdersChargeTypeEntity,
    mjBizAppsOrdersPaymentProviderTypeEntity,
    mjBizAppsOrdersPaymentTermsTypeEntity,
    mjBizAppsOrdersPaymentTypeEntity,
} from '@mj-biz-apps/orders-entities';

/**
 * The lookup cache for BizApps Orders.
 *
 * Use `OrdersEngine.Instance` after `Config()`; every accessor is a synchronous property read.
 */
export class OrdersEngine extends BaseEngine<OrdersEngine> {
    public static get Instance(): OrdersEngine {
        return super.getInstance<OrdersEngine>();
    }

    private _paymentTypes: mjBizAppsOrdersPaymentTypeEntity[] = [];
    private _paymentProviderTypes: mjBizAppsOrdersPaymentProviderTypeEntity[] = [];
    private _paymentTermsTypes: mjBizAppsOrdersPaymentTermsTypeEntity[] = [];
    private _chargeTypes: mjBizAppsOrdersChargeTypeEntity[] = [];

    /**
     * Load (or refresh) the cache.
     *
     * `ResultType: 'entity_object'` on purpose: callers get typed entities, so reading a column that
     * does not exist is a COMPILE error rather than an `undefined` at run time. That is the whole
     * point of the exercise — see the header.
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Load(
            [
                { Type: 'entity', PropertyName: '_paymentTypes', EntityName: 'MJ_BizApps_Orders: Payment Types', ResultType: 'entity_object' },
                {
                    Type: 'entity',
                    PropertyName: '_paymentProviderTypes',
                    EntityName: 'MJ_BizApps_Orders: Payment Provider Types',
                    ResultType: 'entity_object',
                },
                {
                    Type: 'entity',
                    PropertyName: '_paymentTermsTypes',
                    EntityName: 'MJ_BizApps_Orders: Payment Terms Types',
                    ResultType: 'entity_object',
                },
                { Type: 'entity', PropertyName: '_chargeTypes', EntityName: 'MJ_BizApps_Orders: Charge Types', ResultType: 'entity_object' },
            ],
            provider as IMetadataProvider,
            forceRefresh,
            contextUser,
        );
    }

    public get PaymentTypes(): mjBizAppsOrdersPaymentTypeEntity[] {
        return this._paymentTypes;
    }

    public get PaymentProviderTypes(): mjBizAppsOrdersPaymentProviderTypeEntity[] {
        return this._paymentProviderTypes;
    }

    public get PaymentTermsTypes(): mjBizAppsOrdersPaymentTermsTypeEntity[] {
        return this._paymentTermsTypes;
    }

    public get ChargeTypes(): mjBizAppsOrdersChargeTypeEntity[] {
        return this._chargeTypes;
    }

    /** One payment type by ID, or undefined. */
    public PaymentTypeByID(id: string | null | undefined): mjBizAppsOrdersPaymentTypeEntity | undefined {
        if (!id) return undefined;
        const wanted = id.toLowerCase();
        return this._paymentTypes.find((t) => t.ID?.toLowerCase() === wanted);
    }

    /** One payment type by its stable `Code` — `Cash`, `ACH`, `CreditCard`. */
    public PaymentTypeByCode(code: string | null | undefined): mjBizAppsOrdersPaymentTypeEntity | undefined {
        if (!code) return undefined;
        const wanted = code.trim().toLowerCase();
        return this._paymentTypes.find((t) => t.Code?.trim().toLowerCase() === wanted);
    }

    /** One charge type by its stable `Code` — `Shipping`, `SalesTax`. */
    public ChargeTypeByCode(code: string | null | undefined): mjBizAppsOrdersChargeTypeEntity | undefined {
        if (!code) return undefined;
        const wanted = code.trim().toLowerCase();
        return this._chargeTypes.find((t) => t.Code?.trim().toLowerCase() === wanted);
    }
}

/**
 * Load the cache. Idempotent and cheap after the first call.
 *
 * A thin function rather than making callers reach for `OrdersEngine.Instance.Config(...)`, so the
 * booking paths read as one line and the argument order is decided once.
 */
export async function LoadOrdersEngine(provider: IMetadataProvider, user: UserInfo): Promise<void> {
    await OrdersEngine.Instance.Config(false, user, provider);
}
