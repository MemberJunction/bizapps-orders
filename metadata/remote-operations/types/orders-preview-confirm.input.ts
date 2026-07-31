/**
 * Input for `Orders.PreviewConfirm`.
 *
 * A dry run of `Orders.ConfirmOrder` that writes NOTHING: it resolves a GL
 * account for every role every line needs, runs the subscription decision,
 * resolves entitlement policy, and evaluates sales rules — then reports what
 * would happen and what would stop it.
 *
 * This exists so a user learns about an unresolvable account BEFORE pressing the
 * button rather than from a red banner after. It must stay in lock-step with
 * ConfirmOrder: an integration check asserts that what this predicts is what
 * confirming actually does, because a preview that can disagree with reality is
 * worse than no preview at all.
 *
 * Shapes come from the shared block in `orders-save-order.input.ts`.
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPreviewConfirmInput {
    /** Preview confirming an existing draft. Mutually exclusive with `Draft`. */
    OrderHeaderID?: string;
    /** Preview confirming an unsaved draft. Mutually exclusive with `OrderHeaderID`. */
    Draft?: OrderDraftInput;
}
