/**
 * Output for `Orders.ListEntitlements`.
 *
 * One row per Code, each evaluated the same way as a point check. Not a second
 * source of truth for access — the LXP still asks at the gate.
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

export interface ListedEntitlement {
    Code: string;
    HasAccess: boolean;
    Decision: EntitlementDecision;
    ValidFrom?: string;
    ValidTo?: string;
    Quantity?: number;
    GrantID?: string;
    CacheUntil: string;
}

export interface ListEntitlementsOutput {
    EvaluatedAt: string;
    Items: ListedEntitlement[];
}
