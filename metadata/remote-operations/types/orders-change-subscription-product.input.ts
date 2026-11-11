/**
 * Input for `Orders.ChangeSubscriptionProduct`.
 *
 * Corrects the product on one or more subscriptions: what they are subscriptions TO, and so what
 * their next renewal is placed on. Writes the subscription rows and nothing else. The order that
 * sold the current term, its journal and its deal keep the product they were booked with; the next
 * renewal carries the new product at the current term's price plus the increase.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersChangeSubscriptionProductInput {
    /** The subscriptions to correct. Every ID must be a subscription's row ID. */
    SubscriptionIDs: string[];
    /** The product they should be on: Active, and a subscription product (one with a subscription type). */
    ProductID: string;
    /**
     * When the product's subscription type differs from a subscription's, move the subscription to
     * the product's type as well (term length, cadence and lead time follow the type). Left out or
     * false, such a subscription is refused and reported, so a term length never changes unnoticed.
     */
    AdoptProductType?: boolean;
}
