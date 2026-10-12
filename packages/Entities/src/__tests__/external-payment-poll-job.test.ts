import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runView: vi.fn() }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, RunView: class { RunView = mocks.runView; } };
});

import { ClassifyPollJob, ClassifyPollJobs, LoadPollJobState } from '../external-payment-poll-job';

const PREVIEW = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13';
const config = (preview: unknown) => JSON.stringify({ ActionID: 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11', Params: [{ ActionParamID: PREVIEW, Value: preview }] });
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

describe('LoadPollJobState', () => {
    it('classifies what the view returns', async () => {
        mocks.runView.mockResolvedValueOnce({ Success: true, Results: [live, previewing] });
        expect((await LoadPollJobState()).State).toBe('Preview');
    });

    it('throws when the view fails, so no caller reads a failed read as "no job"', async () => {
        mocks.runView.mockResolvedValueOnce({ Success: false, ErrorMessage: 'denied' });
        await expect(LoadPollJobState()).rejects.toThrow(/denied/);
    });
});
