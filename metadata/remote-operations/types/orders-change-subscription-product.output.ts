/**
 * Output for `Orders.ChangeSubscriptionProduct`.
 *
 * One entry per subscription asked for, whether or not it changed.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SubscriptionProductChange {
    SubscriptionID: string;
    SubscriptionNumber: string | null;
    PreviousProductID: string | null;
    PreviousProductName: string | null;
    CurrentProductID: string | null;
    CurrentProductName: string | null;
    /** True when the subscription was also moved to the product's subscription type. */
    TypeMoved: boolean;
    /** Something a person should know about a row that was written: the product is sold by another company, for one. */
    Warning?: string;
    /** True when the row was written. False when it was already on the product, or when it failed. */
    Changed: boolean;
    /** Set when this subscription could not be changed: not found, a type that differs, or a refused save. */
    Error?: string;
}

export interface OrdersChangeSubscriptionProductOutput {
    Success: boolean;
    Message?: string;
    Updated: number;
    Unchanged: number;
    Failed: number;
    Changes: SubscriptionProductChange[];
}
