/**
 * Input for `Orders.AmendArrangement`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type AmendmentReasonCategory = 'Retention' | 'Referral' | 'Other';

export interface AmendArrangementInput {
    /** The booked term to amend. */
    SubscriptionTermID: string;
    /** The term's new end date. Must be later than its current end. */
    NewEndDate: string;
    /** A change of amount. Not supported yet; refused. */
    NewAmount?: number;
    ReasonCategory: AmendmentReasonCategory;
    Reason: string;
    /** Return what the amendment would do without writing anything. */
    Preview?: boolean;
}

export interface AmendArrangementInput {
    /** The booked term to amend. */
    SubscriptionTermID: string;
    /** The term's new end date. Must be later than its current end. */
    NewEndDate: string;
    /** A change of amount. Not supported yet; refused. */
    NewAmount?: number;
    ReasonCategory: AmendmentReasonCategory;
    Reason: string;
    /** Return what the amendment would do without writing anything. */
    Preview?: boolean;
}
