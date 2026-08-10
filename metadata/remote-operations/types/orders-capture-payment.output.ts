/**
 * Output for `Orders.CapturePayment`.
 *
 * Carries the payment as saved, and adds
 * `OrderEffects` — what each order looks like AFTER the payment — so a screen can show the result
 * without a second round trip.
 *
 * EVERYTHING HERE IS READ BACK FROM WHAT THE ENGINE COMPUTED, never recomputed. Recomputing is the
 * mistake that produces a screen quietly disagreeing with the ledger, and the disagreement shows up
 * as a balanced journal entry for the wrong amount, which nothing downstream can catch.
 *
 * `JournalEntryPreview` and `BlockerResult` are declared in orders-save-order.input.ts and shared —
 * CodeGen emits every type file into one namespace, so they are referenced rather than redeclared.
 *
 * NO import statements — definitions are emitted verbatim.
 */

/** What one order looks like after the payment landed on it. */
export interface CapturePaymentOrderEffect {
    OrderHeaderID: string;
    OrderNumber: string;
    /** As the rollup triggers left it, not as the operation calculated it. */
    AmountPaid: number;
    Balance: number;
    PaymentStatus: string;
    /**
     * True when this order's balance went NEGATIVE — the customer over-paid and the surplus is now
     * spendable credit (D68). Not an error: the account-credit screen depends on these existing.
     */
    HasCredit: boolean;
}

export interface OrdersCapturePaymentOutput {
    Success: boolean;
    Message?: string;

    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    /** Expected 'Captured'. Null on a refusal or a preview that found blockers. */
    Status?: string | null;

    /** As booked, after the engine has had its say. */
    Amount?: number;
    /**
     * The provider's cut, computed SERVER-SIDE. Never accepted as input — a client-supplied fee is a
     * client-supplied general-ledger amount, and the client cannot see the provider's schedule.
     * Zero for tenders with no provider.
     */
    ProcessingFeeAmount?: number;
    /** What actually reached the bank: Amount minus the fee. */
    NetAmount?: number;

    OrderEffects?: CapturePaymentOrderEffect[];

    /** The entries this produced, so a screen can show what moved. */
    JournalEntries?: JournalEntryPreview[];
    EntryCount?: number;
    AllBalanced?: boolean;

    /** Refusals, in the shape the UI already renders. */
    Blockers?: BlockerResult[];

    /**
     * True when nothing was written because this was a preview. The numbers above are what a real
     * capture WOULD produce — they come from running it and rolling back, not from a second model.
     */
    WasPreview?: boolean;

    /**
     * True when an `IdempotencyKey` matched an existing payment and THIS CALL TOOK NO MONEY. The
     * fields above describe that original payment, so a retry after a timeout shows the user what
     * actually happened rather than a spurious failure or a second charge.
     */
    WasRetry?: boolean;
    /** Echoed back so a caller can correlate, and so a retry is legible in a log. */
    IdempotencyKey?: string | null;
}

/**
 * A journal entry the capture will (or did) produce. Read-only everywhere in Orders.
 *
 * Declared here because this is now the only operation that reports entries — it moved with its last
 * user rather than being kept alive in a shared file nobody owned.
 */
export interface JournalEntryPreview {
    CompanyID: string;
    CompanyName: string;
    /** Which order line caused it. One entry per line, always. */
    LineNumber?: number | null;
    /** Set once the entry exists; null while previewing. */
    JournalEntryID?: string | null;
    EntryType: string;
    Balanced: boolean;
    Lines: Array<{ Side: 'Dr' | 'Cr'; AccountRole: string; AccountName: string; Amount: number }>;
}
