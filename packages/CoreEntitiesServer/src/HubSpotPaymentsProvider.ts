/**
 * @fileoverview `HubSpotPayments` payment driver — deliberately empty, like Bill.com's (#482).
 *
 * HubSpot collects the money; Orders only reads the payments, through `HubSpotPaymentsRail` and
 * `Orders.PollExternalPayments`. Nothing is charged, captured or refunded from here, so every gateway
 * verb refuses. The class exists because a provider row's type must resolve to a registered driver
 * before anything can read the row, and because a payment the poller captures names its provider,
 * which `Orders.CapturePayment` resolves to ask whether it settles later.
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
    'HubSpot Payments cannot take or refund payments from Orders. HubSpot collects the money and Orders ' +
    'reads the payments HubSpot reports. Make refunds in HubSpot.';

@RegisterClass(BasePaymentProvider, 'HubSpotPayments')
export class HubSpotPaymentsProvider extends BasePaymentProvider {
    /** The poller reads only payments HubSpot reports succeeded, so a captured payment is final at capture. */
    public override get SettlesAsynchronously(): boolean {
        return false;
    }

    /** HubSpot moved the money already; the poller records it. */
    public override get CollectsAtCapture(): boolean {
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
export function LoadHubSpotPaymentsProvider(): void {
    void HubSpotPaymentsProvider;
}
