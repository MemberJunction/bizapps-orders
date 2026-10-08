/**
 * Input for `Orders.ReconcilePaymentProviderCharges`.
 *
 * Matches a payment gateway's charges and refunds to Orders' payment intents and captured payments for
 * a window of business days, and reports what does not match. It corrects nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReconcilePaymentProviderChargesInput {
    /** One provider to reconcile. Omit for every active, live provider whose gateway lists charges. */
    PaymentProviderID?: string;
    /** First business day of the window (YYYY-MM-DD). Omit for seven days ending on ToDate. */
    FromDate?: string;
    /** Last business day of the window (YYYY-MM-DD). Omit for today in the business time zone. */
    ToDate?: string;
    /**
     * True (the default) reports the mismatches and writes nothing. False also raises each as a
     * PROVIDER_CHARGE_MISMATCH finance exception; a mismatch already raised is not raised again.
     */
    Preview?: boolean;
}
