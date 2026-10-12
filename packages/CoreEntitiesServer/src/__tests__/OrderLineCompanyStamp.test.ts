/**
 * A booked line keeps the company it was sold under — golive #262.
 *
 * `OrderLine.CompanyID` is derived from the product while the order is open. Once the order is
 * Confirmed, a later save of the line must not re-derive it from the product's CURRENT company, or
 * moving a product between companies silently moves every old sale of it. Trigger 51003 refuses the
 * write at the database; these tests pin the entity side, so an ordinary re-save of a booked line
 * never attempts it.
 *
 * `Object.create` matches `OrderLineEditVetoThroughEntity.test.ts`: it holds the server entity
 * without standing up metadata. The stored parent status is supplied directly, since the rule is
 * what the line does with it, not how the row is read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `products` is what this process has cached; `database` is what a reload would read. A product
 * only in `database` was written by another process after the cache loaded (golive #301). The real
 * reload is covered in orders-entities' `OrdersEngine.productMiss.test.ts`; this stands in for it.
 */
const engine = vi.hoisted(() => ({
    products: new Map<string, { CompanyID: string }>(),
    database: new Map<string, { CompanyID: string }>(),
    reloads: 0,
}));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return {
        ...actual,
        OrdersEngine: {
            Instance: {
                ProductByID: (id: string) => engine.products.get(id),
                RequireProduct: async (id: string) => {
                    if (!engine.products.has(id)) {
                        engine.reloads++;
                        engine.database.forEach((row, key) => engine.products.set(key, row));
                    }
                    const product = engine.products.get(id);
                    if (!product) throw new Error(`Product ${id} was not found in the product catalog.`);
                    return product;
                },
            },
        },
    };
});

import { OrderLineEntityServer } from '../OrderLineEntityServer.js';

const ORDER = 'a1b2c3d4-0000-4000-8000-000000000001';
const PRODUCT = 'a1b2c3d4-0000-4000-8000-000000000003';
const SOLD_UNDER = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const MOVED_TO = 'a1b2c3d4-0000-4000-8000-0000000000b2';

type LineUnderTest = {
    stampCompanyFromProduct(): Promise<void>;
    CompanyID: string | null;
};

function line(opts: { isSaved: boolean; companyID: string | null; storedStatus: string | null; productID?: string }) {
    const instance = Object.create(OrderLineEntityServer.prototype) as LineUnderTest;
    // Shadowed, not assigned: these are generated accessors that need a loaded field map.
    Object.defineProperty(instance, 'OrderHeaderID', { value: ORDER, writable: true });
    Object.defineProperty(instance, 'ProductID', { value: opts.productID ?? PRODUCT, writable: true });
    Object.defineProperty(instance, 'LineNumber', { value: 1, writable: true });
    Object.defineProperty(instance, 'CompanyID', { value: opts.companyID, writable: true });
    Object.defineProperty(instance, 'IsSaved', { value: opts.isSaved, writable: true });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: { ID: 'user-1' }, writable: true });
    const statusReads = { count: 0 };
    Object.defineProperty(instance, 'storedOrderStatus', {
        value: async () => {
            statusReads.count++;
            return opts.storedStatus;
        },
    });
    return { entity: instance, statusReads };
}

beforeEach(() => {
    engine.products.clear();
    engine.database.clear();
    engine.reloads = 0;
    // The product has moved since the line was first stamped.
    engine.products.set(PRODUCT, { CompanyID: MOVED_TO });
});

describe('a line on a Confirmed order', () => {
    it('keeps its stamped company when the product has moved', async () => {
        const { entity } = line({ isSaved: true, companyID: SOLD_UNDER, storedStatus: 'Confirmed' });
        await entity.stampCompanyFromProduct();
        expect(entity.CompanyID).toBe(SOLD_UNDER);
    });
});

describe('a line on an open order', () => {
    it.each(['Draft', 'Quoted'])('re-stamps from the product while the order is %s', async (status) => {
        const { entity } = line({ isSaved: true, companyID: SOLD_UNDER, storedStatus: status });
        await entity.stampCompanyFromProduct();
        expect(entity.CompanyID).toBe(MOVED_TO);
    });

    it('stamps a new line without reading the order', async () => {
        const { entity, statusReads } = line({ isSaved: false, companyID: null, storedStatus: null });
        await entity.stampCompanyFromProduct();
        expect(entity.CompanyID).toBe(MOVED_TO);
        expect(statusReads.count).toBe(0);
    });
});

describe('the common save', () => {
    it('costs no status read when the product has not moved', async () => {
        const { entity, statusReads } = line({ isSaved: true, companyID: MOVED_TO, storedStatus: 'Confirmed' });
        await entity.stampCompanyFromProduct();
        expect(entity.CompanyID).toBe(MOVED_TO);
        expect(statusReads.count).toBe(0);
    });
});

describe('a product written by another process after the cache loaded (golive #301)', () => {
    const LOADED_ELSEWHERE = 'a1b2c3d4-0000-4000-8000-000000000004';
    const PRODUCT_CO = 'a1b2c3d4-0000-4000-8000-0000000000c3';

    it('is reloaded and stamps the product company, instead of leaving CompanyID null', async () => {
        engine.database.set(LOADED_ELSEWHERE, { CompanyID: PRODUCT_CO });
        const { entity } = line({ isSaved: false, companyID: null, storedStatus: null, productID: LOADED_ELSEWHERE });
        await entity.stampCompanyFromProduct();
        expect(entity.CompanyID).toBe(PRODUCT_CO);
        expect(engine.reloads).toBe(1);
    });

    it('fails naming the line and the product when the reload does not find it either', async () => {
        const { entity } = line({ isSaved: false, companyID: null, storedStatus: null, productID: LOADED_ELSEWHERE });
        await expect(entity.stampCompanyFromProduct()).rejects.toThrow(
            new RegExp(`Order line 1: Product ${LOADED_ELSEWHERE}`),
        );
        expect(entity.CompanyID).toBeNull();
    });
});
