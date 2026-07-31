/**
 * Output for `Orders.CreateOrderInState`.
 *
 * Mirrors `OrdersConfirmOrderOutput` and adds the lifecycle trail, because the whole point of this
 * operation is that it moved through states rather than landing in one — and a caller importing a
 * thousand orders needs to see WHERE one stopped, not just that it did.
 *
 * NO import statements — definitions are emitted verbatim.
 */

/** One step the order actually took. Recorded even when it was a no-op, so the trail is complete. */
export interface OrderStateTransition {
    From: string;
    To: string;
    /** False when the step was refused or skipped; `Reason` then says why. */
    Applied: boolean;
    Reason?: string | null;
}

export interface OrdersCreateOrderInStateOutput {
    Success: boolean;
    Message?: string;

    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    /** Where it actually ended up, which is not always where it was asked to go. */
    Status?: string | null;
    /** What the caller asked for, echoed so a partial result is legible without the request. */
    RequestedStatus?: string | null;

    /** Draft → Confirmed → Posted → Fulfilled, in the order taken. */
    Transitions?: OrderStateTransition[];

    Totals?: OrderTotalsResult;

    /**
     * The entries the CONFIRM produced. Present because this operation's entire justification is
     * that it books properly — an empty list on a successful create is the defect it exists to
     * prevent, not a formatting detail.
     */
    JournalEntries?: JournalEntryPreview[];
    EntryCount?: number;
    AllBalanced?: boolean;

    /**
     * Fulfillable lines still Pending when the target was Fulfilled. Non-zero only with
     * ForceFulfillment, and worth surfacing: the order now claims to have shipped things it has no
     * record of shipping.
     */
    UnfulfilledLineCount?: number;

    Blockers?: BlockerResult[];
}
