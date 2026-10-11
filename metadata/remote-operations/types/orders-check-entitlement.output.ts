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

/**
 * Why a grant is suspended: waiting for its first payment (a new purchase), past due beyond the
 * renewal cutoff, or waiting for activation.
 */
export type EntitlementSuspensionReason = 'AwaitingPayment' | 'PastDue' | 'AwaitingActivation';

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
    /** Present only with `Decision: 'Suspended'`: why access is held. Null when no reason is recorded (a suspension a person made). */
    SuspensionReason?: EntitlementSuspensionReason | null;
    /**
     * Present only while access holds on a renewal that is past due: the last day (`YYYY-MM-DD`, business
     * time zone) access is kept before the past-due cutoff suspends it, or an approved cutoff deferral's
     * last day when that is later.
     */
    AccessCutoffDate?: string;
    EvaluatedAt: string;
    /** min(ValidTo, wall-clock now + 60s). Never derived from AsOf. Fail closed when stale. */
    CacheUntil: string;
}
