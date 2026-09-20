/**
 * The scheduler adapters for the Bill.com operations, with the operation stubbed. What these guard
 * is the string-encoding trap: a ScheduledJob stores every parameter as text, so "false" is truthy,
 * blank is absent, and an unreadable value is refused rather than defaulted. A job configured for
 * preview that sends real invoices on its first run is exactly the failure the Preview flag exists to
 * prevent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';

const executeSend = vi.fn();
const executePoll = vi.fn();
vi.mock('@mj-biz-apps/orders-entities', () => ({
    OrdersSendExternalInvoicesOperation: class { Execute = executeSend; },
    OrdersPollExternalPaymentsOperation: class { Execute = executePoll; },
}));
vi.mock('@memberjunction/core', () => ({ Metadata: { Provider: {} } }));

import { SendExternalInvoicesAction } from '../custom/send-external-invoices.action.js';
import { PollExternalPaymentsAction } from '../custom/poll-external-payments.action.js';
import { boolParam, listParam, numParam, supplied } from '../custom/action-params.js';

const run = (params: Array<{ Name: string; Value: unknown }>, withUser = true): RunActionParams =>
    ({ Params: params.map((p) => ({ ...p, Type: 'Input' })), ContextUser: withUser ? { ID: 'u1' } : undefined, Provider: {} }) as unknown as RunActionParams;

afterEach(() => { executeSend.mockReset(); executePoll.mockReset(); });

describe('action-params', () => {
    it('reads scheduler strings as the scheduler wrote them', () => {
        const p = run([{ Name: 'Preview', Value: 'false' }, { Name: 'MaxCount', Value: '' }, { Name: 'CompanyIDs', Value: 'a, b' }]);
        expect(boolParam(p, 'Preview')).toBe(false);
        expect(supplied(p, 'MaxCount')).toBe(false);
        expect(numParam(p, 'MaxCount')).toBeNull();
        expect(listParam(p, 'CompanyIDs')).toEqual(['a', 'b']);
        expect(boolParam(run([{ Name: 'Preview', Value: 'maybe' }]), 'Preview')).toBeNull();
    });
});

describe('SendExternalInvoicesAction', () => {
    const action = () => new SendExternalInvoicesAction() as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string; Message?: string }> };

    it('"false" for Preview means LIVE, and the operation is called with a boolean', async () => {
        executeSend.mockResolvedValue({ Success: true, Output: { Success: true, Sent: 2, Failed: 0, Skipped: 0, Results: [], PreviewedOnly: false, Message: 'ok' } });
        const r = await action().InternalRunAction(run([{ Name: 'Preview', Value: 'false' }, { Name: 'MaxCount', Value: '25' }]));
        expect(r.Success).toBe(true);
        expect(r.ResultCode).toBe('COMPLETED');
        expect(executeSend.mock.calls[0][0]).toEqual({ Preview: false, MaxCount: 25 });
    });

    it('"true" for Preview previews and reports PREVIEWED', async () => {
        executeSend.mockResolvedValue({ Success: true, Output: { Success: true, Sent: 3, Failed: 0, Skipped: 1, Results: [], PreviewedOnly: true } });
        const r = await action().InternalRunAction(run([{ Name: 'Preview', Value: 'true' }]));
        expect(r.ResultCode).toBe('PREVIEWED');
        expect(executeSend.mock.calls[0][0]).toEqual({ Preview: true });
    });

    it('refuses an unreadable Preview, a bad MaxCount and a non-UUID company, before calling anything', async () => {
        expect((await action().InternalRunAction(run([{ Name: 'Preview', Value: 'maybe' }]))).ResultCode).toBe('INVALID_PREVIEW');
        expect((await action().InternalRunAction(run([{ Name: 'MaxCount', Value: '0' }]))).ResultCode).toBe('INVALID_MAX_COUNT');
        expect((await action().InternalRunAction(run([{ Name: 'CompanyIDs', Value: 'not-a-uuid' }]))).ResultCode).toBe('INVALID_COMPANY_IDS');
        expect(executeSend).not.toHaveBeenCalled();
    });

    it('needs a context user, and turns a partial live pass into a failure', async () => {
        expect((await action().InternalRunAction(run([], false))).ResultCode).toBe('NO_CONTEXT_USER');
        executeSend.mockResolvedValue({ Success: true, Output: { Success: false, Sent: 1, Failed: 1, Skipped: 0, Results: [], PreviewedOnly: false, Message: '1 failed' } });
        const r = await action().InternalRunAction(run([]));
        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('PARTIAL');
    });
});

describe('PollExternalPaymentsAction', () => {
    const action = () => new PollExternalPaymentsAction() as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string; Message?: string }> };

    it('passes a well-formed call through and reports the operation code', async () => {
        executePoll.mockResolvedValue({ Success: true, Output: { Success: true, ResultCode: 'COMPLETED', Captured: 1, Held: 0, Unmatched: 0, ReversalNeeded: 0, Ignored: 0, Outcomes: [], NewWatermarks: [], PreviewedOnly: false } });
        const r = await action().InternalRunAction(run([{ Name: 'Preview', Value: 'false' }, { Name: 'SinceWatermark', Value: '2026-09-01' }]));
        expect(r.ResultCode).toBe('COMPLETED');
        expect(executePoll.mock.calls[0][0]).toMatchObject({ Preview: false, SinceWatermark: '2026-09-01T00:00:00.000Z' });
    });

    it('ATTENTION comes back as a failure so the job notifies', async () => {
        executePoll.mockResolvedValue({ Success: true, Output: { Success: false, ResultCode: 'ATTENTION', Captured: 1, Held: 0, Unmatched: 1, ReversalNeeded: 0, Ignored: 0, Outcomes: [], NewWatermarks: [], PreviewedOnly: false, Message: 'look' } });
        const r = await action().InternalRunAction(run([]));
        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('ATTENTION');
    });

    it('refuses a bad provider id, watermark or preview before calling anything', async () => {
        expect((await action().InternalRunAction(run([{ Name: 'PaymentProviderID', Value: 'nope' }]))).ResultCode).toBe('INVALID_PAYMENT_PROVIDER_ID');
        expect((await action().InternalRunAction(run([{ Name: 'SinceWatermark', Value: 'yesterday-ish' }]))).ResultCode).toBe('INVALID_SINCE_WATERMARK');
        expect((await action().InternalRunAction(run([{ Name: 'Preview', Value: '2' }]))).ResultCode).toBe('INVALID_PREVIEW');
        expect(executePoll).not.toHaveBeenCalled();
    });
});
