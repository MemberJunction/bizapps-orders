import { LogError } from '@memberjunction/core';
import { OrdersEngine, type mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

export type ProductLookupNames = {
    Type: string;
    Category: string;
    RevRec: string;
    /** The id `RevRec` names, for linking to it; null when nothing resolved. */
    RevRecID: string | null;
    /**
     * True when the product sets no revenue recognition type of its own and `RevRec` is the product
     * type's default — the same fallback booking takes (`OrderJournalEntryFactory`).
     */
    RevRecFromType: boolean;
    Successor: string;
};

const DASH = '—';

/** How a type-default rev-rec is labelled wherever it is shown (bc-aidp-next-golive#436). */
export const REV_REC_FROM_TYPE_LABEL = 'from product type';

export const EMPTY_PRODUCT_LOOKUP_NAMES: ProductLookupNames = {
    Type: DASH,
    Category: DASH,
    RevRec: DASH,
    RevRecID: null,
    RevRecFromType: false,
    Successor: DASH,
};

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
 *
 * Rev-rec resolves the way booking does: the product's own id, else its type's default
 * (`RevRecFromType`). The header and the Accounting section both read it from here, so the form
 * shows one value for it (bc-aidp-next-golive#436).
 */
export async function LoadProductLookupNames(
    record: mjBizAppsOrdersProductEntity | null | undefined,
): Promise<ProductLookupNames> {
    const fallback: ProductLookupNames = {
        Type: record?.ProductType || DASH,
        Category: record?.ProductCategory || DASH,
        // The virtual name can outlive a cleared id, so it only stands in for an id that is set.
        RevRec: (record?.RevenueRecognitionTypeID && record.RevenueRecognitionType) || DASH,
        RevRecID: record?.RevenueRecognitionTypeID?.trim() || null,
        RevRecFromType: false,
        Successor: record?.SuccessorProduct || DASH,
    };
    if (!record) return fallback;

    try {
        const engine = OrdersEngine.Instance;
        await engine.EnsureLoaded();
        const own = record.RevenueRecognitionTypeID?.trim();
        const typeDefault = own ? null : engine.ProductTypeByID(record.ProductTypeID)?.DefaultRevenueRecognitionTypeID?.trim();
        const revRecID = own || typeDefault || null;
        const revRecName = engine.RevenueRecognitionTypeByID(revRecID)?.Name;
        return {
            Type: engine.ProductTypeByID(record.ProductTypeID)?.Name || fallback.Type,
            Category: engine.ProductCategoryByID(record.ProductCategoryID)?.Name || fallback.Category,
            RevRec: revRecName || fallback.RevRec,
            RevRecID: revRecName ? revRecID : fallback.RevRecID,
            RevRecFromType: !own && !!typeDefault && !!revRecName,
            Successor: engine.ProductByID(record.SuccessorProductID)?.Name || fallback.Successor,
        };
    } catch (e) {
        LogError(`Product lookup names fell back to the record's virtual fields — OrdersEngine unavailable: ${e}`);
        return fallback;
    }
}

/** The lookup ids a product's names depend on; a change means the names must be resolved again. */
function lookupKey(record: mjBizAppsOrdersProductEntity | null | undefined): string {
    return [record?.ProductTypeID, record?.ProductCategoryID, record?.RevenueRecognitionTypeID, record?.SuccessorProductID].join('|');
}

/**
 * Keeps a component's resolved lookup names in step with the record's ids, so a header or field
 * follows an edit instead of keeping the names it resolved on load.
 *
 * `For(record)` is safe to call from a template getter: it returns the names it has and, when the
 * ids moved since the last resolve, starts a new one and calls `onResolved` when it lands.
 */
export class ProductLookupNamesTracker {
    public Names: ProductLookupNames = EMPTY_PRODUCT_LOOKUP_NAMES;
    private resolvedFor: string | null = null;

    constructor(private readonly onResolved: () => void = () => undefined) {}

    public For(record: mjBizAppsOrdersProductEntity | null | undefined): ProductLookupNames {
        if (this.resolvedFor !== lookupKey(record)) void this.Refresh(record);
        return this.Names;
    }

    public async Refresh(record: mjBizAppsOrdersProductEntity | null | undefined): Promise<void> {
        const key = lookupKey(record);
        this.resolvedFor = key;
        const names = await LoadProductLookupNames(record);
        if (this.resolvedFor !== key) return; // a newer edit started its own resolve
        this.Names = names;
        this.onResolved();
    }
}
