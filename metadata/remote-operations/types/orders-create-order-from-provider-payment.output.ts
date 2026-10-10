/**
 * Output for `Orders.CreateOrderFromProviderPayment`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCreateOrderFromProviderPaymentOutput {
    Success: boolean;
    Message: string;
    /**
     * Why nothing was created, when Success is false: BadInput, ProviderNotFound, ChargeNotFound,
     * ChargeNotSucceeded, ChargeRefunded, ChargeHasNoAmount, ChargeHasNoIntent, CurrencyMismatch,
     * IntentOpenedByOrders, ConfirmRefused or CaptureRefused.
     */
    Code?: string;
    /** True when an earlier call already created the order for this charge; nothing new was written. */
    WasExisting?: boolean;
    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    PaymentIntentID?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    /** The charge's gross amount, which the order totals and the payment records. */
    Amount?: number | null;
}
