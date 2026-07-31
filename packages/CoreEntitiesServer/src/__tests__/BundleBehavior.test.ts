/**
 * BundleBehavior — the arithmetic, with no database.
 *
 * The claim worth the most effort here is that allocation SUMS EXACTLY. A penny lost in an
 * allocation does not announce itself: every line agrees with itself, the order balances, and the
 * only symptom is that the parts no longer add to the whole. So the split is asserted against
 * deliberately awkward numbers rather than convenient ones.
 */
import { describe, expect, it } from 'vitest';
import {
    AllocateBundlePrice,
    ChildQuantity,
    PlanBundleExpansion,
    PlanQuantityRipple,
    RollupTotal,
    SplitExactly,
    type BundleComponent,
    type BundleLineFacts,
} from '../BundleBehavior.js';

const component = (over: Partial<BundleComponent> = {}): BundleComponent => ({
    ComponentProductID: 'component-1',
    Quantity: 1,
    PricingMode: 'Bundled',
    SortOrder: 0,
    StandaloneSellingPrice: 100,
    ...over,
});

const bundleLine = (over: Partial<BundleLineFacts> = {}): BundleLineFacts => ({
    ID: 'parent-line',
    ProductID: 'bundle-product',
    Quantity: 1,
    UnitPrice: 100,
    ReversesOrderLineID: null,
    HasParent: false,
    ...over,
});

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

describe('SplitExactly', () => {
    it('sums to the total on a split that does not divide evenly', () => {
        // The canonical case: 100 across three equal parts. Naive rounding gives 33.33 x 3 = 99.99.
        const parts = SplitExactly(100, [1, 1, 1]);
        expect(sum(parts)).toBe(100);
        expect(parts).toEqual([33.34, 33.33, 33.33]);
    });

    it('sums exactly across a spread of awkward totals and weights', () => {
        const cases: Array<[number, number[]]> = [
            [100, [1, 1, 1]],
            [0.01, [1, 1]],
            [0.03, [1, 1, 1, 1]],
            [999.99, [7, 11, 13]],
            [1234.56, [1, 2, 3, 4, 5, 6, 7]],
            [10, [0.1, 0.2, 0.7]],
            [55.55, [3, 3, 3, 3, 3, 3]],
            [1, [1, 1, 1, 1, 1, 1, 1]],
        ];
        for (const [total, weights] of cases) {
            expect(sum(SplitExactly(total, weights)), `${total} across ${weights}`).toBe(total);
        }
    });

    it('gives the leftover pennies to the largest remainders, not to the first index', () => {
        // 1.00 across weights 1:1:1 leaves one penny; it goes to the biggest remainder.
        const parts = SplitExactly(1, [1, 1, 1]);
        expect(sum(parts)).toBe(1);
        expect(parts.filter((p) => p === 0.34)).toHaveLength(1);
    });

    it('breaks remainder ties toward the earlier index, so results are deterministic', () => {
        expect(SplitExactly(100, [1, 1, 1])).toEqual(SplitExactly(100, [1, 1, 1]));
        expect(SplitExactly(0.05, [1, 1, 1])).toEqual([0.02, 0.02, 0.01]);
    });

    it('splits as evenly as cents allow when every weight is zero', () => {
        // Not all on the first: an arbitrary allocation should at least be an unbiased one.
        const parts = SplitExactly(1, [0, 0, 0]);
        expect(sum(parts)).toBe(1);
        // Compared in CENTS: 0.34 - 0.33 is 0.010000000000000009 in binary floating point, so the
        // obvious assertion fails on a result that is perfectly correct.
        const cents = parts.map((p) => Math.round(p * 100));
        expect(Math.max(...cents) - Math.min(...cents)).toBeLessThanOrEqual(1);
    });

    it('returns nothing for no weights, and zero parts for a zero total', () => {
        expect(SplitExactly(100, [])).toEqual([]);
        expect(SplitExactly(0, [1, 1])).toEqual([0, 0]);
    });

    it('handles a total that is already exact', () => {
        expect(SplitExactly(90, [1, 1, 1])).toEqual([30, 30, 30]);
    });
});

describe('AllocateBundlePrice', () => {
    it('allocates in proportion to standalone selling price', () => {
        const { PerComponent, AllocatedEvenly } = AllocateBundlePrice(100, [
            component({ ComponentProductID: 'a', StandaloneSellingPrice: 75 }),
            component({ ComponentProductID: 'b', StandaloneSellingPrice: 25 }),
        ]);
        expect(PerComponent).toEqual([75, 25]);
        expect(AllocatedEvenly).toBe(false);
        expect(sum(PerComponent)).toBe(100);
    });

    it('weights by standalone value FOR THE LINE, not by unit price alone', () => {
        // Two components at the same unit price, but one appears three times. Weighting by unit
        // price alone would split 50/50 and under-allocate the component you get more of.
        const { PerComponent } = AllocateBundlePrice(100, [
            component({ ComponentProductID: 'a', StandaloneSellingPrice: 10, Quantity: 3 }),
            component({ ComponentProductID: 'b', StandaloneSellingPrice: 10, Quantity: 1 }),
        ]);
        expect(PerComponent).toEqual([75, 25]);
    });

    it('gives SumOfParts components no share of the bundle price', () => {
        const { PerComponent } = AllocateBundlePrice(100, [
            component({ ComponentProductID: 'a', StandaloneSellingPrice: 50 }),
            component({ ComponentProductID: 'b', StandaloneSellingPrice: 50, PricingMode: 'SumOfParts' }),
        ]);
        expect(PerComponent[1]).toBe(0);
        expect(PerComponent[0]).toBe(100);
    });

    it('splits evenly and SAYS SO when no component has a price', () => {
        // There is nothing to allocate BY. An even split is defensible; silently dumping the whole
        // amount on the first component is not, and neither is refusing the sale.
        const { PerComponent, AllocatedEvenly } = AllocateBundlePrice(100, [
            component({ ComponentProductID: 'a', StandaloneSellingPrice: null }),
            component({ ComponentProductID: 'b', StandaloneSellingPrice: null }),
        ]);
        expect(AllocatedEvenly).toBe(true);
        expect(PerComponent).toEqual([50, 50]);
    });

    it('treats a zero price as no price rather than as a weight', () => {
        const { AllocatedEvenly } = AllocateBundlePrice(100, [
            component({ StandaloneSellingPrice: 0 }),
            component({ ComponentProductID: 'b', StandaloneSellingPrice: 0 }),
        ]);
        expect(AllocatedEvenly).toBe(true);
    });

    it('ignores a negative price rather than allocating backwards', () => {
        const { PerComponent } = AllocateBundlePrice(100, [
            component({ ComponentProductID: 'a', StandaloneSellingPrice: -50 }),
            component({ ComponentProductID: 'b', StandaloneSellingPrice: 100 }),
        ]);
        expect(PerComponent).toEqual([0, 100]);
    });

    it('always sums to the bundle total, whatever the weights', () => {
        const prices = [[1, 2, 3], [99.99, 0.01], [7, 7, 7], [1000, 1, 1], [33, 33, 34]];
        for (const set of prices) {
            const { PerComponent } = AllocateBundlePrice(
                123.45,
                set.map((p, i) => component({ ComponentProductID: `c${i}`, StandaloneSellingPrice: p })),
            );
            expect(sum(PerComponent), `weights ${set}`).toBe(123.45);
        }
    });
});

describe('PlanBundleExpansion', () => {
    it('expands into one child per component, with quantities multiplied', () => {
        const plan = PlanBundleExpansion(bundleLine({ Quantity: 2, UnitPrice: 100 }), [
            component({ ComponentProductID: 'a', Quantity: 1, StandaloneSellingPrice: 60 }),
            component({ ComponentProductID: 'b', Quantity: 3, StandaloneSellingPrice: 40 }),
        ]);
        expect(plan.Refusal).toBeNull();
        expect(plan.Children).toHaveLength(2);
        expect(plan.Children[0].Quantity).toBe(2); // 2 bundles x 1
        expect(plan.Children[1].Quantity).toBe(6); // 2 bundles x 3
    });

    it("allocates the WHOLE line's value, not one bundle's", () => {
        const plan = PlanBundleExpansion(bundleLine({ Quantity: 2, UnitPrice: 100 }), [
            component({ ComponentProductID: 'a', StandaloneSellingPrice: 50 }),
            component({ ComponentProductID: 'b', StandaloneSellingPrice: 50 }),
        ]);
        // 2 x 100 = 200 allocated; each component gets 100 total over 2 units = 50 each.
        const lineTotal = sum(plan.Children.map((c) => c.UnitPrice * c.Quantity));
        expect(lineTotal).toBe(200);
    });

    it('stores a UNIT price, since that is what an order line holds', () => {
        const plan = PlanBundleExpansion(bundleLine({ Quantity: 4, UnitPrice: 100 }), [
            component({ ComponentProductID: 'a', Quantity: 2, StandaloneSellingPrice: 100 }),
        ]);
        // 400 allocated to one component, spread over 4 x 2 = 8 units.
        expect(plan.Children[0].Quantity).toBe(8);
        expect(plan.Children[0].UnitPrice).toBe(50);
    });

    it('prices SumOfParts components from their own standalone price', () => {
        const plan = PlanBundleExpansion(bundleLine({ UnitPrice: 100 }), [
            component({ ComponentProductID: 'a', StandaloneSellingPrice: 100 }),
            component({
                ComponentProductID: 'b',
                StandaloneSellingPrice: 15,
                PricingMode: 'SumOfParts',
            }),
        ]);
        expect(plan.Children[1].UnitPrice).toBe(15);
    });

    it('refuses a nested bundle rather than expanding recursively', () => {
        const plan = PlanBundleExpansion(bundleLine({ HasParent: true }), [component()]);
        expect(plan.Children).toHaveLength(0);
        expect(plan.Refusal).toBe('NestedBundle');
    });

    it('refuses a reversal line, a non-positive quantity, and a product with no components', () => {
        expect(
            PlanBundleExpansion(bundleLine({ ReversesOrderLineID: 'origin' }), [component()]).Refusal,
        ).toBe('ReversalLine');
        expect(PlanBundleExpansion(bundleLine({ Quantity: 0 }), [component()]).Refusal).toBe(
            'NonPositiveQuantity',
        );
        expect(PlanBundleExpansion(bundleLine(), []).Refusal).toBe('NotABundle');
    });

    it('carries SortOrder through, so the UI can render components in catalog order', () => {
        const plan = PlanBundleExpansion(bundleLine(), [
            component({ ComponentProductID: 'a', SortOrder: 20 }),
            component({ ComponentProductID: 'b', SortOrder: 10 }),
        ]);
        expect(plan.Children.map((c) => c.SortOrder)).toEqual([20, 10]);
    });

    it('reports an arbitrary allocation rather than hiding it', () => {
        const plan = PlanBundleExpansion(bundleLine(), [
            component({ ComponentProductID: 'a', StandaloneSellingPrice: null }),
            component({ ComponentProductID: 'b', StandaloneSellingPrice: null }),
        ]);
        expect(plan.AllocatedEvenly).toBe(true);
    });
});

describe('ChildQuantity', () => {
    it('multiplies the parent by the component quantity', () => {
        expect(ChildQuantity(3, 2)).toBe(6);
    });

    it('keeps four decimal places, matching the column', () => {
        // Half an hour of a service per bundle is a legitimate thing to sell; rounding to an integer
        // would quietly change what was bought.
        expect(ChildQuantity(3, 0.5)).toBe(1.5);
        expect(ChildQuantity(1, 0.3333)).toBe(0.3333);
    });

    it('is zero when either side is zero', () => {
        expect(ChildQuantity(0, 5)).toBe(0);
        expect(ChildQuantity(5, 0)).toBe(0);
    });
});

describe('PlanQuantityRipple', () => {
    const child = (over: Partial<Parameters<typeof PlanQuantityRipple>[1][number]> = {}) => ({
        ID: 'child-1',
        ComponentQuantity: 2,
        IsQuantityOverridden: false,
        CurrentQuantity: 2,
        ...over,
    });

    it('recomputes each child from the new parent quantity', () => {
        const changes = PlanQuantityRipple(3, [child()]);
        expect(changes).toEqual([{ OrderLineID: 'child-1', FromQuantity: 2, ToQuantity: 6 }]);
    });

    it('LEAVES AN OVERRIDDEN CHILD ALONE', () => {
        // Without this, bumping the bundle quantity silently overwrites a deliberate correction —
        // data loss that looks exactly like arithmetic, because it lands on the number the formula
        // says it should.
        const changes = PlanQuantityRipple(3, [child({ IsQuantityOverridden: true })]);
        expect(changes).toEqual([]);
    });

    it('writes nothing when the quantities already agree', () => {
        expect(PlanQuantityRipple(1, [child({ CurrentQuantity: 2 })])).toEqual([]);
    });

    it('touches only the children that change', () => {
        const changes = PlanQuantityRipple(2, [
            child({ ID: 'a', ComponentQuantity: 1, CurrentQuantity: 2 }), // already right
            child({ ID: 'b', ComponentQuantity: 3, CurrentQuantity: 3 }), // needs 6
            child({ ID: 'c', ComponentQuantity: 1, CurrentQuantity: 99, IsQuantityOverridden: true }),
        ]);
        expect(changes.map((c) => c.OrderLineID)).toEqual(['b']);
    });
});

describe('RollupTotal', () => {
    it('excludes rollup parents, which is what stops the order doubling', () => {
        const total = RollupTotal([
            { IsRollupParent: true, Amount: 100 }, // the bundle, customer-facing
            { IsRollupParent: false, Amount: 60 },
            { IsRollupParent: false, Amount: 40 },
        ]);
        expect(total).toBe(100);
    });

    it('is the plain sum when there are no parents', () => {
        expect(RollupTotal([{ IsRollupParent: false, Amount: 12.5 }])).toBe(12.5);
    });

    it('is zero for an order of nothing but parents', () => {
        expect(RollupTotal([{ IsRollupParent: true, Amount: 100 }])).toBe(0);
    });
});
