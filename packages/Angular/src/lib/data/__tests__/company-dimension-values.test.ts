import { describe, expect, it } from 'vitest';

import { CompanyDimensionValueIDs } from '../orders-queries';
import { MJO_ENTITIES } from '../entity-names';

/**
 * Dimension values are shared by every company, so the line panel narrows its value list to the
 * values the order's company's own Dimension Defaults use. A value from another company's default
 * leaking in is what the narrowing exists to stop; a company value missing is worse, because the
 * list would hide a value the company books under.
 */

const COMPANY = 'a0000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'a0000000-0000-4000-8000-000000000002';
const PRODUCT = 'b0000000-0000-4000-8000-000000000001';
const OTHER_PRODUCT = 'b0000000-0000-4000-8000-000000000002';
const CATEGORY = 'c0000000-0000-4000-8000-000000000001';
const TYPE = 'd0000000-0000-4000-8000-000000000001';

const V_COMPANY = 'e0000000-0000-4000-8000-000000000001';
const V_PRODUCT = 'e0000000-0000-4000-8000-000000000002';
const V_CATEGORY = 'e0000000-0000-4000-8000-000000000003';
const V_OTHER_COMPANY = 'e0000000-0000-4000-8000-000000000004';
const V_OTHER_PRODUCT = 'e0000000-0000-4000-8000-000000000005';
const V_TYPE = 'e0000000-0000-4000-8000-000000000006';

const defaults = [
    { Entity: 'MJ: Companies', RecordID: COMPANY, DimensionValueID: V_COMPANY },
    { Entity: MJO_ENTITIES.Product, RecordID: PRODUCT.toUpperCase(), DimensionValueID: V_PRODUCT.toUpperCase() },
    { Entity: MJO_ENTITIES.ProductCategory, RecordID: CATEGORY, DimensionValueID: V_CATEGORY },
    { Entity: 'MJ: Companies', RecordID: OTHER_COMPANY, DimensionValueID: V_OTHER_COMPANY },
    { Entity: MJO_ENTITIES.Product, RecordID: OTHER_PRODUCT, DimensionValueID: V_OTHER_PRODUCT },
    { Entity: MJO_ENTITIES.ProductType, RecordID: TYPE, DimensionValueID: V_TYPE },
];

describe('CompanyDimensionValueIDs', () => {
    it("keeps values on the company, its products and its categories, case-insensitively", () => {
        const ids = CompanyDimensionValueIDs(defaults, COMPANY, [PRODUCT], [CATEGORY]);
        expect([...ids].sort()).toEqual([V_COMPANY, V_PRODUCT, V_CATEGORY].sort());
    });

    it("leaves out another company's values and values on shared product types", () => {
        const ids = CompanyDimensionValueIDs(defaults, COMPANY, [PRODUCT], [CATEGORY]);
        expect(ids.has(V_OTHER_COMPANY)).toBe(false);
        expect(ids.has(V_OTHER_PRODUCT)).toBe(false);
        expect(ids.has(V_TYPE)).toBe(false);
    });

    it('is empty for a company with no defaults of its own', () => {
        expect(CompanyDimensionValueIDs(defaults, 'a0000000-0000-4000-8000-0000000000ff', [], []).size).toBe(0);
    });
});
