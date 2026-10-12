/**
 * The poll follows the scheduled job's state whoever calls it (#583): a run that would write is
 * refused while the job is off, becomes a preview while the job previews, and records only while the
 * job is live. The provider pass itself is stubbed; what is asserted is whether it runs, and with
 * which preview flag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ loadPollJobState: vi.fn(), readFails: false }));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    // The failed read throws from a plain function: vitest fails a test when a vi.fn implementation
    // throws, even when the code under test catches it.
    const load = async (...args: unknown[]) => {
        const state = await mocks.loadPollJobState(...args);
        if (mocks.readFails) throw new Error('The scheduled poll job could not be read: denied');
        return state;
    };
    return { ...actual, LoadPollJobState: load };
});
vi.mock('../InvoiceRailResolver.js', () => ({
    ListInvoiceRailProviderIDs: vi.fn(async () => [{ ID: '11111111-2222-4333-8444-555555555555', CompanyID: 'c' }]),
    ResolveInvoiceRail: vi.fn(),
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersPollExternalPaymentsInput, OrdersPollExternalPaymentsOutput } from '@mj-biz-apps/orders-entities';
import { PollExternalPaymentsOperation } from '../PollExternalPaymentsOperation.js';

interface Testable {
    InternalExecute(input: OrdersPollExternalPaymentsInput, provider: IMetadataProvider, user: UserInfo): Promise<OrdersPollExternalPaymentsOutput>;
    pollProvider: ReturnType<typeof vi.fn>;
}

function op(): Testable {
    const o = new PollExternalPaymentsOperation() as unknown as Testable;
    o.pollProvider = vi.fn(async () => ({ Outcomes: [], NewWatermark: null, Fault: null }));
    return o;
}

const run = (o: Testable, input: OrdersPollExternalPaymentsInput) => o.InternalExecute(input, {} as IMetadataProvider, {} as UserInfo);

beforeEach(() => {
    mocks.loadPollJobState.mockReset();
    mocks.readFails = false;
});

describe('a poll that would write follows the scheduled job', () => {
    it.each([
        ['Inactive', 'the scheduled poll job is Disabled'],
        ['NotInstalled', 'no scheduled poll job is installed'],
    ])('refuses while the job is %s, and polls nothing', async (State, Why) => {
        mocks.loadPollJobState.mockResolvedValue({ State, Why });
        const o = op();
        const out = await run(o, { Preview: false });
        expect(out.Success).toBe(false);
        expect(out.Message).toContain(Why);
        expect(out.Message).toMatch(/Nothing was polled or recorded/);
        expect(o.pollProvider).not.toHaveBeenCalled();
    });

    it('runs as a preview while the job is in Preview, and says so', async () => {
        mocks.loadPollJobState.mockResolvedValue({ State: 'Preview', Why: 'the scheduled poll job is still in Preview' });
        const o = op();
        const out = await run(o, { Preview: false });
        expect(o.pollProvider).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ preview: true }), expect.anything(), expect.anything());
        expect(out.Success).toBe(true);
        expect(out.ResultCode).toBe('PREVIEWED');
        expect(out.PreviewedOnly).toBe(true);
        expect(out.Message).toMatch(/^Ran as a preview because the scheduled poll job is still in Preview; nothing was recorded\./);
    });

    it('records while the job is live', async () => {
        mocks.loadPollJobState.mockResolvedValue({ State: 'Live', Why: 'the scheduled poll job is live' });
        const o = op();
        const out = await run(o, { Preview: false });
        expect(o.pollProvider).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ preview: false }), expect.anything(), expect.anything());
        expect(out.ResultCode).toBe('COMPLETED');
        expect(out.PreviewedOnly).toBe(false);
    });

    it('treats an absent Preview as a run that would write', async () => {
        mocks.loadPollJobState.mockResolvedValue({ State: 'Inactive', Why: 'the scheduled poll job is Disabled' });
        const o = op();
        expect((await run(o, {})).Success).toBe(false);
        expect(o.pollProvider).not.toHaveBeenCalled();
    });

    it('refuses, writing nothing, when the job state cannot be read', async () => {
        mocks.loadPollJobState.mockResolvedValue(null);
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
        expect(mocks.loadPollJobState).not.toHaveBeenCalled();
        expect(o.pollProvider).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ preview: true }), expect.anything(), expect.anything());
        expect(out.ResultCode).toBe('PREVIEWED');
    });
});
