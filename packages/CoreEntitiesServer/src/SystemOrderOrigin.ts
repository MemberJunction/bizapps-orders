/**
 * SystemOrderOrigin — `OrderHeader.Origin` is written only by the process that creates the order.
 *
 * `Origin` says which process created an order (`Direct` for hand entry, `Widget` for checkout,
 * `ProviderPayment` for an order booked from a provider charge), and order review exempts the system
 * origins (golive #320 §5). The column is free text that `spUpdateOrderHeader` accepts from anyone with
 * Update on Order Headers, so without a guard the person an exemption protects against could claim it.
 *
 * So the order's server save refuses a write of `Origin` unless the code that set it marked the write
 * here. The mark lives in a module-private `WeakSet` keyed by the entity object: only code running in
 * this process, holding that object, can make it, and an object built for a GraphQL or API save never
 * carries one. A new order may still be saved as `Direct` (or with no Origin, which the column
 * defaults to `Direct`), since that claims no exemption.
 *
 * CONNECTS TO:
 *   CALLERS: CheckoutSessionService · CreateOrderFromProviderPaymentOperation (mark)
 *            OrderEntityServer.Save (check)
 *   RULES:   @mj-biz-apps/orders-entities order-review.ts (SYSTEM_ORDER_ORIGINS)
 */
import type { OrderHeaderEntity, SystemOrderOrigin } from '@mj-biz-apps/orders-entities';

const systemOriginWrites = new WeakSet<object>();

/** Set the order's `Origin` to a system origin, as the process that is creating it. */
export function SetSystemOrderOrigin(order: OrderHeaderEntity, origin: SystemOrderOrigin): void {
    order.Origin = origin;
    systemOriginWrites.add(order);
}

/** The facts the guard reads from the order being saved. */
export interface OriginWriteFacts {
    IsSaved: boolean;
    /** The Origin the save would write. */
    Origin: string | null;
    /** The Origin as stored; ignored for an order not yet saved. */
    StoredOrigin: string | null;
    /** A system process set the Origin on this object through {@link SetSystemOrderOrigin}. */
    MarkedBySystem: boolean;
}

/**
 * Why this save may not write its `Origin`, or null when it may: a new order claiming anything but
 * `Direct`, or a saved order whose `Origin` changes, unless a system process set it.
 */
export function OriginWriteRefusal(facts: OriginWriteFacts): string | null {
    if (facts.MarkedBySystem) return null;
    const origin = facts.Origin ?? '';
    if (!facts.IsSaved) {
        if (origin === '' || origin === 'Direct') return null;
        return (
            `An order cannot be created with Origin '${origin}': Origin records which process created the order, ` +
            `and only that process sets it. Leave it as 'Direct'.`
        );
    }
    if (origin === (facts.StoredOrigin ?? '')) return null;
    return (
        `The order's Origin cannot be changed from '${facts.StoredOrigin ?? ''}' to '${origin}': it records which ` +
        `process created the order.`
    );
}

/** True when a system process set this object's `Origin`. */
export function IsSystemOriginWrite(order: object): boolean {
    return systemOriginWrites.has(order);
}
