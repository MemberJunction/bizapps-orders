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

const { FindUnapprovedConcessions } = await import('../ConcessionGate.js');

const ORDER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const LINE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const provider = {} as never;
const user = { ID: 'user-1' } as never;

type Row = Record<string, unknown>;

/** Answers each RunView by entity: concessions, sales authorities and persisted lines. */
function database(concessions: Row[], lines: Row[], authorities: Row[] = []) {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
        Success: true,
        Results: params.EntityName.endsWith('Order Concessions')
            ? concessions
            : params.EntityName.endsWith('Sales Authorities')
              ? authorities
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
 * A concession's share of the order is measured when it is recorded (#306). A draft that loses lines
 * afterwards gives away a larger share than the approval on the rep's own authority covered, so the
 * confirm gate measures the order again.
 */
describe('FindUnapprovedConcessions — share of the order', () => {
    const AUTHORITY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3310';
    const RULE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3311';
    const fivePercent = [{ MaxConcessionPctOfContract: 0.05 }];

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
            expect.stringMatching(/7\.5% of its net total, at or above the 5\.0% limit \(600\.00 on a net total of 8000\.00\).*Withdraw them and record them again/),
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
        database([decided, grown], [lineAt(20000)], [{ MaxConcessionPctOfContract: 0.2 }]);

        const problems = await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user);

        expect(problems).toEqual([
            expect.stringMatching(/42\.5% of its net total, at or above the 20\.0% limit \(8500\.00 on a net total of 20000\.00\).*Withdraw them and record them again/),
        ]);
    });

    it('does not measure an order whose concessions were all decided by an approver', async () => {
        const decided = { ...onAuthority, AuthorizedBySalesAuthorityID: null, SalesRuleID: RULE_ID };
        database([decided], [lineAt(100)], fivePercent);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
        expect(mockRunView.mock.calls.some((c) => (c[0] as { EntityName: string }).EntityName.endsWith('Sales Authorities'))).toBe(false);
    });

    it('does not measure a confirmed order', async () => {
        database([onAuthority], [lineAt(100)], fivePercent);

        expect(await FindUnapprovedConcessions(ORDER_ID, [], false, provider, user)).toEqual([]);
    });
});
