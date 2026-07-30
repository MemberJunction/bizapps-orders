/**
 * Output for `Orders.SaveOrder`.
 *
 * Carries the priced decomposition back, so a caller that saved does not then
 * have to preview to learn what it saved. Shapes come from the shared block in
 * `orders-save-order.input.ts` — see the note at the top of that file for why.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersSaveOrderOutput {
    Success: boolean;
    Message?: string;
    /** Absent on a preview. */
    OrderHeaderID?: string;
    /** Assigned from the sequence at CONFIRM, not at draft save, so this is usually absent. */
    OrderNumber?: string | null;
    Status?: string;
    /** The priced lines, in the order they were saved, each carrying its ClientKey back. */
    Lines?: OrderLineResult[];
    Totals?: OrderTotalsResult;
    Charges?: ChargeResult[];
    Promotions?: PromotionResult[];
    /** Anything that stopped the save, stated in the words of the rule that failed. */
    Blockers?: BlockerResult[];
}
