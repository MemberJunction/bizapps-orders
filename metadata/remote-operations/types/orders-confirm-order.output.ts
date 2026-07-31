/**
 * Output for `Orders.ConfirmOrder`.
 *
 * On failure, `Blockers` carries the REASON — not a bare `false`. A rejected
 * confirm that only logs why is a rejected confirm the user cannot act on.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersConfirmOrderOutput {
    Success: boolean;
    Message?: string;
    OrderHeaderID?: string;
    /** Taken from the sequence inside the transaction, so a failed confirm burns no number. */
    OrderNumber?: string;
    Status?: string;
    Totals?: OrderTotalsResult;
    /** The entries that were actually created, with their IDs. */
    JournalEntries?: JournalEntryPreview[];
    /** What happened to the subscription, when a line carried one. */
    SubscriptionDecisions?: SubscriptionDecisionPreview[];
    /** Grants issued. */
    EntitlementGrants?: EntitlementGrantPreview[];
    /** Set when the order carried an initial-payment intent that captured. */
    PaymentHeaderID?: string;
    PaymentNumber?: string;
    /** Set when a sales rule escalated instead of proceeding. */
    ApprovalTaskID?: string;
    /** Why the confirm was refused. Empty on success. */
    Blockers?: BlockerResult[];
}
