// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    OrdersEngine,
    type mjBizAppsOrdersEventProductEntity,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

/**
 * Raising quantity on a line of an event that requires attendee information splits it into one
 * quantity-1 line per seat (orders #615), because confirm refuses that event at any other shape.
 */

const GALA = 'b1b2c3d4-0000-4000-8000-000000000001';
const MUG = 'b1b2c3d4-0000-4000-8000-000000000002';

function editor(order: { SplitLineIntoSeats: ReturnType<typeof vi.fn> }) {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    const calls = { pricing: 0, applicable: 0 };
    Object.assign(c as object, {
        EditMode: true,
        _order: order,
        Catalog: [
            { ID: GALA, Name: 'Annual Gala', MaxQuantityPerLine: null },
            { ID: MUG, Name: 'Mug', MaxQuantityPerLine: null },
        ],
        SeatSplitNotice: null,
        expandedLineIds: new Set<string>(),
        stagedDiscounts: new Map(),
        discountDrafts: new Map(),
        cdr: { detectChanges: () => undefined },
        schedulePricing: () => calls.pricing++,
        refreshApplicable: async () => void calls.applicable++,
        refreshAllApplicable: async () => void calls.applicable++,
    });
    return { c, calls };
}

function line(productID: string, quantity: number) {
    return { ID: 'L1', ProductID: productID, Quantity: quantity } as unknown as mjBizAppsOrdersOrderLineEntity;
}

afterEach(() => vi.restoreAllMocks());

describe('seat split on quantity change', () => {
    it('splits an attendee-required event line and opens every seat', async () => {
        vi.spyOn(OrdersEngine.Instance, 'EventProductByID').mockImplementation((id) =>
            id === GALA ? ({ RequiresAttendeeInfo: true } as mjBizAppsOrdersEventProductEntity) : undefined,
        );
        const order = { SplitLineIntoSeats: vi.fn(async () => [{ ID: 'L2' }, { ID: 'L3' }]) };
        const { c, calls } = editor(order);
        const gala = line(GALA, 2);

        c.Bump(gala, 1);
        await vi.waitFor(() => expect(c.SeatSplitNotice).not.toBeNull());

        expect(order.SplitLineIntoSeats).toHaveBeenCalledWith(gala);
        expect(c.SeatSplitNotice).toContain('Annual Gala needs an attendee per seat, so it is now 3 lines');
        expect(c.SeatSplitNotice).not.toContain('discount');
        for (const id of ['L1', 'L2', 'L3']) {
            expect(c.IsExtensionOpen({ ID: id } as mjBizAppsOrdersOrderLineEntity)).toBe(true);
        }
        expect(calls.pricing).toBe(1);
    });

    it('notes a staged discount stayed on the first line', async () => {
        vi.spyOn(OrdersEngine.Instance, 'EventProductByID').mockReturnValue({
            RequiresAttendeeInfo: true,
        } as mjBizAppsOrdersEventProductEntity);
        const order = { SplitLineIntoSeats: vi.fn(async () => [{ ID: 'L2' }]) };
        const { c } = editor(order);
        (c as unknown as { discountDrafts: Map<string, unknown> }).discountDrafts.set('L1', {});

        c.Bump(line(GALA, 1), 1);
        await vi.waitFor(() => expect(c.SeatSplitNotice).toMatch(/The discount stayed on the first line\.$/));
    });

    it('only reprices a line that needs no split', () => {
        vi.spyOn(OrdersEngine.Instance, 'EventProductByID').mockReturnValue(undefined);
        const order = { SplitLineIntoSeats: vi.fn() };
        const { c, calls } = editor(order);

        c.Bump(line(MUG, 1), 2);

        expect(order.SplitLineIntoSeats).not.toHaveBeenCalled();
        expect(c.SeatSplitNotice).toBeNull();
        expect(calls.pricing).toBe(1);
        expect(calls.applicable).toBe(1);
    });
});
