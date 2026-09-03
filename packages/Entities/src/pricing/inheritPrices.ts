/**
 * Named-price inheritance — the same walk as GL: product, then its category, then ancestors.
 *
 * A product row named `Member` replaces a category `Member`; it does not stack. Different names
 * from further up the tree remain in the pool for PickPriceRule.
 */
const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

export interface NamedPriceRow {
    Name?: string | null;
    ProductID?: string | null;
    ProductCategoryID?: string | null;
}

/**
 * Keep the most specific row per Name.
 *
 * Product-scoped = most specific. Then the category chain, nearest first. Two rows at the same
 * rank (should be impossible under the unique Name indexes) are both kept so PickPriceRule can
 * refuse a priority tie instead of picking by array order.
 */
export function collapseInheritedPrices<T extends NamedPriceRow>(
    rows: T[],
    productID: string,
    categoryChainNearestFirst: string[],
): T[] {
    const productKey = uuidKey(productID);
    const catRank = new Map(categoryChainNearestFirst.map((id, i) => [uuidKey(id), i]));

    const rankOf = (row: T): number => {
        if (row.ProductID && uuidKey(row.ProductID) === productKey) return -1;
        const cat = row.ProductCategoryID ? catRank.get(uuidKey(row.ProductCategoryID)) : undefined;
        return cat == null ? Number.POSITIVE_INFINITY : cat;
    };

    const best = new Map<string, { rank: number; rows: T[] }>();
    for (const row of rows) {
        const rank = rankOf(row);
        if (!Number.isFinite(rank)) continue;
        const key = (row.Name ?? '').trim().toLowerCase();
        const current = best.get(key);
        if (!current || rank < current.rank) {
            best.set(key, { rank, rows: [row] });
        } else if (rank === current.rank) {
            current.rows.push(row);
        }
    }
    return [...best.values()].flatMap((entry) => entry.rows);
}
