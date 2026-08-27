/**
 * Output for `Orders.CheckEntitlement`.
 *
 * `Decision` is why, not just whether — expired, revoked, never bought, and not-yet-valid
 * are three screens. Unknown person and known-person-without-access share this shape
 * (`HasAccess: false`, `Decision: 'NoGrant'`). Dates are ISO strings.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type EntitlementDecision =
    | 'Granted'
    | 'NoGrant'
    | 'NotYetValid'
    | 'Expired'
    | 'Revoked'
    | 'Suspended'
    | 'SubscriptionInactive';

export interface CheckEntitlementOutput {
    HasAccess: boolean;
    Decision: EntitlementDecision;
    ValidFrom?: string;
    /** When access actually ends — grant window, or subscription access-through after cancel. */
    ValidTo?: string;
    /** ResourceQuantity — seats. Null for Feature/AccessLevel. */
    Quantity?: number;
    /** Audit handle of the winning grant. */
    GrantID?: string;
    EvaluatedAt: string;
    /** min(ValidTo, wall-clock now + 60s). Never derived from AsOf. Fail closed when stale. */
    CacheUntil: string;
}
