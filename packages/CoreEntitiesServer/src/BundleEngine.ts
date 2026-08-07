/**
 * Expand bundle lines into their components, in memory, before anything is written.
 *
 * The ARITHMETIC lives in `BundleBehavior` and is unit-tested without a database. What lives here is
 * the catalog lookup and the mutation of the pending line collection.
 *
 * WHY IT RUNS IN MEMORY, BEFORE THE INSERT. A Confirmed line is frozen by trigger 51003, and because
 * the CRUD procs run under INSERT-EXEC a trigger rollback surfaces as "Cannot use the ROLLBACK
 * statement within an INSERT-EXEC statement" — an error naming neither the line nor the rule. So
 * anything that changes a line's money has to be settled before the row goes down, not corrected
 * afterwards. Expansion changes a great deal of money: it zeroes the parent and creates children.
 *
 * WHY THE PARENT'S ID IS ASSIGNED HERE. A child needs `ParentOrderLineID` at INSERT time for the
 * same reason — setting it afterwards would be an update to a frozen line. So the parent gets its
 * ID before either row is written, and the children point at it from the start.
 *
 * SNAPSHOT, NOT A LIVE VIEW. Expansion is frozen onto the order when it is placed. Editing
 * `ProductBundleItem` later must never mutate a historical order, so nothing re-derives children
 * from the bundle definition after the fact.
 *
 * CONNECTS TO:
 *   PURE: BundleBehavior (+ its unit tests)
 *   CODE: OrderEntityServer.expandBundles (the lifecycle point)
 *   DOC:  plans/bizapps-orders-master.md D32/D41, D45
 */
import {
    BaseEntity,
    IMetadataProvider,
    IRunViewProvider,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import {
    PlanBundleExpansion,
    type BundleComponent,
    type BundleLineFacts,
} from './BundleBehavior.js';

const PRODUCT_BUNDLE_ITEM_ENTITY = 'MJ_BizApps_Orders: Product Bundle Items';
const PRODUCT_PRICE_ENTITY = 'MJ_BizApps_Orders: Product Prices';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${i}'`))].join(',');

/** The subset of an order line this engine reads and writes. Kept structural so there is no import cycle. */
/**
 * An order line this engine can expand.
 *
 * Was a structural duck-type built on `Get`/`Set` — which meant every field this module touched
 * was a string literal the compiler could not check. It is the order-line entity; say so.
 */
export type ExpandableLine = mjBizAppsOrdersOrderLineEntity;

export interface BundleExpansionOutcome {
    /** How many parent lines were expanded. */
    Expanded: number;
    /** How many child lines were created. */
    ChildrenCreated: number;
    /** Parent line IDs whose allocation had no prices to go on and was split evenly. */
    ArbitrarilyAllocated: string[];
}

/**
 * Expand every bundle line in `lines`, appending children to the same collection.
 *
 * `makeLine` creates a fresh, unsaved order-line entity — supplied by the caller so this module does
 * not need to know how the host builds one. Returns what happened rather than throwing when there is
 * nothing to expand, since most orders contain no bundles.
 */
export async function ExpandBundleLines(
    lines: ExpandableLine[],
    makeLine: () => Promise<ExpandableLine>,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<BundleExpansionOutcome> {
    const out: BundleExpansionOutcome = { Expanded: 0, ChildrenCreated: 0, ArbitrarilyAllocated: [] };
    if (!lines.length) return out;

    const rv = new RunView(provider as unknown as IRunViewProvider);

    // WHICH of these products are bundles? One query, not one per line.
    const productIDs = [...new Set(lines.map((l) => l.ProductID))].filter(Boolean);
    if (!productIDs.length) return out;

    const items = await rv.RunView<{
        BundleProductID: string;
        ComponentProductID: string;
        Quantity: number;
        PricingMode: 'Bundled' | 'SumOfParts';
        SortOrder: number;
    }>(
        {
            EntityName: PRODUCT_BUNDLE_ITEM_ENTITY,
            ExtraFilter: `BundleProductID IN (${quote(productIDs)})`,
            ResultType: 'simple',
        },
        user,
    );
    const rows = items.Results ?? [];
    if (!rows.length) return out;

    const componentsByBundle = new Map<string, typeof rows>();
    for (const row of rows) {
        const k = key(row.BundleProductID);
        if (!componentsByBundle.has(k)) componentsByBundle.set(k, []);
        componentsByBundle.get(k)!.push(row);
    }
    for (const list of componentsByBundle.values()) list.sort((a, b) => a.SortOrder - b.SortOrder);

    // STANDALONE SELLING PRICES for the components, so allocation has something to weight by. Only
    // Active, undated-or-current rules with no price list — a list-scoped price is a negotiated
    // price for one customer, not the product's standalone value.
    const componentIDs = [...new Set(rows.map((r) => r.ComponentProductID))];
    const prices = await rv.RunView<{ ProductID: string; Amount: number; Priority: number }>(
        {
            EntityName: PRODUCT_PRICE_ENTITY,
            ExtraFilter:
                `ProductID IN (${quote(componentIDs)}) AND Status = 'Active' ` +
                `AND PriceListID IS NULL AND MinQuantity IS NULL AND MaxQuantity IS NULL`,
            ResultType: 'simple',
        },
        user,
    );
    const sspByProduct = new Map<string, number>();
    for (const p of (prices.Results ?? []).sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0))) {
        // Highest priority wins; the ambiguity guard already stops two rules tying.
        if (!sspByProduct.has(key(p.ProductID))) sspByProduct.set(key(p.ProductID), Number(p.Amount));
    }

    // Snapshot the collection: children are appended as we go and must not themselves be scanned.
    const originals = [...lines];

    for (const line of originals) {
        const components = componentsByBundle.get(key(line.ProductID));
        if (!components?.length) continue;

        const facts: BundleLineFacts = {
            ID: line.ID,
            ProductID: line.ProductID,
            Quantity: Number(line.Quantity ?? 0),
            UnitPrice: Number(line.UnitPrice ?? 0),
            ReversesOrderLineID: line.ReversesOrderLineID ?? null,
            HasParent: !!line.ParentOrderLineID,
        };

        const plan = PlanBundleExpansion(
            facts,
            components.map<BundleComponent>((c) => ({
                ComponentProductID: c.ComponentProductID,
                Quantity: Number(c.Quantity ?? 1),
                PricingMode: c.PricingMode,
                SortOrder: c.SortOrder,
                StandaloneSellingPrice: sspByProduct.get(key(c.ComponentProductID)) ?? null,
            })),
        );

        if (!plan.Children.length) {
            // A reversal line is a legitimate non-expansion — the return path unwinds the children
            // that already exist. A NESTED bundle is not, and saying so beats expanding it wrongly.
            if (plan.Refusal === 'NestedBundle') {
                throw new Error(
                    `Order line ${line.ID} is a bundle inside another bundle. Bundles expand ONE level ` +
                        `only (D45) — the quantity ripple and the price allocation are not defined for ` +
                        `deeper nesting. Sell the inner bundle's components directly, or sell it as its ` +
                        `own line.`,
                );
            }
            continue;
        }

        // THE PARENT KEEPS ITS PRICE FOR DISPLAY AND CONTRIBUTES NOTHING. Every rollup skips a
        // rollup parent, so leaving money on it would double the order — which is exactly what the
        // CK_OrderLine_RollupParentIsFree constraint refuses at the database.
        line.IsRollupParent = true;
        line.DiscountAmount = 0;
        line.ChargeAmount = 0;
        line.LineTax = 0;

        for (const child of plan.Children) {
            const row = await makeLine();
            row.ProductID = child.ComponentProductID;
            row.Quantity = child.Quantity;
            row.UnitPrice = child.UnitPrice;
            row.ParentOrderLineID = line.ID;
            row.SourceBundleProductID = line.ProductID;
            row.IsRollupParent = false;
            row.IsQuantityOverridden = false;
            lines.push(row);
            out.ChildrenCreated++;
        }

        out.Expanded++;
        if (plan.AllocatedEvenly) out.ArbitrarilyAllocated.push(line.ID);
    }

    if (out.ArbitrarilyAllocated.length) {
        console.warn(
            `Bundle line(s) ${out.ArbitrarilyAllocated.join(', ')}: no component carried a standalone ` +
                `price, so the bundle price was split EVENLY rather than by relative value. The order ` +
                `totals correctly, but the per-component revenue split is arbitrary. Price the ` +
                `components to make the allocation meaningful.`,
        );
    }
    return out;
}

/**
 * Apply a parent's quantity change to its children.
 *
 * Exported for the edit path rather than the confirm path — on a DRAFT order a parent's quantity may
 * still change, and its children have to follow. A child whose quantity was hand-edited detaches, so
 * a deliberate correction is not silently overwritten by the formula.
 */
export async function RippleBundleQuantity(
    parentOrderLineID: string,
    parentQuantity: number,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<number> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const children = await rv.RunView<{
        ID: string;
        Quantity: number;
        IsQuantityOverridden: boolean;
        ProductID: string;
        SourceBundleProductID: string | null;
    }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ParentOrderLineID = '${parentOrderLineID}'`,
            ResultType: 'simple',
        },
        user,
    );
    const rows = children.Results ?? [];
    if (!rows.length) return 0;

    // The per-bundle component quantity is not stored on the child — it is the catalog's, and the
    // catalog may have changed since. Read it from the SNAPSHOT instead: the child's current
    // quantity divided by the parent's current quantity is what was agreed at expansion time.
    // Falls back to the catalog only when the parent's old quantity is unknown.
    const bundleProductID = rows[0].SourceBundleProductID;
    const items = bundleProductID
        ? await rv.RunView<{ ComponentProductID: string; Quantity: number }>(
              {
                  EntityName: PRODUCT_BUNDLE_ITEM_ENTITY,
                  ExtraFilter: `BundleProductID = '${bundleProductID}'`,
                  ResultType: 'simple',
              },
              user,
          )
        : { Results: [] };
    const perBundle = new Map(
        (items.Results ?? []).map((i) => [key(i.ComponentProductID), Number(i.Quantity ?? 1)]),
    );

    let changed = 0;
    for (const child of rows) {
        if (child.IsQuantityOverridden) continue;
        const per = perBundle.get(key(child.ProductID));
        if (per == null) continue;
        const target = Math.round((parentQuantity * per + Number.EPSILON) * 10000) / 10000;
        if (target === Number(child.Quantity)) continue;

        const entity = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        if (!(await entity.Load(child.ID))) continue;
        entity.Quantity = target;
        if (!(await entity.Save())) {
            throw new Error(
                `Could not ripple quantity ${target} to bundle child ${child.ID}: ` +
                    `${entity.LatestResult?.CompleteMessage ?? 'no reason given'}`,
            );
        }
        changed++;
    }
    return changed;
}
