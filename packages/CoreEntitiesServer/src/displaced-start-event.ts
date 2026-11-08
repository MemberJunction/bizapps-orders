/**
 * The record of a stated term start that the subscription rules did not use (golive #299).
 *
 * A line for a product the subscriber already holds extends that subscription, and the new term
 * starts the day after current coverage ends (`SubscriptionBehavior.Decide`). The confirm then
 * overwrites the line's `ServicePeriodStart` with the settled term, so without a record the date
 * the user entered is gone. `OrderEntityServer` adds these fields to the subscription's `Extended`
 * event, inside the booking transaction, so the record exists for every path that confirms an
 * order. The order screen reads it back (`OrderHeaderEntity.LoadDisplacedTermStarts`).
 */
import type { DisplacedTermStartEventData } from '@mj-biz-apps/orders-entities';
import { CoverageEndOf, type SubscriptionDecision } from './SubscriptionBehavior.js';

/** `YYYY-MM-DD` from a date the rules normalized to UTC midnight. */
function day(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * The `EventData` fields for a displaced start, or undefined when the line's start stood or it
 * stated none.
 */
export function DisplacedStartEventData(
    orderLineID: string,
    decision: SubscriptionDecision,
    requestedStart: Date | null,
    requestedEnd: Date | null = null,
): DisplacedTermStartEventData | undefined {
    if (!decision.StartOverrideIgnored || !decision.Term || !requestedStart) return undefined;
    return {
        StartOverrideIgnored: true,
        OrderLineID: orderLineID,
        RequestedStartDate: day(requestedStart),
        TermStartDate: day(decision.Term.StartDate),
        // The end of the coverage the line bought, which is the last term's when it bought several.
        TermEndDate: day(CoverageEndOf(decision) ?? decision.Term.EndDate),
        // The end the line stated, so the notice can say the stated length was kept (golive #338).
        ...(requestedEnd ? { RequestedEndDate: day(requestedEnd) } : {}),
    };
}
