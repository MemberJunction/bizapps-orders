/**
 * Output for `Orders.GetFulfillmentQueue`.
 *
 * A worklist, not a report: a picker should be able to work a row without a second round trip, so
 * each line carries what to send, how many, and where — including the ship-to that a LINE may
 * override on the header (D61), because a bundle bought for three colleagues goes to three places.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface FulfillmentQueueLine {
    OrderLineID: string;
    LineNumber: number;
    ProductID: string;
    ProductName: string;
    SKU?: string | null;
    Quantity: number;
    /** Pending | Fulfilled | Returned. Only Pending lines are work. */
    FulfillmentStatus: string;
    /**
     * Where this LINE goes, which may differ from the order's — a seat bought for a colleague, a
     * gift shipped elsewhere. Null means it follows the header.
     */
    ShipToAddressID?: string | null;
    ShipToOrganizationID?: string | null;
    ShipToPersonID?: string | null;
    ShipToName?: string | null;
    /** Set when this line came from a bundle, so a picker can see the components belong together. */
    ParentOrderLineID?: string | null;
    SourceBundleProductID?: string | null;
}

export interface FulfillmentQueueOrder {
    OrderHeaderID: string;
    OrderNumber: string;
    OrderDate: string;
    ConfirmedAt?: string | null;
    Status: string;
    CompanyID: string;
    CompanyName: string;
    /** Whichever party the order bills — organization wins, else the person. */
    CustomerName: string;
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    /**
     * How many fulfillable lines this order has in total, so a screen can say "1 of 3 remaining"
     * rather than just "1". Excludes lines that require no fulfilment, reversals, and rollup parents.
     */
    FulfillableCount: number;
    /** The lines still awaiting fulfilment. Never empty unless IncludeCompleted was set. */
    Lines: FulfillmentQueueLine[];
}

export interface OrdersGetFulfillmentQueueOutput {
    Success: boolean;
    Message?: string;
    /** Oldest confirmed first — the order a warehouse should work them in. */
    Orders: FulfillmentQueueOrder[];
    /** Orders returned. Distinct from the line count, which is what a picker actually works. */
    OrderCount: number;
    /** Lines still awaiting fulfilment across every returned order. */
    AwaitingLineCount: number;
    /** True when MaxCount capped the result, so a screen can say so rather than imply completeness. */
    Truncated: boolean;
}
