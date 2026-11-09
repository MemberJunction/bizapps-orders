/**
 * Resolving a charge-without-payment finance exception with an order, the pure half (#567).
 *
 * Reconciliation raises a gateway charge that has no Orders payment as a `PROVIDER_CHARGE_MISMATCH`
 * finance exception. `Orders.CreateOrderFromProviderPayment` can book such a charge as a paid order,
 * but it takes the provider and the charge id as inputs, and the exception holds the charge id only
 * inside its dedupe key. This file reads the exception back into those inputs and decides whether it
 * is one the create operation can book. It reads nothing and writes nothing;
 * `ResolveChargeExceptionOperation` loads the exception and does the work.
 *
 * WHICH EXCEPTIONS QUALIFY. Open, of the charge-mismatch type, of kind `ChargeWithoutPayment`, and
 * raised against the payment provider. Reconciliation names the provider as the source only when
 * Orders holds neither a payment nor an intent for the charge. When it names an intent or a payment,
 * Orders opened the charge itself, and the create operation refuses it (`IntentOpenedByOrders`), so
 * those are refused here before anything is written.
 *
 * CONNECTS TO:
 *   KEY:  ./ChargeReconciliation.ts `ChargeMismatchDedupeKey` (the format read back here)
 *   USED: ./ResolveChargeExceptionOperation.ts
 */
import type { ChargeMismatchKind } from './ChargeReconciliation.js';
import { PAYMENT_PROVIDER_ENTITY } from './entity-names.js';
import { RequireOptionalUUID, RequireUUID } from './sql-guards.js';

/** The finance exception columns this reads, as the Finance Exceptions view returns them. */
export interface ChargeExceptionRow {
    ID: string;
    Status: string;
    /** The exception type's code, read from Finance Exception Types. */
    TypeCode: string;
    /** The source entity's name (the view's `SourceEntity`). */
    SourceEntity: string;
    SourceRecordID: string;
    DedupeKey: string;
}

/** What the create operation needs from the exception. */
export interface ChargeExceptionTarget {
    PaymentProviderID: string;
    ProviderChargeID: string;
}

export type ChargeExceptionRefusalCode = 'NotOpen' | 'WrongType' | 'WrongKind' | 'OpenedByOrders' | 'UnreadableKey';

export interface ChargeExceptionRefusal {
    Code: ChargeExceptionRefusalCode;
    Message: string;
}

/** The parts of a charge-mismatch dedupe key. */
export interface ParsedChargeMismatchKey {
    Kind: ChargeMismatchKind;
    /** The charge id, or for a payment with no charge id the payment's ID; null when the key held neither. */
    Reference: string | null;
    Amount: number;
}

const KINDS: ReadonlySet<string> = new Set<ChargeMismatchKind>(['ChargeWithoutPayment', 'PaymentWithoutCharge', 'RefundNotBooked']);

/**
 * Read a `ChargeMismatchDedupeKey` back into its parts, or null when it is not one.
 *
 * The key is `Kind|Reference|Amount`. A gateway id carries no `|`, but the split takes the first and
 * last separators so the middle is kept whole either way.
 */
export function ParseChargeMismatchDedupeKey(key: string | null | undefined): ParsedChargeMismatchKey | null {
    const text = String(key ?? '');
    const first = text.indexOf('|');
    const last = text.lastIndexOf('|');
    if (first < 0 || last === first) return null;
    const kind = text.slice(0, first);
    const amountText = text.slice(last + 1);
    const amount = Number(amountText);
    if (!KINDS.has(kind) || amountText.trim() === '' || !Number.isFinite(amount)) return null;
    const reference = text.slice(first + 1, last);
    return { Kind: kind as ChargeMismatchKind, Reference: reference === '' ? null : reference, Amount: amount };
}

/**
 * The provider and charge a charge-mismatch exception names, or why it cannot be resolved with an
 * order. Checked in the order a reader would: is it still open, is it this kind of exception, is it a
 * charge with no payment, and did Orders leave it unopened.
 */
export function CheckChargeExceptionForOrder(row: ChargeExceptionRow, typeCode: string): ChargeExceptionTarget | ChargeExceptionRefusal {
    if (row.Status !== 'Open') {
        return { Code: 'NotOpen', Message: `Finance exception ${row.ID} is already ${row.Status}.` };
    }
    if (row.TypeCode !== typeCode) {
        return { Code: 'WrongType', Message: `Finance exception ${row.ID} is a ${row.TypeCode} exception, not ${typeCode}.` };
    }
    const key = ParseChargeMismatchDedupeKey(row.DedupeKey);
    if (!key) {
        return { Code: 'UnreadableKey', Message: `Finance exception ${row.ID} does not name a gateway charge Orders can read.` };
    }
    if (key.Kind !== 'ChargeWithoutPayment') {
        return {
            Code: 'WrongKind',
            Message: `Only a gateway charge with no payment can be booked as an order. Finance exception ${row.ID} is a different mismatch (${key.Kind}).`,
        };
    }
    if (row.SourceEntity !== PAYMENT_PROVIDER_ENTITY) {
        return {
            Code: 'OpenedByOrders',
            Message:
                `The charge on finance exception ${row.ID} was started by Orders itself, so it belongs to an existing payment. ` +
                `Resolve it through that payment, not by booking it as a new order.`,
        };
    }
    if (!key.Reference) {
        return { Code: 'UnreadableKey', Message: `Finance exception ${row.ID} does not name a gateway charge.` };
    }
    try {
        return { PaymentProviderID: RequireUUID(row.SourceRecordID, 'SourceRecordID'), ProviderChargeID: key.Reference };
    } catch (err) {
        return { Code: 'UnreadableKey', Message: err instanceof Error ? err.message : String(err) };
    }
}

/** What a caller names when resolving an exception. */
export interface ResolveChargeExceptionRequest {
    FinanceExceptionID: string;
    ProductID: string;
    BillToPersonID: string;
    BillToOrganizationID?: string | null;
}

export type CheckedResolveChargeExceptionRequest = Omit<ResolveChargeExceptionRequest, 'BillToOrganizationID'> & { BillToOrganizationID: string | null };

/** The input, validated at the boundary, or why it is refused. */
export function CheckResolveChargeExceptionInput(
    input: ResolveChargeExceptionRequest | null | undefined,
): CheckedResolveChargeExceptionRequest | string {
    try {
        return {
            FinanceExceptionID: RequireUUID(input?.FinanceExceptionID, 'FinanceExceptionID'),
            ProductID: RequireUUID(input?.ProductID, 'ProductID'),
            BillToPersonID: RequireUUID(input?.BillToPersonID, 'BillToPersonID'),
            BillToOrganizationID: RequireOptionalUUID(input?.BillToOrganizationID, 'BillToOrganizationID') || null,
        };
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}

/** The review note the cleared exception carries: the order and payment that resolved it. */
export function ChargeExceptionResolutionNote(
    providerChargeID: string,
    booked: { OrderNumber?: string | null; OrderHeaderID?: string | null; PaymentNumber?: string | null },
): string {
    const order = booked.OrderNumber ?? booked.OrderHeaderID ?? 'an order';
    const payment = booked.PaymentNumber ? `, payment ${booked.PaymentNumber}` : '';
    return `Booked as order ${order}${payment} from provider charge ${providerChargeID}.`;
}
