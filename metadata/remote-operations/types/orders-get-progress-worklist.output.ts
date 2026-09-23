/**
 * Output for `Orders.GetProgressWorklist`.
 *
 * One row per booked percentage-of-completion line, with its last posted observation. Each row
 * carries what `Orders.RecordProgress` needs (the line id) and what a signer needs to decide
 * (the amount, the period, where it stood last time).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ProgressWorklistRow {
    OrderLineID: string;
    OrderHeaderID: string;
    OrderNumber: string;
    LineNumber: number;
    ProductName: string;
    CompanyID: string;
    CompanyName: string;
    /** Whichever party the order bills — organization wins, else the person. */
    CustomerName: string;
    /** The line's LineTotalNet — the amount the percent applies to. */
    LineAmount: number;
    ServicePeriodStart?: string | null;
    ServicePeriodEnd?: string | null;
    /** The last posted observation that has not been superseded — what a supersede would replace. Null when none. */
    LastMeasurementID?: string | null;
    /** The last posted observation's date, or null when none has been recorded yet. A superseded observation is not "last". */
    LastMeasurementDate?: string | null;
    /** Cumulative fraction at the last observation; 0 when none. */
    LastPercentComplete: number;
    /** Revenue recognised on the line to date — the sum of posted recognition amounts. */
    RecognizedToDate: number;
    /** Who signed the last observation. */
    LastAttestedBy?: string | null;
    OrderStatus: string;
}

export interface OrdersGetProgressWorklistOutput {
    Success: boolean;
    Message?: string;
    Rows: ProgressWorklistRow[];
    RowCount: number;
    /** True when `MaxCount` clipped the result. */
    Truncated: boolean;
    /** True when the caller holds `MJ.BizApps.Orders.Progress.Supersede`, so the screen can offer it. The operation checks again. */
    CanSupersede: boolean;
}
