import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The order document page shows the order it is given, including one handed over after
 * construction (#832). The section shell passes a cached page its record with `setInput(...)`,
 * which runs `ngOnChanges` and not `ngOnInit`.
 */

const mockGetOrders = vi.fn();
const mockGetOrderLines = vi.fn();

vi.mock('../../data/orders-queries', () => ({
    GetOrders: (...args: unknown[]) => mockGetOrders(...args),
    GetOrderLines: (...args: unknown[]) => mockGetOrderLines(...args),
}));

import { MJOOrderDocumentPageComponent } from '../orders/order-document.page';

type Page = {
    OrderID: string | null;
    Order: { ID: string } | null;
    Lines: unknown[];
    ngOnInit(): Promise<void>;
    ngOnChanges(changes: Record<string, unknown>): Promise<void>;
};

/** The component over stubs; `Object.create` skips field initializers, so seed them. */
function page(): Page {
    const c = Object.create(MJOOrderDocumentPageComponent.prototype) as Page & Record<string, unknown>;
    c.OrderID = null;
    c.Order = null;
    c.Lines = [];
    c['loadToken'] = 0;
    c['cdr'] = { detectChanges: () => undefined };
    return c;
}

const change = (firstChange: boolean) => ({ OrderID: { firstChange } });

beforeEach(() => {
    mockGetOrders.mockReset();
    mockGetOrderLines.mockReset();
    mockGetOrderLines.mockResolvedValue([]);
});

describe('order document page loading (#832)', () => {
    it('reads the one order by id, not the whole table', async () => {
        mockGetOrders.mockResolvedValue([{ ID: 'o-1' }]);
        const p = page();
        p.OrderID = 'o-1';
        await p.ngOnInit();
        expect(mockGetOrders).toHaveBeenCalledWith({ OrderHeaderID: 'o-1' });
        expect(p.Order?.ID).toBe('o-1');
    });

    it('loads the new order when OrderID changes after construction', async () => {
        mockGetOrders.mockImplementation(async (o: { OrderHeaderID: string }) => [{ ID: o.OrderHeaderID }]);
        const p = page();
        p.OrderID = 'o-1';
        await p.ngOnInit();
        p.OrderID = 'o-2';
        await p.ngOnChanges(change(false));
        expect(p.Order?.ID).toBe('o-2');
    });

    it('leaves the first change to ngOnInit, so the order is not read twice', async () => {
        mockGetOrders.mockResolvedValue([{ ID: 'o-1' }]);
        const p = page();
        p.OrderID = 'o-1';
        await p.ngOnChanges(change(true));
        expect(mockGetOrders).not.toHaveBeenCalled();
    });

    it('keeps the newer order when an older load finishes last', async () => {
        let releaseFirst: (rows: unknown[]) => void = () => undefined;
        mockGetOrders
            .mockImplementationOnce(() => new Promise((r) => (releaseFirst = r)))
            .mockImplementationOnce(async () => [{ ID: 'o-2' }]);
        const p = page();
        p.OrderID = 'o-1';
        const first = p.ngOnInit();
        p.OrderID = 'o-2';
        await p.ngOnChanges(change(false));
        releaseFirst([{ ID: 'o-1' }]);
        await first;
        expect(p.Order?.ID).toBe('o-2');
    });

    it('clears the page when OrderID is cleared', async () => {
        mockGetOrders.mockResolvedValue([{ ID: 'o-1' }]);
        const p = page();
        p.OrderID = 'o-1';
        await p.ngOnInit();
        p.OrderID = null;
        await p.ngOnChanges(change(false));
        expect(p.Order).toBeNull();
        expect(p.Lines).toEqual([]);
    });
});
