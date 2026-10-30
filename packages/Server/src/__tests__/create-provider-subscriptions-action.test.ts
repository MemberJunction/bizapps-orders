/**
 * The `Orders.CreateProviderSubscriptions` Action is an adapter (option E, E2): it reads its parameters
 * the way a scheduler stores them, calls `EnsureProviderSubscriptions`, and fails the run when a
 * subscription needs a person, so the scheduled job's failure notice reaches someone. Preview defaults
 * to true and is read strictly, because the scheduled job ships in preview.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';

const mocks = vi.hoisted(() => ({ ensure: vi.fn() }));
vi.mock('@mj-biz-apps/orders-core-entities-server', () => ({
    EnsureProviderSubscriptionsOnOwnProvider: (...args: unknown[]) => mocks.ensure(...args),
}));

import { CreateProviderSubscriptionsAction } from '../custom/create-provider-subscriptions.action.js';

interface CallableAction {
    InternalRunAction(params: RunActionParams): Promise<{ Success: boolean; ResultCode?: string; Message?: string; Params?: ActionParam[] }>;
}

const p = (Name: string, Value: unknown) => ({ Name, Value, Type: 'Input' }) as ActionParam;
const SUB = 'AAAAAAAA-0000-4000-8000-000000000110';

async function run(params: ActionParam[]) {
    const action = new CreateProviderSubscriptionsAction() as unknown as CallableAction;
    const runParams = { ContextUser: { ID: 'job-user' }, Provider: { id: 'provider' }, Params: params } as unknown as RunActionParams;
    const res = await action.InternalRunAction(runParams);
    return { res, out: (name: string) => runParams.Params?.find((x) => x.Name === name)?.Value };
}

beforeEach(() => {
    mocks.ensure.mockReset().mockResolvedValue({ Success: true, Outcomes: [], Linked: 0, Deferred: 0, Alerts: 0, Waiting: 0, Message: '0 subscription(s)' });
});

describe('Orders.CreateProviderSubscriptions action', () => {
    it('previews every eligible subscription by default', async () => {
        const { res, out } = await run([]);
        expect(mocks.ensure).toHaveBeenCalledWith({ Preview: true }, { id: 'provider' }, { ID: 'job-user' });
        expect(res).toMatchObject({ Success: true, ResultCode: 'PREVIEWED' });
        expect(out('PreviewedOnly')).toBe(true);
    });

    it('reads Preview "false" as false, the way a scheduler stores it, and targets one subscription', async () => {
        mocks.ensure.mockResolvedValue({ Success: true, Outcomes: [{ Code: 'Created' }], Linked: 1, Deferred: 0, Alerts: 0, Message: '1 linked' });
        const { res, out } = await run([p('Preview', 'false'), p('SubscriptionID', SUB), p('MaxCount', '5')]);
        expect(mocks.ensure.mock.calls[0][0]).toEqual({ Preview: false, SubscriptionIDs: [SUB], MaxCount: 5 });
        expect(res).toMatchObject({ Success: true, ResultCode: 'COMPLETED' });
        expect(out('Linked')).toBe(1);
        expect(out('Outcomes')).toEqual([{ Code: 'Created' }]);
        expect(out('PreviewedOnly')).toBe(false);
    });

    it('treats a blank parameter as absent', async () => {
        await run([p('Preview', ''), p('SubscriptionID', ''), p('MaxCount', '')]);
        expect(mocks.ensure.mock.calls[0][0]).toEqual({ Preview: true });
    });

    it('refuses an unreadable Preview, SubscriptionID or MaxCount rather than guessing', async () => {
        expect((await run([p('Preview', 'maybe')])).res).toMatchObject({ Success: false, ResultCode: 'INVALID_PREVIEW' });
        expect((await run([p('SubscriptionID', 'SUB-000110')])).res).toMatchObject({ Success: false, ResultCode: 'INVALID_SUBSCRIPTION_ID' });
        expect((await run([p('MaxCount', '0')])).res).toMatchObject({ Success: false, ResultCode: 'INVALID_MAX_COUNT' });
        expect(mocks.ensure).not.toHaveBeenCalled();
    });

    it('fails the run when a NEW problem was raised for a person, so the job notifies', async () => {
        mocks.ensure.mockResolvedValue({ Success: true, Outcomes: [{ Code: 'NoProviderPrice', NewAlert: true }], Linked: 0, Deferred: 0, Alerts: 1, Waiting: 0, Message: '1 new' });
        const { res, out } = await run([p('Preview', 'false')]);
        expect(res).toMatchObject({ Success: false, ResultCode: 'NEEDS_ATTENTION' });
        expect(out('Alerts')).toBe(1);
    });

    it('succeeds when every problem already has an open Task, so one stuck subscription does not fail every run', async () => {
        mocks.ensure.mockResolvedValue({ Success: true, Outcomes: [{ Code: 'EndedAtGateway', NewAlert: false }], Linked: 0, Deferred: 0, Alerts: 0, Waiting: 1, Message: '1 already with a person' });
        const { res, out } = await run([p('Preview', 'false')]);
        expect(res).toMatchObject({ Success: true, ResultCode: 'COMPLETED' });
        expect(out('Waiting')).toBe(1);
    });

    it('fails the run when the selection itself failed', async () => {
        mocks.ensure.mockResolvedValue({ Success: false, Outcomes: [], Linked: 0, Deferred: 0, Alerts: 0, Message: 'could not select' });
        expect((await run([])).res).toMatchObject({ Success: false, ResultCode: 'ERROR', Message: 'could not select' });
    });

    it('needs a context user', async () => {
        const action = new CreateProviderSubscriptionsAction() as unknown as CallableAction;
        const res = await action.InternalRunAction({ Params: [] } as unknown as RunActionParams);
        expect(res).toMatchObject({ Success: false, ResultCode: 'NO_CONTEXT_USER' });
    });
});

describe('Orders.CreateProviderSubscriptions metadata (shipped at release, read here from metadata/)', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../metadata');
    const read = (file: string) => JSON.parse(readFileSync(resolve(root, file), 'utf8')) as Array<{ fields: Record<string, unknown>; primaryKey: { ID: string }; relatedEntities?: Record<string, Array<{ fields: Record<string, unknown>; primaryKey: { ID: string } }>> }>;
    const [action] = read('actions/.orders-provider-subscription-actions.json');
    const [job] = read('scheduled-jobs/.orders-provider-subscription-scheduled-jobs.json');

    it('the action row names the registered driver class', () => {
        expect(action.fields.DriverClass).toBe('Orders.CreateProviderSubscriptions');
        expect(action.fields.Status).toBe('Active');
    });

    it('the job ships Disabled, set to Preview, capped at 25 like Spawn Renewals, pointed at this action, before Spawn Renewals', () => {
        expect(job.fields.Status).toBe('Disabled');
        expect(job.fields.RunImmediatelyIfNeverRun).toBe(false);
        const config = JSON.parse(String(job.fields.Configuration)) as { ActionID: string; Params: Array<{ ActionParamID: string; Value: string }> };
        expect(config.ActionID).toBe(action.primaryKey.ID);
        const param = (name: string) => action.relatedEntities!['MJ: Action Params'].find((p) => p.fields.Name === name)!;
        expect(config.Params).toEqual([
            { ActionParamID: param('Preview').primaryKey.ID, ValueType: 'Static', Value: 'true' },
            { ActionParamID: param('MaxCount').primaryKey.ID, ValueType: 'Static', Value: '25' },
        ]);
        // The caveat a host must read before turning the switch on is in the row itself, not only in the docs.
        expect(String(job.fields.Description)).toMatch(/REQUIRED wherever an account has BillsSubscriptions on/);
        // 02:45 UTC, before Spawn Renewals' 03:00, so a subscription linked tonight is skipped tonight.
        expect(job.fields.CronExpression).toBe('0 45 2 * * *');
        const spawn = read('scheduled-jobs/.orders-renewal-scheduled-jobs.json').find((j) => j.fields.Name === 'Orders — Spawn Renewals (daily)');
        expect(spawn?.fields.CronExpression).toBe('0 0 3 * * *');
    });
});
