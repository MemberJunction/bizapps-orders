/**
 * The HubSpot Payments rail with the wire stubbed (#482). What these guard: the properties the rail
 * books from are actually asked for (HubSpot returns nothing it was not asked for), a first poll goes
 * through the path that raises on a refused request, a payment collected through the company's own
 * Stripe account is never booked twice, and the gross, fee and buyer reach the person who has to act.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchBatchResult } from '@memberjunction/integration-engine';
import { HUBSPOT_PAYMENT_PROPERTIES, HubSpotPaymentsRail, NormalizeHubSpotPayment } from '../HubSpotPaymentsRail.js';
import {
    HUBSPOT_PAYMENTS_FIRST_WATERMARK,
    HUBSPOT_PAYMENTS_OBJECT,
    UseHubSpotPaymentsGatewaySeams,
    type HubSpotPaymentsGatewaySeams,
} from '../HubSpotPaymentsGateway.js';

interface FetchCall { object: string; watermark: string; properties: string[] }
const fetches: FetchCall[] = [];
let fetchError: Error | null = null;

const hsPayment = (id: string, over: Record<string, unknown> = {}) => ({
    ExternalID: id,
    ObjectType: HUBSPOT_PAYMENTS_OBJECT,
    Fields: {
        hs_object_id: id,
        hs_initial_amount: '250.00',
        hs_fees_amount: '7.55',
        hs_latest_status: 'succeeded',
        hs_processor_type: 'hs_payments',
        hs_payment_method_type: 'card',
        hs_currency_code: 'usd',
        hs_initiated_date: '2026-10-01T14:00:00.000Z',
        hs_lastmodifieddate: '2026-10-01T14:05:00.000Z',
        hs_customer_email: 'buyer@example.com',
        ...over,
    },
});

const batch = (): FetchBatchResult => ({
    Records: [
        hsPayment('9001'),
        hsPayment('9002', { hs_processor_type: 'byo_stripe', hs_lastmodifieddate: '2026-10-02T09:00:00.000Z' }),
    ],
    HasMore: false,
});

const seams = (): HubSpotPaymentsGatewaySeams => ({
    loadCompanyIntegration: async () => ({ ID: 'ci', IntegrationID: 'hubspot' }) as never,
    fetchChanges: async (_ci, object, watermark, properties) => {
        fetches.push({ object, watermark, properties });
        if (fetchError) throw fetchError;
        return batch();
    },
});

const rail = (companyIntegrationID: string | null = 'ci'): HubSpotPaymentsRail => {
    const r = new HubSpotPaymentsRail();
    r.Config = { PaymentProviderID: 'p', TypeCode: 'HubSpotPayments', CompanyID: 'c', Name: 'HubSpot — portal A', IsLiveMode: true, CompanyIntegrationID: companyIntegrationID };
    r.Provider = {} as never;
    r.User = {} as never;
    return r;
};

beforeEach(() => {
    fetches.length = 0;
    fetchError = null;
    UseHubSpotPaymentsGatewaySeams(seams());
});
afterEach(() => UseHubSpotPaymentsGatewaySeams(null));

describe('HubSpotPaymentsRail.FetchPaymentsSince', () => {
    it('asks for every property it books from, on commerce_payments', async () => {
        const r = await rail().FetchPaymentsSince('2026-09-30T00:00:00.000Z');
        expect(r.Success).toBe(true);
        expect(fetches[0].object).toBe('commerce_payments');
        expect(fetches[0].properties).toEqual([...HUBSPOT_PAYMENT_PROPERTIES]);
        for (const p of ['hs_initial_amount', 'hs_fees_amount', 'hs_processor_type', 'hs_latest_status']) expect(fetches[0].properties).toContain(p);
    });

    it('reads from the start on a first poll, through a watermark rather than none', async () => {
        await rail().FetchPaymentsSince(null);
        expect(fetches[0].watermark).toBe(HUBSPOT_PAYMENTS_FIRST_WATERMARK);
    });

    it('passes the stored watermark through as an instant', async () => {
        await rail().FetchPaymentsSince('2026-09-30T00:00:00+00:00');
        expect(fetches[0].watermark).toBe('2026-09-30T00:00:00.000Z');
    });

    it('moves the watermark to the newest payment it read, set-aside ones included', async () => {
        const r = await rail().FetchPaymentsSince(null);
        expect(r.Success && r.Value.NewWatermark).toBe('2026-10-02T09:00:00.000Z');
    });

    it('refuses with no Company Integration, before any call', async () => {
        const r = await rail(null).FetchPaymentsSince(null);
        expect(r.Success).toBe(false);
        expect(fetches).toHaveLength(0);
        expect((await rail(null).CheckConfiguration()).Success).toBe(false);
    });

    it('marks a rate limit retryable and a refused scope not', async () => {
        fetchError = new Error('HubSpot API returned 429 Too Many Requests');
        const limited = await rail().FetchPaymentsSince(null);
        expect(limited.Success === false && limited.Transient).toBe(true);
        fetchError = new Error('HubSpot API returned 403: missing scope crm.objects.commerce_payments.read');
        const refused = await rail().FetchPaymentsSince(null);
        expect(refused.Success === false && refused.Transient).toBe(false);
    });
});

describe('NormalizeHubSpotPayment', () => {
    it('books the gross, in upper-case currency, with a card tender', () => {
        const p = NormalizeHubSpotPayment('9001', hsPayment('9001').Fields);
        expect(p.Amount).toBe(250);
        expect(p.CurrencyCode).toBe('USD');
        expect(p.PaymentDate).toBe('2026-10-01');
        expect(p.UpdatedAt).toBe('2026-10-01T14:05:00.000Z');
        expect(p.Status).toBe('succeeded');
        expect(p.TenderCode).toBe('CreditCard');
        expect(p.InvoicePayments).toEqual([]);
        expect(p.SetAsideReason).toBeNull();
    });

    it('puts the gross, fee, net and buyer in front of the person who has to apply it', () => {
        const p = NormalizeHubSpotPayment('9001', hsPayment('9001').Fields);
        expect(p.UnmatchedReason).toContain('250.00 USD gross');
        expect(p.UnmatchedReason).toContain('7.55 USD fee');
        expect(p.UnmatchedReason).toContain('242.45 USD net');
        expect(p.UnmatchedReason).toContain('buyer@example.com');
    });

    it('sets aside a payment collected through the company\'s own Stripe account', () => {
        const p = NormalizeHubSpotPayment('9002', hsPayment('9002', { hs_processor_type: 'byo_stripe' }).Fields);
        expect(p.SetAsideReason).toMatch(/own Stripe account/);
        expect(p.UnmatchedReason).toBeNull();
    });

    it('sets aside a payment HubSpot only recorded, and one with no processor', () => {
        expect(NormalizeHubSpotPayment('9003', hsPayment('9003', { hs_processor_type: 'none', hs_payment_method_type: 'check' }).Fields).SetAsideReason).toMatch(/collected elsewhere/);
        expect(NormalizeHubSpotPayment('9004', hsPayment('9004', { hs_processor_type: null }).Fields).SetAsideReason).toMatch(/not reported/);
    });

    it('reads epoch-millisecond datetimes', () => {
        const p = NormalizeHubSpotPayment('9005', hsPayment('9005', { hs_initiated_date: '1759327200000', hs_lastmodifieddate: '1759327500000' }).Fields);
        expect(p.PaymentDate).toBe('2025-10-01');
        expect(p.UpdatedAt).toBe(new Date(1759327500000).toISOString());
    });
});
