import { describe, expect, it, vi } from 'vitest';
import type { IRunViewProvider, UserInfo } from '@memberjunction/core';

/**
 * WHICH TAGS A PAYMENT ALLOCATION CARRIES FOR EACH ORDER LINE (golive #383).
 *
 * `LoadOrderLineShares` feeds both payment booking paths. Each share's dimensions are what booking
 * tagged the AR debit with: the line's stored `OrderLineDimension` rows merged with its own
 * `DimensionID`/`DimensionValueID` columns, the column winning on its own axis. Nothing else: a
 * mapping default the line has no row for was never on the debit.
 *
 * These drive the real loader against a provider that answers the reads from fixtures, with the
 * orders engine stubbed.
 */

const ORDER = 'a0000000-0000-4000-8000-000000000001';
const LINE_WITH_ROWS = 'a0000000-0000-4000-8000-000000000011';
const LINE_COLUMN_ONLY = 'a0000000-0000-4000-8000-000000000012';
const LINE_BARE = 'a0000000-0000-4000-8000-000000000013';
const PRODUCT = 'a0000000-0000-4000-8000-000000000021';
const COMPANY = 'a0000000-0000-4000-8000-000000000031';
const VENTURE_AXIS = 'b0000000-0000-4000-8000-000000000001';
const PRODUCT_AXIS = 'b0000000-0000-4000-8000-000000000002';
const VENTURE_STORED = 'c0000000-0000-4000-8000-000000000002';
const PRODUCT_COLUMN = 'c0000000-0000-4000-8000-000000000003';
const PRODUCT_STORED = 'c0000000-0000-4000-8000-000000000004';

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

function providerFor(fx: Fixture, fieldsAsked: string[][] = []): IRunViewProvider {
    return {
        RunView: async (params: { EntityName: string; Fields?: string[] }) => {
            if (params.EntityName.endsWith('Order Lines')) {
                fieldsAsked.push(params.Fields ?? []);
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

    it('tags a line whose only tag is its own column, as booking did', async () => {
        const fields: string[][] = [];
        const shares = await LoadOrderLineShares(
            providerFor(
                { lines: [{ ID: LINE_COLUMN_ONLY, DimensionID: PRODUCT_AXIS, DimensionValueID: PRODUCT_COLUMN }], stored: [] },
                fields,
            ),
            {} as UserInfo,
            ORDER,
        );

        expect(fields[0]).toEqual(expect.arrayContaining(['DimensionID', 'DimensionValueID']));
        expect(tagsOf(shares, LINE_COLUMN_ONLY)).toEqual([`${PRODUCT_AXIS}=${PRODUCT_COLUMN}`]);
    });

    it('leaves a line with no column and no rows untagged', async () => {
        const shares = await LoadOrderLineShares(
            providerFor({ lines: [{ ID: LINE_BARE }], stored: [] }),
            {} as UserInfo,
            ORDER,
        );

        expect(shares.find((s) => s.OrderLineID === LINE_BARE)?.Dimensions).toBeUndefined();
    });
});
