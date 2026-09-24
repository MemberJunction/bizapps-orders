/**
 * The Bill.com webhook route, without Express and without a database. The rules that matter: an
 * unverified body triggers nothing; a verified one is acknowledged immediately and the poll for THAT
 * provider runs; an unknown or non-Bill.com provider is a 404 so Bill.com stops retrying it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { resolvePaymentProvider } = vi.hoisted(() => ({ resolvePaymentProvider: vi.fn() }));
vi.mock('@mj-biz-apps/orders-core-entities-server', async () => {
    const actual = await vi.importActual<typeof import('@mj-biz-apps/orders-core-entities-server')>('@mj-biz-apps/orders-core-entities-server');
    return { ...actual, ResolvePaymentProvider: resolvePaymentProvider };
});
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), Metadata: { Provider: {} } };
});
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: { GetSystemUser: () => ({ ID: 'sys' }) } } }));
vi.mock('@memberjunction/server-extensions-core', () => ({ BaseServerExtension: class {} }));
vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
    return { ...actual, RegisterClass: () => () => undefined };
});
vi.mock('body-parser', () => ({ default: { raw: () => (_req: unknown, _res: unknown, next: () => void) => next() } }));
vi.mock('@mj-biz-apps/orders-entities', async () => {
    const actual = await vi.importActual<typeof import('@mj-biz-apps/orders-entities')>('@mj-biz-apps/orders-entities');
    return { ...actual, OrdersPollExternalPaymentsOperation: class { Execute = async () => ({ Success: true, Output: { Message: 'ok' } }); } };
});

import { HandleBillComWebhook } from '../BillComWebhookExtension.js';
import { SignBillComPayload, VerifyBillComSignature, ParseBillComWebhookEvent } from '@mj-biz-apps/orders-core-entities-server';

const providerId = '11111111-2222-4333-8444-555555555555';
const key = 'securityKey';
const body = JSON.stringify({ type: 'invoice.updated', data: { id: '00e1' } });

const fakeDriver = (typeCode = 'BillCom', secret: string | null = key) => ({
    Config: { TypeCode: typeCode },
    VerifyWebhook: async (raw: string, headers: Record<string, string | undefined>) => VerifyBillComSignature(raw, headers, secret),
    ParseWebhookEvent: (raw: string) => { const e = ParseBillComWebhookEvent(raw); return e ? { EventID: e.EventID ?? 'x', Kind: e.Type } : null; },
});

const respond = () => {
    const calls: Array<{ status: number; body: unknown }> = [];
    return { calls, res: { status: (code: number) => ({ json: (b: unknown) => { calls.push({ status: code, body: b }); return b; } }) } };
};
const context = () => ({ provider: {} as never, user: { ID: 'sys' } as never });

afterEach(() => resolvePaymentProvider.mockReset());

describe('HandleBillComWebhook', () => {
    it('acknowledges a verified invoice event with 202 and polls that provider', async () => {
        resolvePaymentProvider.mockResolvedValue(fakeDriver());
        const polled: string[] = [];
        const { calls, res } = respond();
        await HandleBillComWebhook({ rawBody: body, headers: { 'x-bill-sha-signature': await SignBillComPayload(body, key) }, providerId }, res, context, async (id) => { polled.push(id); });
        expect(calls).toEqual([{ status: 202, body: { received: true, polled: true, kind: 'invoice.updated' } }]);
        expect(polled).toEqual([providerId]);
    });

    it('refuses a bad signature with 401 and polls nothing', async () => {
        resolvePaymentProvider.mockResolvedValue(fakeDriver());
        const polled: string[] = [];
        const { calls, res } = respond();
        await HandleBillComWebhook({ rawBody: body, headers: { 'x-bill-sha-signature': 'nope' }, providerId }, res, context, async (id) => { polled.push(id); });
        expect(calls[0].status).toBe(401);
        expect(polled).toEqual([]);
    });

    it('404s an unknown provider id, an unconfigured provider, and a non-Bill.com provider', async () => {
        const polled: string[] = [];
        let r = respond();
        await HandleBillComWebhook({ rawBody: body, headers: {}, providerId: 'not-a-uuid' }, r.res, context, async (id) => { polled.push(id); });
        expect(r.calls[0].status).toBe(404);
        resolvePaymentProvider.mockRejectedValue(new Error('No payment provider'));
        r = respond();
        await HandleBillComWebhook({ rawBody: body, headers: {}, providerId }, r.res, context, async (id) => { polled.push(id); });
        expect(r.calls[0].status).toBe(404);
        resolvePaymentProvider.mockResolvedValue(fakeDriver('Stripe'));
        r = respond();
        await HandleBillComWebhook({ rawBody: body, headers: {}, providerId }, r.res, context, async (id) => { polled.push(id); });
        expect(r.calls[0].status).toBe(404);
        expect(polled).toEqual([]);
    });

    it('a verified event that is not about invoices or payments is acknowledged but not polled', async () => {
        resolvePaymentProvider.mockResolvedValue(fakeDriver());
        const other = JSON.stringify({ type: 'vendor.created', data: { id: '009' } });
        const polled: string[] = [];
        const { calls, res } = respond();
        await HandleBillComWebhook({ rawBody: other, headers: { 'x-bill-sha-signature': await SignBillComPayload(other, key) }, providerId }, res, context, async (id) => { polled.push(id); });
        expect(calls[0]).toEqual({ status: 202, body: { received: true, polled: false, kind: 'vendor.created' } });
        expect(polled).toEqual([]);
    });

    it('500s when the system user cannot be resolved, so Bill.com retries', async () => {
        const { calls, res } = respond();
        await HandleBillComWebhook({ rawBody: body, headers: {}, providerId }, res, () => ({ provider: undefined, user: undefined }));
        expect(calls[0].status).toBe(500);
    });
});
