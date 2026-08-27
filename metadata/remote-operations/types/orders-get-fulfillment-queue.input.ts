/**
 * Input for `Orders.GetFulfillmentQueue`.
 *
 * The queue is a COMPUTED surface, like the overdue worklist: it is every line that still needs
 * shipping, which changes as lines are flipped rather than as anything is written to the order. A
 * stored flag would need a job to keep it honest, and the day the job failed the warehouse would
 * quietly stop seeing work.
 *
 * A line holds its order open only when its product TYPE requires fulfilment. Subscriptions,
 * downloads and donations never appear here — nothing ships — and neither do reversal lines (goods
 * coming back are tracked on the line they reverse) or a bundle's rollup parent (its children carry
 * the actual goods).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetFulfillmentQueueInput {
    /** Restrict to orders owned by these companies. Omit for everything in scope. */
    CompanyIDs?: string[];
    /** Restrict to one customer. */
    BillToOrganizationID?: string;
    BillToPersonID?: string;
    /**
     * Only orders confirmed on or before this date — the practical meaning of "oldest first".
     * Defaults to no bound.
     */
    ConfirmedOnOrBefore?: string;
    /** Restrict to lines shipping to one address, for a warehouse working a single destination. */
    ShipToAddressID?: string;
    /**
     * Include orders whose fulfillable lines are ALL done. Off by default: a queue is work to do,
     * and a screen full of finished orders is how a real backlog gets missed.
     */
    IncludeCompleted?: boolean;
    /** Cap the result. Defaults to 500. */
    MaxCount?: number;
}
