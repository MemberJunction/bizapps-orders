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
 * PER PROVIDER. A job that sets `PaymentProviderID` governs only that provider; the jobs that set none
 * govern every provider without a job of its own (`ClassifyPollJobsFor`).
 *
 * @module @mj-biz-apps/orders-entities
 */
import { RunView, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/** The Action behind `Orders — Poll External Payments`, whose scheduled job governs the poll. */
export const POLL_EXTERNAL_PAYMENTS_ACTION_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11';
/** That Action's `PaymentProviderID` input param. A job that sets it polls, and governs, only that provider. */
export const POLL_EXTERNAL_PAYMENTS_PROVIDER_PARAM_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B12';
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
    const params = jobParams(configuration);
    // Unreadable configuration is not permission to record money.
    if (params === 'unreadable') return true;
    const preview = findParam(params, POLL_EXTERNAL_PAYMENTS_PREVIEW_PARAM_ID);
    if (!preview) return false;
    const raw = (preview as { Value?: unknown }).Value;
    if (raw == null || raw === '') return false;
    if (typeof raw === 'boolean') return raw;
    return ['true', '1', 'yes', 'y'].includes(String(raw).trim().toLowerCase());
}

/**
 * The provider this job polls, from its `PaymentProviderID` param; null when it names none and so
 * polls every provider (the shipped job). An unreadable configuration also reads as null: it then
 * counts among the jobs that cover every provider, where its unreadable Preview param already makes
 * it refuse to record.
 */
export function PollJobProviderID(configuration: string | null): string | null {
    const params = jobParams(configuration);
    if (params === 'unreadable') return null;
    const raw = (findParam(params, POLL_EXTERNAL_PAYMENTS_PROVIDER_PARAM_ID) as { Value?: unknown } | undefined)?.Value;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** The job's `Params` array: empty when it has none, 'unreadable' when the JSON does not parse. */
function jobParams(configuration: string | null): unknown[] | 'unreadable' {
    let parsed: unknown;
    try {
        parsed = JSON.parse(configuration ?? '');
    } catch {
        return 'unreadable';
    }
    const params = (parsed as { Params?: unknown })?.Params;
    return Array.isArray(params) ? params : [];
}

function findParam(params: unknown[], actionParamID: string): unknown {
    return params.find(
        (x) =>
            typeof (x as { ActionParamID?: unknown })?.ActionParamID === 'string' &&
            UUIDsEqual((x as { ActionParamID: string }).ActionParamID, actionParamID),
    );
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
 * THE MOST RESTRICTIVE POLL JOB WINS, not whichever row the database happened to return first. Used
 * on its own only when no provider is in question; a run for a provider goes through
 * `ClassifyPollJobsFor`, so one provider's job never governs another provider's runs.
 */
export function ClassifyPollJobs(jobs: readonly PollJobRow[]): PollJobState {
    if (!jobs.length) return ClassifyPollJob(null);
    return jobs.map((j) => ClassifyPollJob(j)).reduce((worst, v) => (RESTRICTIVENESS[v.State] < RESTRICTIVENESS[worst.State] ? v : worst));
}

/**
 * THE JOBS THAT GOVERN ONE PROVIDER: the jobs naming that provider, or, when none does, the jobs that
 * name no provider and so poll every one. Among those the most restrictive wins.
 *
 * A provider's own job wins over a catch-all job because a catch-all job left in Preview would
 * otherwise hold back a provider whose own job is live. Nothing is lost by it: a scheduled run of a
 * Preview job passes Preview as its input and writes nothing regardless of this gate.
 *
 * With no provider given, every job is read together, as `ClassifyPollJobs`.
 */
export function ClassifyPollJobsFor(jobs: readonly PollJobRow[], paymentProviderID: string | null | undefined): PollJobState {
    if (!paymentProviderID) return ClassifyPollJobs(jobs);
    const own = jobs.filter((j) => {
        const id = PollJobProviderID(j.Configuration);
        return id != null && UUIDsEqual(id, paymentProviderID);
    });
    if (own.length) return ClassifyPollJobs(own);
    const catchAll = jobs.filter((j) => PollJobProviderID(j.Configuration) == null);
    if (catchAll.length) return ClassifyPollJobs(catchAll);
    return { State: 'NotInstalled', Why: 'no scheduled poll job covers this payment provider' };
}

/** One state per provider a job names, plus one for the jobs that name none (`ProviderID` null). */
export function ClassifyPollJobGroups(jobs: readonly PollJobRow[]): Array<PollJobState & { ProviderID: string | null }> {
    const groups = new Map<string, { ProviderID: string | null; Jobs: PollJobRow[] }>();
    for (const j of jobs) {
        const id = PollJobProviderID(j.Configuration);
        const key = id?.toLowerCase() ?? '';
        const group = groups.get(key) ?? { ProviderID: id, Jobs: [] };
        group.Jobs.push(j);
        groups.set(key, group);
    }
    return [...groups.values()].map((g) => ({ ProviderID: g.ProviderID, ...ClassifyPollJobs(g.Jobs) }));
}

/** Reads every installed poll job. Throws when the read fails, so no caller reads a failed read as "no job". */
export async function LoadPollJobs(user?: UserInfo, provider?: IRunViewProvider): Promise<PollJobRow[]> {
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
    return r.Results ?? [];
}

/**
 * Reads every installed poll job and classifies the ones governing `paymentProviderID`
 * (`ClassifyPollJobsFor`), or all of them together when none is given. Throws when the read fails.
 */
export async function LoadPollJobState(user?: UserInfo, provider?: IRunViewProvider, paymentProviderID?: string | null): Promise<PollJobState> {
    return ClassifyPollJobsFor(await LoadPollJobs(user, provider), paymentProviderID);
}
