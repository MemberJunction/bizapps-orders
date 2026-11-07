/**
 * A re-priced line's price breakdown replaces the one it carried, rather than adding to it (#794).
 *
 * A line the engine prices at zero is re-priced on every save; each save used to append another
 * full set of `OrderLinePriceComponent` rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

const { OrderEntityServer } = await import('../OrderEntityServer.js');

const LINE_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const LINE_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

type ReplacingOrder = { deleteSupersededPriceComponents(): Promise<void> };

function orderPricing(lineIDs: string[]) {
    const instance = Object.create(OrderEntityServer.prototype) as unknown as ReplacingOrder;
    const priced = new Map(lineIDs.map((ID) => [{ ID }, { Components: [] }]));
    Object.assign(instance, { _priceComponents: priced });
    Object.defineProperty(instance, 'ProviderToUse', { value: {}, writable: true });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: { ID: 'user-1' }, writable: true });
    return instance;
}

beforeEach(() => {
    mockRunView.mockReset();
});

describe('OrderEntityServer.deleteSupersededPriceComponents', () => {
    it('deletes every earlier component of the lines priced in this save, in one read', async () => {
        const rows = [1, 2, 3].map(() => ({ Delete: vi.fn().mockResolvedValue(true) }));
        mockRunView.mockResolvedValue({ Success: true, Results: rows });

        await orderPricing([LINE_A, LINE_B]).deleteSupersededPriceComponents();

        expect(mockRunView).toHaveBeenCalledTimes(1);
        const params = mockRunView.mock.calls[0][0] as { EntityName: string; ExtraFilter: string };
        expect(params.EntityName).toBe('MJ_BizApps_Orders: Order Line Price Components');
        expect(params.ExtraFilter).toContain(LINE_A);
        expect(params.ExtraFilter).toContain(LINE_B);
        for (const row of rows) expect(row.Delete).toHaveBeenCalledTimes(1);
    });

    it('issues no query when nothing was priced', async () => {
        await orderPricing([]).deleteSupersededPriceComponents();
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('throws when an earlier component will not delete', async () => {
        mockRunView.mockResolvedValue({
            Success: true,
            Results: [{ Delete: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'nope' }, ResultHistory: [], Validate: () => ({ Success: true, Errors: [] }) }],
        });
        await expect(orderPricing([LINE_A]).deleteSupersededPriceComponents()).rejects.toThrow(/price breakdown/);
    });
});
