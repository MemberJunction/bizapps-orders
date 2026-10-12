/**
 * Input for `Orders.AmendArrangement`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type AmendmentReasonCategory = 'Retention' | 'Referral' | 'Dispute' | 'Other';

export interface AmendArrangementInput {
    /** The booked term to amend. Not given with `NewPaymentTermsTypeID`. */
    SubscriptionTermID?: string;
    /** The term's new end date. Must be later than its current end. */
    NewEndDate?: string;
    /** The confirmed order whose payment terms change. Given with `NewPaymentTermsTypeID`. */
    OrderHeaderID?: string;
    /** The order's new payment terms. */
    NewPaymentTermsTypeID?: string;
    /**
     * The term's new amount, net of discount and before tax. Lower than the current amount and more than zero.
     * Given with `SubscriptionTermID` and without `NewEndDate`. Recorded only when the instalments not yet invoiced
     * absorb the whole reduction and its tax; one that needs a credit memo can be previewed but not recorded yet.
     */
    NewAmount?: number;
    /**
     * With `NewAmount`: the invoiced instalment the reduction is about. That invoice is credited up to its open
     * amount, and the rest comes off the instalments not yet invoiced. Blank: it all comes off those.
     */
    AppliesToInvoiceID?: string;
    /**
     * With `AppliesToInvoiceID` naming a paid invoice: refund its credit instead of taking it off the next instalment.
     * Previewed only: a refund needs a credit memo, which cannot be recorded yet.
     */
    RefundRequested?: boolean;
    ReasonCategory: AmendmentReasonCategory;
    Reason: string;
    /** Return what the amendment would do without writing anything. */
    Preview?: boolean;
}
