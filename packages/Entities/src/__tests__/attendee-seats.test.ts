import { afterEach, describe, expect, it, vi } from 'vitest';
import type { mjBizAppsOrdersEventProductEntity } from '../generated/entity_subclasses.js';
import { OrdersEngine } from '../pricing/OrdersEngine.js';
import {
    ExtraSeatLinesNeeded,
    RequiresAttendeePerSeat,
    SEAT_LINE_COPIED_FIELDS,
    SplitIntoSeatLines,
    type SeatLine,
} from '../attendee-seats.js';

const EVENT = 'aaaaaaaa-0000-0000-0000-000000000001';
const OPEN_EVENT = 'aaaaaaaa-0000-0000-0000-000000000002';
const MUG = 'aaaaaaaa-0000-0000-0000-000000000003';

function stubEvents(): void {
    vi.spyOn(OrdersEngine.Instance, 'EventProductByID').mockImplementation((id) => {
        if (id === EVENT) return { RequiresAttendeeInfo: true } as mjBizAppsOrdersEventProductEntity;
        if (id === OPEN_EVENT) return { RequiresAttendeeInfo: false } as mjBizAppsOrdersEventProductEntity;
        return undefined;
    });
}

function line(overrides: Partial<SeatLine> = {}): SeatLine {
    return {
        ProductID: EVENT,
        CompanyID: 'company',
        Description: 'Gala seat',
        ProductPriceID: 'price',
        UnitPrice: 120,
        PriceOverridden: true,
        PriceOverrideReason: 'Board rate',
        DimensionID: 'dimension',
        DimensionValueID: 'dimension-value',
        ShipToAddressID: null,
        ShipToOrganizationID: null,
        ShipToPersonID: 'person',
        ShipToAddressSnapshot: null,
        ServicePeriodStart: null,
        ServicePeriodEnd: null,
        Quantity: 3,
        ReversesOrderLineID: null,
        ParentOrderLineID: null,
        ...overrides,
    } as SeatLine;
}

function blank(): SeatLine {
    return { Quantity: 0 } as SeatLine;
}

afterEach(() => vi.restoreAllMocks());

describe('RequiresAttendeePerSeat', () => {
    it('reads the event flag, and is false for a non-event product', () => {
        stubEvents();
        expect(RequiresAttendeePerSeat(EVENT)).toBe(true);
        expect(RequiresAttendeePerSeat(OPEN_EVENT)).toBe(false);
        expect(RequiresAttendeePerSeat(MUG)).toBe(false);
        expect(RequiresAttendeePerSeat(null)).toBe(false);
    });
});

describe('ExtraSeatLinesNeeded', () => {
    it('is one fewer than the seats of an attendee-required event', () => {
        stubEvents();
        expect(ExtraSeatLinesNeeded(line({ Quantity: 5 }))).toBe(4);
        expect(ExtraSeatLinesNeeded(line({ Quantity: 1 }))).toBe(0);
    });

    it('is 0 for events without the flag and for other products', () => {
        stubEvents();
        expect(ExtraSeatLinesNeeded(line({ ProductID: OPEN_EVENT }))).toBe(0);
        expect(ExtraSeatLinesNeeded(line({ ProductID: MUG }))).toBe(0);
    });

    it('exempts reversals and bundle components, as confirm does', () => {
        stubEvents();
        expect(ExtraSeatLinesNeeded(line({ ReversesOrderLineID: 'original' }))).toBe(0);
        expect(ExtraSeatLinesNeeded(line({ ParentOrderLineID: 'bundle' }))).toBe(0);
    });
});

describe('SplitIntoSeatLines', () => {
    it('leaves N lines at quantity 1 carrying what was sold and its price', async () => {
        stubEvents();
        const original = line({ Quantity: 3 });
        const added = await SplitIntoSeatLines(original, async () => blank());

        expect(original.Quantity).toBe(1);
        expect(added).toHaveLength(2);
        for (const seat of added) {
            expect(seat.Quantity).toBe(1);
            for (const field of SEAT_LINE_COPIED_FIELDS) expect(seat[field]).toEqual(original[field]);
        }
    });

    it('does not copy the reversal or bundle links', async () => {
        stubEvents();
        const [seat] = await SplitIntoSeatLines(line({ Quantity: 2 }), async () => blank());
        expect(seat.ReversesOrderLineID).toBeUndefined();
        expect(seat.ParentOrderLineID).toBeUndefined();
    });

    it('adds nothing and keeps the quantity when no split is needed', async () => {
        stubEvents();
        const create = vi.fn(async () => blank());
        const mug = line({ ProductID: MUG, Quantity: 4 });

        expect(await SplitIntoSeatLines(mug, create)).toEqual([]);
        expect(mug.Quantity).toBe(4);
        expect(create).not.toHaveBeenCalled();
    });
});
