/**
 * Input for `Orders.ListEntitlements`.
 *
 * The person's library. Same identity rules as CheckEntitlement. Heavier auth scope
 * than the point check — a library key must not become an authorization oracle.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ListEntitlementsInput {
    PersonID?: string;
    Email?: string;
    /** Diagnostics only (historical audit). Future values are rejected. CacheUntil is from wall-clock now. */
    AsOf?: string;
    CompanyID?: string;
    /** When false, only in-force capabilities. Default true. */
    IncludeInactive?: boolean;
}
