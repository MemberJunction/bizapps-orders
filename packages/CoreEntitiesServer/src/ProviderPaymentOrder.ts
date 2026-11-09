/**
 * An order created from a provider payment that matched nothing, the pure half (#481).
 *
 * A card payment can reach the gateway with no order or invoice behind it: the buyer paid a link, or
 * paid before anybody keyed the order. The reconciliation job reports it as a charge without a payment
 * and the cash otherwise reaches Orders only when the bank deposit lands. The decision recorded on the
 * issue is to create the order from the payment, in the company the payment belongs to, and apply the
 * payment to it, so the deposit that follows matches a payment already booked.
 *
 * This file decides, from a charge the gateway reported, whether an order can be created from it, and
 * names the keys that keep it to one order and one payment. It reads nothing and writes nothing;
 * `CreateOrderFromProviderPaymentOperation` loads the charge and writes the order.
 *
 * WHAT IT DOES NOT DECIDE. Which product the order carries and who the buyer is are supplied by the
 * caller. The rules that would choose them without a person are open questions on the issue.
 */
import type { GatewayCharge } from './BasePaymentProvider.js';
import { RequireOptionalUUID, RequireUUID } from './sql-guards.js';

const money = (v: number): number => Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;

/** The order's `Origin`, so a list or report can tell these orders from keyed and checkout ones. */
export const PROVIDER_PAYMENT_ORDER_ORIGIN = 'ProviderPayment';

/** Longest gateway charge id accepted; `PaymentHeader.ProviderChargeID` is nvarchar(100). */
export const MAX_PROVIDER_CHARGE_ID_LENGTH = 100;

export type ProviderPaymentRefusalCode =
    | 'ChargeNotSucceeded'
    | 'ChargeRefunded'
    | 'ChargeHasNoAmount'
    | 'ChargeHasNoIntent'
    | 'CurrencyMismatch';

export interface ProviderPaymentRefusal {
    Code: ProviderPaymentRefusalCode;
    Message: string;
}

/**
 * Why an order cannot be created from this charge, or null when it can.
 *
 * A refunded charge, in whole or in part, is refused: the money the order would record is not the
 * money the business kept, and booking it would need the refund booked in the same act. A charge with
 * no gateway intent is refused because the capture path reads the gateway through the intent; every
 * charge taken by Stripe's payment links and hosted checkout has one.
 */
export function CheckChargeForOrder(charge: GatewayCharge, functionalCurrency: string): ProviderPaymentRefusal | null {
    if (charge.Status !== 'succeeded') {
        return {
            Code: 'ChargeNotSucceeded',
            Message: `Charge ${charge.ProviderChargeID} is ${charge.Status || 'in an unknown state'} at the gateway; only a succeeded charge can become an order.`,
        };
    }
    if (!(money(charge.Amount) > 0)) {
        return { Code: 'ChargeHasNoAmount', Message: `Charge ${charge.ProviderChargeID} is for ${money(charge.Amount)}; there is nothing to book.` };
    }
    if (money(charge.AmountRefunded) > 0) {
        return {
            Code: 'ChargeRefunded',
            Message:
                `Charge ${charge.ProviderChargeID} has ${money(charge.AmountRefunded)} of its ${money(charge.Amount)} refunded at the gateway. ` +
                `An order created from it would record money the business did not keep.`,
        };
    }
    if (!charge.ProviderIntentID) {
        return {
            Code: 'ChargeHasNoIntent',
            Message: `Charge ${charge.ProviderChargeID} has no gateway payment intent, which the capture reads the charge and its fee through.`,
        };
    }
    const want = functionalCurrency.trim().toUpperCase();
    if (charge.CurrencyCode.trim().toUpperCase() !== want) {
        return {
            Code: 'CurrencyMismatch',
            Message: `Charge ${charge.ProviderChargeID} is in ${charge.CurrencyCode}; the receiving company books in ${want}.`,
        };
    }
    return null;
}

/**
 * The capture's idempotency key: one payment per provider and charge, whoever asks and however often.
 * `PaymentHeader.IdempotencyKey` is unique, so the database holds the line even if a caller does not.
 */
export function ProviderPaymentIdempotencyKey(paymentProviderID: string, providerChargeID: string): string {
    return `provider-charge:${paymentProviderID.toLowerCase()}:${providerChargeID}`;
}

/** What the created line says it is, and why its price is the payment's amount. */
export function ProviderPaymentLineReason(providerChargeID: string): string {
    return `Price taken from provider payment ${providerChargeID}, which matched no order or invoice.`;
}

/** What a caller names: the charge, the product its order carries, and the buyer. */
export interface ProviderPaymentOrderRequest {
    PaymentProviderID: string;
    ProviderChargeID: string;
    ProductID: string;
    BillToPersonID: string;
    BillToOrganizationID?: string | null;
}

export type CheckedProviderPaymentRequest = Omit<ProviderPaymentOrderRequest, 'BillToOrganizationID'> & { BillToOrganizationID: string | null };

/** The input, validated at the boundary, or why it is refused. */
export function CheckProviderPaymentInput(input: ProviderPaymentOrderRequest | null | undefined): CheckedProviderPaymentRequest | string {
    try {
        const chargeID = String(input?.ProviderChargeID ?? '').trim();
        if (!chargeID) return 'ProviderChargeID is required.';
        if (chargeID.length > MAX_PROVIDER_CHARGE_ID_LENGTH) return `ProviderChargeID is longer than ${MAX_PROVIDER_CHARGE_ID_LENGTH} characters.`;
        return {
            PaymentProviderID: RequireUUID(input?.PaymentProviderID, 'PaymentProviderID'),
            ProviderChargeID: chargeID,
            ProductID: RequireUUID(input?.ProductID, 'ProductID'),
            BillToPersonID: RequireUUID(input?.BillToPersonID, 'BillToPersonID'),
            BillToOrganizationID: RequireOptionalUUID(input?.BillToOrganizationID, 'BillToOrganizationID') || null,
        };
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}

