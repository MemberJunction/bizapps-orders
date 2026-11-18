/**
 * What the New product dialog collects in its first step, and how it becomes a saved product
 * (golive#434).
 *
 * A product the catalog can sell needs four things that used to be set on separate screens: the
 * record, a base price, GL accounts for Sales and Deferred Revenue, and Status = Active. Each missing
 * one failed only at the next step. The dialog asks for the record and its base price together, and
 * {@link ApplyNewProductDraft} puts both on one product so a single `Save()` writes them as one unit
 * (the product's `Prices` collection is an entity graph). The product stays Draft until the dialog's
 * second step has checked its GL accounts.
 */
import { UUIDsEqual } from '@memberjunction/global';
import {
    AsDateValue,
    TodayAsDateValue,
    type mjBizAppsOrdersProductEntity,
    type mjBizAppsOrdersProductPriceEntity,
    type mjBizAppsOrdersProductTypeEntity,
} from '@mj-biz-apps/orders-entities';

/** The first step's fields. Ids are blank strings until chosen, as a native select holds them. */
export interface NewProductDraft {
    Name: string;
    SKU: string;
    CompanyID: string;
    ProductCategoryID: string;
    ProductTypeID: string;
    RevenueRecognitionTypeID: string;
    /** The base price. Zero is a valid price: deals that always enter their own amount still need one. */
    BasePrice: number | null;
    /** `YYYY-MM-DD`. A price applies only to orders dated on or after it. */
    PriceEffectiveFrom: string;
}

/** The name the base price row gets, matching what the pricing widget calls a no-list price. */
export const BASE_PRICE_NAME = 'List';

/** A blank draft. The price starts at zero and applies from today. */
export function EmptyNewProductDraft(today: string): NewProductDraft {
    return {
        Name: '',
        SKU: '',
        CompanyID: '',
        ProductCategoryID: '',
        ProductTypeID: '',
        RevenueRecognitionTypeID: '',
        BasePrice: 0,
        PriceEffectiveFrom: today,
    };
}

/** One sentence per field the draft is missing or has wrong; empty when it can be saved. */
export function ValidateNewProductDraft(draft: NewProductDraft): string[] {
    const errors: string[] = [];
    if (!draft.Name.trim()) errors.push('Enter a name.');
    if (!draft.CompanyID) errors.push('Choose the company that sells it.');
    if (!draft.ProductCategoryID) errors.push('Choose a category.');
    if (!draft.ProductTypeID) errors.push('Choose a product type.');
    if (!draft.RevenueRecognitionTypeID) errors.push('Choose how revenue is recognized.');
    if (draft.BasePrice == null || !Number.isFinite(draft.BasePrice) || draft.BasePrice < 0) {
        errors.push('Enter a base price of zero or more.');
    }
    if (!AsDateValue(draft.PriceEffectiveFrom)) errors.push('Enter the date the price applies from.');
    return errors;
}

/**
 * The recognition type a product of this type gets unless the user picks another: the type's
 * default, or the current choice when the type has none.
 */
export function RevenueRecognitionForType(
    types: readonly Pick<mjBizAppsOrdersProductTypeEntity, 'ID' | 'DefaultRevenueRecognitionTypeID'>[],
    productTypeID: string,
    current: string,
): string {
    const type = types.find((t) => UUIDsEqual(t.ID, productTypeID));
    return type?.DefaultRevenueRecognitionTypeID ?? current;
}

/**
 * Fills a new product from the draft and adds its base price to the product's `Prices` collection,
 * so the caller's `product.Save()` writes both or neither. The product is left Draft.
 */
export async function ApplyNewProductDraft(product: mjBizAppsOrdersProductEntity, draft: NewProductDraft): Promise<mjBizAppsOrdersProductPriceEntity> {
    product.Name = draft.Name.trim();
    product.SKU = draft.SKU.trim() || null;
    product.CompanyID = draft.CompanyID;
    product.ProductCategoryID = draft.ProductCategoryID;
    product.ProductTypeID = draft.ProductTypeID;
    product.RevenueRecognitionTypeID = draft.RevenueRecognitionTypeID;
    product.Status = 'Draft';

    const price = await product.Prices.Create();
    price.PriceListID = null;
    price.Name = BASE_PRICE_NAME;
    price.Amount = draft.BasePrice ?? 0;
    price.PricingModel = 'PerUnit';
    price.FeeType = 'Standard';
    price.Priority = 0;
    price.Status = 'Active';
    // The chosen day at midnight UTC, the same rule the pricing widget follows.
    price.EffectiveFrom = AsDateValue(draft.PriceEffectiveFrom) ?? TodayAsDateValue();
    return price;
}
