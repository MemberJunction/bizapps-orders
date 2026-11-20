/**
 * @fileoverview One line per seat for an event that requires attendee information.
 *
 * An event product with `RequiresAttendeeInfo` books only when each seat is its own line at
 * quantity 1 naming its attendee: the attendee lives on `EventOrderLine`, an IS-A child sharing the
 * line's key, so a line holds one attendee. Checkout already builds that shape. These helpers let an
 * order editor build it too, so staff who ask for N seats get N lines instead of a refusal at confirm.
 *
 * @module @mj-biz-apps/orders-entities
 */
import type { mjBizAppsOrdersOrderLineEntity } from './generated/entity_subclasses';
import { OrdersEngine } from './pricing/OrdersEngine';

/**
 * Fields a seat line takes from the line it was split from: what was sold, at what price, where it
 * ships and which dimension it books to.
 *
 * Left out: quantity and totals (repriced per line), the line number (assigned on save), reversal,
 * bundle and subscription fields (a split line is none of these), and the line's discount. A
 * discount is a concession staged against one line, and copying a fixed amount to every seat would
 * multiply it.
 */
export const SEAT_LINE_COPIED_FIELDS = [
    'ProductID',
    'CompanyID',
    'Description',
    'ProductPriceID',
    'UnitPrice',
    'PriceOverridden',
    'PriceOverrideReason',
    'DimensionID',
    'DimensionValueID',
    'ShipToAddressID',
    'ShipToOrganizationID',
    'ShipToPersonID',
    'ShipToAddressSnapshot',
    'ServicePeriodStart',
    'ServicePeriodEnd',
] as const satisfies ReadonlyArray<keyof mjBizAppsOrdersOrderLineEntity>;

type SeatLineField = (typeof SEAT_LINE_COPIED_FIELDS)[number];

/** The parts of an order line a seat split reads and writes. */
export type SeatLine = Pick<
    mjBizAppsOrdersOrderLineEntity,
    SeatLineField | 'Quantity' | 'ReversesOrderLineID' | 'ParentOrderLineID'
>;

/** True when the product is an event that requires an attendee on every seat. */
export function RequiresAttendeePerSeat(productID: string | null | undefined): boolean {
    return OrdersEngine.Instance.EventProductByID(productID)?.RequiresAttendeeInfo === true;
}

/**
 * How many lines a seat split would add for this line; 0 when it needs none.
 *
 * Reversal lines and bundle components are exempt, as at confirm: a reversal unwinds a seat already
 * named, and a component is sold by its bundle line.
 */
export function ExtraSeatLinesNeeded(line: SeatLine): number {
    if (line.ReversesOrderLineID || line.ParentOrderLineID) return 0;
    if (!RequiresAttendeePerSeat(line.ProductID)) return 0;
    const quantity = Math.floor(Number(line.Quantity ?? 0));
    return quantity > 1 ? quantity - 1 : 0;
}

/**
 * Turns a quantity-N line into N quantity-1 lines and returns the added ones.
 *
 * The original line keeps its attendee and its discount and drops to quantity 1. `createLine` adds an
 * empty line to the order, with its attendee record when the product type has one.
 */
export async function SplitIntoSeatLines<L extends SeatLine>(line: L, createLine: () => Promise<L>): Promise<L[]> {
    const extra = ExtraSeatLinesNeeded(line);
    if (extra === 0) return [];
    line.Quantity = 1;
    const added: L[] = [];
    for (let i = 0; i < extra; i++) {
        const seat = await createLine();
        for (const field of SEAT_LINE_COPIED_FIELDS) copyField(line, seat, field);
        seat.Quantity = 1;
        added.push(seat);
    }
    return added;
}

function copyField<K extends SeatLineField>(from: SeatLine, to: SeatLine, field: K): void {
    to[field] = from[field];
}
