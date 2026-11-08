/**
 * Output for `Orders.ResolveChargeException`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersResolveChargeExceptionOutput {
    /** True when the order is booked and the exception cleared. */
    Success: boolean;
    Message: string;
    /**
     * Why it did not finish, when Success is false: BadInput, NotAuthorized, ExceptionNotFound, NotOpen,
     * WrongType, WrongKind, OpenedByOrders, UnreadableKey, ClearRefused, or a code from
     * Orders.CreateOrderFromProviderPayment. Only ClearRefused leaves a booked order behind.
     */
    Code?: string;
    /** True when the exception was cleared. */
    Cleared: boolean;
    /** The gateway charge the exception names. */
    ProviderChargeID?: string | null;
    /** True when an earlier call already booked the order for this charge. */
    WasExisting?: boolean;
    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    /** The charge's gross amount. */
    Amount?: number | null;
}
