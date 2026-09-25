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

/** Answers each RunView by entity: concessions and persisted lines. */
function database(concessions: Row[], lines: Row[]) {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
        Success: true,
        Results: params.EntityName.endsWith('Order Concessions') ? concessions : lines,
    }));
}

/** An engine price of 100 for every line. */
const engineAt100 = { EngineUnitPrice: 100, IsEnginePrice: false, IsNamedListPick: false };

const apiLine = {
    ID: LINE_ID,
    LineNumber: 1,
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

    it('leaves the engine price alone', async () => {
        database([], [apiLine]);
        mockStanding.mockResolvedValue({ EngineUnitPrice: 60, IsEnginePrice: true, IsNamedListPick: false });

        expect(await FindUnapprovedConcessions(ORDER_ID, [], true, provider, user)).toEqual([]);
    });
});
