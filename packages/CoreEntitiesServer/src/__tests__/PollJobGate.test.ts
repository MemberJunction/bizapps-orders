/**
 * The poll follows the scheduled jobs whoever calls it (#583), one provider at a time (#608): a
 * provider whose job is off is skipped, one whose job previews runs as a preview, and only a provider
 * whose job is live records. The run fails only when every provider was skipped. The provider pass
 * itself is stubbed; what is asserted is whether it runs, and with which preview flag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-2222-4333-8444-555555555555';
const B = '66666666-7777-4888-9999-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({ jobs: [] as unknown[], readFails: false, loads: 0, providers: [] as Array<{ ID: string; CompanyID: string }> }));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    // The failed read throws from a plain function: vitest fails a test when a vi.fn implementation
    // throws, even when the code under test catches it.
    const load = async () => {
        mocks.loads++;
        if (mocks.readFails) throw new Error('The scheduled poll job could not be read: denied');
        return mocks.jobs;
    };
    return { ...actual, LoadPollJobs: load };
});
vi.mock('../InvoiceRailResolver.js', () => ({
    ListInvoiceRailProviderIDs: vi.fn(async () => mocks.providers),
    ResolveInvoiceRail: vi.fn(),
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersPollExternalPaymentsInput, OrdersPollExternalPaymentsOutput } from '@mj-biz-apps/orders-entities';
import { PollExternalPaymentsOperation } from '../PollExternalPaymentsOperation.js';

interface Testable {
    InternalExecute(input: OrdersPollExternalPaymentsInput, provider: IMetadataProvider, user: UserInfo): Promise<OrdersPollExternalPaymentsOutput>;
    pollProvider: ReturnType<typeof vi.fn>;
}

const job = (status: string, preview: boolean, providerID?: string) => ({
    Status: status,
    Configuration: JSON.stringify({
        ActionID: 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11',
        Params: [
            { ActionParamID: 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13', Value: String(preview) },
            ...(providerID ? [{ ActionParamID: 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B12', Value: providerID }] : []),
        ],
    }),
});

function op(): Testable {
    const o = new PollExternalPaymentsOperation() as unknown as Testable;
    o.pollProvider = vi.fn(async () => ({ Outcomes: [], NewWatermark: null, Fault: null }));
    return o;
}

const run = (o: Testable, input: OrdersPollExternalPaymentsInput) => o.InternalExecute(input, {} as IMetadataProvider, {} as UserInfo);
const previewFlagFor = (o: Testable, id: string) => o.pollProvider.mock.calls.find((c) => c[0] === id)?.[1]?.preview;

beforeEach(() => {
    mocks.jobs = [];
    mocks.readFails = false;
    mocks.loads = 0;
    mocks.providers = [{ ID: A, CompanyID: 'c' }];
});

describe('a poll that would write follows the scheduled job', () => {
    it.each([
        ['Disabled', [job('Disabled', true)], 'the scheduled poll job is Disabled'],
        ['not installed', [], 'no scheduled poll job covers this payment provider'],
    ])('refuses while the job is %s, and polls nothing', async (_label, jobs, Why) => {
        mocks.jobs = jobs;
        const o = op();
        const out = await run(o, { Preview: false });
        expect(out.Success).toBe(false);
        expect(out.Message).toContain(Why);
        expect(out.Message).toMatch(/Nothing was polled or recorded/);
        expect(o.pollProvider).not.toHaveBeenCalled();
    });

    it('runs as a preview while the job is in Preview, and says so', async () => {
        mocks.jobs = [job('Active', true)];
        const o = op();
        const out = await run(o, { Preview: false });
        expect(previewFlagFor(o, A)).toBe(true);
        expect(out.Success).toBe(true);
        expect(out.ResultCode).toBe('PREVIEWED');
        expect(out.PreviewedOnly).toBe(true);
        expect(out.Message).toMatch(/^Ran as a preview because provider .+: the scheduled poll job is still in Preview; nothing was recorded\./);
    });

    it('records while the job is live', async () => {
        mocks.jobs = [job('Active', false)];
        const o = op();
        const out = await run(o, { Preview: false });
        expect(previewFlagFor(o, A)).toBe(false);
        expect(out.ResultCode).toBe('COMPLETED');
        expect(out.PreviewedOnly).toBe(false);
    });

    it('treats an absent Preview as a run that would write', async () => {
        mocks.jobs = [job('Disabled', true)];
        const o = op();
        expect((await run(o, {})).Success).toBe(false);
        expect(o.pollProvider).not.toHaveBeenCalled();
    });

    it('refuses, writing nothing, when the job state cannot be read', async () => {
        mocks.readFails = true;
        const o = op();
        const out = await run(o, { Preview: false });
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/could not be read/);
        expect(o.pollProvider).not.toHaveBeenCalled();
    });

    it('lets an asked-for preview run without reading the job, since it writes nothing', async () => {
        const o = op();
        const out = await run(o, { Preview: true });
        expect(mocks.loads).toBe(0);
        expect(previewFlagFor(o, A)).toBe(true);
        expect(out.ResultCode).toBe('PREVIEWED');
    });
});

describe('each provider follows its own job', () => {
    beforeEach(() => {
        mocks.providers = [
            { ID: A, CompanyID: 'c' },
            { ID: B, CompanyID: 'c' },
        ];
    });

    it('records for the live provider while the other provider previews', async () => {
        mocks.jobs = [job('Active', false, A), job('Active', true, B)];
        const o = op();
        const out = await run(o, { Preview: false });
        expect(previewFlagFor(o, A)).toBe(false);
        expect(previewFlagFor(o, B)).toBe(true);
        expect(out.ResultCode).toBe('COMPLETED');
        expect(out.PreviewedOnly).toBe(false);
        expect(out.Message).toContain(`Ran as a preview because provider ${B}`);
    });

    it('skips a provider whose job is off, and still records for the live one', async () => {
        mocks.jobs = [job('Active', false, A), job('Disabled', false, B)];
        const o = op();
        const out = await run(o, { Preview: false });
        expect(o.pollProvider).toHaveBeenCalledTimes(1);
        expect(previewFlagFor(o, A)).toBe(false);
        expect(out.Success).toBe(true);
        expect(out.Message).toContain(`Skipped provider ${B}: the scheduled poll job is Disabled.`);
    });

    it('fails only when every provider was skipped', async () => {
        mocks.jobs = [job('Disabled', false, A), job('Disabled', false, B)];
        const o = op();
        const out = await run(o, { Preview: false });
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/^Nothing was polled or recorded/);
        expect(o.pollProvider).not.toHaveBeenCalled();
    });

    it("a provider's own job wins over a catch-all job; the catch-all covers the rest", async () => {
        mocks.jobs = [job('Active', true), job('Active', false, A)];
        const o = op();
        await run(o, { Preview: false });
        expect(previewFlagFor(o, A)).toBe(false);
        expect(previewFlagFor(o, B)).toBe(true);
    });

    it('a run naming one provider is governed by that provider only', async () => {
        mocks.jobs = [job('Active', false, A), job('Active', true, B)];
        const o = op();
        const out = await run(o, { Preview: false, PaymentProviderID: A });
        expect(o.pollProvider).toHaveBeenCalledTimes(1);
        expect(previewFlagFor(o, A)).toBe(false);
        expect(out.ResultCode).toBe('COMPLETED');
    });
});
