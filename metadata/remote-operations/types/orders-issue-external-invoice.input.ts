/**
 * Input for `Orders.IssueExternalInvoice`.
 *
 * One BILLING UNIT → one invoice on the company's external AR rail (Bill.com). A unit is an order
 * billed as a whole for one selling company, or one Invoiced instalment of an order billed on a
 * schedule. The operation is idempotent per unit: a second call for a unit that is already on the
 * rail returns the existing reference and changes nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersIssueExternalInvoiceInput {
    /** The order the unit bills. */
    OrderHeaderID: string;
    /**
     * The selling company of the document. Optional when the order sells for exactly one company or
     * when an instalment is named (the instalment carries its company). Required for a schedule-less
     * order that sells for several companies.
     */
    CompanyID?: string | null;
    /** The Invoiced instalment to send, for an order billed on a schedule. Omit for an order billed as a whole. */
    OrderHeaderPaymentScheduleID?: string | null;
    /** Build and return the payload without contacting the rail or writing anything. */
    Preview?: boolean;
    /**
     * Send a unit whose previous rail invoice was cancelled or whose send failed permanently.
     * Re-issuing is a deliberate human act (design D-B7); the sweep never sets this for a cancelled unit.
     */
    AllowReissue?: boolean;
}
