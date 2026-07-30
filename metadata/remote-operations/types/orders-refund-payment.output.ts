/**
 * Output for `Orders.RefundPayment`.
 *
 * The processing fee is deliberately NOT reversed — the processor kept its cut.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RefundPaymentOutput {
    Success: boolean;
    Message?: string;
    /** What was (or would be) refunded. */
    RefundAmount?: number;
    /** Still refundable AFTER this refund. */
    RemainingRefundable?: number;
    RefundPaymentHeaderID?: string;
    RefundPaymentNumber?: string;
    /** The reversing journal entry, when one was booked. */
    JournalEntryID?: string;
    /**
     * How the refund un-applied across the orders the original settled — proportional
     * to how it was applied, because that decision was already made once.
     */
    Unapplications?: Array<{
        OrderHeaderID: string;
        OrderNumber: string;
        OriginalAmount: number;
        UnappliedAmount: number;
        BalanceAfter: number;
    }>;
}
