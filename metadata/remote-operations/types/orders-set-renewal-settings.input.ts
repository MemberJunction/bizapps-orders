/**
 * Input for `Orders.SetRenewalSettings`.
 *
 * Sets the renewal switches on one or more subscriptions: the auto-renew flag and the annual
 * increase the renewal pricer reads first (`Subscription.RenewalIncreasePercent`). Writes the
 * subscription rows and nothing else: no order is touched, no renewal is placed or repriced. The
 * next renewal each subscription places, by the scheduled pass or from the Renewals page, follows
 * the new settings.
 *
 * A field left out is left alone; at least one must be given.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersSetRenewalSettingsInput {
    /** The subscriptions to set. Every ID must be a subscription's row ID. */
    SubscriptionIDs: string[];
    /**
     * Whether the scheduled pass renews the subscription. `true` places a confirmed renewal at lead
     * time; `false` lets the term end unless somebody renews it by hand. A subscription a payment
     * gateway bills refuses this change (the gateway owns the switch), and is reported, not failed.
     * Left out: unchanged.
     */
    AutoRenew?: boolean;
    /**
     * The rate in percent, so 5 means five percent: 0 to 100, at most four decimals. `null` clears
     * the subscription's own rate, so it inherits the product's, then its category's, then the
     * company's. `0` is a deliberate "no increase" that overrides all of those. Left out: unchanged.
     */
    IncreasePercent?: number | null;
}
