import { describe, expect, it, vi } from 'vitest';
import type { IRunViewProvider, UserInfo } from '@memberjunction/core';

/**
 * WHICH TAGS A PAYMENT ALLOCATION CARRIES FOR EACH ORDER LINE.
 *
 * `LoadOrderLineShares` feeds both payment booking paths. Each share's dimensions come from three
 * places, nearest first: the line's own `DimensionID`/`DimensionValueID` columns, then its stored
 * `OrderLineDimension` rows. That is what booking tags the AR debit with, so the AR credit matches.
 * The `DimensionDefault` mapping is NOT consulted: a default the line has no row for was never on
 * the debit, and tagging the credit with it would stop AR netting by that dimension (golive#383).
 *
 * These drive the real loader against a provider that answers the reads from fixtures, with the
 * orders engine stubbed and the default resolver stubbed to always offer a default.
 */

const ORDER = 'a0000000-0000-4000-8000-000000000001';
const LINE_WITH_ROWS = 'a0000000-0000-4000-8000-000000000011';
const LINE_WITHOUT_ROWS = 'a0000000-0000-4000-8000-000000000012';
const PRODUCT = 'a0000000-0000-4000-8000-000000000021';
const COMPANY = 'a0000000-0000-4000-8000-000000000031';
const VENTURE_AXIS = 'b0000000-0000-4000-8000-000000000001';
const PRODUCT_AXIS = 'b0000000-0000-4000-8000-000000000002';
const VENTURE_DEFAULT = 'c0000000-0000-4000-8000-000000000001';
const VENTURE_STORED = 'c0000000-0000-4000-8000-000000000002';
const PRODUCT_COLUMN = 'c0000000-0000-4000-8000-000000000003';
const PRODUCT_STORED = 'c0000000-0000-4000-8000-000000000004';

const mocks = vi.hoisted(() => ({
    defaults: [] as Array<{ DimensionID: string; DimensionValueID: string; Source: string }>,
}));

vi.mock('../AccountingBridge.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../AccountingBridge.js')>()),
    LoadAccountingEngine: vi.fn(async () => ({ Dimensions: [{ ID: 'b0000000-0000-4000-8000-000000000001' }] })),
}));

vi.mock('../DimensionDefaultResolver.js', () => ({
    DimensionDefaultResolver: class {
        async Resolve() {
            return mocks.defaults;
        }
    },
}));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@mj-biz-apps/orders-entities')>()),
    LoadOrdersEngine: vi.fn(async () => undefined),
    OrdersEngine: {
        Instance: {
            ProductByID: (id: string) => ({ ID: id, ProductCategoryID: null, ProductTypeID: 'type-1', CompanyID: COMPANY }),
        },
    },
}));

import { LoadOrderLineShares } from '../PaymentAllocationInputs.js';

interface Fixture {
    lines: Array<{ ID: string; DimensionID?: string | null; DimensionValueID?: string | null }>;
    stored: Array<{ OrderLineID: string; DimensionID: string; DimensionValueID: string }>;
}

function providerFor(fx: Fixture): IRunViewProvider {
    return {
        EntityByName: (name: string) => ({ ID: `entity:${name}` }),
        RunView: async (params: { EntityName: string }) => {
            if (params.EntityName.endsWith('Order Lines')) {
                return {
                    Success: true,
                    Results: fx.lines.map((l) => ({
                        CompanyID: COMPANY,
                        ProductID: PRODUCT,
                        LineTotalGross: 100,
                        DimensionID: null,
                        DimensionValueID: null,
                        ...l,
                    })),
                };
            }
            if (params.EntityName.endsWith('Order Line Dimensions')) {
                return { Success: true, Results: fx.stored };
            }
            if (params.EntityName.endsWith('Order Headers')) {
                return { Success: true, Results: [{ OrderDate: '2026-11-01' }] };
            }
            throw new Error(`unexpected view ${params.EntityName}`);
        },
    } as unknown as IRunViewProvider;
}

function tagsOf(shares: Awaited<ReturnType<typeof LoadOrderLineShares>>, lineID: string) {
    const share = shares.find((s) => s.OrderLineID === lineID);
    return (share?.Dimensions ?? []).map((d) => `${d.DimensionID}=${d.DimensionValueID}`).sort();
}

describe('LoadOrderLineShares dimension tags', () => {
    it('carries the stored rows, with the line column winning on its own axis', async () => {
        mocks.defaults = [];
        const shares = await LoadOrderLineShares(
            providerFor({
                lines: [{ ID: LINE_WITH_ROWS, DimensionID: PRODUCT_AXIS, DimensionValueID: PRODUCT_COLUMN }],
                stored: [
                    { OrderLineID: LINE_WITH_ROWS.toUpperCase(), DimensionID: VENTURE_AXIS, DimensionValueID: VENTURE_STORED },
                    { OrderLineID: LINE_WITH_ROWS, DimensionID: PRODUCT_AXIS, DimensionValueID: PRODUCT_STORED },
                ],
            }),
            {} as UserInfo,
            ORDER,
        );

        expect(tagsOf(shares, LINE_WITH_ROWS)).toEqual(
            [`${VENTURE_AXIS}=${VENTURE_STORED}`, `${PRODUCT_AXIS}=${PRODUCT_COLUMN}`].sort(),
        );
    });

    it('keeps the stored value when a mapping default names the same axis', async () => {
        mocks.defaults = [{ DimensionID: VENTURE_AXIS, DimensionValueID: VENTURE_DEFAULT, Source: 'Product' }];
        const shares = await LoadOrderLineShares(
            providerFor({
                lines: [{ ID: LINE_WITH_ROWS }],
                stored: [{ OrderLineID: LINE_WITH_ROWS, DimensionID: VENTURE_AXIS, DimensionValueID: VENTURE_STORED }],
            }),
            {} as UserInfo,
            ORDER,
        );

        expect(tagsOf(shares, LINE_WITH_ROWS)).toEqual([`${VENTURE_AXIS}=${VENTURE_STORED}`]);
    });

    it('adds no mapping default for an axis the line has no stored row for (golive#383)', async () => {
        mocks.defaults = [{ DimensionID: VENTURE_AXIS, DimensionValueID: VENTURE_DEFAULT, Source: 'Product' }];
        const shares = await LoadOrderLineShares(
            providerFor({ lines: [{ ID: LINE_WITHOUT_ROWS }], stored: [] }),
            {} as UserInfo,
            ORDER,
        );

        expect(tagsOf(shares, LINE_WITHOUT_ROWS)).toEqual([]);
    });
});
