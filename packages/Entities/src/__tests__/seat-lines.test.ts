/**
 * One order line per seat for an attendee-required event: adding a seat and splitting a quantity-N
 * line build quantity-1 lines that copy the sale and carry their own attendee record.
 */
import { describe, expect, it } from 'vitest';
import type { BaseEntity } from '@memberjunction/core';
import {
    AddSeatLine,
    CopySeatLineFields,
    SEAT_LINE_COPIED_FIELDS,
    SeatCount,
    SplitIntoSeatLines,
    type SeatLine,
    type SeatLineCollection,
} from '../seat-lines';

const EVENT_ORDER_LINES = 'MJ_BizApps_Orders: Event Order Lines';

type FakeLine = SeatLine & {
    ISAChildName: string | null;
    DiscountAmount: number;
    JournalEntryID: string | null;
    SubscriptionID: string | null;
};

let nextID = 0;

function fakeLine(values: Partial<FakeLine> = {}): FakeLine {
    const line: FakeLine = {
        ID: `line-${++nextID}`,
        Quantity: 1,
        ProductID: null,
        CompanyID: null,
        UnitPrice: 0,
        ProductPriceID: null,
        PriceOverridden: false,
        PriceOverrideReason: null,
        Description: null,
        ShipToAddressID: null,
        ShipToOrganizationID: null,
        ShipToPersonID: null,
        ServicePeriodStart: null,
        ServicePeriodEnd: null,
        DimensionID: null,
        DimensionValueID: null,
        DiscountAmount: 0,
        JournalEntryID: null,
        SubscriptionID: null,
        ISAChildName: null,
        async EnsureISAChild(entityName?: string): Promise<BaseEntity | null> {
            line.ISAChildName = entityName ?? null;
            return null;
        },
        ...values,
    };
    return line;
}

function fakeCollection(): SeatLineCollection<FakeLine> & { Items: FakeLine[] } {
    const items: FakeLine[] = [];
    return {
        Items: items,
        async Create(): Promise<FakeLine> {
            const line = fakeLine();
            items.push(line);
            return line;
        },
    };
}

function soldLine(quantity: number): FakeLine {
    return fakeLine({
        Quantity: quantity,
        ProductID: 'product-summit',
        CompanyID: 'company-1',
        UnitPrice: 450,
        ProductPriceID: 'price-member',
        PriceOverridden: true,
        PriceOverrideReason: 'Speaker rate',
        Description: 'Annual summit',
        ShipToAddressID: 'address-1',
        ShipToOrganizationID: 'org-1',
        ShipToPersonID: 'person-1',
        ServicePeriodStart: new Date('2026-11-02'),
        ServicePeriodEnd: new Date('2026-11-04'),
        DimensionID: 'dim-dept',
        DimensionValueID: 'dim-dept-events',
        DiscountAmount: 90,
        JournalEntryID: 'je-1',
        SubscriptionID: 'sub-1',
    });
}

describe('SeatCount', () => {
    it('reads a whole quantity as that many seats', () => {
        expect(SeatCount(1)).toBe(1);
        expect(SeatCount(5)).toBe(5);
    });

    it('reads a fraction, zero, a negative or nothing as one seat, so nothing splits', () => {
        expect(SeatCount(2.5)).toBe(1);
        expect(SeatCount(0)).toBe(1);
        expect(SeatCount(-3)).toBe(1);
        expect(SeatCount(null)).toBe(1);
        expect(SeatCount(undefined)).toBe(1);
        expect(SeatCount(Number.NaN)).toBe(1);
    });
});

describe('CopySeatLineFields', () => {
    it('copies what is sold, the price, the parties, the dates and the tag', () => {
        const source = soldLine(3);
        const target = fakeLine();
        CopySeatLineFields(source, target);
        for (const field of SEAT_LINE_COPIED_FIELDS) {
            expect(target[field], field).toEqual(source[field]);
        }
    });

    it('leaves the key, quantity, computed money and one-line links alone', () => {
        const source = soldLine(3);
        const target = fakeLine();
        const id = target.ID;
        CopySeatLineFields(source, target);
        expect(target.ID).toBe(id);
        expect(target.Quantity).toBe(1);
        expect(target.DiscountAmount).toBe(0);
        expect(target.JournalEntryID).toBeNull();
        expect(target.SubscriptionID).toBeNull();
    });
});

describe('AddSeatLine', () => {
    it('adds a quantity-1 line copying the source, with its own attendee record', async () => {
        const lines = fakeCollection();
        const source = soldLine(1);
        const added = await AddSeatLine(lines, source, EVENT_ORDER_LINES);
        expect(lines.Items).toEqual([added]);
        expect(added.ID).not.toBe(source.ID);
        expect(added.Quantity).toBe(1);
        expect(added.ProductID).toBe('product-summit');
        expect(added.UnitPrice).toBe(450);
        expect(added.ISAChildName).toBe(EVENT_ORDER_LINES);
        expect(source.Quantity).toBe(1);
    });

    it('adds no extension record when the product type has none', async () => {
        const added = await AddSeatLine(fakeCollection(), soldLine(1), null);
        expect(added.ISAChildName).toBeNull();
    });
});

describe('SplitIntoSeatLines', () => {
    it('turns a quantity-3 line into three quantity-1 lines, keeping the first seat on the source', async () => {
        const lines = fakeCollection();
        const source = soldLine(3);
        const added = await SplitIntoSeatLines(lines, source, EVENT_ORDER_LINES);
        expect(source.Quantity).toBe(1);
        expect(added).toHaveLength(2);
        expect(lines.Items).toEqual(added);
        for (const line of added) {
            expect(line.Quantity).toBe(1);
            expect(line.ProductID).toBe(source.ProductID);
            expect(line.DimensionValueID).toBe(source.DimensionValueID);
            expect(line.ISAChildName).toBe(EVENT_ORDER_LINES);
        }
        const seats = [source, ...added].reduce((sum, line) => sum + line.Quantity, 0);
        expect(seats).toBe(3);
    });

    it('does nothing to a one-seat line', async () => {
        const lines = fakeCollection();
        const source = soldLine(1);
        expect(await SplitIntoSeatLines(lines, source, EVENT_ORDER_LINES)).toEqual([]);
        expect(lines.Items).toHaveLength(0);
    });

    it('does not split a fractional quantity', async () => {
        const lines = fakeCollection();
        const source = soldLine(2.5);
        expect(await SplitIntoSeatLines(lines, source, EVENT_ORDER_LINES)).toEqual([]);
        expect(source.Quantity).toBe(2.5);
        expect(lines.Items).toHaveLength(0);
    });
});
