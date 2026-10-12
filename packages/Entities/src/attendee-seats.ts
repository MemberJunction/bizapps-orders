/**
 * @fileoverview One attendee per seat, for event products that require attendee information (#590).
 *
 * `EventProduct.RequiresAttendeeInfo` says an order for the event must name who is coming. The
 * attendee is an `EventOrderLine`: an IS-A child of `OrderLine` sharing the line's primary key, with a
 * required `PersonID`. So a line can name at most ONE attendee, and "one attendee per seat" can only
 * mean ONE SEAT PER LINE: N seats are N lines of quantity 1, each with its attendee. Checkout already
 * builds a per-unit purchase that way.
 *
 * The rule lives here, decided from plain facts, so the server's confirm gate and the order-line
 * editor answer the same question the same way. The server gathers the facts from the database; the
 * editor uses {@link AttendeeSeatCap} to keep the quantity at one before a confirm can be refused.
 *
 * Reversal lines are exempt: a return unwinds seats that were already sold, and its negative quantity
 * names nobody new.
 *
 * @module @mj-biz-apps/orders-entities
 */

/** What the rule needs to know about one order line. */
export interface AttendeeSeatLineFacts {
    /** The line's number on the order, for the message. NULL before one is assigned. */
    LineNumber: number | null;
    /** The product's name, for the message. */
    ProductName: string | null;
    Quantity: number;
    /** True when the line's product is an event whose `RequiresAttendeeInfo` is set. */
    RequiresAttendee: boolean;
    /** True when the line has an `EventOrderLine` naming a Person. */
    HasAttendee: boolean;
    /** True when the line reverses another line; reversals are exempt. */
    IsReversal: boolean;
}

/**
 * The reasons an order cannot confirm under the attendee rule, one per offending line. Empty when
 * every line passes.
 */
export function AttendeeSeatShortfalls(lines: readonly AttendeeSeatLineFacts[]): string[] {
    const problems: string[] = [];
    for (const line of lines) {
        if (!line.RequiresAttendee || line.IsReversal) continue;
        const label = describeLine(line);
        if (line.Quantity !== 1) {
            problems.push(
                `${label} is for ${line.Quantity} seats; this event needs each attendee named, so add one line per seat`,
            );
        } else if (!line.HasAttendee) {
            problems.push(`${label} has no attendee; this event needs the attendee named`);
        }
    }
    return problems;
}

/**
 * The most seats one line may carry: 1 for an event that requires attendee information, otherwise the
 * product's own `MaxQuantityPerLine` (NULL = no cap). Feed the result to `ClampLineQuantity`.
 */
export function AttendeeSeatCap(requiresAttendee: boolean, maxQuantityPerLine: number | null | undefined): number | null {
    if (requiresAttendee) return 1;
    return maxQuantityPerLine ?? null;
}

function describeLine(line: AttendeeSeatLineFacts): string {
    const name = line.ProductName ? ` (${line.ProductName})` : '';
    return line.LineNumber != null ? `Line ${line.LineNumber}${name}` : `A line${name}`;
}
