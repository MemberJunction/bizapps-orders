/**
 * Input for `Orders.CheckEntitlement`.
 *
 * Asked by capability Code, not SKU. PersonID is authoritative; email is a convenience
 * resolution (normalised, ambiguous-if-duplicate). AsOf is diagnostics only — the trust
 * path omits it and evaluates at now.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface CheckEntitlementInput {
    /** Authoritative person key. When present, Email is ignored. */
    PersonID?: string;
    /** Convenience. Normalised; more than one matching person is treated as no grant. */
    Email?: string;
    /** `ProductEntitlement.Code` — unique per product, not globally. Convention: APP_AREA_TIER. */
    Code: string;
    /** Diagnostics only. Omit on the trust path. */
    AsOf?: string;
    /** Optional narrowing via the template product's company. */
    CompanyID?: string;
}
