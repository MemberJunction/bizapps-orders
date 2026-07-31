/**
 * Output for `Orders.FulfillOrderLines`.
 *
 * Reports per line AND per order, because they answer different questions: a picker wants to know
 * which scans took, and a supervisor wants to know which orders are now closed.
 *
 * A refusal is a normal outcome, not an error — scanning an already-shipped item is an ordinary
 * mistake — so refusals come back as data with reasons rather than as a thrown failure.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface FulfilledLineResult {
    OrderLineID: string;
    /** True when this call moved it from Pending to Fulfilled. */
    Fulfilled: boolean;
    /**
     * Why not, when it was not. One of LineNotFound, OrderNotPosted, DoesNotRequireFulfillment,
     * IsReversal, IsRollupParent, AlreadyFulfilled — with wording that names the line.
     */
    Refusal?: string | null;
    RefusalReason?: string | null;
}

export interface AdvancedOrderResult {
    OrderHeaderID: string;
    OrderNumber: string;
    /** The status before this call — Confirmed or Posted. */
    StatusBefore: string;
    StatusAfter: string;
    /** True when this call was what closed it out. */
    AdvancedToFulfilled: boolean;
    /** Fulfillable lines still pending on this order. Zero when it advanced. */
    RemainingLineCount: number;
}

export interface OrdersFulfillOrderLinesOutput {
    Success: boolean;
    Message?: string;
    Lines: FulfilledLineResult[];
    /** Every order touched, whether or not it advanced. */
    Orders: AdvancedOrderResult[];
    FulfilledCount: number;
    RefusedCount: number;
    /** Orders this call moved to Fulfilled. */
    AdvancedCount: number;
}
