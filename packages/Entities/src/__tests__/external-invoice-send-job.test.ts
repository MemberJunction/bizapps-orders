/**
 * The send dialogs promised a pickup "within the half hour" while the job shipped Disabled and in
 * Preview. These cover the reading that replaced the promise: what the job will actually do.
 */
import { describe, expect, it } from 'vitest';
import { ClassifySendJob, ClassifySendJobsFor, SendJobCompanyIDs, SendNowDetail, SendQueuedNote } from '../external-invoice-send-job';

const PREVIEW = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B04';
const COMPANIES = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B02';
const A = '11111111-2222-4333-8444-555555555555';
const B = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const config = (preview: unknown, companies?: unknown) =>
    JSON.stringify({
        ActionID: 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B01',
        Params: [{ ActionParamID: PREVIEW, Value: preview }, ...(companies !== undefined ? [{ ActionParamID: COMPANIES, Value: companies }] : [])],
    });
const live = { Status: 'Active', Configuration: config('false') };
const previewing = { Status: 'Active', Configuration: config('true') };
const shipped = { Status: 'Disabled', Configuration: config('true') };

describe('ClassifySendJob', () => {
    it('reads the job as shipped as not sending', () => {
        expect(ClassifySendJob(shipped)).toEqual({ State: 'Inactive', Why: 'the scheduled send is Disabled' });
    });

    it('names the other states', () => {
        expect(ClassifySendJob(null).State).toBe('NotInstalled');
        expect(ClassifySendJob(previewing).State).toBe('Preview');
        expect(ClassifySendJob(live).State).toBe('Live');
        expect(ClassifySendJob({ Status: 'Active', Configuration: '{not json' }).State).toBe('Preview');
    });
});

describe('ClassifySendJobsFor — any live job covering the company sends the unit', () => {
    it('the most permissive covering job wins', () => {
        expect(ClassifySendJobsFor([shipped, live], A).State).toBe('Live');
        expect(ClassifySendJobsFor([previewing, shipped], A).State).toBe('Preview');
        expect(ClassifySendJobsFor([], A).State).toBe('NotInstalled');
    });

    it('a job naming other companies does not cover this one', () => {
        const otherOnly = { Status: 'Active', Configuration: config('false', B) };
        expect(ClassifySendJobsFor([otherOnly], A)).toEqual({ State: 'NotInstalled', Why: 'no scheduled send job covers this company' });
        expect(ClassifySendJobsFor([otherOnly, previewing], A).State).toBe('Preview');
        expect(ClassifySendJobsFor([otherOnly], B).State).toBe('Live');
    });
});

describe('SendJobCompanyIDs — parsed as the action parses it', () => {
    it.each([
        [undefined, null],
        ['', null],
        [`${A}, ${B}`, [A, B]],
        [`["${A}"]`, [A]],
        [[B], [B]],
    ])('%#', (value, expected) => {
        expect(SendJobCompanyIDs(config('false', value))).toEqual(expected);
    });
});

describe('the dialog wording', () => {
    it('promises a pickup only when the job is live', () => {
        expect(SendNowDetail({ State: 'Live', Why: '' })).toMatch(/next run/);
        expect(SendNowDetail(ClassifySendJob(shipped))).toBe('Nothing sends this on its own: the scheduled send is Disabled. This sends it now.');
        expect(SendNowDetail(ClassifySendJob(previewing))).toMatch(/in Preview and writes nothing/);
        expect(SendNowDetail(null)).toBe('This sends it now.');
    });

    it('the queued note says who sends it', () => {
        expect(SendQueuedNote({ State: 'Live', Why: '' })).toMatch(/scheduled send picks it up/);
        expect(SendQueuedNote(ClassifySendJob(shipped))).toBe('It goes only when someone sends it: the scheduled send is Disabled.');
        expect(SendQueuedNote(null)).toBe('');
    });
});
