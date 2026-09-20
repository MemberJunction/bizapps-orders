/**
 * Bill.com signs every notification HMAC-SHA256/base64 over the raw body with the subscription's
 * security key. The signature is the credential: an unverified body must never trigger anything,
 * because the only thing a Bill.com webhook can make us do is call Bill.com.
 */
import { describe, expect, it } from 'vitest';
import { IsPaymentRelevant, ParseBillComWebhookEvent, SignBillComPayload, VerifyBillComSignature, BILLCOM_SIGNATURE_HEADER } from '../BillComWebhook.js';

const key = 'shh-securityKey';
const body = JSON.stringify({ type: 'invoice.updated', data: { id: '00e123', dueAmount: 0 }, eventId: 'evt-1', createdTime: '2026-09-20T10:00:00.000Z' });

describe('SignBillComPayload', () => {
    it('is HMAC-SHA256 base64 — the RFC 4231 test vector', async () => {
        // Key "key", message "The quick brown fox jumps over the lazy dog" →
        // f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8 (hex) = 97yD9DBThCSxMpjmqm+xQ+9NWaFJRhdZl0edvC0aPNg= (base64)
        expect(await SignBillComPayload('The quick brown fox jumps over the lazy dog', 'key')).toBe('97yD9DBThCSxMpjmqm+xQ+9NWaFJRhdZl0edvC0aPNg=');
    });
});

describe('VerifyBillComSignature', () => {
    it("accepts BILL's own signature over the exact raw body", async () => {
        const sig = await SignBillComPayload(body, key);
        expect(await VerifyBillComSignature(body, { [BILLCOM_SIGNATURE_HEADER]: sig }, key)).toEqual({ Valid: true });
    });
    it('refuses a changed body, a wrong key, a missing header and a missing key', async () => {
        const sig = await SignBillComPayload(body, key);
        expect((await VerifyBillComSignature(body + ' ', { [BILLCOM_SIGNATURE_HEADER]: sig }, key)).Valid).toBe(false);
        expect((await VerifyBillComSignature(body, { [BILLCOM_SIGNATURE_HEADER]: sig }, 'other')).Valid).toBe(false);
        expect((await VerifyBillComSignature(body, {}, key)).Valid).toBe(false);
        expect((await VerifyBillComSignature(body, { [BILLCOM_SIGNATURE_HEADER]: sig }, null)).Reason).toMatch(/security key/);
    });
});

describe('ParseBillComWebhookEvent', () => {
    it('reads the type, entity id and event id', () => {
        expect(ParseBillComWebhookEvent(body)).toEqual({ Type: 'invoice.updated', EntityID: '00e123', EventID: 'evt-1', OccurredAt: '2026-09-20T10:00:00.000Z' });
    });
    it('returns null for a body that is not an event object', () => {
        expect(ParseBillComWebhookEvent('not json')).toBeNull();
        expect(ParseBillComWebhookEvent('{}')).toBeNull();
        expect(ParseBillComWebhookEvent('null')).toBeNull();
        expect(ParseBillComWebhookEvent('[1]')).toBeNull();
    });
    it('knows which events are worth a poll', () => {
        expect(IsPaymentRelevant('invoice.updated')).toBe(true);
        expect(IsPaymentRelevant('vendor.created')).toBe(false);
        expect(IsPaymentRelevant('test')).toBe(false);
    });
});
