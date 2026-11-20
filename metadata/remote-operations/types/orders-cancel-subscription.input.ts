/**
 * Input for `Orders.CancelSubscription`.
 *
 * Policy in, reversal out. The caller supplies a subscription, a date and a reason;
 * the subscription type's cancellation mode, refund mode and grace decide the rest.
 * The mechanic underneath is a negative-quantity order line — correct double-entry
 * and terrible data entry, which is exactly why it is computed from a date and a
 * policy rather than typed.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface CancelSubscriptionInput {
    SubscriptionID: string;
    /** When the customer asked. Defaults to today. The RULES decide when coverage actually ends. */
    RequestDate?: string;
    /** Free text, stored on the lifecycle event. */
    Reason?: string;
    /**
     * When coverage ends, chosen by the person cancelling. `Immediate` ends coverage and access on
     * the request day; `EndOfTerm` ends them on the term's last day. A chosen timing drops the type's
     * grace. Absent, the subscription type's cancellation mode and grace decide. Refund mode never
     * changes.
     */
    Timing?: 'Immediate' | 'EndOfTerm';
    /**
     * Return the decision WITHOUT writing anything — for a confirmation screen that shows
     * "you will be refunded $X, coverage ends Y" before the user commits.
     */
    Preview?: boolean;
}
