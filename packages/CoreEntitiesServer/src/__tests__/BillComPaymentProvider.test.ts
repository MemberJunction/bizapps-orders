/**
 * The `BillCom` payment driver is deliberately almost empty, and these tests pin that down: it must
 * settle synchronously (the poller only ever captures money Bill.com already reports as cleared), and
 * every gateway verb must REFUSE rather than pretend — a Bill.com invoice is not something Orders can
 * charge against.
 */
import { describe, it, expect } from 'vitest';
import { BillComPaymentProvider } from '../BillComPaymentProvider.js';

const driver = (): BillComPaymentProvider => {
    const d = new BillComPaymentProvider();
    d.Config = {
        ID: 'p',
        TypeCode: 'BillCom',
        CompanyID: 'c',
        Name: 'Bill.com — Blue Cypress',
        CredentialsRef: null,
        IsLiveMode: false,
        Capabilities: { SupportsTokenization: false, SupportsRefund: false, SupportsWebhooks: false },
    };
    d.Credentials = {};
    return d;
};

describe('BillComPaymentProvider', () => {
    it('settles synchronously — the poller only captures cleared money', () => {
        expect(driver().SettlesAsynchronously).toBe(false);
        expect(driver().HandledEventKinds).toEqual([]);
    });

    it('refuses to open an intent, naming the rail', async () => {
        const r = await driver().CreateIntent({ Amount: 10, CurrencyCode: 'USD' });
        expect(r.Success).toBe(false);
        expect(r.Reason).toMatch(/not a checkout rail/i);
    });

    it('refuses capture and refund the same way', async () => {
        const d = driver();
        const capture = await d.Capture({ ProviderIntentID: 'pi', Amount: 10, CurrencyCode: 'USD' });
        const refund = await d.Refund({ ProviderChargeID: 'ch', Amount: 1, CurrencyCode: 'USD' });
        expect(capture.Success).toBe(false);
        expect(capture.Reason).toMatch(/not a checkout rail/i);
        expect(refund.Success).toBe(false);
        expect(refund.Reason).toMatch(/not a checkout rail/i);
    });

    it('does not verify webhooks — Bill.com publishes no payment event', async () => {
        const v = await driver().VerifyWebhook('{}', {});
        expect(v.Valid).toBe(false);
    });
});
