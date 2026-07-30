/**
 * Output for `Orders.CancelSubscription`.
 *
 * `Decision` is the wire-safe projection of the engine's decision: dates are ISO
 * strings rather than `Date`, because that is what crosses the transport anyway and
 * a contract that pretends otherwise lies to its client.
 *
 * NO import statements — definitions are emitted verbatim.
 */

/** What the subscription type's rules decided. Present even on a preview. */
export interface CancellationDecisionResult {
    /** When coverage ends for revenue purposes. Never before the request, never after the term. */
    EffectiveDate: string;
    /** When ACCESS ends — effective date plus grace. Grace extends access, NOT revenue. */
    AccessThroughDate: string;
    /** What to give back. 0 under NoRefund, and never more than the term charged. */
    RefundAmount: number;
    /** Fraction of the term to reverse; the reversal line's quantity is its negative. */
    ReversalFraction: number;
    /** `Canceled` when coverage is cut short, `Completed` when the term simply runs out. */
    TermStatus: 'Canceled' | 'Completed';
    /** Which rules produced this, in a sentence — surfaced to the user, so it names the policy. */
    Explanation: string;
}

export interface CancelSubscriptionOutput {
    Success: boolean;
    Message?: string;
    Decision?: CancellationDecisionResult;
    /** The term that was (or would be) cancelled. */
    SubscriptionTermID?: string;
    /** The reversal order, when one was needed. Absent when nothing was refunded. */
    ReversalOrderID?: string;
    ReversalOrderNumber?: string;
}
