/**
 * Output for `Orders.PreviewOrder` — the decomposition the order-entry rail renders.
 *
 * `Success: false` here means the draft could not be PRICED (an unknown product, a
 * negative quantity on a non-return). It does not mean the order cannot confirm —
 * that is `Orders.PreviewConfirm`'s question, and it is asked separately because
 * resolving GL accounts and evaluating sales rules costs more than pricing does.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPreviewOrderOutput {
    Success: boolean;
    Message?: string;
    Lines: OrderLineResult[];
    Totals: OrderTotalsResult;
    Charges: ChargeResult[];
    /** Applied AND offered-not-applied, because the second is what answers customer questions. */
    Promotions: PromotionResult[];
    /** Present only when the caller asked for them. */
    JournalEntries?: JournalEntryPreview[];
    /** Pricing-level problems. Confirm-level blockers come from PreviewConfirm. */
    Blockers?: BlockerResult[];
}
