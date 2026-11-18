import { beforeEach, describe, expect, it, vi } from 'vitest';

const runView = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => runView(...args);
        },
    };
});

import { GetOrders } from '../orders-queries';

beforeEach(() => {
    runView.mockReset();
    runView.mockResolvedValue({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 });
});

const filterOf = () => (runView.mock.calls[0]?.[0] as { ExtraFilter: string }).ExtraFilter;

describe('GetOrders presets', () => {
    it('returnable: booked orders that are not themselves returns (#835)', async () => {
        await GetOrders({ Preset: 'returnable', MaxRows: 10, User: {} as never });
        expect(filterOf()).toContain(`Status = 'Confirmed'`);
        expect(filterOf()).toContain('ReversesOrderHeaderID IS NULL');
        expect(filterOf()).toContain(`OrderType <> 'Return'`);
    });

    it('booked still includes return orders', async () => {
        await GetOrders({ Preset: 'booked', MaxRows: 10, User: {} as never });
        expect(filterOf()).toBe(`Status = 'Confirmed'`);
    });
});
