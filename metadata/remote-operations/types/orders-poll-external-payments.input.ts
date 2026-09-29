/**
 * Input for `Orders.PollExternalPayments`.
 *
 * Read receivable payments from every company's external AR rail (Bill.com) since the last
 * watermark, and capture each CLEARED payment exactly once through `Orders.CapturePayment`, applied
 * to the orders its invoices belong to. Poll-authoritative: Bill.com publishes no payment-received
 * webhook (golive #148). Meant for a scheduled job through the `Orders: Poll External Payments` Action.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPollExternalPaymentsInput {
    /** Poll one provider row only. Omit for every active rail provider. */
    PaymentProviderID?: string | null;
    /** Decide everything, write nothing — no payments, no dispositions, no watermark. */
    Preview?: boolean;
    /** Cap on payments considered per provider in one pass. Default 100. The remainder is read next pass. */
    MaxCount?: number;
    /** Override the stored watermark (ISO). For a first run or a deliberate re-read; dedupe by payment id makes re-reading safe. */
    SinceWatermark?: string | null;
}
