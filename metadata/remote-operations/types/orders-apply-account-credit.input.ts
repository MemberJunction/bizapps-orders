/**
 * Input for `Orders.ApplyAccountCredit`.
 *
 * Spending a credit writes a ZERO-amount payment with two offsetting lines: no new
 * cash entered the business, so this only re-attributes money already received.
 * The credit itself is a negative order balance — there is no separate instrument,
 * because a second record holding the same number is a second thing that can
 * disagree with it.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ApplyAccountCreditInput {
    /** The order carrying the credit (its Balance is negative). */
    SourceOrderHeaderID: string;
    /** The order to spend it on. */
    TargetOrderHeaderID: string;
    /** Omit to apply as much as both sides allow. */
    Amount?: number;
    Reason?: string;
    /** Compute and validate without writing — for a confirmation screen. */
    Preview?: boolean;
}
