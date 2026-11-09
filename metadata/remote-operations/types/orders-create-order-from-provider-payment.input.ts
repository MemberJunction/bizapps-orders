/**
 * Input for `Orders.CreateOrderFromProviderPayment`.
 *
 * Creates a paid order from a gateway charge that matched no order or invoice: the order in the
 * payment provider's company, one line at the charge's amount, and the charge captured against it.
 * The product and the buyer are named by the caller.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCreateOrderFromProviderPaymentInput {
    /** The payment provider the charge was taken through. Its company receives the order and the cash. */
    PaymentProviderID: string;
    /** The gateway's charge id (Stripe: ch_...), as the reconciliation reports it. */
    ProviderChargeID: string;
    /** The product the order's one line carries, priced at the charge's amount. */
    ProductID: string;
    /** The buyer. */
    BillToPersonID: string;
    /** The buyer's organization, when the order is billed to one. */
    BillToOrganizationID?: string | null;
}
