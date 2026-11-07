/**
 * Whether the scheduled `Orders — Send External Invoices` job will send a unit without a person.
 *
 * The send dialogs used to promise that "the scheduled send would do this within the half hour". The
 * job ships Disabled and in Preview (`metadata/scheduled-jobs/.orders-billcom-scheduled-jobs.json`), so
 * on a fresh install that promise was false: nothing sends the unit until somebody enables the job and
 * turns Preview off. The dialogs now read the job and say what will actually happen.
 *
 * THE MOST PERMISSIVE JOB WINS, the opposite of the poll gate. The poll gate decides whether cash may
 * be recorded, so the strictest job governs. Here the question is whether any job will pick the unit
 * up, and one live job covering the company is enough.
 *
 * PER COMPANY. A job that sets `CompanyIDs` sends only those companies' units; a job that sets none
 * sends every company's.
 *
 * Reads and wording only. Nothing here changes what the job or the operation does.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { RunView, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { JobParamValue, JobPreviewParamIsTrue, type PollJobRow, type PollJobStateName } from './external-payment-poll-job.js';

/** The Action behind `Orders — Send External Invoices`. */
export const SEND_EXTERNAL_INVOICES_ACTION_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B01';
/** That Action's `CompanyIDs` input param: comma-separated, or a JSON array. */
export const SEND_EXTERNAL_INVOICES_COMPANY_IDS_PARAM_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B02';
/** That Action's `Preview` input param. */
export const SEND_EXTERNAL_INVOICES_PREVIEW_PARAM_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B04';
const SCHEDULED_JOB_ENTITY = 'MJ: Scheduled Jobs';

export type SendJobStateName = PollJobStateName;

export interface SendJobState {
    State: SendJobStateName;
    /** Why the job will or will not send on its own, as a clause: "the scheduled send is Disabled". */
    Why: string;
}

/**
 * The companies this job sends for; null when it names none and so sends every company's units.
 * Parsed as `listParam` (packages/Server/src/custom/action-params.ts) parses it for the action.
 * An unreadable configuration reads as null, and its unreadable Preview param already makes it Preview.
 */
export function SendJobCompanyIDs(configuration: string | null): string[] | null {
    const raw = JobParamValue(configuration, SEND_EXTERNAL_INVOICES_COMPANY_IDS_PARAM_ID);
    if (raw === 'unreadable' || raw == null) return null;
    let list: unknown[];
    if (Array.isArray(raw)) list = raw;
    else {
        const text = String(raw).trim();
        if (!text) return null;
        if (text.startsWith('[')) {
            try {
                const parsed = JSON.parse(text) as unknown;
                list = Array.isArray(parsed) ? parsed : [];
            } catch {
                list = [];
            }
        } else list = text.split(',');
    }
    const ids = list.map(String).map((s) => s.trim()).filter(Boolean);
    return ids.length ? ids : null;
}

/** One job's state. */
export function ClassifySendJob(job: PollJobRow | null | undefined): SendJobState {
    if (!job) return { State: 'NotInstalled', Why: 'no scheduled send job is installed' };
    if ((job.Status ?? '').trim().toLowerCase() !== 'active') return { State: 'Inactive', Why: `the scheduled send is ${job.Status?.trim() || 'not active'}` };
    if (JobPreviewParamIsTrue(job.Configuration, SEND_EXTERNAL_INVOICES_PREVIEW_PARAM_ID)) return { State: 'Preview', Why: 'the scheduled send is in Preview' };
    return { State: 'Live', Why: 'the scheduled send is live' };
}

const PERMISSIVENESS: Record<SendJobStateName, number> = { NotInstalled: 0, Inactive: 1, Preview: 2, Live: 3 };

/** The best state among the jobs that send `companyID`'s units; every job when no company is given. */
export function ClassifySendJobsFor(jobs: readonly PollJobRow[], companyID?: string | null): SendJobState {
    const covering = jobs.filter((j) => {
        if (!companyID) return true;
        const ids = SendJobCompanyIDs(j.Configuration);
        return ids == null || ids.some((id) => UUIDsEqual(id, companyID));
    });
    if (!covering.length) {
        return jobs.length ? { State: 'NotInstalled', Why: 'no scheduled send job covers this company' } : ClassifySendJob(null);
    }
    return covering.map((j) => ClassifySendJob(j)).reduce((best, v) => (PERMISSIVENESS[v.State] > PERMISSIVENESS[best.State] ? v : best));
}

/**
 * The sentence a send dialog shows under its question, for a unit that has not been sent before.
 * Null state means the job could not be read (a user without access to Scheduled Jobs): the dialog
 * then promises nothing about it.
 */
export function SendNowDetail(state: SendJobState | null): string {
    switch (state?.State) {
        case 'Live':
            return 'The scheduled send would pick this up on its next run; this sends it now.';
        case 'Preview':
            return `Nothing sends this on its own yet: ${state.Why} and writes nothing. This sends it now.`;
        case 'Inactive':
        case 'NotInstalled':
            return `Nothing sends this on its own: ${state.Why}. This sends it now.`;
        default:
            return 'This sends it now.';
    }
}

/** What the order shows under "nothing has been sent yet" for a unit that can be sent. */
export function SendQueuedNote(state: SendJobState | null): string {
    switch (state?.State) {
        case 'Live':
            return 'It is queued, and the scheduled send picks it up.';
        case 'Preview':
        case 'Inactive':
        case 'NotInstalled':
            return `It goes only when someone sends it: ${state.Why}.`;
        default:
            return '';
    }
}

/** Reads every installed send job. Throws when the read fails, so no caller reads a failed read as "no job". */
export async function LoadSendJobs(user?: UserInfo, provider?: IRunViewProvider): Promise<PollJobRow[]> {
    const rv = new RunView(provider);
    const r = await rv.RunView<PollJobRow>(
        {
            EntityName: SCHEDULED_JOB_ENTITY,
            ExtraFilter: `Configuration LIKE '%${SEND_EXTERNAL_INVOICES_ACTION_ID}%'`,
            Fields: ['Status', 'Configuration'],
            OrderBy: 'Name',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!r?.Success) throw new Error(`The scheduled send job could not be read: ${r?.ErrorMessage ?? 'no result'}`);
    return r.Results ?? [];
}
