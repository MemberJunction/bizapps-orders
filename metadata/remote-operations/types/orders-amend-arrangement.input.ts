/**
 * Input for `Orders.AmendArrangement`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type AmendmentReasonCategory = 'Retention' | 'Referral' | 'Dispute' | 'Other';

export interface AmendArrangementInput {
    /** The booked term to amend. Not given with `NewPaymentTermsTypeID`. */
    SubscriptionTermID?: string;
    /**
     * The term's new end date. Alone, it must be later than the current end (an extension). With
     * `NewStartDate`, it must move by the same days as the start (a shift); leave it out and it follows the start.
     */
    NewEndDate?: string;
    /** The term's new start date: a shift moves start and end by the same number of days. */
    NewStartDate?: string;
    /** The confirmed order whose payment terms change. Given with `NewPaymentTermsTypeID`. */
    OrderHeaderID?: string;
    /** The order's new payment terms. */
    NewPaymentTermsTypeID?: string;
    /**
     * The term's new amount, net of discount and before tax. Lower than the current amount and more than zero.
     * Given with `SubscriptionTermID` and without `NewEndDate`. The reduction and its tax come off the instalments not
     * yet invoiced; what they cannot absorb is credited on a credit memo the approved change carries.
     */
    NewAmount?: number;
    /**
     * With `NewAmount`: the invoiced instalment the reduction is about. That invoice is credited up to its open
     * amount, and the rest comes off the instalments not yet invoiced. Blank: it all comes off those.
     */
    AppliesToInvoiceID?: string;
    /**
     * With `AppliesToInvoiceID` naming a paid invoice: refund its credit instead of taking it off the next instalment.
     * The approval credits that invoice on the credit memo; finance pays the refund with `Orders.RefundPayment`.
     */
    RefundRequested?: boolean;
    /** A term extension earned by a referral: the program that approves it. Requires ReasonCategory 'Referral'. */
    ReferralProgramID?: string;
    /** Required for every amendment; not given with `EscalateOrderConcessionID`. */
    ReasonCategory?: AmendmentReasonCategory;
    /** Why the amendment is made, or, with `EscalateOrderConcessionID`, why the case goes to the ConcessionLimit approver. */
    Reason: string;
    /**
     * A Shift concession awaiting finance review, which a holder of the finance acknowledgment role sends to the
     * ConcessionLimit approver instead of deciding it. Given alone, with `Reason`.
     */
    EscalateOrderConcessionID?: string;
    /** Return what the amendment would do without writing anything. */
    Preview?: boolean;
}
