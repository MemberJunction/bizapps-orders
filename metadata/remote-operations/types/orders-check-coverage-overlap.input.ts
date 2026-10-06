/**
 * Input for `Orders.CheckCoverageOverlap`.
 *
 * Whether any subscription line of a saved draft order would overlap coverage its holder already
 * has for another band of the same subscription family, and what confirm will do about it. The
 * order editor asks this so the notice it shows is the same rule confirm enforces.
 *
 * Read-only.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface CheckCoverageOverlapInput {
    /** A saved order. Only its saved lines are checked. */
    OrderHeaderID: string;
}
