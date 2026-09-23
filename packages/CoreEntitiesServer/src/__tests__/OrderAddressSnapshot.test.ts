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
}

type SnapshotOrder = {
    stampAddressSnapshots(): Promise<void>;
    BillToAddressSnapshot: string | null;
    ShipToAddressSnapshot: string | null;
};

function orderWith(bill: string | null, ship: string | null, lines: FakeLine[]): SnapshotOrder {
    const instance = Object.create(OrderEntityServer.prototype) as SnapshotOrder;
    // The generated accessors read and write field state BaseEntity would own; plain properties
    // shadow them so the method under test sees ordinary values.
    for (const [name, value] of Object.entries({
        BillToAddressID: bill,
        ShipToAddressID: ship,
        BillToAddressSnapshot: null,
        ShipToAddressSnapshot: null,
        OrderNumber: 'ORD-000200',
    })) {
        Object.defineProperty(instance, name, { value, writable: true });
    }
    Object.defineProperty(instance, 'Lines', { value: { Items: lines } });
    Object.defineProperty(instance, 'ProviderToUse', { value: {} });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: { ID: 'user-1' } });
    return instance;
}

const line = (n: number, ship: string | null): FakeLine => ({ LineNumber: n, ShipToAddressID: ship, ShipToAddressSnapshot: null });

beforeEach(() => {
    mockRunView.mockReset();
    mockRunView.mockResolvedValue({ Success: true, Results: ROWS });
});

describe('OrderEntityServer.stampAddressSnapshots', () => {
    it('copies the bill-to and ship-to rows onto the header', async () => {
        const order = orderWith(BILL, SHIP, []);

        await order.stampAddressSnapshots();

        expect(ParseAddressSnapshot(order.BillToAddressSnapshot)).toMatchObject({ AddressID: BILL, StateProvince: 'IL', PostalCode: '60601' });
        expect(ParseAddressSnapshot(order.ShipToAddressSnapshot)).toMatchObject({ AddressID: SHIP, StateProvince: 'TX', PostalCode: '73301' });
    });

    it('gives a line a snapshot only when it names its own ship-to', async () => {
        const own = line(1, LINE_SHIP);
        const inherits = line(2, null);

        await orderWith(BILL, SHIP, [own, inherits]).stampAddressSnapshots();

        expect(ParseAddressSnapshot(own.ShipToAddressSnapshot)).toMatchObject({ AddressID: LINE_SHIP, StateProvince: 'CO' });
        expect(inherits.ShipToAddressSnapshot).toBeNull();
    });

    it('reads every address in one query, bypassing the cache', async () => {
        await orderWith(BILL, SHIP, [line(1, LINE_SHIP)]).stampAddressSnapshots();

        expect(mockRunView).toHaveBeenCalledTimes(1);
        const params = mockRunView.mock.calls[0][0] as { EntityName: string; ExtraFilter: string; BypassCache: boolean };
        expect(params.EntityName).toBe('MJ_BizApps_Common: Addresses');
        expect(params.BypassCache).toBe(true);
        for (const id of [BILL, SHIP, LINE_SHIP]) expect(params.ExtraFilter).toContain(id);
    });

    it('matches address IDs regardless of case', async () => {
        const order = orderWith(BILL.toUpperCase(), null, []);

        await order.stampAddressSnapshots();

        expect(ParseAddressSnapshot(order.BillToAddressSnapshot)?.City).toBe('Chicago');
    });

    it('issues no query and writes nulls when the order has no addresses', async () => {
        const order = orderWith(null, null, [line(1, null)]);

        await order.stampAddressSnapshots();

        expect(mockRunView).not.toHaveBeenCalled();
        expect(order.BillToAddressSnapshot).toBeNull();
        expect(order.ShipToAddressSnapshot).toBeNull();
    });

    it('refuses the confirm when an address row no longer exists', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [ROWS[0]] });

        await expect(orderWith(BILL, null, [line(3, LINE_SHIP)]).stampAddressSnapshots()).rejects.toThrow(
            /ORD-000200 cannot be confirmed: its line 3 ship-to address/,
        );
    });

    it('refuses the confirm when the addresses cannot be read', async () => {
        mockRunView.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'timeout' });

        await expect(orderWith(BILL, null, []).stampAddressSnapshots()).rejects.toThrow(/timeout/);
    });
});
