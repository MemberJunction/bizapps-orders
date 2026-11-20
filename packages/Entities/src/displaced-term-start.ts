/**
 * @fileoverview Which lines' stated service start did a confirm move?
 *
 * A subscription line that extends coverage the subscriber already holds starts the day after that
 * coverage ends, whatever start the line stated (`SubscriptionBehavior.Decide`). The confirm stamps
 * the settled term onto the line, so the stated date is replaced. Nothing told the person who typed
 * it: the screen kept the stated dates until a reload, and the reload showed different ones.
 *
 * The confirm records the replaced date on the subscription's `Extended` event
 * ({@link DisplacedTermStartEventData}). That event is the one source for the notice: it is written
 * in the booking transaction, so it exists for every path that confirms an order (the order form,
 * fast entry, a deal close, an API call), and it can be read again whenever the order is opened.
 *
 * @module @mj-biz-apps/orders-entities
 */

import { ToISODate } from './date-cell';

/**
 * The `EventData` an `Extended` subscription event carries when the line's stated start was not
 * used. Written by `OrderEntityServer`; read by {@link ParseDisplacedTermStart}. Dates are
 * `YYYY-MM-DD`.
 */
export interface DisplacedTermStartEventData {
    StartOverrideIgnored: true;
    OrderLineID: string;
    RequestedStartDate: string;
    TermStartDate: string;
    TermEndDate: string;
    /**
     * The end the line stated, when it stated one (golive #338). The confirm keeps the stated length
     * from the new start, so `TermEndDate` is that length later. Absent on events recorded before
     * the confirm honored a stated end.
     */
    RequestedEndDate?: string;
}

/** A line whose stated start the confirm replaced. Dates are `YYYY-MM-DD`. */
export interface DisplacedTermStart {
    OrderLineID: string;
    LineNumber: number | null;
    Product: string | null;
    StatedStart: string;
    SettledStart: string;
    SettledEnd: string | null;
    /** The end the line stated, or null when it stated none. */
    StatedEnd: string | null;
}

/** The fields of an order line the notice names it by. */
export interface DisplacedTermStartLine {
    ID: string;
    LineNumber: number | null;
    Product?: string | null;
}

/**
 * The displaced start recorded in one event's `EventData`, or null when the event records none.
 *
 * Tolerates any `EventData`: most `Extended` events carry no displaced start, and a malformed
 * payload is not this reader's to reject.
 */
export function ParseDisplacedTermStart(
    eventData: string | null | undefined,
    lines: readonly DisplacedTermStartLine[],
): DisplacedTermStart | null {
    if (!eventData) return null;
    let data: Partial<DisplacedTermStartEventData>;
    try {
        data = JSON.parse(eventData) as Partial<DisplacedTermStartEventData>;
    } catch {
        return null;
    }
    if (data?.StartOverrideIgnored !== true || !data.OrderLineID) return null;

    const stated = ToISODate(data.RequestedStartDate);
    const settled = ToISODate(data.TermStartDate);
    if (!stated || !settled || stated === settled) return null;

    const lineID = data.OrderLineID.toLowerCase();
    const line = lines.find((l) => l.ID?.toLowerCase() === lineID);
    return {
        OrderLineID: data.OrderLineID,
        LineNumber: line?.LineNumber ?? null,
        Product: line?.Product || null,
        StatedStart: stated,
        SettledStart: settled,
        SettledEnd: ToISODate(data.TermEndDate),
        StatedEnd: ToISODate(data.RequestedEndDate) || null,
    };
}

/**
 * One notice per moved line, naming the end the line keeps: a stated end moves with the start, so the
 * line keeps its stated length; without one, the line runs one term of its subscription type.
 */
export function DescribeDisplacedTermStart(d: DisplacedTermStart): string {
    const which = d.LineNumber != null ? `Line ${d.LineNumber}` : 'A line';
    const product = d.Product ? ` (${d.Product})` : '';
    const entered = d.StatedEnd ? `${d.StatedStart} to ${d.StatedEnd}` : `from ${d.StatedStart}`;
    const runs = d.SettledEnd ? `${d.SettledStart} to ${d.SettledEnd}` : `from ${d.SettledStart}`;
    const keeps = !d.SettledEnd
        ? ''
        : d.StatedEnd
          ? ` It keeps the length entered, so it ends ${d.SettledEnd}.`
          : ` It ends ${d.SettledEnd}, one term of its subscription type.`;
    return (
        `${which}${product} runs ${runs}, not ${entered} as entered. The customer already holds this ` +
        `product, so the line was added as the next term of that subscription.${keeps}`
    );
}
