/**
 * @fileoverview `BillCom` payment driver — deliberately almost empty.
 *
 * Bill.com is the AR RAIL, not a checkout gateway. Invoices go OUT through `BillComInvoiceRail`
 * (same type code, resolved from the same `PaymentProvider` row), and cleared payments come IN
 * through `Orders.PollExternalPayments`, which records them as money that has already moved. Nothing
 * is ever charged from here, so every gateway verb refuses — a refusal, not an exception, because
 * asking is a normal thing for generic code to do and the honest answer is "not this rail".
 *
 * WHY THE CLASS EXISTS AT ALL. `BuildPaymentProvider` refuses a type whose code resolves to the base
 * driver, so a `BillCom` provider row needs a registered subclass before anything can read it. And a
 * payment the poller captures carries `PaymentProviderID`, which `CapturePaymentOperation` resolves
 * to ask `SettlesAsynchronously` — the answer here is "no", because the poller only ever captures
 * what Bill.com already reports as cleared.
 *
 * @module @mj-biz-apps/orders-core-entities-server
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

const NOT_A_CHECKOUT_RAIL =
    'Bill.com is not a checkout rail. Invoices are created in Bill.com by the invoice rail, and payments ' +
    'are captured by Orders.PollExternalPayments when Bill.com reports them cleared; nothing is charged ' +
    'from Orders.';

@RegisterClass(BasePaymentProvider, 'BillCom')
export class BillComPaymentProvider extends BasePaymentProvider {
    /** The poller captures only cleared money, so a captured payment is final at capture. */
    public override get SettlesAsynchronously(): boolean {
        return false;
    }

    public override async CreateIntent(_request: CreateIntentRequest): Promise<CreateIntentResult> {
        return { Success: false, Reason: NOT_A_CHECKOUT_RAIL };
    }

    public override async Capture(_request: CaptureRequest): Promise<CaptureResult> {
        return { Success: false, Reason: NOT_A_CHECKOUT_RAIL };
    }

    public override async Refund(_request: RefundRequest): Promise<RefundResult> {
        return { Success: false, Reason: NOT_A_CHECKOUT_RAIL };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so the decorator runs. */
export function LoadBillComPaymentProvider(): void {
    void BillComPaymentProvider;
}
