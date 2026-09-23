/**
 * DimensionDefaultResolver — what GL dimension values a product implies, before anyone types one.
 *
 * An order line can state ONE dimension tag by hand. The chart-of-accounts design needs five axes
 * on a revenue line and needs them without a human in the loop, so the values have to be DERIVED.
 * This class answers the product half: given a line's product, which dimension values follow from
 * it.
 *
 * THE WALK IS THE SAME ONE ACCOUNTS USE, deliberately:
 *
 *     Product  →  its ProductCategory  →  that category's ancestors
 *              →  its ProductType  →  the line's Company
 *
 * `GLAccountResolver` already walks exactly this for GL accounts, and reusing the precedence is
 * what lets a venture be stated once on a category instead of copied onto every product, while a
 * single product can still override it.
 *
 * MOST SPECIFIC WINS PER DIMENSION, not per walk. The walk does not stop at the first level that
 * answers anything: a category may supply Venture while the product supplies Product, and both
 * belong on the line. Each dimension is taken from the nearest level that names it, and nearer
 * levels never lose to further ones.
 *
 * NOTHING HERE FAILS. An unmapped product yields no defaults, which is a line that books untagged —
 * legal, and the state every line was in before this existed. Refusing to book would turn a
 * half-configured mapping into an outage across every order. Where a GL account link genuinely
 * REQUIRES a dimension, that is the place to refuse, and it is a separate check.
 *
 * CONNECTS TO:
 *   SHAPE:    __mj_BizAppsOrders.DimensionDefault (V202609221500)
 *   PRECEDENT: GLAccountResolver (./GLAccountResolver.ts) — the identical walk, for accounts
 *   CALLER:   OrderEntityServer.stampLineDimensions (./OrderEntityServer.ts)
 */
import { IMetadataProvider, RunView, UserInfo, type IRunViewProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { pickActiveLinkIndex } from '@mj-biz-apps/accounting-engine-base';
import { LoadOrdersEngine, OrdersEngine } from '@mj-biz-apps/orders-entities';
import type { LineDimensionTag } from './LineDimensionMerge.js';

/** MJ Entity IDs for the records a default can hang off. Mirrors `ResolverEntityIDs`. */
export interface DimensionDefaultEntityIDs {
    Product: string;
    ProductCategory: string;
    ProductType: string;
    Company: string;
}

/** One row of `DimensionDefault`, as the walk needs it. */
interface DefaultRow {
    EntityID: string;
    RecordID: string;
    DimensionID: string;
    DimensionValueID: string;
    Status: 'Pending' | 'Active' | 'Disabled';
    StartedAt: Date | null;
    EndedAt: Date | null;
}

/** What a line was resolved to, and from where — the `Source` is for diagnostics, not for logic. */
export interface ResolvedDefault extends LineDimensionTag {
    Source: 'Product' | 'ProductCategory' | 'ProductType' | 'Company';
}

/**
 * Resolves product → dimension defaults, caching the whole mapping for one unit of work.
 *
 * Construct per save; do not hold across requests. The table is small — one row per mapped record
 * per axis — so it is read once in full rather than queried per line. An order with forty lines
 * would otherwise be forty round trips to answer from the same handful of rows.
 */
export class DimensionDefaultResolver {
    private _rows: DefaultRow[] | null = null;
    private readonly _categoryParent = new Map<string, string | null>();
    private _categoriesLoaded = false;

    constructor(
        private readonly _entityIDs: DimensionDefaultEntityIDs,
        private readonly _provider: IMetadataProvider,
        private readonly _contextUser: UserInfo,
    ) {}

    /**
     * The dimension values that follow from a product, as of a date.
     *
     * @param asOf the ORDER's date, not today — a back-dated order resolves the mapping that was
     *             live when it was placed, which is the same rule the account walk and the
     *             dimension-value pickers follow.
     */
    public async Resolve(
        productID: string | null,
        productCategoryID: string | null,
        productTypeID: string | null,
        companyID: string,
        asOf: Date,
    ): Promise<ResolvedDefault[]> {
        await this.ensureLoaded();

        // Nearest first. Each level contributes only the axes no nearer level already answered.
        const byDimension = new Map<string, ResolvedDefault>();
        const take = (rows: DefaultRow[], source: ResolvedDefault['Source']) => {
            for (const row of rows) {
                const key = row.DimensionID.toLowerCase();
                if (byDimension.has(key)) continue;
                byDimension.set(key, {
                    DimensionID: row.DimensionID,
                    DimensionValueID: row.DimensionValueID,
                    Source: source,
                });
            }
        };

        if (productID) take(this.activeFor(this._entityIDs.Product, productID, asOf), 'Product');
        for (const categoryID of await this.categoryChain(productCategoryID)) {
            take(this.activeFor(this._entityIDs.ProductCategory, categoryID, asOf), 'ProductCategory');
        }
        if (productTypeID) take(this.activeFor(this._entityIDs.ProductType, productTypeID, asOf), 'ProductType');
        take(this.activeFor(this._entityIDs.Company, companyID, asOf), 'Company');

        return [...byDimension.values()];
    }

    /**
     * Every row for one record, one per dimension, with the date-effective winner chosen per axis.
     *
     * `pickActiveLinkIndex` is the accounting engine's own window rule — Status plus StartedAt /
     * EndedAt — and it is used here rather than reimplemented so a default and a GL account link
     * are never live on different days for the same reason.
     */
    private activeFor(entityID: string, recordID: string, asOf: Date): DefaultRow[] {
        const candidates = (this._rows ?? []).filter(
            (row) => UUIDsEqual(row.EntityID, entityID) && row.RecordID.toLowerCase() === recordID.toLowerCase(),
        );

        const out: DefaultRow[] = [];
        const axes = new Set(candidates.map((row) => row.DimensionID.toLowerCase()));
        for (const axis of axes) {
            const forAxis = candidates.filter((row) => row.DimensionID.toLowerCase() === axis);
            const winner = pickActiveLinkIndex(
                forAxis.map((row) => ({ Status: row.Status, StartedAt: row.StartedAt, EndedAt: row.EndedAt })),
                asOf,
            );
            if (winner !== -1) out.push(forAxis[winner]);
        }
        return out;
    }

    /** The category and each ancestor, nearest first. Cycle-guarded like the account walk. */
    private async categoryChain(startCategoryID: string | null): Promise<string[]> {
        if (!startCategoryID) return [];
        await this.ensureCategoriesLoaded();

        const chain: string[] = [];
        const seen = new Set<string>();
        let current: string | null = startCategoryID;
        while (current && !seen.has(current)) {
            seen.add(current); // the DB CHECK blocks self-parenting, not longer loops
            chain.push(current);
            current = this._categoryParent.get(current) ?? null;
        }
        return chain;
    }

    private async ensureCategoriesLoaded(): Promise<void> {
        if (this._categoriesLoaded) return;
        await LoadOrdersEngine(this._provider, this._contextUser);
        for (const row of OrdersEngine.Instance.ProductCategories) {
            this._categoryParent.set(row.ID, row.ParentProductCategoryID ?? null);
        }
        this._categoriesLoaded = true;
    }

    /**
     * Read the mapping once.
     *
     * A FAILED READ THROWS. Returning an empty list would be indistinguishable from "nothing is
     * mapped", and the difference matters: one books untagged because that is the configuration,
     * the other books untagged because the query broke. The second is the defect this work exists
     * to close, wearing the first one's clothes.
     */
    private async ensureLoaded(): Promise<void> {
        if (this._rows) return;
        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const result = await rv.RunView<DefaultRow>(
            {
                EntityName: 'MJ_BizApps_Orders: Dimension Defaults',
                ExtraFilter: `Status = 'Active'`,
                Fields: ['EntityID', 'RecordID', 'DimensionID', 'DimensionValueID', 'Status', 'StartedAt', 'EndedAt'],
                ResultType: 'simple',
            },
            this._contextUser,
        );
        if (!result?.Success) {
            throw new Error(
                `Could not read the dimension defaults, so this order's lines cannot be tagged: ` +
                    `${result?.ErrorMessage ?? 'no error message supplied'}`,
            );
        }
        this._rows = result.Results ?? [];
    }
}
