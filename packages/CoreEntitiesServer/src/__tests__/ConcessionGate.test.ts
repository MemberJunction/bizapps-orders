/**
 * The confirm gate re-prices every line with a stated price (golive #222). It used to read only lines
 * flagged `PriceOverridden`, which the order-lines editor sets — so a line priced through the API
 * without the flag gave away value no approval ever saw.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunView, mockStanding } = vi.hoisted(() => ({ mockRunView: vi.fn(), mockStanding: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return { ...actual, ResolveLinePriceStanding: (...args: unknown[]) => mockStanding(...args) };
});

const { ApplyShareLimitMixTiers, AssessConcessionGate, FindUncoveredLinePrices, FindUnapprovedConcessions } = await import('../ConcessionGate.js');

const ORDER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const LINE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const provider = {} as never;
const user = { ID: 'user-1' } as never;

type Row = Record<string, unknown>;

/**
 * Answers each RunView by entity: concessions, sales authorities, manual discounts, mix tiers, products
 * and persisted lines.
 */
function database(concessions: Row[], lines: Row[], authorities: Row[] = [], adjustments: Row[] = [], mixTiers: Row[] = [], products: Row[] = []) {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
        Success: true,
        Results: params.EntityName.endsWith('Order Concessions')
            ? concessions
            : params.EntityName.endsWith('Sales Authorities')
              ? authorities
              : params.EntityName.endsWith('Order Adjustments')
                ? adjustments
                : params.EntityName.endsWith('Sales Authority Mix Tiers')
                  ? mixTiers
                  : params.EntityName.endsWith(': Products')
                    ? products
                    : lines,
    }));
}

/** An engine price of 100 for every line. */
const engineAt100 = { EngineUnitPrice: 100, IsEnginePrice: false, IsNamedListPick: false };

const apiLine = {
    ID: LINE_ID,
    LineNumber: 1,
    ParentOrderLineID: null as string | null,
    ReversesOrderLineID: null as string | null,
    ProductID: 'product-1',
    OrderHeaderID: ORDER_ID,
    Quantity: 2,
    UnitPrice: 60,
    ProductPriceID: null,
};

beforeEach(() => {
    mockRunView.mockReset();
    mockStanding.mockReset();
    mockStanding.mockResolvedValue(engineAt100);
});

describe('FindUnapprovedConcessions — line prices', () => {
    it('holds a persisted line priced below the engine without the PriceOverridden flag', async () => {
        database([], [apiLine]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/line 1 is priced at 60.00 .* worth 80.00 with no approved Price/)]);
        const lineQuery = mockRunView.mock.calls.find((c) => (c[0] as { EntityName: string }).EntityName.endsWith('Order Lines'));
        expect((lineQuery?.[0] as { ExtraFilter: string }).ExtraFilter).not.toMatch(/PriceOverridden/);
    });

    it('counts a DiscountPct on a line with no engine price, against its stated price (#905)', async () => {
        mockStanding.mockResolvedValue({ EngineUnitPrice: null, IsEnginePrice: false, IsNamedListPick: false });
        database([], [{ ...apiLine, UnitPrice: 1000, Quantity: 1, DiscountPct: 0.4 }]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/line 1 is discounted 40%, a concession worth 400.00/)]);
    });

    it('counts nothing on a line with no engine price and no discount', async () => {
        mockStanding.mockResolvedValue({ EngineUnitPrice: null, IsEnginePrice: false, IsNamedListPick: false });
        database([], [{ ...apiLine, UnitPrice: 1000, Quantity: 1, DiscountPct: 0 }]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('clears the line once an approved concession covers its value', async () => {
        database([{ Status: 'Approved', DeliveryForm: 'Price', ReasonCategory: 'Retention', ComputedValue: 80, OrderLineID: LINE_ID }], [apiLine]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('skips an unsaved line whose price the engine has yet to fill', async () => {
        database([], []);
        const blank = { ...apiLine, ID: null, UnitPrice: null, PriceStated: false };

        expect(await FindUnapprovedConcessions(ORDER_ID, [blank], true, provider, user)).toEqual([]);
        expect(mockStanding).not.toHaveBeenCalled();
    });

    it('tells the rep to save first when the order has no ID to record a concession against', async () => {
        const unsaved = { ...apiLine, ID: null, OrderHeaderID: null, PriceStated: true };

        const problems = await FindUnapprovedConcessions(null, [unsaved], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/Save the order without confirming it first/)]);
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('skips a bundle component, whose price is its share of the bundle price', async () => {
        // A bundle at 250 of A (100) and B (200) writes A at 83.33 and B at 166.67.
        const bundleID = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
        const component = { ...apiLine, ParentOrderLineID: bundleID, UnitPrice: 83.33, Quantity: 1 };
        database([], [component]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        expect(await FindUnapprovedConcessions(ORDER_ID, [{ ...component, PriceStated: true }], true, provider, user)).toEqual([]);
        expect(mockStanding).not.toHaveBeenCalled();
    });

    it('skips a reversal, whose price is the line it unwinds', async () => {
        const origin = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
        const reversal = { ...apiLine, ReversesOrderLineID: origin, Quantity: -0.2493, UnitPrice: 900 };
        database([], [reversal]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        expect(await FindUnapprovedConcessions(ORDER_ID, [{ ...reversal, PriceStated: true }], true, provider, user)).toEqual([]);
        expect(mockStanding).not.toHaveBeenCalled();
    });

    it('leaves the engine price alone', async () => {
        database([], [apiLine]);
        mockStanding.mockResolvedValue({ EngineUnitPrice: 60, IsEnginePrice: true, IsNamedListPick: false });

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });
});

/**
 * A `DiscountPct` gives value away as surely as a lower price (golive #305). A deal's Discount %, the
 * API and an import all write it straight onto the line, so the gate counts it whoever set it.
 */
describe('FindUnapprovedConcessions — DiscountPct', () => {
    const atEngine = { EngineUnitPrice: 100, IsEnginePrice: true, IsNamedListPick: false };
    const discounted = { ...apiLine, UnitPrice: 100, DiscountPct: 0.1 };

    beforeEach(() => mockStanding.mockResolvedValue(atEngine));

    it('holds a line at its engine price that carries a discount', async () => {
        database([], [discounted]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
            expect.stringMatching(/line 1 is discounted 10%, a concession worth 20.00 with no approved Price/),
        ]);
    });

    it('asks for the discount on the persisted line it reads', async () => {
        database([], [discounted]);
        await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        const lineQuery = mockRunView.mock.calls.find((c) => (c[0] as { EntityName: string }).EntityName.endsWith('Order Lines'));
        expect((lineQuery?.[0] as { Fields: string[] }).Fields).toEqual(expect.arrayContaining(['DiscountPct', 'RenewsSubscriptionID']));
    });

    it('clears the line once an approved Price concession covers the discount', async () => {
        database([{ Status: 'Approved', DeliveryForm: 'Price', ReasonCategory: 'Other', ComputedValue: 20, OrderLineID: LINE_ID }], [discounted]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('is not cleared by a Pending concession', async () => {
        database([{ Status: 'Pending', DeliveryForm: 'Price', ReasonCategory: 'Other', ComputedValue: 20, OrderLineID: LINE_ID }], [discounted]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);
        expect(problems).toEqual([expect.stringMatching(/awaiting approval/), expect.stringMatching(/discounted 10%/)]);
    });

    it('counts the discount on a named list pick, which is not itself a concession', async () => {
        database([], [{ ...discounted, UnitPrice: 80 }]);
        mockStanding.mockResolvedValue({ EngineUnitPrice: 100, IsEnginePrice: false, IsNamedListPick: true });

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
            expect.stringMatching(/line 1 is discounted 10%, a concession worth 16.00/),
        ]);
    });

    it('adds a discount on a below-engine price to the price concession, so one approval covers both', async () => {
        database([], [{ ...discounted, UnitPrice: 60 }]);
        mockStanding.mockResolvedValue(engineAt100);

        // (100 - 60) x 2 = 80 by price, plus 60 x 2 x 10% = 12 by discount.
        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
            expect.stringMatching(/priced at 60.00 against an engine price of 100.00 and discounted 10%, a concession worth 92.00/),
        ]);
    });

    it('values an unsaved line whose price the engine has yet to fill at the engine price', async () => {
        database([], []);
        const blank = { ...discounted, ID: null, UnitPrice: null, PriceStated: false };

        expect(await FindUnapprovedConcessions(null, [blank], true, provider, user)).toEqual([
            expect.stringMatching(/discounted 10%, a concession worth 20.00. Save the order/),
        ]);
    });

    it('leaves the discount a renewal carries forward from the line it renews', async () => {
        database([], [{ ...discounted, RenewsSubscriptionID: '3f2504e0-4f89-41d3-9a0c-0305e82c3305' }]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('still skips a reversal that carries its origin line\'s discount', async () => {
        const reversal = { ...discounted, ReversesOrderLineID: '3f2504e0-4f89-41d3-9a0c-0305e82c3304', Quantity: -1 };
        database([], [reversal]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        expect(mockStanding).not.toHaveBeenCalled();
    });
});

/**
 * A giveaway is the list price with a 100% discount (golive #328). A line charged nothing once its
 * concession is taken off is Scope, worth list price times quantity; a manual discount above the rep's
 * authority is saved held and counted until an approved concession covers it.
 */
describe('FindUnapprovedConcessions — giveaways and held discounts (golive #328)', () => {
    const atEngine = { EngineUnitPrice: 100, IsEnginePrice: true, IsNamedListPick: false };
    const listLine = { ...apiLine, UnitPrice: 100 };
    const heldRow = (amount: number) => ({ OrderLineID: LINE_ID, Amount: amount });

    beforeEach(() => mockStanding.mockResolvedValue(atEngine));

    it('classes a line kept at list price with a 100% discount as Scope, worth list times quantity', async () => {
        database([], [{ ...listLine, DiscountPct: 1 }]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
            expect.stringMatching(/line 1 is discounted 100%, a concession worth 200\.00 with no approved Scope concession/),
        ]);
    });

    it('keeps a typed price of zero as Scope', async () => {
        database([], [{ ...apiLine, UnitPrice: 0 }]);
        mockStanding.mockResolvedValue(engineAt100);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
            expect.stringMatching(/priced at 0\.00 .* worth 200\.00 with no approved Scope concession/),
        ]);
    });

    it('holds a line carrying a held manual discount', async () => {
        database([], [listLine], [], [heldRow(50)]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
            expect.stringMatching(/line 1 is given a manual discount of 50\.00 that needs approval, a concession worth 50\.00 with no approved Price/),
        ]);
        const adjustmentQuery = mockRunView.mock.calls.find((c) => (c[0] as { EntityName: string }).EntityName.endsWith('Order Adjustments'));
        expect((adjustmentQuery?.[0] as { ExtraFilter: string }).ExtraFilter).toMatch(
            /PromotionID IS NULL AND AuthorizedBySalesAuthorityID IS NULL AND ApprovedByUserID IS NULL/,
        );
    });

    it('classes a held discount of the whole line as Scope, and clears it once a Scope concession is approved', async () => {
        database([], [listLine], [], [heldRow(200)]);
        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
            expect.stringMatching(/worth 200\.00 with no approved Scope concession/),
        ]);

        database([{ Status: 'Approved', DeliveryForm: 'Scope', ReasonCategory: 'Other', ComputedValue: 200, OrderLineID: LINE_ID }], [listLine], [], [heldRow(200)]);
        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('holds a held discount on a line with no engine price', async () => {
        database([], [{ ...apiLine, UnitPrice: 500, Quantity: 1 }], [], [heldRow(500)]);
        mockStanding.mockResolvedValue({ EngineUnitPrice: null, IsEnginePrice: false, IsNamedListPick: false });

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
            expect.stringMatching(/manual discount of 500\.00 that needs approval, a concession worth 500\.00 with no approved Scope/),
        ]);
    });

    it('counts the held discount on a line the caller holds', async () => {
        database([], [], [], [heldRow(50)]);

        expect(await FindUnapprovedConcessions(ORDER_ID, [{ ...listLine, PriceStated: true }], true, provider, user)).toHaveLength(1);
    });

    // A renewal line kept at the renewal pass's price is not a stated price, and the discount it
    // carries forward is not counted, so a held discount is the only thing that makes it a candidate.
    it('holds a renewal line at its renewal price that carries a held manual discount', async () => {
        database([], [], [], [heldRow(50)]);
        const renewal = {
            ...listLine,
            DiscountPct: 0,
            RenewsSubscriptionID: '3f2504e0-4f89-41d3-9a0c-0305e82c3305',
            PriceStated: false,
        };

        expect(await FindUnapprovedConcessions(ORDER_ID, [renewal], true, provider, user)).toEqual([
            expect.stringMatching(/line 1 is given a manual discount of 50\.00 that needs approval, a concession worth 50\.00 with no approved Price/),
        ]);
    });
});

/**
 * A concession's share of the order is measured when it is recorded (#306). A draft that loses lines
 * afterwards gives away a larger share than the approval on the rep's own authority covered, so the
 * confirm gate measures the order again.
 */
describe('FindUnapprovedConcessions — share of the order', () => {
    const AUTHORITY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3310';
    const RULE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3311';
    const fivePercent = [{ ID: AUTHORITY_ID, MaxConcessionPctOfContract: 0.05 }];

    /** 600 of added seats, approved on the rep's own authority when the order was 12,000. */
    const onAuthority = {
        Status: 'Approved',
        DeliveryForm: 'Seats',
        ReasonCategory: 'Retention',
        ComputedValue: 600,
        OrderLineID: LINE_ID,
        AuthorizedBySalesAuthorityID: AUTHORITY_ID,
        SalesRuleID: null,
        CumulativeShare: 0.05 - 0.0001,
    };
    const lineAt = (net: number) => ({ ...apiLine, UnitPrice: net, Quantity: 1, LineTotalNet: net });

    beforeEach(() => mockStanding.mockResolvedValue({ EngineUnitPrice: 0, IsEnginePrice: true, IsNamedListPick: false }));

    it('holds the confirm once the order has shrunk and the share reaches the limit', async () => {
        database([onAuthority], [lineAt(8000)], fivePercent);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([
            expect.stringMatching(/7\.5% of its catalog total, at or above the 5\.0% limit \(600\.00 on a catalog total of 8000\.00\).*Withdraw them and record them again/),
        ]);
    });

    it('passes while the share stays under the limit', async () => {
        database([onAuthority], [lineAt(20000)], fivePercent);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('measures the lines the caller holds instead of their persisted copies', async () => {
        database([onAuthority], [lineAt(20000)], fivePercent);

        const held = { ...lineAt(8000), PriceStated: true };
        expect(await FindUnapprovedConcessions(ORDER_ID, [held], true, provider, user)).toHaveLength(1);
    });

    it('leaves reversal lines out of the net total', async () => {
        const reversal = { ...lineAt(-12000), ID: '3f2504e0-4f89-41d3-9a0c-0305e82c3312', Quantity: -1, ReversesOrderLineID: LINE_ID };
        database([onAuthority], [lineAt(20000), reversal], fivePercent);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('is not covered by an approver who decided another concession at a higher share', async () => {
        // A 20% limit. At a net total of 10,000 an approver decides 5,000 (50%). The order grows to
        // 100,000 and 3,500 more is approved on the rep's own authority (8.5%). It shrinks to 20,000:
        // 8,500 is 42.5%, which no approver saw on this order as it is now.
        const decided = { ...onAuthority, ComputedValue: 5000, AuthorizedBySalesAuthorityID: null, SalesRuleID: RULE_ID, CumulativeShare: 0.5 };
        const grown = { ...onAuthority, ComputedValue: 3500, CumulativeShare: 0.085 };
        database([decided, grown], [lineAt(20000)], [{ ID: AUTHORITY_ID, MaxConcessionPctOfContract: 0.2 }]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([
            expect.stringMatching(/42\.5% of its catalog total, at or above the 20\.0% limit \(8500\.00 on a catalog total of 20000\.00\).*Withdraw them and record them again/),
        ]);
    });

    it('does not measure an order whose concessions were all decided by an approver', async () => {
        const decided = { ...onAuthority, AuthorizedBySalesAuthorityID: null, SalesRuleID: RULE_ID };
        database([decided], [lineAt(100)], fivePercent);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        expect(mockRunView.mock.calls.some((c) => (c[0] as { EntityName: string }).EntityName.endsWith('Sales Authorities'))).toBe(false);
    });

    /**
     * golive #494: the share is of the order at its catalog prices. Divided by the total after the
     * discount, a 10% discount read as 11.1% and broke a 10.01% limit.
     */
    describe('measured against the catalog total', () => {
        const tenPointZeroOne = [{ ID: AUTHORITY_ID, MaxConcessionPctOfContract: 0.1001 }];
        const priceOnAuthority = (value: number) => ({ ...onAuthority, DeliveryForm: 'Price', ComputedValue: value });

        it('counts a 10% discount as 10% of the order', async () => {
            mockStanding.mockResolvedValue({ EngineUnitPrice: 1000, IsEnginePrice: true, IsNamedListPick: false });
            database([priceOnAuthority(1000)], [{ ...apiLine, UnitPrice: 1000, Quantity: 10, DiscountPct: 0.1, LineTotalNet: 9000 }], tenPointZeroOne);

            expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        });

        it('counts a price below the catalog price against the catalog price', async () => {
            // 90 against a catalog price of 100 on ten units: 100 given away, 10% of 1,000.
            mockStanding.mockResolvedValue({ EngineUnitPrice: 100, IsEnginePrice: false, IsNamedListPick: false });
            database([priceOnAuthority(100)], [{ ...apiLine, UnitPrice: 90, Quantity: 10, LineTotalNet: 900 }], tenPointZeroOne);

            expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        });

        it('still holds a share above the limit, naming the catalog total', async () => {
            mockStanding.mockResolvedValue({ EngineUnitPrice: 1000, IsEnginePrice: true, IsNamedListPick: false });
            database([priceOnAuthority(1200)], [{ ...apiLine, UnitPrice: 1000, Quantity: 10, DiscountPct: 0.12, LineTotalNet: 8800 }], tenPointZeroOne);

            expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
                expect.stringMatching(/12\.0% of its catalog total, at or above the 10\.0% limit \(1200\.00 on a catalog total of 10000\.00\)/),
            ]);
        });

        it("leaves a bundle's components out and values the bundle line at its own price", async () => {
            mockStanding.mockResolvedValue({ EngineUnitPrice: 1000, IsEnginePrice: true, IsNamedListPick: false });
            const component = { ...apiLine, ID: '3f2504e0-4f89-41d3-9a0c-0305e82c3313', ParentOrderLineID: LINE_ID, UnitPrice: 500, Quantity: 2, LineTotalNet: 1000 };
            database([priceOnAuthority(100)], [{ ...apiLine, UnitPrice: 1000, Quantity: 1, DiscountPct: 0.1, LineTotalNet: 0 }, component], tenPointZeroOne);

            expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        });
    });

    it('does not measure a confirmed order', async () => {
        database([onAuthority], [lineAt(100)], fivePercent);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], false, provider, user)).toEqual([]);
    });

    describe('mix tiers (golive #281)', () => {
        const TYPE_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3320';
        const TYPE_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3321';
        const PRODUCT_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3322';
        const PRODUCT_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3323';
        const SECOND_LINE = '3f2504e0-4f89-41d3-9a0c-0305e82c3324';
        const tenPercentWithTwoTypes = [{ SalesAuthorityID: AUTHORITY_ID, MinProductTypes: 2, MaxConcessionPctOfContract: 0.1 }];
        const products = [{ ProductTypeID: TYPE_A }, { ProductTypeID: TYPE_B }];
        /** 600 approved on authority; the order is 8,000 (7.5%), over the 5% base limit, under the 10% tier. */
        const lineA = { ...lineAt(4000), ProductID: PRODUCT_A };
        const lineB = { ...lineAt(4000), ID: SECOND_LINE, ProductID: PRODUCT_B };

        it('passes when the order still spans the product types its tier needs', async () => {
            database([onAuthority], [lineA, lineB], fivePercent, [], tenPercentWithTwoTypes, products);

            expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        });

        it('holds the confirm once a product type is removed and the order falls back to the base limit', async () => {
            database([onAuthority], [{ ...lineA, LineTotalNet: 8000, UnitPrice: 8000 }], fivePercent, [], tenPercentWithTwoTypes, [products[0]]);

            const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

            expect(problems).toEqual([expect.stringMatching(/7\.5% of its catalog total, at or above the 5\.0% limit.*Withdraw them and record them again/)]);
        });

        it('does not count a bundle component as a product type', async () => {
            const component = { ...lineB, ParentOrderLineID: LINE_ID, LineTotalNet: 0 };
            database([onAuthority], [{ ...lineA, LineTotalNet: 8000, UnitPrice: 8000 }, component], fivePercent, [], tenPercentWithTwoTypes, [products[0]]);

            expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toHaveLength(1);
            const productQuery = mockRunView.mock.calls.find((c) => (c[0] as { EntityName: string }).EntityName.endsWith(': Products'));
            expect((productQuery?.[0] as { ExtraFilter: string }).ExtraFilter).not.toContain(PRODUCT_B);
        });

        it('keeps the base limit for an authority with no mix tiers, however many product types', async () => {
            database([onAuthority], [lineA, lineB], fivePercent, [], [], products);

            expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([
                expect.stringMatching(/7\.5% of its catalog total, at or above the 5\.0% limit/),
            ]);
        });
    });
});

describe('FindUnapprovedConcessions — products that always need approval (golive #281)', () => {
    const PRODUCT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3310';
    const CATEGORY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3311';
    const PARENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3312';
    const TYPE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3313';
    /** A line at its stated price with no engine price: nothing for the price check to compare against. */
    const servicesLine = { ...apiLine, ProductID: PRODUCT_ID, UnitPrice: 500, Quantity: 1 };

    function catalog(opts: {
        concessions?: Row[];
        lines?: Row[];
        product?: boolean | null;
        category?: boolean | null;
        parent?: boolean | null;
        type?: boolean | null;
    }) {
        mockRunView.mockImplementation(async (params: { EntityName: string }) => {
            const name = params.EntityName;
            const results = name.endsWith('Order Concessions')
                ? opts.concessions ?? []
                : name.endsWith('Order Adjustments')
                  ? []
                  : name.endsWith('Product Categories')
                  ? [
                        { ID: CATEGORY_ID, ParentProductCategoryID: PARENT_ID, RequiresSaleApproval: opts.category ?? null },
                        { ID: PARENT_ID, ParentProductCategoryID: null, RequiresSaleApproval: opts.parent ?? null },
                    ]
                  : name.endsWith('Product Types')
                    ? [{ ID: TYPE_ID, RequiresSaleApproval: opts.type ?? null }]
                    : name.endsWith('Products')
                      ? [{ ID: PRODUCT_ID, ProductTypeID: TYPE_ID, ProductCategoryID: CATEGORY_ID, RequiresSaleApproval: opts.product ?? null }]
                      : opts.lines ?? [servicesLine];
            return { Success: true, Results: results };
        });
        mockStanding.mockResolvedValue({ EngineUnitPrice: null, IsEnginePrice: false, IsNamedListPick: false });
    }

    it('holds a line whose product type requires approval, with no engine price to compare against', async () => {
        catalog({ type: true });
        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);
        expect(problems).toEqual([
            'line 1 is for a product that always needs approval, and no Price or Scope concession approved by the ' +
                'ConcessionLimit approver is recorded for it',
        ]);
    });

    it('takes the nearest stated level: a category opting out wins over its parent and the type', async () => {
        catalog({ category: false, parent: true, type: true });
        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('is cleared only by an approved concession decided under the ConcessionLimit rule', async () => {
        const onAuthority = { Status: 'Approved', DeliveryForm: 'Price', ComputedValue: 0, OrderLineID: LINE_ID, AuthorizedBySalesAuthorityID: '3f2504e0-4f89-41d3-9a0c-0305e82c3314', SalesRuleID: null, ReasonCategory: 'Other' };
        catalog({ product: true, concessions: [onAuthority] });
        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toHaveLength(1);

        catalog({ product: true, concessions: [{ ...onAuthority, AuthorizedBySalesAuthorityID: null, SalesRuleID: 'rule-1' }] });
        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('leaves a renewal line alone', async () => {
        catalog({ product: true, lines: [{ ...servicesLine, RenewsSubscriptionID: 'sub-1' }] });
        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });

    it('tells the rep to save first when the line is not saved', async () => {
        catalog({ product: true, lines: [] });
        const unsaved = { ...servicesLine, ID: null, PriceStated: true };
        const problems = await FindUnapprovedConcessions(null, [unsaved], true, provider, user);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/always needs approval\. Save the order without confirming it first/);
    });

    it('does not check a confirmed order', async () => {
        catalog({ product: true });
        expect(await FindUnapprovedConcessions(ORDER_ID, [], false, provider, user)).toEqual([]);
    });
});

/** Recording a concession measures it against the share limit the order earns by its product mix. */
describe('ApplyShareLimitMixTiers (golive #281)', () => {
    const AUTHORITY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3330';
    const PRODUCT_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3331';
    const PRODUCT_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3332';
    const authority = { ID: AUTHORITY_ID, MaxDiscountPct: null, MaxConcessionValue: 5000, MaxTermExtensionDays: null, MaxConcessionPctOfContract: 0.05 };
    const tiers = [
        { SalesAuthorityID: AUTHORITY_ID, MinProductTypes: 2, MaxConcessionPctOfContract: 0.1 },
        { SalesAuthorityID: AUTHORITY_ID, MinProductTypes: 3, MaxConcessionPctOfContract: 0.15 },
    ];
    const lines = [
        { ...apiLine, ProductID: PRODUCT_A },
        { ...apiLine, ID: '3f2504e0-4f89-41d3-9a0c-0305e82c3333', ProductID: PRODUCT_B },
    ];

    it('raises the limit to the tier the order meets', async () => {
        database([], lines, [], [], tiers, [{ ProductTypeID: 'type-a' }, { ProductTypeID: 'type-b' }]);

        expect((await ApplyShareLimitMixTiers(authority, ORDER_ID, provider, user))?.MaxConcessionPctOfContract).toBe(0.1);
    });

    it('counts two products of one type once', async () => {
        database([], lines, [], [], tiers, [{ ProductTypeID: 'type-a' }, { ProductTypeID: 'TYPE-A' }]);

        expect((await ApplyShareLimitMixTiers(authority, ORDER_ID, provider, user))?.MaxConcessionPctOfContract).toBe(0.05);
    });

    it('reads nothing for an authority with no share limit', async () => {
        database([], lines, [], [], tiers);

        expect(await ApplyShareLimitMixTiers({ ...authority, MaxConcessionPctOfContract: null }, ORDER_ID, provider, user)).toMatchObject({
            MaxConcessionPctOfContract: null,
        });
        expect(mockRunView).not.toHaveBeenCalled();
    });
});

describe('the order judged as a whole on price (golive #499)', () => {
    const UPSELL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3311';
    const PLAN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3312';
    // An upgrade split across two lines: the upsell lists at 3000, the existing plan at 8000.
    const upsell = { ...apiLine, ID: UPSELL_ID, LineNumber: 1, ProductID: 'upsell', Quantity: 1, UnitPrice: 5012 };
    const plan = { ...apiLine, ID: PLAN_ID, LineNumber: 2, ProductID: 'plan', Quantity: 1, UnitPrice: 5988 };
    const engineFor = (prices: Record<string, number>) => (line?: { ProductID: string }) =>
        Promise.resolve({ EngineUnitPrice: prices[line?.ProductID ?? ""], IsEnginePrice: false, IsNamedListPick: false });

    beforeEach(() => mockStanding.mockImplementation(engineFor({ upsell: 3000, plan: 8000 })));

    it('lets a line below its engine price through when another line above its own makes up for it, and says so', async () => {
        database([], [upsell, plan]);

        const report = await AssessConcessionGate(ORDER_ID, [], true, provider, user);

        expect(report.Problems).toEqual([]);
        expect(report.Notes).toEqual([
            'line 2 is priced 2012.00 below its engine price, made up for by line 1, priced 2012.00 above its own, so the order as a whole gives nothing away by price',
        ]);
    });

    it('reports the line as before when the lines above their engine price fall short', async () => {
        database([], [{ ...upsell, UnitPrice: 4000 }, plan]);

        const report = await AssessConcessionGate(ORDER_ID, [], true, provider, user);

        expect(report.Problems).toEqual([expect.stringMatching(/line 2 is priced at 5988.00 against an engine price of 8000.00, a concession worth 2012.00/)]);
        expect(report.Notes).toEqual([]);
    });

    it('still counts a DiscountPct on the line whose price is made up for', async () => {
        database([], [upsell, { ...plan, DiscountPct: 0.1 }]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/^line 2 is discounted 10%, a concession worth 598.80 with no approved Price/)]);
    });

    it('takes a premium line\'s own discount off what it makes up for', async () => {
        // 5012 less 70% is 1503.60, below its list of 3000, so it makes up for none of the 2012.00.
        database([], [{ ...upsell, DiscountPct: 0.7 }, plan]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems.some((p) => /line 2 is priced at 5988.00/.test(p))).toBe(true);
    });

    it('never nets a product given away', async () => {
        database([], [upsell, { ...plan, UnitPrice: 0 }]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/line 2 is priced at 0.00 .* with no approved Scope concession/)]);
    });

    it('raises no booking exception for a line made up for', async () => {
        database([], [upsell, plan]);

        expect(await FindUncoveredLinePrices(ORDER_ID, [], provider, user)).toEqual([]);
    });

    it('names every line on each side', async () => {
        const third = { ...plan, ID: '3f2504e0-4f89-41d3-9a0c-0305e82c3313', LineNumber: 3, UnitPrice: 7000 };
        database([], [{ ...upsell, UnitPrice: 6012 }, plan, third]);

        const report = await AssessConcessionGate(ORDER_ID, [], true, provider, user);

        expect(report.Problems).toEqual([]);
        expect(report.Notes[0]).toMatch(/^lines 2 and 3 are priced 3012.00 below their engine prices, made up for by line 1, priced 3012.00/);
    });

    it("takes a premium line's held manual discount off what it makes up for", async () => {
        // 5012 less a held 3500 is 1512, below its list of 3000, so it makes up for none of the 2012.
        database([], [upsell, plan], [], [{ OrderLineID: UPSELL_ID, Amount: 3500 }]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems.some((p) => /line 2 is priced at 5988.00/.test(p))).toBe(true);
    });

    it('counts no premium for a named list pick', async () => {
        mockStanding.mockImplementation((line?: { ProductID: string }) =>
            Promise.resolve(
                line?.ProductID === 'upsell'
                    ? { EngineUnitPrice: 3000, IsEnginePrice: false, IsNamedListPick: true }
                    : { EngineUnitPrice: 8000, IsEnginePrice: false, IsNamedListPick: false },
            ),
        );
        database([], [upsell, plan]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/line 2 is priced at 5988.00/)]);
    });

    it('counts no premium for a product sold at a negotiated price, which lists at 0', async () => {
        // Its price is the sale, not a premium: the 7000 off line 2 is still given away.
        mockStanding.mockImplementation(engineFor({ upsell: 0, plan: 8000 }));
        database([], [{ ...upsell, UnitPrice: 20000 }, { ...plan, UnitPrice: 1000 }]);

        const report = await AssessConcessionGate(ORDER_ID, [], true, provider, user);

        expect(report.Problems).toEqual([expect.stringMatching(/line 2 is priced at 1000.00 against an engine price of 8000.00, a concession worth 7000.00/)]);
        expect(report.Notes).toEqual([]);
        expect(await FindUncoveredLinePrices(ORDER_ID, [], provider, user)).toHaveLength(1);
    });

    it('counts no premium for a line nothing resolves an engine price for', async () => {
        mockStanding.mockImplementation((line?: { ProductID: string }) =>
            Promise.resolve({ EngineUnitPrice: line?.ProductID === 'upsell' ? null : 8000, IsEnginePrice: false, IsNamedListPick: false }),
        );
        database([], [upsell, plan]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/line 2 is priced at 5988.00/)]);
    });

    it('never nets a product given away, even when the premiums would cover it', async () => {
        database([], [{ ...upsell, UnitPrice: 12000 }, { ...plan, UnitPrice: 0 }]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/line 2 is priced at 0.00 .* with no approved Scope concession/)]);
    });

    it('does not net a line an approver refused a Price concession for', async () => {
        const refused = { Status: 'Rejected', DeliveryForm: 'Price', ReasonCategory: 'Retention', ComputedValue: 2012, OrderLineID: PLAN_ID, AuthorizedBySalesAuthorityID: null, SalesRuleID: null };
        database([refused], [upsell, plan]);

        const report = await AssessConcessionGate(ORDER_ID, [], true, provider, user);

        expect(report.Problems).toEqual([expect.stringMatching(/line 2 is priced at 5988.00 .* with no approved Price concession/)]);
        expect(report.Notes).toEqual([]);
    });

    it('tells the rep to withdraw a pending Price concession the netted line no longer needs', async () => {
        const pending = { Status: 'Pending', DeliveryForm: 'Price', ReasonCategory: 'Retention', ComputedValue: 2012, OrderLineID: PLAN_ID, AuthorizedBySalesAuthorityID: null, SalesRuleID: null };
        database([pending], [upsell, plan]);

        const report = await AssessConcessionGate(ORDER_ID, [], true, provider, user);

        expect(report.Problems).toEqual([expect.stringMatching(/awaiting approval/)]);
        expect(report.Notes[0]).toMatch(/; the Price concession awaiting approval on line 2 is no longer needed, so withdraw it to confirm$/);
    });

    it('measures the share against the netted line at its stated price', async () => {
        // 1200 of seats on the rep's own authority. The customer pays 11000: 10.9%, over a 10% limit.
        // Counting line 2 at its engine price would make it 1200 on 13012, 9.2%, and let it through.
        const AUTHORITY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3320';
        const seats = { Status: 'Approved', DeliveryForm: 'Seats', ReasonCategory: 'Retention', ComputedValue: 1200, OrderLineID: PLAN_ID, AuthorizedBySalesAuthorityID: AUTHORITY_ID, SalesRuleID: null };
        database([seats], [upsell, plan], [{ ID: AUTHORITY_ID, MaxConcessionPctOfContract: 0.1 }]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([expect.stringMatching(/10\.9% of its catalog total, at or above the 10\.0% limit \(1200\.00 on a catalog total of 11000\.00\)/)]);
    });
});
