/**
 * Charge-to-payment reconciliation, the pure half (#477).
 *
 * Nothing routinely compared the gateway's charges with Orders' payments. A charge taken outside the
 * checkout, a captured payment whose charge the gateway does not have, or a refunded charge whose
 * payment Orders still holds as fully captured showed up only in a manual export.
 *
 * This file decides, from facts already loaded, which of those three a set of charges and payments
 * contains. It reads nothing and writes nothing; `ReconcilePaymentProviderChargesOperation` loads the
 * facts and raises what this finds. It FIXES NOTHING: every mismatch needs somebody to decide whether
 * Orders or the gateway is right.
 */
import type { GatewayCharge } from './BasePaymentProvider.js';

const money = (v: number): number => Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;

export type ChargeMismatchKind = 'ChargeWithoutPayment' | 'PaymentWithoutCharge' | 'RefundNotBooked';

/** A payment Orders opened against the provider: an original, never a reversal. */
export interface ReconcilablePayment {
    ID: string;
    PaymentNumber: string;
    ReceivingCompanyID: string;
    PaymentDate: string;
    Amount: number;
    Status: string;
    ProviderChargeID: string | null;
    PaymentIntentID: string | null;
    /** Refunds Orders holds against it (`ReversalSource = 'Refund'`), positive. */
    RefundedAmount: number;
}

export interface ChargeMismatch {
    Kind: ChargeMismatchKind;
    ProviderChargeID?: string | null;
    ProviderIntentID?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    PaymentIntentID?: string | null;
    CompanyID?: string | null;
    Amount: number;
    Detail: string;
}

/** `YYYY-MM-DD` of a date in UTC, the grain the window is stated in. */
function utcDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Find the mismatches.
 *
 * @param charges           every charge the gateway reports in the window, plus any charge a refund in
 *                          the window points at (those are checked for refunds only)
 * @param chargesInWindow   ids of the charges CREATED in the window — only these can be "a charge with
 *                          no payment"; an older charge pulled in by a refund was judged when its own
 *                          window ran
 * @param payments          Orders' payments for the provider in the window, and any payment whose
 *                          charge id appears in `charges`
 * @param confirmedMissing  charge ids of window payments that a direct read of the gateway did not find
 *                          (or found not succeeded)
 * @param intentIDs         our `PaymentIntent.ID` by the gateway's intent id, for the source record
 */
export function FindChargeMismatches(input: {
    FromDate: string;
    ToDate: string;
    Charges: GatewayCharge[];
    ChargesInWindow: ReadonlySet<string>;
    Payments: ReconcilablePayment[];
    ConfirmedMissing: ReadonlySet<string>;
    IntentIDs: ReadonlyMap<string, string>;
}): ChargeMismatch[] {
    const out: ChargeMismatch[] = [];
    const paymentByCharge = new Map<string, ReconcilablePayment>();
    for (const p of input.Payments) {
        if (p.ProviderChargeID) paymentByCharge.set(p.ProviderChargeID, p);
    }
    const chargeByID = new Map(input.Charges.map((c) => [c.ProviderChargeID, c]));

    for (const charge of input.Charges) {
        if (charge.Status !== 'succeeded') continue;
        const payment = paymentByCharge.get(charge.ProviderChargeID);
        const intentID = charge.ProviderIntentID ? input.IntentIDs.get(charge.ProviderIntentID) ?? null : null;

        if (input.ChargesInWindow.has(charge.ProviderChargeID) && (!payment || payment.Status !== 'Captured')) {
            out.push({
                Kind: 'ChargeWithoutPayment',
                ProviderChargeID: charge.ProviderChargeID,
                ProviderIntentID: charge.ProviderIntentID ?? null,
                PaymentHeaderID: payment?.ID ?? null,
                PaymentNumber: payment?.PaymentNumber ?? null,
                PaymentIntentID: intentID,
                CompanyID: payment?.ReceivingCompanyID ?? null,
                Amount: money(charge.Amount),
                Detail: payment
                    ? `Charge ${charge.ProviderChargeID} for ${money(charge.Amount)} succeeded at the gateway but payment ${payment.PaymentNumber} is ${payment.Status}.`
                    : `Charge ${charge.ProviderChargeID} for ${money(charge.Amount)} succeeded at the gateway${charge.ProviderIntentID ? ` (intent ${charge.ProviderIntentID}${intentID ? ', opened by Orders' : ', not opened by Orders'})` : ''} and Orders has no payment for it.`,
            });
            continue;
        }

        if (payment && payment.Status === 'Captured') {
            const difference = money(money(charge.AmountRefunded) - money(payment.RefundedAmount));
            if (difference > 0) {
                out.push({
                    Kind: 'RefundNotBooked',
                    ProviderChargeID: charge.ProviderChargeID,
                    ProviderIntentID: charge.ProviderIntentID ?? null,
                    PaymentHeaderID: payment.ID,
                    PaymentNumber: payment.PaymentNumber,
                    PaymentIntentID: intentID,
                    CompanyID: payment.ReceivingCompanyID,
                    Amount: difference,
                    Detail:
                        `Charge ${charge.ProviderChargeID} has ${money(charge.AmountRefunded)} refunded at the gateway ` +
                        `but payment ${payment.PaymentNumber} carries ${money(payment.RefundedAmount)} of refunds.`,
                });
            }
        }
    }

    for (const payment of input.Payments) {
        if (payment.Status !== 'Captured') continue;
        if (payment.PaymentDate < input.FromDate || payment.PaymentDate > input.ToDate) continue;
        const charge = payment.ProviderChargeID ? chargeByID.get(payment.ProviderChargeID) : undefined;
        const missing =
            !payment.ProviderChargeID ||
            input.ConfirmedMissing.has(payment.ProviderChargeID) ||
            (charge != null && charge.Status !== 'succeeded');
        if (!missing) continue;
        out.push({
            Kind: 'PaymentWithoutCharge',
            ProviderChargeID: payment.ProviderChargeID,
            PaymentHeaderID: payment.ID,
            PaymentNumber: payment.PaymentNumber,
            PaymentIntentID: payment.PaymentIntentID,
            CompanyID: payment.ReceivingCompanyID,
            Amount: money(payment.Amount),
            Detail: payment.ProviderChargeID
                ? `Payment ${payment.PaymentNumber} is captured for ${money(payment.Amount)} against charge ${payment.ProviderChargeID}, which the gateway ${charge ? `reports as ${charge.Status}` : 'does not have'}.`
                : `Payment ${payment.PaymentNumber} is captured for ${money(payment.Amount)} against this gateway but records no charge id.`,
        });
    }
    return out;
}

/** Stable per mismatch and amount, so a nightly re-run raises nothing new until something changes. */
export function ChargeMismatchDedupeKey(m: ChargeMismatch): string {
    return `${m.Kind}|${m.ProviderChargeID ?? m.PaymentHeaderID ?? ''}|${money(m.Amount)}`;
}

/** The window's first and last instant in UTC, padded so a payment dated near midnight finds its charge. */
export function GatewayWindow(fromDate: string, toDate: string, padDays: number): { From: Date; To: Date } {
    const from = new Date(`${fromDate}T00:00:00Z`);
    const to = new Date(`${toDate}T23:59:59Z`);
    from.setUTCDate(from.getUTCDate() - padDays);
    to.setUTCDate(to.getUTCDate() + padDays);
    return { From: from, To: to };
}

/** True when the gateway created the charge on a UTC day inside the stated window. */
export function CreatedInWindow(charge: GatewayCharge, fromDate: string, toDate: string): boolean {
    if (!charge.CreatedAt) return false;
    const day = utcDay(charge.CreatedAt);
    return day >= fromDate && day <= toDate;
}
