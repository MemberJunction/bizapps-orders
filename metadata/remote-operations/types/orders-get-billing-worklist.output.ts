/**
 * Output for `Orders.GetBillingWorklist`.
 *
 * One row per `Scheduled` instalment due inside the window, earliest first — the order a
 * person should issue them in. Each row carries enough to decide and to act (the schedule row
 * id is what `Orders.IssueInstalmentInvoice` takes) without a second round trip.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface BillingWorklistRow {
    OrderHeaderPaymentScheduleID: string;
    OrderHeaderID: string;
    OrderNumber: string;
    /** 1-based, within the order and company. */
    InstallmentNumber: number;
    /** How many non-cancelled instalments the order has for this company. */
    InstallmentCount: number;
    DueDate: string;
    /** Negative once past due. */
    DaysUntilDue: number;
    Amount: number;
    CompanyID: string;
    CompanyName: string;
    /** Whichever party the order bills — organization wins, else the person. */
    CustomerName: string;
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    Description?: string | null;
    /** The order's status. A Draft order's instalments are listed but cannot be issued. */
    OrderStatus: string;
}

export interface OrdersGetBillingWorklistOutput {
    Success: boolean;
    Message?: string;
    Rows: BillingWorklistRow[];
    /** Sum of Amount over the returned rows. */
    TotalDue: number;
    RowCount: number;
    /** True when `MaxCount` clipped the result. */
    Truncated: boolean;
    /** The window the rows were selected in, echoed so the UI can say what it is showing. */
    AsOfDate: string;
    WindowEnd: string;
}
