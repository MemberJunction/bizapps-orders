/**
 * Input for `Orders.PreviewOrder`.
 *
 * Runs the REAL pricing pipeline over an unsaved draft and returns the full
 * decomposition without writing anything. This is what makes continuous preview
 * honest: there is no second implementation of the pricing rules living in the
 * browser beside the engine, which is the thing that eventually disagrees.
 *
 * Shapes come from the shared block in `orders-save-order.input.ts`.
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPreviewOrderInput {
    Draft: OrderDraftInput;
    /**
     * Include the per-line journal-entry projection. Costs a GL-account resolution
     * walk per line, so order entry leaves it off while typing and the Accounting
     * tab turns it on.
     */
    IncludeJournalEntries?: boolean;
}
