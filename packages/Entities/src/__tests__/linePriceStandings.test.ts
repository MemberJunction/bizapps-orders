import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/**
 * ResolveLinePriceStandings (#1009): several lines of one order share one header read and one read of
 * the order's parties, and each line gets the answer ResolveLinePriceStanding gives it alone.
 */

const ORDER_A = 'a1b2c3d4-0000-4000-8000-00000000000a';
const ORDER_B = 'a1b2c3d4-0000-4000-8000-00000000000b';
const PRODUCT_1 = 'a1b2c3d4-0000-4000-8000-000000000001';
const PRODUCT_2 = 'a1b2c3d4-0000-4000-8000-000000000002';
const COMPANY = 'a1b2c3d4-0000-4000-8000-0000000000cc';

const mocks = vi.hoisted(() => ({
    headerReads: [] as string[],
    applicabilityReads: [] as Array<{ OrderHeaderID: string | null; ProductID: string | null }>,
    productReads: [] as string[],
    resolveCalls: [] as Array<{ ProductID: string; Product: unknown }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        async RunView(params: { ExtraFilter: string }) {
            mocks.headerReads.push(params.ExtraFilter);
            return {
                Success: true,
                Results: [{ CompanyID: COMPANY, OrderDate: '2026-11-01', BillToPersonID: null, BillToOrganizationID: null }],
            };
        }
    }
    return { ...actual, RunView: FakeRunView };
});

vi.mock('../pricing/OrdersEngine.js', () => ({
    LoadOrdersEngine: vi.fn(async () => undefined),
    OrdersEngine: {
        Instance: {
            ProductByID: (id: string) => ({ ID: id, CompanyID: COMPANY, ProductCategoryID: null }),
        },
    },
}));

vi.mock('../pricing/applicability.js', () => ({
    loadApplicabilityContext: vi.fn(async (ids: { OrderHeaderID: string | null; ProductID: string | null }) => {
        mocks.applicabilityReads.push({ OrderHeaderID: ids.OrderHeaderID, ProductID: ids.ProductID });
        return { Order: { ID: ids.OrderHeaderID }, Product: ids.ProductID ? { ID: ids.ProductID } : null };
    }),
    LoadApplicabilityProduct: vi.fn(async (id: string) => {
        mocks.productReads.push(id);
        return { ID: id };
    }),
}));

vi.mock('../pricing/PriceResolver.js', () => ({
    ResolvePrice: vi.fn(async (ctx: { ProductID: string; ApplicabilityContext: { Product: unknown } }) => {
        mocks.resolveCalls.push({ ProductID: ctx.ProductID, Product: ctx.ApplicabilityContext.Product });
        return { UnitPrice: ctx.ProductID === PRODUCT_1 ? 100 : 200, ProductPriceID: null };
    }),
    ListApplicablePrices: vi.fn(async () => []),
}));

vi.mock('../pricing/priceOverride.js', () => ({
    isEnginePrice: (line: { UnitPrice: number | null }, engine: { UnitPrice: number }) => line.UnitPrice === engine.UnitPrice,
    isNamedListPick: () => false,
}));

const { ResolveLinePriceStanding, ResolveLinePriceStandings } = await import('../pricing/linePriceContext.js');

const provider = {} as IMetadataProvider;
const user = {} as UserInfo;
const line = (OrderHeaderID: string | null, ProductID: string, UnitPrice: number) => ({
    OrderHeaderID,
    ProductID,
    UnitPrice,
    Quantity: 1,
    ProductPriceID: null,
});

beforeEach(() => {
    mocks.headerReads.length = 0;
    mocks.applicabilityReads.length = 0;
    mocks.productReads.length = 0;
    mocks.resolveCalls.length = 0;
});

describe('ResolveLinePriceStandings', () => {
    it('reads one order header and its parties once for all of its lines', async () => {
        const out = await ResolveLinePriceStandings(
            [line(ORDER_A, PRODUCT_1, 100), line(ORDER_A, PRODUCT_2, 150), line(ORDER_A, PRODUCT_1, 90)],
            provider,
            user,
        );
        expect(mocks.headerReads).toHaveLength(1);
        expect(mocks.applicabilityReads).toEqual([{ OrderHeaderID: ORDER_A, ProductID: null }]);
        expect(mocks.productReads).toEqual([PRODUCT_1, PRODUCT_2]);
        expect(out.map((s) => s?.IsEnginePrice)).toEqual([true, false, false]);
        expect(out.map((s) => s?.EngineUnitPrice)).toEqual([100, 200, 100]);
    });

    it("puts each line's own product into the shared context", async () => {
        await ResolveLinePriceStandings([line(ORDER_A, PRODUCT_1, 1), line(ORDER_A, PRODUCT_2, 1)], provider, user);
        expect(mocks.resolveCalls).toEqual([
            { ProductID: PRODUCT_1, Product: { ID: PRODUCT_1 } },
            { ProductID: PRODUCT_2, Product: { ID: PRODUCT_2 } },
        ]);
    });

    it('reads each order once when lines of two orders are mixed, and keeps input order', async () => {
        const out = await ResolveLinePriceStandings(
            [line(ORDER_A, PRODUCT_1, 100), line(ORDER_B, PRODUCT_2, 200), line(ORDER_A.toUpperCase(), PRODUCT_2, 1)],
            provider,
            user,
        );
        expect(mocks.headerReads).toHaveLength(2);
        expect(mocks.applicabilityReads.map((r) => r.OrderHeaderID)).toEqual([ORDER_A, ORDER_B]);
        expect(out.map((s) => s?.IsEnginePrice)).toEqual([true, true, false]);
    });

    it('returns an empty list for no lines without reading anything', async () => {
        expect(await ResolveLinePriceStandings([], provider, user)).toEqual([]);
        expect(mocks.headerReads).toHaveLength(0);
    });

    it('gives the same standing as the single-line helper', async () => {
        const one = await ResolveLinePriceStanding(line(ORDER_A, PRODUCT_2, 150), provider, user);
        const many = await ResolveLinePriceStandings([line(ORDER_A, PRODUCT_2, 150)], provider, user);
        expect(many[0]).toEqual(one);
    });
});
