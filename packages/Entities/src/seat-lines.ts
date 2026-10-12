/**
 * @fileoverview One order line per seat, for an event whose product requires attendee information.
 *
 * The attendee lives on `EventOrderLine`, an IS-A child that shares the order line's key, so a line
 * holds one attendee. Booking refuses such an event line unless it is quantity 1 with its attendee,
 * which is also the shape checkout builds. Staff entering the order by hand need the same shape: a
 * second seat is a second line, and a draft line already at quantity N splits into N lines.
 *
 * Shared rather than in the order form so any host composing an order builds seats the same way.
 *
 * @module @mj-biz-apps/orders-entities
 */
import type { BaseEntity } from '@memberjunction/core';

/**
 * The line fields a new seat takes from the line it was added beside: what is sold, at what price,
 * to whom, for when, and how it is tagged.
 *
 * Not copied: the key, order, position and quantity; every figure the pricing pass computes
 * (discounts, totals, charges, tax), which it recomputes for the new line; and every link that
 * belongs to one line only (journal entry, reversal, bundle parent, subscription, renewal target,
 * address snapshot, billed and recognized amounts).
 */
export const SEAT_LINE_COPIED_FIELDS = [
    'ProductID',
    'CompanyID',
    'UnitPrice',
    'ProductPriceID',
    'PriceOverridden',
    'PriceOverrideReason',
    'Description',
    'ShipToAddressID',
    'ShipToOrganizationID',
    'ShipToPersonID',
    'ServicePeriodStart',
    'ServicePeriodEnd',
    'DimensionID',
    'DimensionValueID',
] as const;

export type SeatLineCopiedField = (typeof SEAT_LINE_COPIED_FIELDS)[number];

/** The slice of an order line seat handling reads and writes. */
export type SeatLine = { ID: string; Quantity: number; EnsureISAChild(entityName?: string): Promise<BaseEntity | null> } & {
    [K in SeatLineCopiedField]: unknown;
};

/** Where new seat lines are created: an order's `Lines` collection. */
export interface SeatLineCollection<L extends SeatLine> {
    Create(): Promise<L>;
}

/**
 * How many seats a line at `quantity` sells. A fraction or a value below one is not a seat count,
 * so it reads as one seat and nothing splits: rounding 2.5 seats to two would drop half a sale
 * without anyone choosing to.
 */
export function SeatCount(quantity: number | null | undefined): number {
    const n = Number(quantity ?? 0);
    if (!Number.isInteger(n) || n < 1) return 1;
    return n;
}

/** Copy the seat fields from `source` onto `target`. See {@link SEAT_LINE_COPIED_FIELDS}. */
export function CopySeatLineFields<L extends SeatLine>(source: L, target: L): void {
    for (const field of SEAT_LINE_COPIED_FIELDS) {
        (target as Record<SeatLineCopiedField, unknown>)[field] = source[field];
    }
}

/**
 * A new quantity-1 line for one more seat of `source`'s event, with its own attendee record.
 * `extensionEntity` is the product type's order line extension (`Event Order Lines`); the new
 * line's extension starts empty, because the attendee is the one thing a seat never shares.
 */
export async function AddSeatLine<L extends SeatLine>(
    lines: SeatLineCollection<L>,
    source: L,
    extensionEntity: string | null,
): Promise<L> {
    const line = await lines.Create();
    CopySeatLineFields(source, line);
    line.Quantity = 1;
    if (extensionEntity) await line.EnsureISAChild(extensionEntity);
    return line;
}

/**
 * Split `source` into one quantity-1 line per seat: `source` keeps the first seat (and the attendee
 * it may already have), and a new line is added for each other seat. Returns the new lines, in seat
 * order; empty when `source` sells one seat.
 */
export async function SplitIntoSeatLines<L extends SeatLine>(
    lines: SeatLineCollection<L>,
    source: L,
    extensionEntity: string | null,
): Promise<L[]> {
    const seats = SeatCount(source.Quantity);
    if (seats <= 1) return [];
    source.Quantity = 1;
    const added: L[] = [];
    for (let seat = 1; seat < seats; seat++) {
        added.push(await AddSeatLine(lines, source, extensionEntity));
    }
    return added;
}
