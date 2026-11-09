/**
 * @fileoverview Which subscription type a product uses, shared by confirm and every screen that
 * decides whether a line is a subscription (golive #339).
 *
 * A product either names its subscription type or inherits its product type's default. Confirm
 * has always honored both; a screen that read only the product's own column treated every
 * inheriting product as a one-time sale, so it never asked the extend-or-new question or showed a
 * term start, and confirm then made that choice by itself.
 *
 * @module @mj-biz-apps/orders-entities
 */

/**
 * `Product.SubscriptionTypeID` when set, otherwise the product type's `DefaultSubscriptionTypeID`.
 * Null means the line is not a subscription: no term, no service period from this path.
 */
export function ResolveSubscriptionTypeID(
    productSubscriptionTypeID: string | null | undefined,
    typeDefaultSubscriptionTypeID: string | null | undefined,
): string | null {
    const explicit = productSubscriptionTypeID?.trim();
    if (explicit) return explicit;
    const inherited = typeDefaultSubscriptionTypeID?.trim();
    return inherited || null;
}
