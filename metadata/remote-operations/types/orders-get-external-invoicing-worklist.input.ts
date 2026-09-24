/**
 * Input for `Orders.GetExternalInvoicingWorklist`.
 *
 * Every billing unit that is invoiceable on a company's external rail and has not been sent — a
 * Confirmed schedule-less order with a balance and no rail history, or an Invoiced instalment with
 * SentAt NULL — plus, on request, the units whose last send failed. Companies without an active rail
 * never appear.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetExternalInvoicingWorklistInput {
    /** Restrict to these selling companies. Omit for every company with an active rail. */
    CompanyIDs?: string[];
    /** Cap on rows. Default 200. Truncation is reported, never silent. */
    MaxCount?: number;
    /** Also list units whose last send failed (State 'Failed') and stuck sends (State 'InFlight'). */
    IncludeFailed?: boolean;
}
