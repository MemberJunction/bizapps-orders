/**
 * A product written outside this process is reloaded on a miss, once (golive #301).
 *
 * `OrdersEngine` loads the catalog once per process and afterwards only learns of rows saved through
 * this process's entity layer. A product added by a loader, by raw SQL or by another API replica
 * fires no event here, so before this fix every lookup treated it as absent: the order line saved
 * with no company ("CompanyID: Company cannot be null"), the service period source read
 * `NotRequired`, and the recognition type read null.
 *
 * These tests stand in for the other process with a fake database the engine reads through its
 * provider's `RunView`: a row is added to it after the cache has loaded, with no entity event, which
 * is exactly what the engine sees when another process writes the product.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig, type RunViewParams } from '@memberjunction/core';
import { OrdersEngine } from '../pricing/OrdersEngine.js';

type Row = Record<string, unknown>;

/** The internals these tests seed; each is what `Load()` would have set. */
type EngineInternals = {
    _metadataConfigs: BaseEnginePropertyConfig[];
    _loaded: boolean;
    _contextUser: unknown;
    _products: Row[];
    _productTypes: Row[];
    _revenueRecognitionTypes: Row[];
    _eventProducts: Row[];
    _provider: unknown;
};

const PRODUCTS = 'MJ_BizApps_Orders: Products';
const CACHED = 'a0000000-0000-4000-8000-000000000001';
const LOADED_ELSEWHERE = 'a0000000-0000-4000-8000-000000000002';
const SECOND_LOADED_ELSEWHERE = 'a0000000-0000-4000-8000-000000000003';
const NOWHERE = 'a0000000-0000-4000-8000-0000000000ff';
const PRODUCT_CO = 'c0000000-0000-4000-8000-000000000001';

const engine = (): EngineInternals => OrdersEngine.Instance as unknown as EngineInternals;

/** The configs `OrdersEngine.Config()` asks `BaseEngine` to load, upgraded the way `Load()` does. */
async function capturedConfigs(): Promise<BaseEnginePropertyConfig[]> {
    const load = vi
        .spyOn(BaseEngine.prototype as unknown as { Load: (configs: Partial<BaseEnginePropertyConfig>[]) => Promise<void> }, 'Load')
        .mockResolvedValue(undefined);
    await OrdersEngine.Instance.Config(false, { ID: 'u-1' } as never, {} as never);
    const configs = load.mock.calls[0][0].map((c) => new BaseEnginePropertyConfig(c));
    load.mockRestore();
    return configs;
}

const product = (id: string): Row => ({
    ID: id,
    Name: `Product ${id.slice(-2)}`,
    CompanyID: PRODUCT_CO,
    ProductTypeID: 'TYPE-SVC',
    RevenueRecognitionTypeID: 'RR-OVERTIME',
    SubscriptionTypeID: null,
});

/** The database the other process writes to. */
let db: Map<string, Row[]>;
let runView: ReturnType<typeof vi.fn>;

beforeEach(async () => {
    const configs = await capturedConfigs();
    db = new Map([[PRODUCTS, [product(CACHED)]]]);
    runView = vi.fn(async (params: RunViewParams) => ({
        Success: true,
        Results: [...(db.get(params.EntityName ?? '') ?? [])],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: '',
    }));
    const e = engine();
    // Assigned, not `SetProvider`: that binding is first-wins, so a later test's database would be ignored.
    e._provider = { RunView: runView, EntityByName: () => undefined };
    e._metadataConfigs = configs;
    e._loaded = true; // the API process warmed the cache at startup
    e._contextUser = { ID: 'system' };
    e._products = [product(CACHED)];
    e._productTypes = [{ ID: 'TYPE-SVC', Code: 'Service', DefaultRevenueRecognitionTypeID: null }];
    e._revenueRecognitionTypes = [{ ID: 'RR-OVERTIME', Code: 'EvenOverTime', RequiresServicePeriod: true }];
    e._eventProducts = [];
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Another process inserts a product: the database has it, this process heard nothing. */
const insertElsewhere = (id: string) => db.get(PRODUCTS)!.push(product(id));

describe('a product another process wrote after the cache loaded', () => {
    it('is invisible to the synchronous lookups until something reloads', () => {
        insertElsewhere(LOADED_ELSEWHERE);
        expect(OrdersEngine.Instance.ProductByID(LOADED_ELSEWHERE)).toBeUndefined();
        expect(OrdersEngine.Instance.ServicePeriodSource(LOADED_ELSEWHERE)).toBe('NotRequired');
        expect(OrdersEngine.Instance.ResolveRevenueRecognitionTypeID(LOADED_ELSEWHERE)).toBeNull();
    });

    it('RequireProduct reloads once, straight from the database, and returns it with its company', async () => {
        insertElsewhere(LOADED_ELSEWHERE);
        const found = await OrdersEngine.Instance.RequireProduct(LOADED_ELSEWHERE);
        expect(found.CompanyID).toBe(PRODUCT_CO);
        expect(runView).toHaveBeenCalledTimes(1);
        expect(runView.mock.calls[0][0]).toMatchObject({ EntityName: PRODUCTS, BypassCache: true });
    });

    it('after EnsureProducts, the service period and recognition lookups see it', async () => {
        insertElsewhere(LOADED_ELSEWHERE);
        await OrdersEngine.Instance.EnsureProducts([LOADED_ELSEWHERE]);
        expect(OrdersEngine.Instance.ServicePeriodSource(LOADED_ELSEWHERE)).toBe('Line');
        expect(OrdersEngine.Instance.ResolveRevenueRecognitionTypeID(LOADED_ELSEWHERE)).toBe('RR-OVERTIME');
    });

    it('concurrent misses share one reload', async () => {
        insertElsewhere(LOADED_ELSEWHERE);
        insertElsewhere(SECOND_LOADED_ELSEWHERE);
        const [a, b] = await Promise.all([
            OrdersEngine.Instance.RequireProduct(LOADED_ELSEWHERE),
            OrdersEngine.Instance.RequireProduct(SECOND_LOADED_ELSEWHERE),
        ]);
        expect([a.ID, b.ID]).toEqual([LOADED_ELSEWHERE, SECOND_LOADED_ELSEWHERE]);
        expect(runView).toHaveBeenCalledTimes(1);
    });
});

describe('a product already in the cache', () => {
    it('costs no query', async () => {
        await OrdersEngine.Instance.EnsureProducts([CACHED, null, undefined]);
        expect((await OrdersEngine.Instance.RequireProduct(CACHED)).ID).toBe(CACHED);
        expect(runView).not.toHaveBeenCalled();
    });
});

describe('a product that is not in the database either', () => {
    it('fails naming the product after exactly one reload', async () => {
        await expect(OrdersEngine.Instance.RequireProduct(NOWHERE)).rejects.toThrow(NOWHERE);
        expect(runView).toHaveBeenCalledTimes(1);
    });
});

describe('a reload that cannot read the catalog', () => {
    it('says the catalog could not be read, and keeps the rows it had', async () => {
        runView.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'connection reset' });
        await expect(OrdersEngine.Instance.RequireProduct(NOWHERE)).rejects.toThrow(/could not reload the product catalog/i);
        expect(OrdersEngine.Instance.ProductByID(CACHED)).toBeDefined();
    });
});
