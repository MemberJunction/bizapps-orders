/**
 * @fileoverview What the charge-exception panel decides, as pure functions (#567).
 *
 * The panel offers to book a gateway charge as a paid order on accounting's Finance Exception form.
 * It is offered only on an exception `Orders.ResolveChargeException` would accept, so a reviewer is
 * never handed a form that can only be refused. The operation checks all of this again on the server;
 * this decides what the screen shows.
 *
 * @module @mj-biz-apps/orders-ng
 */

/** The finance exception type reconciliation raises charge mismatches as. */
export const CHARGE_MISMATCH_TYPE_CODE = 'PROVIDER_CHARGE_MISMATCH';

/** Reconciliation names the provider as the source only when Orders holds nothing for the charge. */
export const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';

/** The exception fields the panel reads; the real entity carries more. */
export interface ChargeExceptionLike {
    Status: string;
    SourceEntity: string | null;
    DedupeKey: string;
}

/**
 * The gateway charge a charge-without-payment exception names, from its dedupe key
 * (`ChargeWithoutPayment|<charge>|<amount>`), or null for any other key.
 */
export function ChargeWithoutPaymentChargeID(dedupeKey: string | null | undefined): string | null {
    const text = String(dedupeKey ?? '');
    const prefix = 'ChargeWithoutPayment|';
    const last = text.lastIndexOf('|');
    if (!text.startsWith(prefix) || last < prefix.length) return null;
    const charge = text.slice(prefix.length, last);
    return charge === '' ? null : charge;
}

/** Whether to offer booking the charge as an order. `typeCode` is the exception type's Code. */
export function CanBookChargeAsOrder(row: ChargeExceptionLike | null | undefined, typeCode: string | null | undefined): boolean {
    if (!row || row.Status !== 'Open') return false;
    if (typeCode !== CHARGE_MISMATCH_TYPE_CODE) return false;
    if (row.SourceEntity !== PAYMENT_PROVIDER_ENTITY) return false;
    return ChargeWithoutPaymentChargeID(row.DedupeKey) !== null;
}

/** Whether the inputs are complete enough to send. The organization is optional. */
export function CanSubmitBooking(productID: string | null | undefined, personID: string | null | undefined): boolean {
    return !!productID && !!personID;
}
