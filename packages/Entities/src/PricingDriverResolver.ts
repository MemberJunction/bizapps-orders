/**
 * @fileoverview Which pricing driver applies — and therefore whether a client may price locally.
 *
 * ## The question this answers
 *
 * Most pricing is metadata: price rules, tiers, lists, promotions, charge types, tax tables. A
 * browser can run that walk itself against cached catalog data and show a total instantly, with no
 * server round trip. What it cannot do is run a PLUGIN — a `BasePriceResolver` subclass, which is
 * server-side code that may read anything and compute anything.
 *
 * So before pricing locally, a client has to know whether a plugin applies. That has to be
 * answerable from METADATA, because asking the server defeats the point.
 *
 * ## Why the answer walks four levels
 *
 * The same shape `GLAccountResolver` already uses for accounts: the most specific answer wins.
 *
 * ```text
 * Product.PricingDriverClass
 *   ↳ ProductCategory.PricingDriverClass        (and up the parent chain)
 *       ↳ ProductType.PricingDriverClass
 *           ↳ OrderCompanyPolicy.PricingDriverClass
 * ```
 *
 * A product may price specially on its own; a category may (event tickets); a type may (usage
 * metering); a company may have a house resolver — which is where every plugin registered before the
 * column existed is keyed, as `Company:<id>`.
 *
 * ## The direction of the safe answer
 *
 * `null` at every level means "no plugin", so price locally. **Anything else escalates.** When the
 * data cannot be read at all this returns an ESCALATION rather than a local verdict: a failed lookup
 * must not be mistaken for "no plugin found", because the two produce the same absence and only one
 * of them is safe. Escalating costs a round trip; guessing costs a wrong price.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { OrdersEngine, OrdersEngineReady } from './pricing/OrdersEngine';

/** Where a driver was found, so a caller can say WHY it escalated. */
export type PricingDriverLevel = 'product' | 'category' | 'type' | 'company';

export interface PricingDriverVerdict {
    /** True when every level is null and the caller may run the metadata walk itself. */
    CanPriceLocally: boolean;
    /** The ClassFactory key to invoke, when one applies. */
    DriverClass: string | null;
    /** Which level supplied it — for diagnostics, and for explaining an escalation. */
    Level: PricingDriverLevel | null;
    /**
     * Set when the verdict is an escalation caused by a FAILED LOOKUP rather than a found driver.
     * Never silently treated as "no driver" — see the module note on the direction of the safe answer.
     */
    Unresolved?: string;
}

/** Price locally — nothing anywhere names a plugin. */
const LOCAL: PricingDriverVerdict = { CanPriceLocally: false, DriverClass: null, Level: null };

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const POLICY_ENTITY = 'MJ_BizApps_Orders: Order Company Policies';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface ProductRow {
    ID: string;
    ProductTypeID: string | null;
    ProductCategoryID: string | null;
    PricingDriverClass: string | null;
}
interface CategoryRow {
    ID: string;
    ParentProductCategoryID: string | null;
    PricingDriverClass: string | null;
}

/**
 * The driver for one product, or a verdict that it can be priced locally.
 *
 * @param productID - The product being priced.
 * @param companyID - The selling company, for the last fallback level.
 */
export async function ResolvePricingDriver(
    productID: string,
    companyID: string | null,
    provider: IRunViewProvider,
    user?: UserInfo,
): Promise<PricingDriverVerdict> {
    if (!UUID.test(productID ?? '')) {
        return { ...LOCAL, CanPriceLocally: false, Unresolved: `'${productID}' is not a product id.` };
    }
    const rv = new RunView(provider);
    if (await OrdersEngineReady(provider as unknown as IMetadataProvider, user)) {
        const engine = OrdersEngine.Instance;
        const product = engine.ProductByID(productID);
        if (product) {
            if (product.PricingDriverClass) {
                return { CanPriceLocally: false, DriverClass: product.PricingDriverClass, Level: 'product' };
            }
            for (const categoryID of engine.CategoryChain(product.ProductCategoryID)) {
                const category = engine.ProductCategoryByID(categoryID);
                if (!category) break;
                if (category.PricingDriverClass) {
                    return { CanPriceLocally: false, DriverClass: category.PricingDriverClass, Level: 'category' };
                }
            }
            if (product.ProductTypeID) {
                const driver = engine.ProductTypeByID(product.ProductTypeID)?.PricingDriverClass ?? null;
                if (driver) return { CanPriceLocally: false, DriverClass: driver, Level: 'type' };
            }
            if (companyID && UUID.test(companyID)) {
                const policyRes = await rv.RunView<{ PricingDriverClass: string | null }>(
                    {
                        EntityName: POLICY_ENTITY,
                        ExtraFilter: `ID = '${companyID}'`,
                        Fields: ['PricingDriverClass'],
                        ResultType: 'simple',
                    },
                    user,
                );
                if (!policyRes?.Success) {
                    return { ...LOCAL, Unresolved: `Could not read the company pricing policy.` };
                }
                const policyDriver = policyRes.Results?.[0]?.PricingDriverClass;
                if (policyDriver) return { CanPriceLocally: false, DriverClass: policyDriver, Level: 'company' };
            }
            return { CanPriceLocally: true, DriverClass: null, Level: null };
        }
    }

    const productRes = await rv.RunView<ProductRow>(
        {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID = '${productID}'`,
            Fields: ['ID', 'ProductTypeID', 'ProductCategoryID', 'PricingDriverClass'],
            ResultType: 'simple',
        },
        user,
    );
    if (!productRes?.Success) {
        return { ...LOCAL, Unresolved: `Could not read the product: ${productRes?.ErrorMessage ?? 'unknown error'}` };
    }
    const product = productRes.Results?.[0];
    if (!product) {
        return { ...LOCAL, Unresolved: `Product ${productID} does not exist.` };
    }
    if (product.PricingDriverClass) {
        return { CanPriceLocally: false, DriverClass: product.PricingDriverClass, Level: 'product' };
    }

    let categoryID = product.ProductCategoryID;
    const seen = new Set<string>();
    while (categoryID && UUID.test(categoryID)) {
        if (seen.has(categoryID.toLowerCase())) break;
        seen.add(categoryID.toLowerCase());
        const catRes = await rv.RunView<CategoryRow>(
            {
                EntityName: CATEGORY_ENTITY,
                ExtraFilter: `ID = '${categoryID}'`,
                Fields: ['ID', 'ParentProductCategoryID', 'PricingDriverClass'],
                ResultType: 'simple',
            },
            user,
        );
        if (!catRes?.Success) {
            return { ...LOCAL, Unresolved: `Could not read product category ${categoryID}.` };
        }
        const category = catRes.Results?.[0];
        if (!category) break;
        if (category.PricingDriverClass) {
            return { CanPriceLocally: false, DriverClass: category.PricingDriverClass, Level: 'category' };
        }
        categoryID = category.ParentProductCategoryID;
    }

    if (product.ProductTypeID && UUID.test(product.ProductTypeID)) {
        const typeRes = await rv.RunView<{ PricingDriverClass: string | null }>(
            {
                EntityName: TYPE_ENTITY,
                ExtraFilter: `ID = '${product.ProductTypeID}'`,
                Fields: ['PricingDriverClass'],
                ResultType: 'simple',
            },
            user,
        );
        if (!typeRes?.Success) {
            return { ...LOCAL, Unresolved: `Could not read product type ${product.ProductTypeID}.` };
        }
        const driver = typeRes.Results?.[0]?.PricingDriverClass;
        if (driver) return { CanPriceLocally: false, DriverClass: driver, Level: 'type' };
    }

    if (companyID && UUID.test(companyID)) {
        const policyRes = await rv.RunView<{ PricingDriverClass: string | null }>(
            {
                EntityName: POLICY_ENTITY,
                ExtraFilter: `ID = '${companyID}'`,
                Fields: ['PricingDriverClass'],
                ResultType: 'simple',
            },
            user,
        );
        if (!policyRes?.Success) {
            return { ...LOCAL, Unresolved: `Could not read the company pricing policy.` };
        }
        const driver = policyRes.Results?.[0]?.PricingDriverClass;
        if (driver) return { CanPriceLocally: false, DriverClass: driver, Level: 'company' };
    }

    // Nothing anywhere names a plugin: the metadata walk is the whole answer, so a client may run it.
    return { CanPriceLocally: true, DriverClass: null, Level: null };
}

/**
 * True when EVERY product on an order can be priced locally.
 *
 * All-or-nothing on purpose. Pricing is not per-line arithmetic — promotions stack against order
 * totals, charges apportion across lines, tax computes on the discounted amount — so an order with
 * one plugin-priced line cannot be half-computed locally and half on the server without the two
 * halves disagreeing about the same totals.
 */
export async function CanPriceOrderLocally(
    productIDs: string[],
    companyID: string | null,
    provider: IRunViewProvider,
    user?: UserInfo,
): Promise<PricingDriverVerdict> {
    for (const productID of [...new Set(productIDs)]) {
        const verdict = await ResolvePricingDriver(productID, companyID, provider, user);
        if (!verdict.CanPriceLocally) return verdict;
    }
    return { CanPriceLocally: true, DriverClass: null, Level: null };
}
