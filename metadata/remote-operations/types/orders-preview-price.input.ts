/**
 * Input for `Orders.PreviewPrice`.
 *
 * Resolves ONE product's price through the real pipeline. The narrow sibling of
 * `Orders.PreviewOrder`: this answers "what does this cost", that answers "what
 * does this order come to". The pricing screen's resolution-walk visualiser and
 * the order line's price badge both read this.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface PreviewPriceInput {
    ProductID: string;
    /** Defaults to 1 — the common "what does one cost" question. */
    Quantity?: number;
    /** Who is buying. Either may be omitted; both omitted means base pricing. */
    OrganizationID?: string | null;
    PersonID?: string | null;
    /** Defaults to now. Pass a future date to check a seasonal rate before it starts. */
    AsOf?: string;
    /** Force a specific list, ignoring the customer's assignment — for "what if" comparisons. */
    PriceListID?: string | null;
    FeeType?: string;
}
