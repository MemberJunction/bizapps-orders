/**
 * Input for `Orders.ResolveChargeException`.
 *
 * Books the gateway charge a charge-without-payment finance exception names as a paid order, then
 * clears the exception. The provider and charge come from the exception; the caller names the product
 * and the buyer.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersResolveChargeExceptionInput {
    /** The PROVIDER_CHARGE_MISMATCH finance exception to resolve. */
    FinanceExceptionID: string;
    /** The product the order's one line carries, priced at the charge's amount. */
    ProductID: string;
    /** The buyer. */
    BillToPersonID: string;
    /** The buyer's organization, when the order is billed to one. */
    BillToOrganizationID?: string | null;
}
