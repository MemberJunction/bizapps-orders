/**
 * Output for `Orders.SendExternalInvoices`.
 *
 * `Results` lists every unit the pass considered with its outcome, so a preview run's list is the
 * deliverable a person confirms before the job goes live, and a live run's failures are named.
 * A live pass that left a unit unsent reports Success false.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SendExternalInvoicesResult {
    OrderNumber: string;
    DocumentNumber: string;
    CompanyID: string;
    OrderHeaderPaymentScheduleID: string | null;
    Amount: number;
    ResultCode: string;
    Message?: string;
    ExternalInvoiceRef?: string | null;
}

export interface OrdersSendExternalInvoicesOutput {
    Success: boolean;
    Message?: string;
    Sent: number;
    Failed: number;
    /** Units in the worklist beyond MaxCount, or skipped as permanent failures. Not lost — still due next pass. */
    Skipped: number;
    PreviewedOnly: boolean;
    Results: SendExternalInvoicesResult[];
}
