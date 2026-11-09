/**
 * An approved Seats concession adds its seats to the term the line bought (#686).
 *
 * `ReadRows`, `RenewalAlreadyPlaced` and `ResizeTermGrants` are stubbed; the term is a fake entity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reads, renewal, resize } = vi.hoisted(() => ({
    reads: new Map<string, unknown[]>(),
    renewal: vi.fn(async () => null as string | null),
    resize: vi.fn(async () => ({ Resized: 1 })),
}));

vi.mock('../TermExtension.js', () => ({
    ReadRows: async (_ctx: unknown, params: { EntityName: string }) => reads.get(params.EntityName) ?? [],
    RenewalAlreadyPlaced: renewal,
}));
vi.mock('../EntitlementEngine.js', () => ({ ResizeTermGrants: resize }));

const { ApplySeatAddition, CheckSeatAddition } = await import('../SeatAddition.js');

const LINE = '11111111-1111-1111-1111-111111111111';
const TERM = '22222222-2222-2222-2222-222222222222';
const SUB = '33333333-3333-3333-3333-333333333333';
const PRODUCT = '44444444-4444-4444-4444-444444444444';

function term(overrides: Record<string, unknown> = {}) {
    return { ID: TERM, SubscriptionID: SUB, TermNumber: 1, OrderLineID: LINE, Status: 'Active', Quantity: 10, ...overrides };
}

function ctx(saved: { Quantity?: number }, saves = true) {
    const entity = {
        Quantity: 10,
        Load: vi.fn(async () => true),
        Save: vi.fn(async function (this: { Quantity: number }) {
            saved.Quantity = this.Quantity;
            return saves;
        }),
        LatestResult: { CompleteMessage: 'refused' },
    };
    return { Provider: { GetEntityObject: vi.fn(async () => entity) }, User: {} } as never;
}

beforeEach(() => {
    reads.clear();
    renewal.mockReset();
    renewal.mockResolvedValue(null);
    resize.mockClear();
    reads.set('MJ_BizApps_Orders: Subscriptions', [{ ProductID: PRODUCT }]);
});

describe('ApplySeatAddition', () => {
    it("raises the term's seats and resizes its grants to the new count", async () => {
        reads.set('MJ_BizApps_Orders: Subscription Terms', [term()]);
        const saved: { Quantity?: number } = {};
        const seats = await ApplySeatAddition({ OrderLineID: LINE, AddedQuantity: 3 }, ctx(saved));
        expect(seats).toBe(13);
        expect(saved.Quantity).toBe(13);
        expect(resize).toHaveBeenCalledWith(TERM, PRODUCT, 13, expect.anything(), expect.anything());
    });

    it('does nothing when the line has no term yet; confirm counts the seats', async () => {
        const saved: { Quantity?: number } = {};
        expect(await ApplySeatAddition({ OrderLineID: LINE, AddedQuantity: 3 }, ctx(saved))).toBeNull();
        expect(saved.Quantity).toBeUndefined();
        expect(resize).not.toHaveBeenCalled();
    });

    it('refuses a fractional number of seats', async () => {
        reads.set('MJ_BizApps_Orders: Subscription Terms', [term()]);
        await expect(ApplySeatAddition({ OrderLineID: LINE, AddedQuantity: 1.5 }, ctx({}))).rejects.toThrow(/whole/);
    });

    it('fails the approval when the term cannot be saved', async () => {
        reads.set('MJ_BizApps_Orders: Subscription Terms', [term()]);
        await expect(ApplySeatAddition({ OrderLineID: LINE, AddedQuantity: 2 }, ctx({}, false))).rejects.toThrow(/refused/);
        expect(resize).not.toHaveBeenCalled();
    });
});

describe('CheckSeatAddition', () => {
    it('allows a line with no term', async () => {
        expect(await CheckSeatAddition({ OrderLineID: LINE, AddedQuantity: 1 }, ctx({}))).toBeNull();
    });

    it('refuses a term that is not Scheduled or Active', async () => {
        reads.set('MJ_BizApps_Orders: Subscription Terms', [term({ Status: 'Canceled' })]);
        expect(await CheckSeatAddition({ OrderLineID: LINE, AddedQuantity: 1 }, ctx({}))).toMatch(/Canceled/);
    });

    it('refuses once the renewal is placed, since it was priced from the old count', async () => {
        reads.set('MJ_BizApps_Orders: Subscription Terms', [term()]);
        renewal.mockResolvedValue('renewal already placed');
        expect(await CheckSeatAddition({ OrderLineID: LINE, AddedQuantity: 1 }, ctx({}))).toBe('renewal already placed');
    });
});
