/**
 * Output for `Orders.ApplyAccountCredit`.
 *
 * When source and target belong to different companies the intercompany legs are
 * REQUIRED rather than convenient: a single Dr A/R / Cr A/R spanning two legal
 * entities could not be booked at all, since a resolved account must belong to its
 * own company.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ApplyAccountCreditOutput {
    Success: boolean;
    Message?: string;
    /** What was (or would be) applied. */
    AppliedAmount?: number;
    /** The source order's credit still available AFTER this application. */
    RemainingCredit?: number;
    /** The target order's balance AFTER this application. */
    TargetBalanceAfter?: number;
    PaymentHeaderID?: string;
    PaymentNumber?: string;
    /** True when the two orders belong to different companies, so intercompany legs were raised. */
    CrossCompany?: boolean;
}
