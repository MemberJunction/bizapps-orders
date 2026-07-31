/**
 * Input for `Orders.ConfirmOrder`.
 *
 * The irreversible step. In ONE transaction it saves the draft (if one is
 * supplied), transitions to `Confirmed`, books one journal entry per line,
 * decides and writes subscriptions, issues entitlement grants, and captures the
 * initial payment when the order carries one. Any failure rolls back everything —
 * a confirmed order without its entries is invalid state, not a partial success.
 *
 * Two call shapes:
 *   - `OrderHeaderID` — confirm an already-saved draft.
 *   - `Draft` — save and confirm together, for a caller that never persisted one.
 *
 * Shapes come from the shared block in `orders-save-order.input.ts`.
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersConfirmOrderInput {
    /** Confirm an existing draft. Mutually exclusive with `Draft`. */
    OrderHeaderID?: string;
    /** Save-and-confirm in one call. Mutually exclusive with `OrderHeaderID`. */
    Draft?: OrderDraftInput;
    /**
     * Refuse the confirm unless the gross matches this to the cent. The number the
     * user was looking at when they pressed the button — so a price that moved
     * underneath them (a promotion that expired mid-session, a rate that changed)
     * stops the confirm instead of silently booking a different amount.
     */
    ExpectedGrossTotal?: number;
    /**
     * Proceed even though a sales rule requires approval, recording the approval
     * against the acting user. Refused unless they hold the authority.
     */
    ApprovalOverrideReason?: string;
}
