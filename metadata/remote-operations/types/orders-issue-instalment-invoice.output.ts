/**
 * Output for `Orders.IssueInstalmentInvoice`.
 *
 * Issuing freezes the document number on the row, stamps InvoicedAt and who did it, and
 * advances the row to Invoiced. It is idempotent: issuing an instalment that is already
 * Invoiced returns its existing number with `AlreadyInvoiced: true` and changes nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersIssueInstalmentInvoiceOutput {
    Success: boolean;
    Message?: string;
    OrderHeaderPaymentScheduleID?: string | null;
    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    InstallmentNumber?: number | null;
    /** The frozen invoice number, e.g. `ORD-1234-2`. */
    DocumentNumber?: string | null;
    InvoicedAt?: string | null;
    Amount?: number | null;
    DueDate?: string | null;
    /** True when the row was already Invoiced and this call changed nothing. */
    AlreadyInvoiced: boolean;
    /**
     * The AR reclass journal entry (Unbilled -> AR). Null until AIDP-25 (#240) fills the
     * `EmitInstalmentReclassEntry` seam; the number, the stamp and the status advance regardless.
     */
    JournalEntryID?: string | null;
}
