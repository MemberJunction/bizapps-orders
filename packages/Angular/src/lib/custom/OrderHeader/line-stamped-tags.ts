import { UUIDsEqual } from '@memberjunction/global';
import type { MJODimensionOption } from '../../data/orders-queries';

/**
 * The tags a saved order line books, as the line details panel shows them.
 *
 * WHY THE PANEL NEEDS THESE. The panel's picker binds to the one tag stated on the line itself. The
 * tags a line actually books are the `OrderLineDimension` rows the server writes on save: the
 * product's defaults plus that hand-set tag on its own axis. Showing only the picker made a line
 * with a stamped default read "none", and choosing a value replaced the default with no sign that
 * one was there.
 */
export interface MJOStampedTag {
    DimensionID: string;
    DimensionLabel: string;
    ValueID: string;
    ValueLabel: string;
    /** `line` when this axis is the one set by hand on the line, `default` when it was derived. */
    Source: 'default' | 'line';
}

/** The fields of a stored tag row this reads, so tests need no entity. */
export interface MJOStoredTagRow {
    DimensionID: string;
    DimensionValueID: string;
    Dimension?: string | null;
    DimensionValue?: string | null;
}

/**
 * Turn a line's stored tag rows into what the panel lists, in the catalog's dimension order.
 *
 * `savedLineAxis` is the line's hand-set axis AS SAVED, read when the rows were loaded. The rows
 * already carry that tag (the server merges it on save), so it is the only way to tell a hand-set
 * row from a derived one. Labels come from the catalog; a value it does not list (one whose
 * effective window has closed) falls back to the name the row's view carries.
 */
export function BuildStampedTags(
    rows: readonly MJOStoredTagRow[],
    savedLineAxis: string | null,
    catalog: readonly MJODimensionOption[],
): MJOStampedTag[] {
    const order = (dimensionID: string): number => {
        const index = catalog.findIndex((d) => UUIDsEqual(d.ID, dimensionID));
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };

    return [...rows]
        .sort((a, b) => order(a.DimensionID) - order(b.DimensionID))
        .map((row) => {
            const dimension = catalog.find((d) => UUIDsEqual(d.ID, row.DimensionID));
            const value = dimension?.Values.find((v) => UUIDsEqual(v.ID, row.DimensionValueID));
            return {
                DimensionID: row.DimensionID,
                DimensionLabel: dimension ? `${dimension.Code} — ${dimension.Name}` : (row.Dimension ?? row.DimensionID),
                ValueID: row.DimensionValueID,
                ValueLabel: value ? `${value.Code} — ${value.Name}` : (row.DimensionValue ?? row.DimensionValueID),
                Source: savedLineAxis && UUIDsEqual(savedLineAxis, row.DimensionID) ? 'line' : 'default',
            };
        });
}

/**
 * The default a choice would replace, or null when the choice replaces nothing worth asking about.
 *
 * Asked only for a DERIVED tag: replacing a value someone already set by hand is the ordinary edit
 * the picker is for. Choosing the default's own value is not a replacement either.
 */
export function DefaultReplacedBy(
    stamped: readonly MJOStampedTag[],
    dimensionID: string,
    valueID: string,
): MJOStampedTag | null {
    if (!dimensionID || !valueID) return null;
    const hit = stamped.find((tag) => UUIDsEqual(tag.DimensionID, dimensionID));
    if (!hit || hit.Source !== 'default') return null;
    return UUIDsEqual(hit.ValueID, valueID) ? null : hit;
}

/** The value stamped on an axis, for the hint under the value picker. */
export function StampedOn(stamped: readonly MJOStampedTag[], dimensionID: string): MJOStampedTag | null {
    if (!dimensionID) return null;
    return stamped.find((tag) => UUIDsEqual(tag.DimensionID, dimensionID)) ?? null;
}
