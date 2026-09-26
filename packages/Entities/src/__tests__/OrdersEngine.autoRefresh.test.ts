/**
 * Booking reads a product's revenue recognition from `OrdersEngine`, so a correction an administrator
 * saves in the UI only reaches the next order if the save refreshes the cache in the same process.
 * `BaseEngine` does that by listening for entity save events. These tests drive a save event through
 * `MJGlobal` into the engine and assert the lookups booking uses see the new values without a
 * `Config(true)` or a restart (#179).
 *
 * The engine state is seeded directly rather than through `Load()`, which would need a database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, BaseEntityEvent } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { OrdersEngine } from '../pricing/OrdersEngine.js';

type Row = Record<string, unknown>;

/** The internals these tests seed; each is what `Load()` would have set. */
type EngineInternals = {
    _metadataConfigs: BaseEnginePropertyConfig[];
    _products: Row[];
    _productTypes: Row[];
    _revenueRecognitionTypes: Row[];
    SetProvider(provider: unknown): void;
    SetupGlobalEventListener(): Promise<boolean>;
    canUseImmediateMutation(config: BaseEnginePropertyConfig): boolean;
};

const PRODUCTS = 'MJ_BizApps_Orders: Products';
const PRODUCT_TYPES = 'MJ_BizApps_Orders: Product Types';
const REV_REC_TYPES = 'MJ_BizApps_Orders: Revenue Recognition Types';

const engine = (): EngineInternals => OrdersEngine.Instance as unknown as EngineInternals;

/** The configs `OrdersEngine.Config()` asks `BaseEngine` to load, upgraded the way `Load()` does. */
async function capturedConfigs(): Promise<BaseEnginePropertyConfig[]> {
    const load = vi
        .spyOn(BaseEngine.prototype as unknown as { Load: (configs: Partial<BaseEnginePropertyConfig>[]) => Promise<void> }, 'Load')
        .mockResolvedValue(undefined);
    await OrdersEngine.Instance.Config(false, { ID: 'u-1' } as never, {} as never);
    const configs = load.mock.calls[0][0].map(
        (c) => new BaseEnginePropertyConfig(c),
    );
    load.mockRestore();
    return configs;
}

/** A stand-in for a saved entity: the fields `BaseEngine` reads off an event's `baseEntity`. */
function entity(entityName: string, fields: Row): Row {
    const row: Row = {
        ...fields,
        EntityInfo: { Name: entityName, PrimaryKeys: [{ Name: 'ID', IsUniqueIdentifier: true }] },
        GetAll: () => ({ ...fields }),
        LoadFromData(data: Row) {
            Object.assign(this, data);
            return Promise.resolve(true);
        },
    };
    return row;
}

/** Raise a save event the way `BaseEntity.RaiseEvent` does after a successful `Save()`. */
function raiseSave(saved: Row, saveSubType: 'create' | 'update'): void {
    const event = new BaseEntityEvent();
    event.type = 'save';
    event.saveSubType = saveSubType;
    event.baseEntity = saved as unknown as BaseEntity;
    MJGlobal.Instance.RaiseEvent({
        component: saved as never,
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        args: event,
    });
}

describe('OrdersEngine refreshes on entity saves (#179)', () => {
    let configs: BaseEnginePropertyConfig[];

    beforeEach(async () => {
        configs = await capturedConfigs();
        const e = engine();
        e._metadataConfigs = configs;
        // The clone BaseEngine caches is built by this provider's GetEntityObject.
        e.SetProvider({
            GetEntityObject: async (entityName: string) => entity(entityName, {}),
        });
        e._products = [
            entity(PRODUCTS, { ID: 'PROD-1', ProductTypeID: 'TYPE-1', RevenueRecognitionTypeID: 'RR-UPFRONT' }),
        ];
        e._productTypes = [entity(PRODUCT_TYPES, { ID: 'TYPE-1', DefaultRevenueRecognitionTypeID: 'RR-UPFRONT' })];
        e._revenueRecognitionTypes = [
            entity(REV_REC_TYPES, { ID: 'RR-UPFRONT', Code: 'UpFront' }),
            entity(REV_REC_TYPES, { ID: 'RR-DEFERRED', Code: 'AllBackEnd' }),
        ];
        await e.SetupGlobalEventListener();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers every config for immediate, in-place refresh', () => {
        // Every config, not only the ones booking reads: pricing reads Product Prices and
        // Product Categories from here too, and a config added later is covered without
        // editing this test.
        expect(configs.map((c) => c.EntityName)).toEqual(
            expect.arrayContaining([PRODUCTS, PRODUCT_TYPES, REV_REC_TYPES]),
        );
        for (const config of configs) {
            expect(config.AutoRefresh, config.EntityName).toBe(true);
            // A Filter, OrderBy, 'simple' result type or AdditionalLoading override would
            // turn this into a debounced full reload instead.
            expect(engine().canUseImmediateMutation(config), config.EntityName).toBe(true);
        }
    });

    it("serves a product's corrected revenue recognition type after its save", async () => {
        raiseSave(
            entity(PRODUCTS, { ID: 'prod-1', ProductTypeID: 'TYPE-1', RevenueRecognitionTypeID: 'RR-DEFERRED' }),
            'update',
        );
        await vi.waitFor(() =>
            expect(OrdersEngine.Instance.ProductByID('PROD-1')?.RevenueRecognitionTypeID).toBe('RR-DEFERRED'),
        );
        expect(OrdersEngine.Instance.Products).toHaveLength(1);
    });

    it("serves a product type's corrected default after its save", async () => {
        raiseSave(entity(PRODUCT_TYPES, { ID: 'TYPE-1', DefaultRevenueRecognitionTypeID: 'RR-DEFERRED' }), 'update');
        await vi.waitFor(() =>
            expect(OrdersEngine.Instance.ProductTypeByID('TYPE-1')?.DefaultRevenueRecognitionTypeID).toBe(
                'RR-DEFERRED',
            ),
        );
    });

    it('serves a product created after the cache loaded', async () => {
        raiseSave(
            entity(PRODUCTS, { ID: 'PROD-NEW', ProductTypeID: 'TYPE-1', RevenueRecognitionTypeID: 'RR-DEFERRED' }),
            'create',
        );
        await vi.waitFor(() =>
            expect(OrdersEngine.Instance.ProductByID('PROD-NEW')?.RevenueRecognitionTypeID).toBe('RR-DEFERRED'),
        );
    });
});
