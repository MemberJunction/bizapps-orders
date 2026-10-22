/**
 * Input for `Orders.RequestAccessOverride`.
 *
 * An exception to payment-gated access on one order. Nothing changes until it is approved through
 * the task this raises.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RequestAccessOverrideInput {
    OrderHeaderID: string;
    /** WaivePaymentHold lifts the hold on grants awaiting payment; DeferCutoff lifts the renewal cutoff. */
    OverrideType: 'WaivePaymentHold' | 'DeferCutoff';
    /** Why the exception is needed. Required. */
    Reason: string;
    /** Last day the override holds, YYYY-MM-DD, inclusive. Required; not before today. */
    EffectiveThrough: string;
}
