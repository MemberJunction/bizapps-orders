/**
 * The dimension values that follow from what a line IS, not from what its product is mapped to.
 *
 * `DimensionDefaultResolver` answers the axes a product implies — Venture, Product, and the Event
 * an event product belongs to. Two axes cannot come from a mapping table, because they are facts
 * about this particular line:
 *
 *   ARR-Type  — New when the line starts a subscription, Renewal when it continues one. The same
 *               product sells both, on the same day, so no product-level default can answer it.
 *   Vintage   — the year the event happens, which lives on the event product's own date. A mapping
 *               row per product per year would have to be written before each season and would
 *               silently stop being written.
 *
 * These are resolved to `DimensionValue` rows BY CODE, because that is the only stable handle: the
 * ids are minted by whatever pulls the dimensions out of Business Central, and differ per
 * environment.
 *
 * A MISSING VALUE IS SKIPPED, NOT INVENTED. If the ARR-Type dimension has no `New` value, the line
 * goes untagged on that axis rather than tagged with a guess, and the same check that refuses a
 * line missing a REQUIRED dimension is what turns that into a refusal — this module never decides
 * that a booking should fail.
 *
 * CONNECTS TO:
 *   VOCABULARY: __mj_BizAppsAccounting Dimension / DimensionValue, via AccountingEngineBase
 *   CALLER:     OrderEntityServer.stampLineDimensions (./OrderEntityServer.ts)
 */
import type { LineDimensionTag } from './LineDimensionMerge.js';

/** The dimension codes this module reads. They are Business Central's, not invented here. */
export const DIMENSION_CODE = {
    ARRType: 'ARR-TYPE',
    Vintage: 'VINTAGE',
} as const;

/** The ARR-Type values. A subscription line is one or the other; a non-subscription line is neither. */
export const ARR_TYPE_VALUE_CODE = {
    New: 'NEW',
    Renewal: 'RENEWAL',
} as const;

/** What the accounting engine's caches look like to this module, declared structurally. */
export interface DimensionVocabulary {
    Dimensions: Array<{ ID: string; Code: string; IsActive: boolean }>;
    DimensionValues: Array<{ ID: string; DimensionID: string; Code: string; IsActive: boolean }>;
}

/** Everything about a line these rules need, gathered by the caller. */
export interface LineDimensionFacts {
    /**
     * What the order's subscription pass decided for this line: `CreateNew` starts coverage,
     * `ExtendExisting` and `Reactivate` continue it. Absent on a line that buys no subscription.
     *
     * Taken from the DECISION rather than from `SubscriptionTerm.TermNumber`, which would be the
     * more obvious source and is not available: terms are written later in the same save, so at
     * stamping time the number does not exist yet.
     */
    SubscriptionAction?: 'CreateNew' | 'ExtendExisting' | 'Reactivate' | 'Reject' | null;
    /** The event's start, when the line's product is an event. Its YEAR is the vintage. */
    EventStartsAt?: Date | string | null;
}

/** Find an active dimension by code, case-insensitively — codes arrive from an external system. */
function dimensionByCode(vocabulary: DimensionVocabulary, code: string): { ID: string } | undefined {
    return vocabulary.Dimensions.find((d) => d.IsActive && d.Code.trim().toUpperCase() === code);
}

/** Find an active value of a dimension by code. */
function valueByCode(
    vocabulary: DimensionVocabulary,
    dimensionID: string,
    code: string,
): { ID: string } | undefined {
    const axis = dimensionID.toLowerCase();
    return vocabulary.DimensionValues.find(
        (v) => v.IsActive && v.DimensionID.toLowerCase() === axis && v.Code.trim().toUpperCase() === code,
    );
}

/**
 * The ARR-Type tag for a line, or nothing.
 *
 * `Reject` yields nothing: the subscription pass refused the line, so there is no term to call new
 * or renewed, and the save is about to fail anyway.
 */
export function DeriveARRType(
    facts: LineDimensionFacts,
    vocabulary: DimensionVocabulary,
): LineDimensionTag | null {
    const action = facts.SubscriptionAction;
    if (!action || action === 'Reject') return null;

    const dimension = dimensionByCode(vocabulary, DIMENSION_CODE.ARRType);
    if (!dimension) return null;

    const code = action === 'CreateNew' ? ARR_TYPE_VALUE_CODE.New : ARR_TYPE_VALUE_CODE.Renewal;
    const value = valueByCode(vocabulary, dimension.ID, code);
    return value ? { DimensionID: dimension.ID, DimensionValueID: value.ID } : null;
}

/**
 * The Vintage tag for a line, or nothing.
 *
 * The year is read in UTC. Event dates are stored as `DATETIMEOFFSET` and an event starting on
 * 1 January local time must not be filed under the previous year because the server sits west of
 * the venue.
 */
export function DeriveVintage(
    facts: LineDimensionFacts,
    vocabulary: DimensionVocabulary,
): LineDimensionTag | null {
    if (!facts.EventStartsAt) return null;
    const startsAt = new Date(facts.EventStartsAt);
    if (Number.isNaN(startsAt.getTime())) return null;

    const dimension = dimensionByCode(vocabulary, DIMENSION_CODE.Vintage);
    if (!dimension) return null;

    const value = valueByCode(vocabulary, dimension.ID, String(startsAt.getUTCFullYear()));
    return value ? { DimensionID: dimension.ID, DimensionValueID: value.ID } : null;
}

/** Both rules, in one call. Order is irrelevant — they never name the same axis. */
export function DeriveLineDimensions(
    facts: LineDimensionFacts,
    vocabulary: DimensionVocabulary,
): LineDimensionTag[] {
    return [DeriveARRType(facts, vocabulary), DeriveVintage(facts, vocabulary)].filter(
        (tag): tag is LineDimensionTag => tag !== null,
    );
}
