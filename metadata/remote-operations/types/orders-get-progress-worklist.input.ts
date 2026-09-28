/**
 * Input for `Orders.GetProgressWorklist`.
 *
 * The monthly attestation list: every open percentage-of-completion line with its last
 * observation, so the delivery lead can state this period's (plan §9.4, version 1).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetProgressWorklistInput {
    /** Restrict to lines sold by these companies. Omit for everything in scope. */
    CompanyIDs?: string[];
    /** Include lines already attested at 100%. Off by default — a finished line has nothing to attest. */
    IncludeComplete?: boolean;
    /** Cap the result. Defaults to 500. */
    MaxCount?: number;
}
