/**
 * Confirming an order copies its addresses onto it (golive #263).
 *
 * `stampAddressSnapshots` runs inside the booking transaction. These tests drive it on the real
 * prototype with the Address read stubbed, and check what lands on the header and the lines.
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
const { ParseAddressSnapshot } = await import('@mj-biz-apps/orders-entities');

const BILL = '11111111-1111-4111-8111-111111111111';
const SHIP = '22222222-2222-4222-8222-222222222222';
const LINE_SHIP = '33333333-3333-4333-8333-333333333333';

const ROWS = [
    { ID: BILL, Line1: '1 Billing Way', Line2: null, Line3: null, City: 'Chicago', StateProvince: 'IL', PostalCode: '60601', Country: 'US' },
    { ID: SHIP, Line1: '2 Shipping Rd', Line2: null, Line3: null, City: 'Austin', StateProvince: 'TX', PostalCode: '73301', Country: 'US' },
    { ID: LINE_SHIP, Line1: '3 Venue Ave', Line2: null, Line3: null, City: 'Denver', StateProvince: 'CO', PostalCode: '80202', Country: 'US' },
];

interface FakeLine {
    LineNumber: number;
    ShipToAddressID: string | null;
    ShipToAddressSnapshot: string | null;
    GetFieldByName(name: string): { OldValue: string | null };
}

type SnapshotOrder = {
    stampAddressSnapshots(mode: 'confirm' | 'fill'): Promise<void>;
    inheritReversalAddresses(): Promise<void>;
    recordInheritedAddress(entity: unknown, snapshotField: string, addressID: string, snapshot: string | null): void;
    BillToAddressID: string | null;
    ShipToAddressID: string | null;
    ReversesOrderHeaderID: string | null;
    MoneyLocked: boolean;
    BillToAddressSnapshot: string | null;
    ShipToAddressSnapshot: string | null;
    addressSnapshotsStamped: boolean;
};

/** `stored` is what the row already holds, which BaseEntity reports as each field's OldValue. */
function orderWith(
    bill: string | null,
    ship: string | null,
    lines: FakeLine[],
    stored: { BillToAddressSnapshot?: string; ShipToAddressSnapshot?: string; BillToAddressID?: string; ShipToAddressID?: string } = {},
): SnapshotOrder {
    const instance = Object.create(OrderEntityServer.prototype) as SnapshotOrder;
    // The generated accessors read and write field state BaseEntity would own; plain properties
    // shadow them so the method under test sees ordinary values.
    for (const [name, value] of Object.entries({
        BillToAddressID: bill,
        ShipToAddressID: ship,
        BillToAddressSnapshot: stored.BillToAddressSnapshot ?? null,
        ShipToAddressSnapshot: stored.ShipToAddressSnapshot ?? null,
        OrderNumber: 'ORD-000200',
        ReversesOrderHeaderID: null,
        MoneyLocked: false,
        _inheritedAddresses: new Map(),
        GetFieldByName: (name: string) => ({ OldValue: stored[name as keyof typeof stored] ?? null }),
    })) {
        Object.defineProperty(instance, name, { value, writable: true });
    }
    Object.defineProperty(instance, 'Lines', { value: { Items: lines } });
    Object.defineProperty(instance, 'ProviderToUse', { value: {} });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: { ID: 'user-1' } });
    return instance;
}

const line = (n: number, ship: string | null, stored: string | null = null, storedShip: string | null = null): FakeLine => ({
    LineNumber: n,
    ShipToAddressID: ship,
    ShipToAddressSnapshot: stored,
    GetFieldByName: (name: string) => ({ OldValue: name === 'ShipToAddressID' ? storedShip : stored }),
});

const TAMPERED = '{"AddressID":"44444444-4444-4444-8444-444444444444","StateProvince":"DE"}';

beforeEach(() => {
    mockRunView.mockReset();
    mockRunView.mockResolvedValue({ Success: true, Results: ROWS });
});

describe('OrderEntityServer.stampAddressSnapshots — confirm', () => {
    it('copies the bill-to and ship-to rows onto the header', async () => {
        const order = orderWith(BILL, SHIP, []);

        await order.stampAddressSnapshots('confirm');

        expect(ParseAddressSnapshot(order.BillToAddressSnapshot)).toMatchObject({ AddressID: BILL, StateProvince: 'IL', PostalCode: '60601' });
        expect(ParseAddressSnapshot(order.ShipToAddressSnapshot)).toMatchObject({ AddressID: SHIP, StateProvince: 'TX', PostalCode: '73301' });
        expect(order.addressSnapshotsStamped).toBe(true);
    });

    it('gives a line a snapshot only when it names its own ship-to', async () => {
        const own = line(1, LINE_SHIP);
        const inherits = line(2, null);

        await orderWith(BILL, SHIP, [own, inherits]).stampAddressSnapshots('confirm');

        expect(ParseAddressSnapshot(own.ShipToAddressSnapshot)).toMatchObject({ AddressID: LINE_SHIP, StateProvince: 'CO' });
        expect(inherits.ShipToAddressSnapshot).toBeNull();
    });

    it('replaces whatever the caller sent', async () => {
        const order = orderWith(BILL, null, []);
        order.BillToAddressSnapshot = TAMPERED;

        await order.stampAddressSnapshots('confirm');

        expect(ParseAddressSnapshot(order.BillToAddressSnapshot)?.StateProvince).toBe('IL');
    });

    it('reads every address in one query, bypassing the cache', async () => {
        await orderWith(BILL, SHIP, [line(1, LINE_SHIP)]).stampAddressSnapshots('confirm');

        expect(mockRunView).toHaveBeenCalledTimes(1);
        const params = mockRunView.mock.calls[0][0] as { EntityName: string; ExtraFilter: string; BypassCache: boolean };
        expect(params.EntityName).toBe('MJ_BizApps_Common: Addresses');
        expect(params.BypassCache).toBe(true);
        for (const id of [BILL, SHIP, LINE_SHIP]) expect(params.ExtraFilter).toContain(id);
    });

    it('matches address IDs regardless of case', async () => {
        const order = orderWith(BILL.toUpperCase(), null, []);

        await order.stampAddressSnapshots('confirm');

        expect(ParseAddressSnapshot(order.BillToAddressSnapshot)?.City).toBe('Chicago');
    });

    it('issues no query and writes nulls when the order has no addresses', async () => {
        const order = orderWith(null, null, [line(1, null)]);

        await order.stampAddressSnapshots('confirm');

        expect(mockRunView).not.toHaveBeenCalled();
        expect(order.BillToAddressSnapshot).toBeNull();
        expect(order.ShipToAddressSnapshot).toBeNull();
    });

    it('refuses the save when an address row cannot be found', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [ROWS[0]] });

        await expect(orderWith(BILL, null, [line(3, LINE_SHIP)]).stampAddressSnapshots('confirm')).rejects.toThrow(
            /ORD-000200 cannot be saved: its line 3 ship-to address .* does not exist or is not visible to you/,
        );
    });

    it('refuses the save when the addresses cannot be read', async () => {
        mockRunView.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'timeout' });

        await expect(orderWith(BILL, null, []).stampAddressSnapshots('confirm')).rejects.toThrow(/timeout/);
    });
});

describe('OrderEntityServer.stampAddressSnapshots — fill, on a booked order', () => {
    const storedBill = () => JSON.stringify({ AddressID: BILL, Line1: 'old', Line2: null, Line3: null, City: 'Old Town', StateProvince: 'OH', PostalCode: '43004', Country: 'US' });

    it('keeps a stored snapshot and does not re-read its address', async () => {
        const order = orderWith(BILL, null, [], { BillToAddressSnapshot: storedBill() });

        await order.stampAddressSnapshots('fill');

        expect(mockRunView).not.toHaveBeenCalled();
        expect(ParseAddressSnapshot(order.BillToAddressSnapshot)?.StateProvince).toBe('OH');
    });

    it('puts a stored snapshot back when the caller sent another', async () => {
        const order = orderWith(BILL, null, [], { BillToAddressSnapshot: storedBill() });
        order.BillToAddressSnapshot = TAMPERED;

        await order.stampAddressSnapshots('fill');

        expect(ParseAddressSnapshot(order.BillToAddressSnapshot)?.StateProvince).toBe('OH');
    });

    it('snapshots an address filled after confirm, and one that never had a snapshot', async () => {
        const filledLine = line(1, LINE_SHIP);
        const order = orderWith(BILL, SHIP, [filledLine], { BillToAddressSnapshot: storedBill() });

        await order.stampAddressSnapshots('fill');

        const params = mockRunView.mock.calls[0][0] as { ExtraFilter: string };
        expect(params.ExtraFilter).not.toContain(BILL);
        expect(ParseAddressSnapshot(order.ShipToAddressSnapshot)?.StateProvince).toBe('TX');
        expect(ParseAddressSnapshot(filledLine.ShipToAddressSnapshot)?.StateProvince).toBe('CO');
    });

    // An address that was on the order before this save and has since lost its row: deleted
    // through the address editor before the backfill ran, or hidden from this user by RLS.
    it('leaves a stored address with no row unsnapshotted and lets the save go ahead', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [] });
        const inherited = line(1, LINE_SHIP, null, LINE_SHIP);
        const order = orderWith(BILL, null, [inherited], { BillToAddressID: BILL });

        await expect(order.stampAddressSnapshots('fill')).resolves.toBeUndefined();

        expect(order.BillToAddressSnapshot).toBeNull();
        expect(inherited.ShipToAddressSnapshot).toBeNull();
        expect(order.addressSnapshotsStamped).toBe(true);
    });

    it('still refuses an address filled on this save when its row cannot be found', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [] });

        await expect(orderWith(BILL, null, []).stampAddressSnapshots('fill')).rejects.toThrow(
            /bill-to address .* does not exist or is not visible to you/,
        );
        await expect(orderWith(SHIP, null, [], { BillToAddressID: BILL }).stampAddressSnapshots('fill')).rejects.toThrow(
            /bill-to address/,
        );
    });

    it('still refuses a stored address with no row on the confirm', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [] });

        await expect(orderWith(BILL, null, [], { BillToAddressID: BILL }).stampAddressSnapshots('confirm')).rejects.toThrow(
            /does not exist or is not visible to you/,
        );
    });
});

describe('OrderEntityServer — a reversal takes its addresses from the order it reverses', () => {
    const ORIGIN = '55555555-5555-4555-8555-555555555555';
    const soldBill = JSON.stringify({ AddressID: BILL, Line1: 'as sold', Line2: null, Line3: null, City: 'Columbus', StateProvince: 'OH', PostalCode: '43004', Country: 'US' });
    const soldLine = JSON.stringify({ AddressID: LINE_SHIP, Line1: 'venue as sold', Line2: null, Line3: null, City: 'Boise', StateProvince: 'ID', PostalCode: '83702', Country: 'US' });
    const originHeader = (over: Record<string, string | null> = {}) => ({
        BillToAddressID: BILL,
        ShipToAddressID: SHIP,
        BillToAddressSnapshot: soldBill,
        ShipToAddressSnapshot: null,
        ...over,
    });

    it('fills blank addresses from the origin, and confirm keeps the origin snapshot instead of re-reading the row', async () => {
        const order = orderWith(null, null, []);
        order.ReversesOrderHeaderID = ORIGIN;
        mockRunView.mockResolvedValueOnce({ Success: true, Results: [originHeader()] });

        await order.inheritReversalAddresses();
        expect(order.BillToAddressID).toBe(BILL);
        expect(order.ShipToAddressID).toBe(SHIP);

        mockRunView.mockResolvedValueOnce({ Success: true, Results: ROWS });
        await order.stampAddressSnapshots('confirm');

        // The bill-to came with a snapshot: the sale's, not the edited row's.
        expect(ParseAddressSnapshot(order.BillToAddressSnapshot)?.StateProvince).toBe('OH');
        // The origin had no ship-to snapshot, so that one is read from its row.
        expect(ParseAddressSnapshot(order.ShipToAddressSnapshot)?.StateProvince).toBe('TX');
        const read = mockRunView.mock.calls[1][0] as { ExtraFilter: string };
        expect(read.ExtraFilter).not.toContain(BILL);
        expect(read.ExtraFilter).toContain(SHIP);
    });

    it('keeps an address the reversal states itself', async () => {
        const order = orderWith(LINE_SHIP, null, []);
        order.ReversesOrderHeaderID = ORIGIN;
        mockRunView.mockResolvedValueOnce({ Success: true, Results: [originHeader()] });

        await order.inheritReversalAddresses();

        expect(order.BillToAddressID).toBe(LINE_SHIP);
        expect(order.ShipToAddressID).toBe(SHIP);
    });

    it('reads nothing for an order that reverses nothing, or one already booked', async () => {
        await orderWith(null, null, []).inheritReversalAddresses();
        const booked = orderWith(null, null, []);
        booked.ReversesOrderHeaderID = ORIGIN;
        booked.MoneyLocked = true;
        await booked.inheritReversalAddresses();

        expect(mockRunView).not.toHaveBeenCalled();
        expect(booked.BillToAddressID).toBeNull();
    });

    it('refuses when the origin order cannot be read', async () => {
        const order = orderWith(null, null, []);
        order.ReversesOrderHeaderID = ORIGIN;
        mockRunView.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'timeout' });

        await expect(order.inheritReversalAddresses()).rejects.toThrow(/order this one reverses: timeout/);
    });

    it("gives a reversal line its origin line's snapshot", async () => {
        const reversal = line(1, LINE_SHIP);
        const order = orderWith(null, null, [reversal]);
        order.recordInheritedAddress(reversal, 'ShipToAddressSnapshot', LINE_SHIP, soldLine);

        await order.stampAddressSnapshots('confirm');

        expect(mockRunView).not.toHaveBeenCalled();
        expect(ParseAddressSnapshot(reversal.ShipToAddressSnapshot)?.StateProvince).toBe('ID');
    });

    it('reads the row when the address was changed after it was inherited', async () => {
        const reversal = line(1, LINE_SHIP);
        const order = orderWith(null, null, [reversal]);
        order.recordInheritedAddress(reversal, 'ShipToAddressSnapshot', SHIP, soldLine);

        await order.stampAddressSnapshots('confirm');

        expect(ParseAddressSnapshot(reversal.ShipToAddressSnapshot)?.StateProvince).toBe('CO');
    });
});
