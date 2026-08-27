/**
 * Input for `Orders.FulfillOrderLines`.
 *
 * Flipping lines to Fulfilled and advancing the order when the last one is done are ONE decision,
 * so they are one operation. Doing them as two calls leaves a window where every line is shipped
 * and the order still reads Posted — which is what a warehouse sees as "the system lost my work".
 *
 * Fulfilment is a LOGISTICS fact (D15). No journal entry fires on Posted to Fulfilled; revenue was
 * settled at booking and releases on its own schedule. A delay in the warehouse must never restate
 * a closed period.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersFulfillOrderLinesInput {
    /**
     * The lines to mark Fulfilled. Lines from several orders may be sent together — a picker works
     * a shelf, not an order — and each order advances independently once its own lines are done.
     */
    OrderLineIDs: string[];
    /**
     * Refuse the whole call if ANY line cannot be fulfilled, rather than doing what is possible and
     * reporting the rest. Default false: a picker who scans one already-shipped item should not
     * lose the other nine scans.
     */
    AllOrNothing?: boolean;
    /**
     * A picker's remark. ACCEPTED BUT NOT YET STORED — OrderHeader has no column for it, and adding
     * one to hold a free-text note is a schema change nobody has asked for. Kept in the contract so
     * callers can send it, and so the day there is somewhere honest to put it, nothing changes here.
     */
    Notes?: string;
}
