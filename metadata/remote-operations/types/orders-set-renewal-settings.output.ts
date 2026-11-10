/**
 * Output for `Orders.SetRenewalSettings`.
 *
 * One entry per subscription asked for, whether or not it changed, so a bulk update from a page
 * can say exactly what it did and what it could not.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RenewalSettingsState {
    AutoRenew: boolean | null;
    /** The subscription's own rate. `null` means it inherits. */
    IncreasePercent: number | null;
}

export interface RenewalSettingsChange {
    SubscriptionID: string;
    SubscriptionNumber: string | null;
    /** The settings before this call. */
    Previous: RenewalSettingsState;
    /** The settings after this call. Equals `Previous` when nothing changed. */
    Current: RenewalSettingsState;
    /** True when the row was written. False when it already held the settings, or when it failed. */
    Changed: boolean;
    /** Set when this subscription could not be updated: not found, or the save was refused. */
    Error?: string;
}

export interface OrdersSetRenewalSettingsOutput {
    Success: boolean;
    Message?: string;
    /** Rows written. */
    Updated: number;
    /** Rows that already held the settings. */
    Unchanged: number;
    /** Rows that could not be written; each carries its reason. */
    Failed: number;
    Changes: RenewalSettingsChange[];
}
