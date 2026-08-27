/**
 * Bundle expansion arithmetic, with no database in sight.
 *
 * WHY EXPAND AT ALL. A bundle sold as one line forces ONE of everything: one tax treatment, one
 * revenue schedule, one GL account, one entitlement, one returnable unit. A bundle of a publication
 * (often exempt) and a conference registration (not) taxed at the header is simply wrong, and a
 * bundle spanning a subscription and an event cannot be scheduled from a single line at all. So the
 * components become real order lines and everything downstream keeps working per line.
 *
 * WHAT THE PARENT IS FOR. The customer bought "the Gold Package", not four things, and reporting
 * needs to know a component came from a bundle — and from WHICH bundle line, since two Gold Packages
 * on one order produce two indistinguishable sets otherwise. So the parent line survives as the
 * customer-facing row, carrying `IsRollupParent`, and contributes ZERO to every total. The children
 * carry the money.
 *
 * THE ARITHMETIC THAT BITES. Allocating one bundle price across components by relative standalone
 * selling price does not divide evenly. Allocate $100 across three equal components and naive
 * rounding gives 33.33 × 3 = 99.99 — a penny that vanishes, on an order that still balances because
 * every line agrees with itself. `AllocateBundlePrice` uses largest-remainder so the parts sum to
 * the whole EXACTLY, and its tests assert that on deliberately awkward numbers.
 *
 * CONNECTS TO:
 *   CODE: BundleEngine (the rows) · OrderEntityServer (the lifecycle point)
 *   DOC:  plans/archive/bizapps-orders-master.md D32/D41 (bundles), D45 (ParentOrderLineID)
 */

/** Round to cents the way the rest of the engine does. */
const Money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** How a bundle prices its components. */
export type BundlePricingMode = 'Bundled' | 'SumOfParts';

/** One component of a bundle, as the catalog defines it. */
export interface BundleComponent {
    ComponentProductID: string;
    /** Units of this component per ONE bundle. */
    Quantity: number;
    PricingMode: BundlePricingMode;
    SortOrder: number;
    /**
     * The component's own list price — its standalone selling price. Null when the catalog has no
     * price rule for it, which is survivable: see `AllocateBundlePrice`.
     */
    StandaloneSellingPrice: number | null;
}

/** One child line to be created. */
export interface PlannedBundleChild {
    ComponentProductID: string;
    /** parent quantity × component quantity. */
    Quantity: number;
    /** The child's share of the bundle price, per unit. */
    UnitPrice: number;
    SortOrder: number;
}

export type BundleRefusal =
    | 'NotABundle'
    | 'ReversalLine'
    | 'NonPositiveQuantity'
    | 'NestedBundle'
    | 'NoComponents';

export interface BundlePlan {
    Children: PlannedBundleChild[];
    Refusal: BundleRefusal | null;
    /** True when allocation fell back to splitting evenly because no component had a price. */
    AllocatedEvenly: boolean;
}

/**
 * Split `total` across `weights` so the parts sum to `total` EXACTLY.
 *
 * Largest-remainder: floor every share to cents, then hand the leftover pennies one at a time to
 * whichever shares were cut by the most. The naive alternative — round each share independently —
 * loses or invents money on most inputs, and does it invisibly: each line is individually plausible
 * and the order still balances against itself.
 *
 * Ties break toward the earlier index, so the result is deterministic for a given input rather than
 * dependent on sort stability.
 */
export function SplitExactly(total: number, weights: number[]): number[] {
    const n = weights.length;
    if (n === 0) return [];

    const cents = Math.round(Money(total) * 100);
    const weightSum = weights.reduce((s, w) => s + w, 0);

    // No usable weights: split as evenly as cents allow rather than putting it all on the first.
    if (!(weightSum > 0)) {
        const base = Math.floor(cents / n);
        const out = new Array<number>(n).fill(base);
        for (let i = 0; i < cents - base * n; i++) out[i] += 1;
        return out.map((c) => c / 100);
    }

    const exact = weights.map((w) => (cents * w) / weightSum);
    const floors = exact.map((e) => Math.floor(e));
    let remaining = cents - floors.reduce((s, f) => s + f, 0);

    const order = exact
        .map((e, i) => ({ i, rem: e - Math.floor(e) }))
        .sort((a, b) => (b.rem === a.rem ? a.i - b.i : b.rem - a.rem));

    const out = [...floors];
    for (let k = 0; k < order.length && remaining > 0; k++, remaining--) out[order[k].i] += 1;

    return out.map((c) => c / 100);
}

/**
 * Allocate a bundle's price across its components by relative standalone selling price.
 *
 * `Bundled` components share the bundle price. `SumOfParts` components are priced on their own and
 * take no share of it — a bundle may mix the two, which is how "everything in the package plus a
 * discounted add-on priced separately" is expressed.
 *
 * WHEN NO COMPONENT HAS A PRICE the weights are all zero and there is nothing to allocate BY. Rather
 * than refuse the sale or silently dump the whole amount on the first component, it splits evenly
 * and says so through `AllocatedEvenly`, so a caller can record that the allocation was arbitrary.
 * An even split is defensible; a silent lopsided one is not.
 */
export function AllocateBundlePrice(
    bundleTotal: number,
    components: BundleComponent[],
): { PerComponent: number[]; AllocatedEvenly: boolean } {
    const bundled = components.map((c) => c.PricingMode === 'Bundled');

    // Weight by the component's standalone value FOR THE WHOLE LINE — its price times how many of
    // it the bundle contains. Weighting by unit price alone would under-allocate to a component
    // that appears three times.
    const weights = components.map((c, i) =>
        bundled[i] ? Math.max(0, Number(c.StandaloneSellingPrice ?? 0)) * Math.max(0, c.Quantity) : 0,
    );

    const bundledCount = bundled.filter(Boolean).length;
    const weightSum = weights.reduce((s, w) => s + w, 0);
    const allocatedEvenly = bundledCount > 0 && !(weightSum > 0);

    if (allocatedEvenly) {
        // Even across the BUNDLED ones only; SumOfParts components still take nothing.
        const evenWeights = components.map((_, i) => (bundled[i] ? 1 : 0));
        return { PerComponent: SplitExactly(bundleTotal, evenWeights), AllocatedEvenly: true };
    }

    return { PerComponent: SplitExactly(bundleTotal, weights), AllocatedEvenly: false };
}

/** What a bundle line needs to say for itself. */
export interface BundleLineFacts {
    ID: string;
    ProductID: string;
    Quantity: number;
    /** The price of ONE bundle. Multiplied by quantity to get what is allocated. */
    UnitPrice: number;
    ReversesOrderLineID: string | null;
    /** True when this line is ITSELF a component of another bundle — one level only (D45). */
    HasParent: boolean;
}

/**
 * Plan the child lines a bundle line expands into.
 *
 * ONE LEVEL ONLY. A component that is itself a bundle is refused rather than expanded recursively:
 * the quantity ripple and the allocation both get considerably harder, and nothing in the catalog
 * needs it yet. Easy to relax; very hard to un-ship once orders exist that depend on it.
 */
export function PlanBundleExpansion(
    line: BundleLineFacts,
    components: BundleComponent[],
): BundlePlan {
    const empty = (reason: BundleRefusal): BundlePlan => ({
        Children: [],
        Refusal: reason,
        AllocatedEvenly: false,
    });

    if (!components.length) return empty('NotABundle');
    if (line.ReversesOrderLineID) return empty('ReversalLine');
    if (line.HasParent) return empty('NestedBundle');

    const qty = Number(line.Quantity ?? 0);
    if (!(qty > 0)) return empty('NonPositiveQuantity');

    // What the whole parent line is worth, which is what gets allocated.
    const bundleTotal = Money(Money(line.UnitPrice ?? 0) * qty);
    const { PerComponent, AllocatedEvenly } = AllocateBundlePrice(bundleTotal, components);

    const children: PlannedBundleChild[] = components.map((c, i) => {
        const childQty = ChildQuantity(qty, c.Quantity);
        // The allocation is a TOTAL for the component across the whole line; the line stores a UNIT
        // price, so divide back out. Dividing by zero would be a NaN that saves cleanly, so guard it.
        const unitPrice = childQty > 0 ? Money(PerComponent[i] / childQty) : 0;
        return {
            ComponentProductID: c.ComponentProductID,
            Quantity: childQty,
            UnitPrice: c.PricingMode === 'Bundled' ? unitPrice : Money(c.StandaloneSellingPrice ?? 0),
            SortOrder: c.SortOrder,
        };
    });

    return { Children: children, Refusal: null, AllocatedEvenly };
}

/** A child's quantity: how many bundles times how many of the component each contains. */
export function ChildQuantity(parentQuantity: number, componentQuantity: number): number {
    const q = Number(parentQuantity ?? 0) * Number(componentQuantity ?? 0);
    // Component quantities are DECIMAL(18,4); keep the same scale rather than rounding to an integer,
    // since 0.5 hours of a service per bundle is a legitimate thing to sell.
    return Math.round((q + Number.EPSILON) * 10000) / 10000;
}

/** One child's current state, for deciding whether the ripple may touch it. */
export interface RippleChild {
    ID: string;
    ComponentQuantity: number;
    IsQuantityOverridden: boolean;
    CurrentQuantity: number;
}

export interface RippleChange {
    OrderLineID: string;
    FromQuantity: number;
    ToQuantity: number;
}

/**
 * What a change to the parent's quantity should do to its children.
 *
 * A child whose quantity was hand-edited DETACHES from the ripple. Without that, bumping the bundle
 * quantity silently overwrites a deliberate correction — data loss that looks exactly like
 * arithmetic, because the number it lands on is the number the formula says it should be.
 *
 * Returns only the children that actually change, so a no-op ripple writes nothing.
 */
export function PlanQuantityRipple(
    parentQuantity: number,
    children: RippleChild[],
): RippleChange[] {
    const changes: RippleChange[] = [];
    for (const child of children) {
        if (child.IsQuantityOverridden) continue;
        const target = ChildQuantity(parentQuantity, child.ComponentQuantity);
        if (target !== child.CurrentQuantity) {
            changes.push({
                OrderLineID: child.ID,
                FromQuantity: child.CurrentQuantity,
                ToQuantity: target,
            });
        }
    }
    return changes;
}

/**
 * Does this set of lines total correctly once parents are excluded?
 *
 * The invariant every rollup depends on: a rollup parent contributes nothing, so the sum over
 * non-parent lines is the order's real value. Exported because it is worth asserting from the
 * outside rather than trusting each rollup to remember.
 */
export function RollupTotal(lines: Array<{ IsRollupParent: boolean; Amount: number }>): number {
    return Money(lines.filter((l) => !l.IsRollupParent).reduce((s, l) => s + Number(l.Amount ?? 0), 0));
}
