/**
 * Output for `Orders.PreviewPrice`.
 *
 * `Components` is the explanation, not decoration — it is what lets a price badge
 * show the walk that produced the number instead of asserting it.
 *
 * NO import statements — definitions are emitted verbatim.
 */

/** One line of the explanation. */
export interface PreviewComponent {
    ComponentType: string;
    Label: string;
    Amount: number;
    RunningTotal: number;
}

export interface PreviewPriceOutput {
    Success: boolean;
    Message?: string;
    UnitPrice?: number;
    ExtendedAmount?: number;
    Quantity?: number;
    /** The list that applied, and how it was arrived at. */
    PriceListID?: string | null;
    PriceListName?: string | null;
    /** Which rule won, for a rule author checking their work. */
    ProductPriceID?: string | null;
    /** Which resolver answered — 'default', or a plugin key like `Company:<id>`. */
    ResolvedBy?: string;
    Components?: PreviewComponent[];
}
