/**
 * Input for `Orders.SendExternalInvoices`.
 *
 * The sweep: read the external invoicing worklist and send each unit through
 * `Orders.IssueExternalInvoice`. Meant for a scheduled job (through the `Orders: Send External
 * Invoices` Action) and for the Bill.com queue page's "Run now". Never re-issues a cancelled unit —
 * that is a person's act (design D-B7).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersSendExternalInvoicesInput {
    /** Restrict to these selling companies. Omit for every company with an active rail. */
    CompanyIDs?: string[];
    /**
     * Cap on units sent in one pass, and on the units a preview lists. The first-run safety valve:
     * a mis-configuration invoices this many customers, not the book. Default 25.
     */
    MaxCount?: number;
    /** List what WOULD be sent and send nothing. */
    Preview?: boolean;
    /** Also retry units whose last send failed for a transient reason (timeout, 5xx, session). Default true. */
    RetryTransientFailures?: boolean;
}
