import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runView: vi.fn() }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, RunView: class { RunView = mocks.runView; } };
});

import { ClassifyPollJob, ClassifyPollJobGroups, ClassifyPollJobs, ClassifyPollJobsFor, LoadPollJobState, PollJobProviderID } from '../external-payment-poll-job';

const PREVIEW = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13';
const PROVIDER = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B12';
const A = '11111111-2222-4333-8444-555555555555';
const B = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const config = (preview: unknown, providerID?: string) =>
    JSON.stringify({
        ActionID: 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11',
        Params: [{ ActionParamID: PREVIEW, Value: preview }, ...(providerID ? [{ ActionParamID: PROVIDER, Value: providerID }] : [])],
    });
const live = { Status: 'Active', Configuration: config('false') };
const previewing = { Status: 'Active', Configuration: config('true') };
const disabled = { Status: 'Disabled', Configuration: config('true') };

describe('ClassifyPollJob', () => {
    it('names the four states', () => {
        expect(ClassifyPollJob(null).State).toBe('NotInstalled');
        expect(ClassifyPollJob(disabled).State).toBe('Inactive');
        expect(ClassifyPollJob(previewing).State).toBe('Preview');
        expect(ClassifyPollJob(live).State).toBe('Live');
    });
});

describe('ClassifyPollJobs — the most restrictive job wins, whatever order the rows come in', () => {
    it.each([
        [[live, previewing], 'Preview'],
        [[previewing, live], 'Preview'],
        [[live, disabled, previewing], 'Inactive'],
        [[live, live], 'Live'],
        [[], 'NotInstalled'],
    ])('%#', (jobs, expected) => {
        expect(ClassifyPollJobs(jobs).State).toBe(expected);
    });
});

describe('PollJobProviderID', () => {
    it('reads the PaymentProviderID param, or null when the job names none', () => {
        expect(PollJobProviderID(config('false', A))).toBe(A);
        expect(PollJobProviderID(config('false'))).toBeNull();
        expect(PollJobProviderID('{not json')).toBeNull();
    });
});

describe('ClassifyPollJobsFor — only the jobs governing that provider count', () => {
    const liveA = { Status: 'Active', Configuration: config('false', A) };
    const previewB = { Status: 'Active', Configuration: config('true', B) };
    const previewAll = { Status: 'Active', Configuration: config('true') };

    it("another provider's Preview job does not downgrade a live provider", () => {
        expect(ClassifyPollJobsFor([liveA, previewB], A).State).toBe('Live');
        expect(ClassifyPollJobsFor([liveA, previewB], B).State).toBe('Preview');
    });

    it("a provider's own job wins over a catch-all job, which covers the providers without one", () => {
        expect(ClassifyPollJobsFor([previewAll, liveA], A).State).toBe('Live');
        expect(ClassifyPollJobsFor([previewAll, liveA], B).State).toBe('Preview');
    });

    it('a provider no job covers is NotInstalled', () => {
        expect(ClassifyPollJobsFor([liveA], B).State).toBe('NotInstalled');
    });

    it('matches the provider ID whatever its case', () => {
        expect(ClassifyPollJobsFor([liveA, previewB], A.toUpperCase()).State).toBe('Live');
    });

    it('with no provider, reads every job together', () => {
        expect(ClassifyPollJobsFor([liveA, previewB], null).State).toBe('Preview');
    });

    it('groups one state per named provider plus one for the catch-all jobs', () => {
        const groups = ClassifyPollJobGroups([liveA, previewB, previewAll]);
        expect(groups.map((g) => [g.ProviderID, g.State])).toEqual([
            [A, 'Live'],
            [B, 'Preview'],
            [null, 'Preview'],
        ]);
    });
});

describe('LoadPollJobState', () => {
    it('classifies what the view returns', async () => {
        mocks.runView.mockResolvedValueOnce({ Success: true, Results: [live, previewing] });
        expect((await LoadPollJobState()).State).toBe('Preview');
    });

    it('classifies only the jobs governing the provider it is given', async () => {
        mocks.runView.mockResolvedValueOnce({ Success: true, Results: [{ Status: 'Active', Configuration: config('false', A) }, { Status: 'Active', Configuration: config('true', B) }] });
        expect((await LoadPollJobState(undefined, undefined, A)).State).toBe('Live');
    });

    it('throws when the view fails, so no caller reads a failed read as "no job"', async () => {
        mocks.runView.mockResolvedValueOnce({ Success: false, ErrorMessage: 'denied' });
        await expect(LoadPollJobState()).rejects.toThrow(/denied/);
    });
});
