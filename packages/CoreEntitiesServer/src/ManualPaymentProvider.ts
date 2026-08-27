/**
 * ManualPaymentProvider — a cheque arrived, and somebody is telling us so.
 *
 * NO GATEWAY, AND THAT IS THE POINT. For the majority of B2B collection there is nothing to call: a
 * wire lands, a cheque clears, cash is counted. The money has already moved before this code runs, so
 * the driver's job is not to move it but to let the ordinary capture path record it — which is why it
 * exists as a driver at all rather than as a special case threaded through `PaymentHeaderEntityServer`.
 * One code path books cash, and every tender reaches it the same way.
 *
 * IT NEVER REFUSES A CAPTURE. A gateway declines because it tried and failed; there is nothing here to
 * decline. If a person is recording a payment that did not actually arrive, no software at this layer
 * can know — that is what reconciliation against a bank statement is for, and pretending otherwise
 * would be theatre.
 *
 * IT REPORTS NO FEE — and reports it as ZERO rather than as unknown, unlike the gateway drivers.
 * That is a real distinction: a bank may charge for a wire, but it charges the ACCOUNT, not the
 * transaction, so there is no per-payment cut to book against this receipt. Zero is the true answer,
 * not a missing one.
 *
 * CONNECTS TO:
 *   BASE: ./BasePaymentProvider.ts
 *   DOC:  plans/archive/bizapps-orders-master.md D19 ('v1 = Stripe + Manual')
 */
import { RegisterClass } from '@memberjunction/global';
import {
    BasePaymentProvider,
    type CaptureRequest,
    type CaptureResult,
    type CreateIntentRequest,
    type CreateIntentResult,
    type RefundRequest,
    type RefundResult,
} from './BasePaymentProvider.js';

@RegisterClass(BasePaymentProvider, 'Manual')
export class ManualPaymentProvider extends BasePaymentProvider {
    /** Nothing calls us, so there is nothing to verify. `SupportsWebhooks` is 0 on the type row. */
    public override get HandledEventKinds(): readonly string[] {
        return [];
    }

    /**
     * An intent exists so the manual path has the same shape as every other, which keeps callers free
     * of `if (manual)`. It is immediately payable because the money is already here.
     */
    public override async CreateIntent(request: CreateIntentRequest): Promise<CreateIntentResult> {
        if (request.Amount <= 0) {
            return { Success: false, Reason: `A manual payment of ${request.Amount} records nothing.` };
        }
        return {
            Success: true,
            // Prefixed so a manual receipt is never mistaken for a gateway reference during
            // reconciliation. The instrument's own identifier — cheque number, wire confirmation —
            // lives on `PaymentDetail.ReferenceNumber`, which is where somebody would look for it.
            ProviderIntentID: `manual_${crypto.randomUUID()}`,
            Status: 'RequiresPayment',
        };
    }

    public override async Capture(request: CaptureRequest): Promise<CaptureResult> {
        const amount = request.Amount ?? 0;
        if (amount <= 0) {
            return { Success: false, Reason: 'A manual capture needs the amount that actually arrived.' };
        }
        return {
            Success: true,
            Amount: amount,
            // Genuinely zero — see the header. A bank's wire charge hits the account, not this receipt.
            FeeAmount: 0,
            ProviderChargeID: request.ProviderIntentID,
            Status: 'Succeeded',
        };
    }

    /**
     * A manual refund is fully expressible even though nothing moves on our side (D17): somebody will
     * post a cheque, and the ledger entry is the record that they must.
     */
    public override async Refund(request: RefundRequest): Promise<RefundResult> {
        const amount = request.Amount;
        if (amount == null || amount <= 0) {
            return { Success: false, Reason: 'A manual refund needs the amount being returned.' };
        }
        return {
            Success: true,
            Amount: amount,
            ProviderRefundID: `manual_refund_${crypto.randomUUID()}`,
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadManualPaymentProvider(): void {
    // intentionally empty
}
