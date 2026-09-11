import { LogError } from '@memberjunction/core';
import { OrdersEngine, type mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

export type ProductLookupNames = {
    Type: string;
    Category: string;
    RevRec: string;
    Successor: string;
};

const DASH = '—';

/**
 * Display names for a Product's lookups, resolved from `OrdersEngine` by id.
 *
 * The `ProductType` / `ProductCategory` / `RevenueRecognitionType` virtual columns on a LOADED
 * Product are not trustworthy for display, which is walkthrough Pin 28. Measured on HH-CONF on
 * 2026-09-11: `ProductType` came back `null` while `RevenueRecognitionType` still read "Up Front"
 * after the id had moved to All Back End — so the panels showed "—" and then a name for the wrong
 * type. `vwProducts` has the right values; it is the hydration of the virtual fields that is
 * unreliable, and that lives in MJ core, not here.
 *
 * The ids are always correct, so resolve from those. The virtual field stays as the fallback for
 * anything the engine cannot resolve, which is no worse than today.
 */
export async function LoadProductLookupNames(
    record: mjBizAppsOrdersProductEntity | null | undefined,
): Promise<ProductLookupNames> {
    const fallback: ProductLookupNames = {
        Type: record?.ProductType || DASH,
        Category: record?.ProductCategory || DASH,
        RevRec: record?.RevenueRecognitionType || DASH,
        Successor: record?.SuccessorProduct || DASH,
    };
    if (!record) return fallback;

    try {
        const engine = OrdersEngine.Instance;
        await engine.EnsureLoaded();
        return {
            Type: engine.ProductTypeByID(record.ProductTypeID)?.Name || fallback.Type,
            Category: engine.ProductCategoryByID(record.ProductCategoryID)?.Name || fallback.Category,
            RevRec: engine.RevenueRecognitionTypeByID(record.RevenueRecognitionTypeID)?.Name || fallback.RevRec,
            Successor: engine.ProductByID(record.SuccessorProductID)?.Name || fallback.Successor,
        };
    } catch (e) {
        LogError(`Product lookup names fell back to the record's virtual fields — OrdersEngine unavailable: ${e}`);
        return fallback;
    }
}
