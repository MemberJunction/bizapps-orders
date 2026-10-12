/**
 * Whether the scheduled `Orders: Poll External Payments` job allows the payment poll to record cash.
 *
 * ONE RULE, EVERY CALLER. Both scheduled jobs ship Disabled and in Preview so Finance reads one run
 * before any money moves. The job is therefore the switch for the whole rail, not only for the
 * scheduler: the Bill.com webhook, the "Check for payments now" button and anything else that runs
 * `Orders.PollExternalPayments` must not record cash the job is not yet allowed to record. The
 * operation enforces this on the server (`PollExternalPaymentsOperation`); the webhook and the queue
 * page read the same answer to decide what to do and what to tell a person.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { RunView, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/** The Action behind `Orders — Poll External Payments`, whose scheduled job governs the poll. */
export const POLL_EXTERNAL_PAYMENTS_ACTION_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11';
/** That Action's `Preview` input param. Seeded by V202609272103; the job's Configuration names it. */
export const POLL_EXTERNAL_PAYMENTS_PREVIEW_PARAM_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13';
const SCHEDULED_JOB_ENTITY = 'MJ: Scheduled Jobs';

/**
 * - `NotInstalled` / `Inactive`: nothing may be recorded, and nothing should run on a person's behalf.
 * - `Preview`: a run decides everything and writes nothing.
 * - `Live`: a run records cash.
 */
export type PollJobStateName = 'NotInstalled' | 'Inactive' | 'Preview' | 'Live';

export interface PollJobState {
    State: PollJobStateName;
    /** One sentence a person can read: why the poll may or may not record cash. */
    Why: string;
}

export interface PollJobRow {
    Status: string | null;
    Configuration: string | null;
}

/**
 * Is this job's `Preview` param set to something the action will read as true?
 *
 * MUST AGREE WITH `boolParam` (packages/Server/src/custom/action-params.ts), which is what actually
 * decides whether the scheduled run previews. It accepts a real boolean as well as 'true', '1', 'yes'
 * and 'y', and every one of those is a spelling a person can put in the Configuration JSON. Only the
 * Preview param is read, never the whole blob, so another param whose value is "true" cannot block a
 * live job.
 *
 * ABSENT MEANS NOT PREVIEWING, which is the action's own default (`preview = !!input?.Preview`);
 * the two have to answer the same way or the gate is worse than no gate.
 */
export function PollPreviewParamIsTrue(configuration: string | null): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(configuration ?? '');
    } catch {
        // Unreadable configuration is not permission to record money.
        return true;
    }
    const params = (parsed as { Params?: unknown })?.Params;
    if (!Array.isArray(params)) return false;
    const preview = params.find(
        (x) =>
            typeof (x as { ActionParamID?: unknown })?.ActionParamID === 'string' &&
            UUIDsEqual((x as { ActionParamID: string }).ActionParamID, POLL_EXTERNAL_PAYMENTS_PREVIEW_PARAM_ID),
    );
    if (!preview) return false;
    const raw = (preview as { Value?: unknown }).Value;
    if (raw == null || raw === '') return false;
    if (typeof raw === 'boolean') return raw;
    return ['true', '1', 'yes', 'y'].includes(String(raw).trim().toLowerCase());
}

/** One job's state. */
export function ClassifyPollJob(job: PollJobRow | null | undefined): PollJobState {
    if (!job) return { State: 'NotInstalled', Why: 'no scheduled poll job is installed' };
    if ((job.Status ?? '').trim().toLowerCase() !== 'active') return { State: 'Inactive', Why: `the scheduled poll job is ${job.Status?.trim() || 'not active'}` };
    if (PollPreviewParamIsTrue(job.Configuration)) return { State: 'Preview', Why: 'the scheduled poll job is still in Preview' };
    return { State: 'Live', Why: 'the scheduled poll job is live' };
}

const RESTRICTIVENESS: Record<PollJobStateName, number> = { NotInstalled: 0, Inactive: 1, Preview: 2, Live: 3 };

/**
 * THE MOST RESTRICTIVE POLL JOB WINS, not whichever row the database happened to return first.
 *
 * One job covers every provider today (the shipped row names no `PaymentProviderID`), but the poll
 * takes one, so a site that splits the job per provider is an ordinary configuration. With no way to
 * tell which job governs which provider, every installed poll job has to agree before anything writes.
 */
export function ClassifyPollJobs(jobs: readonly PollJobRow[]): PollJobState {
    if (!jobs.length) return ClassifyPollJob(null);
    return jobs.map((j) => ClassifyPollJob(j)).reduce((worst, v) => (RESTRICTIVENESS[v.State] < RESTRICTIVENESS[worst.State] ? v : worst));
}

/** Reads every installed poll job and classifies them together. Throws when the read fails. */
export async function LoadPollJobState(user?: UserInfo, provider?: IRunViewProvider): Promise<PollJobState> {
    const rv = new RunView(provider);
    const r = await rv.RunView<PollJobRow>(
        {
            EntityName: SCHEDULED_JOB_ENTITY,
            ExtraFilter: `Configuration LIKE '%${POLL_EXTERNAL_PAYMENTS_ACTION_ID}%'`,
            Fields: ['Status', 'Configuration'],
            OrderBy: 'Name',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!r?.Success) throw new Error(`The scheduled poll job could not be read: ${r?.ErrorMessage ?? 'no result'}`);
    return ClassifyPollJobs(r.Results ?? []);
}
