/**
 * @fileoverview `HubSpotPayments` rail — payments a HubSpot portal collected, read into the poller (#482).
 *
 * A company that takes card or bank-debit payments through HubSpot (a payment link, a quote, a HubSpot
 * invoice) learns of them today only when the payout reaches the bank. This rail lets
 * `Orders.PollExternalPayments` read them when they are made: one `PaymentProvider` row per company,
 * pointing at the Company Integration for that company's portal, so each portal's payments land in
 * its own company.
 *
 * READ-ONLY. Orders issues no documents through HubSpot, so every outbound verb keeps the base
 * class's refusal. Only `FetchPaymentsSince` is implemented.
 *
 * WHAT IT READS (`commerce_payments`, properties as HubSpot documents them):
 *   hs_initial_amount   the gross the buyer was charged — the amount the poller books
 *   hs_fees_amount      what HubSpot kept to process it; the payout is gross less this
 *   hs_latest_status    classified by `HUBSPOT_PAYMENT_STATUS`, never here
 *   hs_processor_type   who collected the money (below)
 *   hs_payment_method_type, hs_currency_code, hs_initiated_date, hs_lastmodifieddate, hs_customer_email
 *
 * ONLY HUBSPOT-COLLECTED MONEY IS BOOKED. `hs_processor_type` decides:
 *   hs_payments  HubSpot collected it and pays it out to the bank. Read and booked here.
 *   byo_stripe   collected through the company's own Stripe account. Orders already sees that charge
 *                in Stripe (charge reconciliation), so booking it here as well would count it twice.
 *                Set aside.
 *   anything else (none, quickbooks, xero, or not reported): a payment recorded in HubSpot and
 *                collected elsewhere — a check, a wire, another system's receipt. Booked where the
 *                money arrived. Set aside.
 *
 * NO ORDER MATCHING YET. A HubSpot payment names its deal only through an association, and the
 * published HubSpot connector has no call that reads one record's associations. Until it does, every
 * HubSpot-collected payment that succeeded is recorded `Unmatched`, with its gross, fee and buyer,
 * for a person to apply or turn into an order. It is still booked-visible before the payout lands,
 * which is what the poll is for.
 *
 * NO SANDBOX CHECK. Unlike Bill.com, a HubSpot portal's credential carries no sandbox or production
 * flag: a test portal is simply another portal. The provider row's Company Integration is what decides
 * which portal is read.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { RegisterClass } from '@memberjunction/global';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { HubSpotTenderFor } from '@mj-biz-apps/orders-entities';
import { BaseInvoiceRail, type RailPaymentRecord, type RailResult } from './BaseInvoiceRail.js';
import { CanonicalInstant } from './BillComInvoiceRail.js';
import { HUBSPOT_PAYMENTS_FIRST_WATERMARK, HUBSPOT_PAYMENTS_OBJECT, HubSpotPaymentsGateway } from './HubSpotPaymentsGateway.js';

/** What a retry could plausibly change: the network, HubSpot's rate limit, a server error. */
export const HUBSPOT_TRANSIENT = /timeout|timed out|ECONN|ETIMEDOUT|EAI_AGAIN|socket|rate limit|too many|(?<![\d.\-])(?:5\d\d|429)(?![\d.])/i;

/** The properties every fetch asks for. HubSpot returns nothing it was not asked for. */
export const HUBSPOT_PAYMENT_PROPERTIES: readonly string[] = Object.freeze([
    'hs_initial_amount',
    'hs_fees_amount',
    'hs_latest_status',
    'hs_processor_type',
    'hs_payment_method_type',
    'hs_currency_code',
    'hs_initiated_date',
    'hs_lastmodifieddate',
    'hs_customer_email',
]);

const num = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));
const text = (v: unknown): string | null => (v == null || String(v).trim() === '' ? null : String(v).trim());
/** HubSpot writes datetimes as ISO strings, and some endpoints as epoch milliseconds in a string. */
const instant = (v: unknown): string | null => (typeof v === 'string' && /^\d{10,}$/.test(v.trim()) ? CanonicalInstant(Number(v)) : CanonicalInstant(v));
const money = (n: number): string => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);

@RegisterClass(BaseInvoiceRail, 'HubSpotPayments')
export class HubSpotPaymentsRail extends BaseInvoiceRail {
    private async companyIntegration(): Promise<MJCompanyIntegrationEntity> {
        if (!this.Provider || !this.User) throw new Error('HubSpotPaymentsRail needs Provider and User; resolve it through ResolveInvoiceRail.');
        if (!this.Config.CompanyIntegrationID) {
            throw new Error(
                `Payment provider '${this.Config.Name}' has no CompanyIntegrationID. HubSpot cannot be reached without the ` +
                    `MJ Company Integration for the company's portal; set it on the provider row.`,
            );
        }
        return HubSpotPaymentsGateway(this.Provider).loadCompanyIntegration(this.Config.CompanyIntegrationID, this.Provider, this.User);
    }

    public override async CheckConfiguration(): Promise<RailResult<true>> {
        try {
            await this.companyIntegration();
            return { Success: true, Value: true };
        } catch (e) {
            return { Success: false, Transient: false, Reason: e instanceof Error ? e.message : String(e) };
        }
    }

    public override async FetchPaymentsSince(
        watermark: string | null,
    ): Promise<RailResult<{ Payments: RailPaymentRecord[]; NewWatermark: string | null }>> {
        try {
            const ci = await this.companyIntegration();
            const since = CanonicalInstant(watermark) ?? HUBSPOT_PAYMENTS_FIRST_WATERMARK;
            const batch = await HubSpotPaymentsGateway(this.Provider!).fetchChanges(ci, HUBSPOT_PAYMENTS_OBJECT, since, [...HUBSPOT_PAYMENT_PROPERTIES], this.User!);
            const payments = batch.Records.map((r) => NormalizeHubSpotPayment(r.ExternalID, r.Fields));
            const newWatermark = payments.reduce<string | null>(
                (max, p) => (p.UpdatedAt && (!max || p.UpdatedAt > max) ? p.UpdatedAt : max),
                CanonicalInstant(batch.NewWatermarkValue),
            );
            return { Success: true, Value: { Payments: payments, NewWatermark: newWatermark } };
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            return { Success: false, Reason: reason, Transient: HUBSPOT_TRANSIENT.test(reason) };
        }
    }
}

/** Why a payment this processor collected is not booked from HubSpot, or null when it is. */
export function HubSpotSetAsideReason(paymentID: string, processorType: string | null): string | null {
    const processor = (processorType ?? '').toLowerCase();
    if (processor === 'hs_payments') return null;
    if (processor === 'byo_stripe') {
        return (
            `HubSpot payment ${paymentID} was collected through the company's own Stripe account. Orders sees that charge ` +
            `in Stripe, so it is booked there (charge reconciliation), not read here, or it would count twice.`
        );
    }
    return (
        `HubSpot payment ${paymentID} is a record of money collected elsewhere (processor '${processorType ?? 'not reported'}'). ` +
        `It is booked where the money arrived, not read here.`
    );
}

/** One `commerce_payments` record as the connector returns it (properties flattened) → the rail-neutral shape. Exported for tests. */
export function NormalizeHubSpotPayment(externalID: string, x: Record<string, unknown>): RailPaymentRecord {
    const gross = num(x.hs_initial_amount);
    const fee = num(x.hs_fees_amount);
    const currency = text(x.hs_currency_code)?.toUpperCase() ?? null;
    const paymentDate = instant(x.hs_initiated_date)?.slice(0, 10) ?? null;
    const email = text(x.hs_customer_email);
    const method = text(x.hs_payment_method_type);
    const processor = text(x.hs_processor_type);
    const setAside = HubSpotSetAsideReason(externalID, processor);
    const tender = HubSpotTenderFor(method);
    const cur = currency ? ` ${currency}` : '';
    const record: RailPaymentRecord = {
        ExternalPaymentRef: externalID,
        // The buyer's email is on the payload and in the reason; the column holds a rail customer id.
        ExternalCustomerRef: null,
        Amount: gross,
        UnappliedAmount: 0,
        PaymentDate: paymentDate,
        Status: text(x.hs_latest_status),
        OnlinePayment: processor?.toLowerCase() === 'hs_payments',
        CurrencyCode: currency,
        ReceivablesType: method,
        UpdatedAt: instant(x.hs_lastmodifieddate),
        InvoicePayments: [],
        Raw: x,
        SetAsideReason: setAside,
        UnmatchedReason: setAside
            ? null
            : `HubSpot payment ${externalID}: ${money(gross)}${cur} gross, ${money(fee)}${cur} fee, ${money(gross - fee)}${cur} net` +
              `${email ? `, paid by ${email}` : ''}${paymentDate ? ` on ${paymentDate}` : ''}. ` +
              `Orders cannot yet match a HubSpot payment to its order (the payment's deal is not readable through the HubSpot connector), ` +
              `so nothing is captured. Record it against its order by hand, or create the order from it.`,
    };
    if (tender) record.TenderCode = tender;
    return record;
}

/** Tree-shaking anchor — call from the server bootstrap. */
export function LoadHubSpotPaymentsRail(): void {
    void HubSpotPaymentsRail;
}
