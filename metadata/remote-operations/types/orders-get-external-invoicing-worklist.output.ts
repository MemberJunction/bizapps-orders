/**
 * Output for `Orders.GetExternalInvoicingWorklist`.
 *
 * Each row carries enough to decide and to act — the unit key is what `Orders.IssueExternalInvoice`
 * takes — without a second round trip.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ExternalInvoicingWorklistRow {
    OrderHeaderID: string;
    OrderNumber: string;
    CompanyID: string;
    CompanyName: string;
    /** Null for an order billed as a whole. */
    OrderHeaderPaymentScheduleID: string | null;
    InstallmentNumber: number | null;
    /** The number the rail invoice will carry. */
    DocumentNumber: string;
    Amount: number;
    DueDate: string | null;
    CustomerName: string;
    /** Unsent: never attempted. Failed: last send refused. InFlight: a Sending row with no rail reference. */
    State: 'Unsent' | 'Failed' | 'InFlight';
    /** The ExternalInvoice row behind a Failed or InFlight state. */
    ExternalInvoiceID: string | null;
    LastError: string | null;
    /** When the unit became invoiceable (ConfirmedAt or InvoicedAt), ISO. */
    SinceAt: string | null;
}

export interface OrdersGetExternalInvoicingWorklistOutput {
    Success: boolean;
    Message?: string;
    Rows: ExternalInvoicingWorklistRow[];
    RowCount: number;
    /** True when MaxCount clipped the result. */
    Truncated: boolean;
}
