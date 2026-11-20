/**
 * Output for `Orders.ReconcilePaymentProviderCharges`.
 *
 * Every mismatch found, per-provider counts, and every error, so a run that raised nothing can be
 * told apart from one that found nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface PaymentProviderChargeMismatch {
    /**
     * ChargeWithoutPayment: a charge that succeeded at the gateway with no captured Orders payment.
     * PaymentWithoutCharge: a captured payment whose charge the gateway does not have or did not
     * collect. RefundNotBooked: a charge refunded at the gateway beyond the refunds its payment carries.
     */
    Kind: 'ChargeWithoutPayment' | 'PaymentWithoutCharge' | 'RefundNotBooked';
    PaymentProviderID: string;
    ProviderChargeID?: string | null;
    ProviderIntentID?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    PaymentIntentID?: string | null;
    CompanyID?: string | null;
    /** The amount in question, major units. */
    Amount: number;
    Detail: string;
}

export interface PaymentProviderReconciliationResult {
    PaymentProviderID: string;
    PaymentProviderName: string;
    /** Checked, Skipped (test mode) or Error (see Message). */
    Status: 'Checked' | 'Skipped' | 'Error';
    ChargesRead: number;
    RefundsRead: number;
    Mismatches: number;
    /** Orders created from this provider's unmatched charges. Zero in preview. */
    OrdersCreated: number;
    Message?: string;
}

/** A paid order created from a charge that matched no Orders payment (#481). */
export interface PaymentProviderUnmatchedChargeOrder {
    PaymentProviderID: string;
    ProviderChargeID: string;
    OrderHeaderID: string;
    OrderNumber?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    /** The charge's gross amount, major units. */
    Amount: number;
}

export interface PaymentProviderReconciliationError {
    PaymentProviderID?: string;
    Code: string;
    Message: string;
}

export interface OrdersReconcilePaymentProviderChargesOutput {
    /** False when any provider could not be read or any mismatch could not be raised. */
    Success: boolean;
    Message?: string;
    Preview: boolean;
    FromDate: string;
    ToDate: string;
    Providers: PaymentProviderReconciliationResult[];
    Mismatches: PaymentProviderChargeMismatch[];
    /** Finance exceptions this run created. Zero in preview. */
    Raised: number;
    /** Mismatches that already had an exception from an earlier run. */
    AlreadyRaised: number;
    /**
     * Charges without a payment that became paid orders: the provider's price map named the product
     * and the charge's e-mail named the buyer. They are not in Mismatches. Empty in preview.
     */
    OrdersCreated: PaymentProviderUnmatchedChargeOrder[];
    Errors: PaymentProviderReconciliationError[];
}
