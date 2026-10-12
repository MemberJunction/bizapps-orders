/**
 * The one write allowed to change a confirmed order's payment terms (#309).
 *
 * The shared order entity refuses a change to a confirmed order's `PaymentTermsTypeID` on every tier. An
 * approved `Terms` concession is the sanctioned way to change them, and ./PaymentTermsChange.ts applies it
 * through `OrderEntityServer`. The sanction is a module-private set rather than a property, so nothing outside
 * this server can grant it: a client that set a flag on its own object would still be refused.
 *
 * CONNECTS TO:
 *   CALLER: ./PaymentTermsChange.ts (grants) · ./OrderEntityServer.ts (reads)
 */
const SANCTIONED = new WeakSet<object>();

/** Let this order object's next save change its payment terms. */
export function GrantPaymentTermsChange(order: object): void {
    SANCTIONED.add(order);
}

/** Whether this order object's save may change its payment terms. */
export function PaymentTermsChangeGranted(order: object): boolean {
    return SANCTIONED.has(order);
}
