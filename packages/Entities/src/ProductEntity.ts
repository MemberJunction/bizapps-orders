/**
 * Shared Product subclass: a product takes its type's defaults when the type is chosen
 * (bc-aidp-next-golive#277).
 *
 * `ProductType` carries `DefaultRevenueRecognitionTypeID`, `DefaultSubscriptionTypeID` and
 * `DefaultIsTaxable`. Nothing copied them onto a new product, so `RevenueRecognitionTypeID` (NOT
 * NULL) refused the save until it was set by hand, and `SubscriptionTypeID` / `IsTaxable` saved null.
 *
 * Lives here rather than in the form so every caller gets it: the form, a Remote Operation, an
 * integration, a script.
 */
import { BaseEntity, type EntitySaveOptions, type FieldValueCollection, type IMetadataProvider, LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersProductEntity } from './generated/entity_subclasses';
import { LoadOrdersEngine, OrdersEngine } from './pricing/OrdersEngine';
import { ResolveTaxability, type TaxabilityCategoryLevel } from './pricing/TaxResolver';

const ENTITY = 'MJ_BizApps_Orders: Products';

/** The product fields a product type supplies a default for. */
export type ProductDefaults = {
    RevenueRecognitionTypeID: string | null;
    SubscriptionTypeID: string | null;
    IsTaxable: boolean | null;
};

export const PRODUCT_DEFAULT_FIELDS = ['RevenueRecognitionTypeID', 'SubscriptionTypeID', 'IsTaxable'] as const;
export type ProductDefaultField = (typeof PRODUCT_DEFAULT_FIELDS)[number];

/** The lookups default resolution reads. `OrdersEngine` satisfies it. */
export type ProductDefaultsLookup = Pick<OrdersEngine, 'ProductTypeByID' | 'ProductCategoryByID' | 'CategoryChain'>;

/**
 * The defaults a product of this type, in this category, starts with. Null when the type is unknown.
 *
 * Taxability is the answer the taxability walk gives a product that says nothing itself — its
 * category chain, nearest first, then the type. The type's `DefaultIsTaxable` alone would stamp
 * "taxable" onto a product whose category is exempt.
 */
export function ResolveProductDefaults(
    lookup: ProductDefaultsLookup,
    productTypeID: string | null | undefined,
    productCategoryID: string | null | undefined,
): ProductDefaults | null {
    const type = lookup.ProductTypeByID(productTypeID);
    if (!type) return null;

    const chain: TaxabilityCategoryLevel[] = [];
    for (const id of lookup.CategoryChain(productCategoryID)) {
        const row = lookup.ProductCategoryByID(id);
        if (!row) break;
        chain.push({ ID: row.ID, DefaultIsTaxable: row.DefaultIsTaxable, DefaultTaxCategory: row.DefaultTaxCategory });
    }
    const taxability = ResolveTaxability(
        { IsTaxable: null, TaxCategory: null },
        chain,
        { DefaultIsTaxable: type.DefaultIsTaxable, DefaultTaxCategory: type.DefaultTaxCategory ?? null },
    );

    return {
        RevenueRecognitionTypeID: type.DefaultRevenueRecognitionTypeID?.trim() || null,
        SubscriptionTypeID: type.DefaultSubscriptionTypeID?.trim() || null,
        IsTaxable: taxability.IsTaxable,
    };
}

type DefaultValue = ProductDefaults[ProductDefaultField];

const isEmpty = (v: DefaultValue | undefined): boolean => v == null || (typeof v === 'string' && v.trim() === '');

const sameValue = (a: DefaultValue | undefined, b: DefaultValue | undefined): boolean => {
    if (isEmpty(a) && isEmpty(b)) return true;
    if (typeof a === 'string' && typeof b === 'string') return a.trim().toLowerCase() === b.trim().toLowerCase();
    return a === b;
};

/**
 * Which default fields to write, and with what.
 *
 * A field takes the new default when it is empty, or when it still holds the value this record
 * stamped earlier — i.e. it came from the previous type, not from the user. A value the user chose
 * is never overwritten. When the new type has no default for a field it stamped, the stamp is
 * cleared, so switching Subscription → Merchandise does not leave Annual Rolling behind.
 */
export function PlanProductDefaultWrites(
    current: ProductDefaults,
    stamped: Partial<ProductDefaults>,
    next: ProductDefaults,
): Partial<ProductDefaults> {
    const writes: Partial<ProductDefaults> = {};
    for (const field of PRODUCT_DEFAULT_FIELDS) {
        const stillStamped = field in stamped && sameValue(stamped[field], current[field]);
        if (!isEmpty(current[field]) && !stillStamped) continue;
        if (sameValue(current[field], next[field])) continue;
        (writes as Record<ProductDefaultField, DefaultValue>)[field] = next[field];
    }
    return writes;
}

@RegisterClass(BaseEntity, ENTITY)
export class ProductEntity extends mjBizAppsOrdersProductEntity {
    /** What this instance wrote from a type default, per field — the values it may replace later. */
    private stampedDefaults: Partial<ProductDefaults> = {};

    /**
     * Applies the defaults when the type or category changes. Form fields and the typed setters
     * both write through `Set`; loads do not (they use `SetMany`), so a loaded product is untouched.
     */
    public override Set(FieldName: string, Value: unknown): void {
        const watched = FieldName === 'ProductTypeID' || FieldName === 'ProductCategoryID';
        const before = watched ? this.Get(FieldName) : undefined;
        super.Set(FieldName, Value);
        if (watched && !sameValue(before as string | null, this.Get(FieldName) as string | null)) {
            this.applyTypeDefaults();
        }
    }

    /** A record created with `ProductTypeID` in `newValues` never passes through `Set`. */
    public override NewRecord(newValues?: FieldValueCollection): boolean {
        const created = super.NewRecord(newValues);
        if (created) this.applyTypeDefaults();
        return created;
    }

    /**
     * The same fill before a new product saves, after loading the engine — a caller whose engine
     * was not loaded when the type was set still saves with the type's defaults. Existing products
     * are not touched here: a null `IsTaxable` on a saved product is not this save's to change.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.IsSaved) {
            try {
                await LoadOrdersEngine(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);
                this.applyTypeDefaults();
            } catch (e) {
                LogError(`Product type defaults not applied — OrdersEngine unavailable: ${e}`);
            }
        }
        return super.Save(options);
    }

    /** Synchronous: reads the engine only when it is already loaded. */
    protected applyTypeDefaults(): void {
        const engine = OrdersEngine.Instance;
        if (!engine.Loaded) return;

        const next = ResolveProductDefaults(engine, this.ProductTypeID, this.ProductCategoryID);
        if (!next) return;

        const writes = PlanProductDefaultWrites(
            {
                RevenueRecognitionTypeID: this.RevenueRecognitionTypeID ?? null,
                SubscriptionTypeID: this.SubscriptionTypeID ?? null,
                IsTaxable: this.IsTaxable ?? null,
            },
            this.stampedDefaults,
            next,
        );
        if ('RevenueRecognitionTypeID' in writes) this.RevenueRecognitionTypeID = writes.RevenueRecognitionTypeID as string;
        if ('SubscriptionTypeID' in writes) this.SubscriptionTypeID = writes.SubscriptionTypeID ?? null;
        if ('IsTaxable' in writes) this.IsTaxable = writes.IsTaxable ?? null;
        this.stampedDefaults = { ...this.stampedDefaults, ...writes };
    }
}
