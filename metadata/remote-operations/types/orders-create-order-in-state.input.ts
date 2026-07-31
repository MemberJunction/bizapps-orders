/**
 * Input for `Orders.CreateOrderInState`.
 *
 * WHAT THIS IS FOR. Back-office entry of something that has ALREADY happened — a sale taken at a
 * counter, a shipment that went out before anyone opened the system, a migration from whatever came
 * before. The order needs to land in its final state without a human clicking through Draft →
 * Confirmed → Posted → Fulfilled.
 *
 * WHAT IT IS NOT. A shortcut past booking. It runs the REAL confirm path — the same
 * `Orders.ConfirmOrder` machinery, the same per-line journal entries, the same subscription
 * materialisation and entitlement grants — and only then advances the status. An operation that
 * wrote `Status = 'Fulfilled'` directly would produce an order that looks complete and has no
 * ledger behind it, which is precisely the failure nothing downstream can detect: the order
 * reconciles against itself, and the money simply never existed (D17).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCreateOrderInStateInput {
    /**
     * The order to create. Same shape `Orders.ConfirmOrder` takes, so there is one draft mapping to
     * be right rather than two.
     */
    Draft: OrderDraftInput;

    /**
     * Where it should end up: 'Confirmed', 'Posted' or 'Fulfilled'.
     *
     * 'Draft' and 'Quoted' are not accepted — that is `Orders.SaveOrder`, and routing them here
     * would run booking on an order that is not meant to be locked yet. 'Voided' is not accepted
     * either: voiding is a decision about an existing order, not a state to create one in.
     */
    TargetStatus: string;

    /**
     * The date the thing actually happened, when it is not today. Back-dating is the normal case
     * here — this operation exists because the event preceded the record.
     */
    OrderDate?: string | null;

    /**
     * Refuse if the order's gross total does not come to this. Same guard `ConfirmOrder` offers, and
     * worth more here: a migration that silently reprices at today's rates rather than the rate the
     * customer was charged is a defect that looks like a successful import.
     */
    ExpectedGrossTotal?: number | null;

    /**
     * Advance to Fulfilled even when some fulfillable lines cannot be marked — a migration where the
     * shipment records are incomplete. Default false, because an order marked Fulfilled with unshipped
     * lines is a promise the system now claims to have kept.
     */
    ForceFulfillment?: boolean;

    /** Recorded on the order, so the row says why it skipped the usual path. */
    Reason?: string | null;
}
