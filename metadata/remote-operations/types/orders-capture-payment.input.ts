/**
 * Input for `Orders.CapturePayment`.
 *
 * WHY THIS OPERATION EXISTS. A payment is a HEADER plus its ALLOCATION LINES, and the two must be
 * written in one transaction. `PaymentHeaderEntityServer.Lines` is a TRANSIENT collection, not a
 * column, so CodeGen cannot emit it on the client entity and a browser `entity.Save()` has nowhere
 * to put the allocations. That is the same situation `Orders.SaveOrder` was built for, and it needs
 * the same answer: one call, one transaction.
 *
 * A two-step create-then-allocate flow was rejected. Between the steps there would be a captured
 * payment with no allocations in the database — cash recorded against nothing — and any failure in
 * the second step would leave it there permanently.
 *
 * NOTE ON THE FEE: it is deliberately NOT an input. A client-supplied fee is a client-supplied
 * general-ledger amount, and the client has no access to the provider's schedule. The server
 * computes it and returns it.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCapturePaymentAllocationInput {
    OrderHeaderID: string;
    Amount: number;
    /** Settle a specific LINE rather than the order as a whole. Optional. */
    OrderLineID?: string | null;
}

/** Instrument detail, when the tender needs one. Never the PAN — only tokens and references (D38). */
export interface OrdersCapturePaymentDetailInput {
    PaymentProviderID?: string | null;
    ProviderInstrumentRef?: string | null;
    SourceCustomerPaymentMethodID?: string | null;
    ReferenceNumber?: string | null;
    InstrumentDate?: string | null;
}

export interface OrdersCapturePaymentInput {
    /**
     * The `PaymentIntent` row this payment settles, from `Orders.OpenPaymentIntent`.
     *
     * REQUIRED FOR A GATEWAY-COLLECTED PAYMENT and meaningless without one. `PaymentHeaderEntityServer`
     * reads the gateway's own intent string THROUGH this row on the way to capture; a provider-backed
     * payment that does not carry it is refused with "there is nothing for the gateway to capture".
     *
     * Omitted for a RECORDED payment — a cheque, a wire, cash — where the money moved before any of
     * this code ran and there is no gateway to ask.
     */
    PaymentIntentID?: string | null;

    /**
     * Gross amount received. Must equal the sum of `Allocations[].Amount` (D68).
     *
     * The invariant is checked HERE rather than trusted from the caller: the page enforces it before
     * emitting, but the operation is the trust boundary, and a mismatch means cash recorded against
     * nothing or an order credited with money that never arrived.
     */
    Amount: number;

    /** Which company received the cash. */
    ReceivingCompanyID: string;

    /** Who paid. Exactly one of these. */
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;

    /**
     * Tender by CODE, not id — the client should not have to resolve a lookup to take money. An
     * unknown code is refused by name rather than falling back to a default tender, because a
     * payment silently recorded as the wrong kind is invisible until somebody reconciles.
     */
    TenderCode: string;

    /** 'YYYY-MM-DD'. Defaults to today. */
    PaymentDate?: string;

    /** Cheque number, wire confirmation, free text. */
    Reference?: string | null;
    Notes?: string | null;

    /** Where the money lands. Must be non-empty. */
    Allocations: OrdersCapturePaymentAllocationInput[];

    PaymentDetail?: OrdersCapturePaymentDetailInput | null;

    /** Spend a stored-value balance instead of taking new cash. */
    SourceOrderHeaderID?: string | null;

    /**
     * Makes this call safe to retry. A double-clicked Capture, a retry after a timeout, a queue
     * redelivery — all must take the money ONCE.
     *
     * Supply a token the CLIENT generates when the user opens the form, not one derived from the
     * amount: two people legitimately paying the same amount on the same day must both go through.
     * A repeat call with the same token returns the ORIGINAL payment and sets `WasRetry`, rather
     * than taking money again or reporting a spurious failure.
     *
     * Optional. Without it a retry takes the payment twice, which is the caller's choice to make.
     */
    IdempotencyKey?: string | null;

    /**
     * Compute and validate WITHOUT writing.
     *
     * Runs the REAL capture inside a transaction that always rolls back — not a separate model of
     * the arithmetic. A preview that reimplements the calculation eventually disagrees with the
     * capture, and the disagreement surfaces as a balanced journal entry for the wrong amount, which
     * nothing downstream can catch.
     */
    Preview?: boolean;
}
