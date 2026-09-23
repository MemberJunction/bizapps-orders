/**
 * What dimension tags an order line contributes to the journal entries it produces.
 *
 * TWO SOURCES, AND THEY ARE NOT ALTERNATIVES. `OrderLineDimension` is the long-standing child
 * table, which `OrderJournalEntryFactory` has always read. `OrderLine.DimensionID` /
 * `.DimensionValueID` are the single tag stated on the line itself (golive #236) — the one an
 * order taker can actually set, since nothing ever wrote a child row. A line may carry both.
 *
 * CONNECTS TO:
 *   CALLER: OrderJournalEntryFactory (./OrderJournalEntryFactory.ts)
 */

/** A tag as accounting takes it: the axis and the point on it, both required. */
export interface LineDimensionTag {
    DimensionID: string;
    DimensionValueID: string;
}

/** The pair of columns on the order line, either half of which may be absent. */
export interface LineDimensionColumns {
    DimensionID?: string | null;
    DimensionValueID?: string | null;
}

/**
 * Merge the line's own tag with its child rows.
 *
 * THE COLUMN WINS ON ITS OWN AXIS. A child row and the column naming the same `DimensionID` would
 * hand accounting two values for one dimension, and `UQ_JELDimension_Line_Dimension` refuses a
 * journal entry line tagged twice on the same axis — so the conflict would fail the whole booking
 * rather than show itself. The column is what a person set on this order, so it is the half that
 * survives; the child row's other axes are kept untouched.
 *
 * A COLUMN PAIR IS ONLY A TAG WHEN BOTH HALVES ARE PRESENT. `CK_OrderLine_DimensionPair` makes that
 * a database rule, but rows written before the constraint existed are read by this code too, and a
 * dimension with no value is not something accounting can record.
 *
 * Comparison is case-insensitive: SQL Server returns `UNIQUEIDENTIFIER` uppercased while a
 * browser-minted id is lower case, and a case-sensitive match here would let the duplicate through
 * to the failure this function exists to prevent.
 */
export function MergeLineDimensions(
    columns: LineDimensionColumns,
    childRows: readonly LineDimensionTag[],
): LineDimensionTag[] {
    const { DimensionID, DimensionValueID } = columns;
    if (!DimensionID || !DimensionValueID) return [...childRows];

    const axis = DimensionID.toLowerCase();
    return [
        ...childRows.filter((row) => row.DimensionID.toLowerCase() !== axis),
        { DimensionID, DimensionValueID },
    ];
}

/**
 * Combine the tags a product's mapping implies with the tags derived from the line itself.
 *
 * THE RULE WINS ON A SHARED AXIS. They normally address different ones — Venture, Product and Event
 * come from the mapping, ARR-Type and Vintage are facts about this line — but where both name the
 * same axis the rule is the more specific answer: it was computed from this line, while the mapping
 * is a default somebody set on a product, a category or a company.
 *
 * Case-insensitive on the axis for the same reason as `MergeLineDimensions`: ids arrive from SQL
 * Server uppercased and from a browser lower case, and a missed match here would send accounting two
 * values for one dimension, which it refuses.
 */
export function MergeDerivedTags(
    fromMapping: readonly LineDimensionTag[],
    fromRules: readonly LineDimensionTag[],
): LineDimensionTag[] {
    const ruleAxes = new Set(fromRules.map((tag) => tag.DimensionID.toLowerCase()));
    return [
        ...fromMapping.filter((tag) => !ruleAxes.has(tag.DimensionID.toLowerCase())),
        ...fromRules,
    ];
}
