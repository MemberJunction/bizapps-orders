/**
 * @fileoverview How the scheduled renewal pass is set up on this host: live, preview, or off.
 *
 * The Renewals page calls a subscription "due for renewal" when its term end is inside the lead
 * window and auto-renew is on. Whether anything then happens depends on the scheduled job
 * (`metadata/scheduled-jobs/.orders-renewal-scheduled-jobs.json`): it ships Disabled, and when
 * enabled its `Preview` parameter ships `true`, so it reports what it would renew and places
 * nothing until a person switches it live. A page that said "renews on the next pass" on such a
 * host would be promising an order nobody will place. So the worklist reads the job and reports
 * its mode, and the page says so.
 *
 * The job and its Preview parameter are found by the fixed IDs the metadata assigns them, which
 * is what a re-push preserves. A host without the job row reads as Off; a read that fails reads
 * as Unknown and is never fatal.
 *
 * CONNECTS TO:
 *   CALLERS: ./GetRenewalWorklistOperation.ts
 *   READS:   MJ: Scheduled Jobs (Status, Configuration, NextRunAt)
 */
import { LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';

/** `metadata/scheduled-jobs/.orders-renewal-scheduled-jobs.json`: "Orders — Spawn Renewals (daily)". */
export const RENEWAL_JOB_ID = '4E7A21B5-3C60-4F18-9D42-0A15C7E9B210';
/** `metadata/actions`: the Spawn Renewals action's `Preview` parameter. */
export const RENEWAL_PREVIEW_PARAM_ID = '4E7A21B5-3C60-4F18-9D42-0A15C7E9B203';

export type RenewalPassMode = 'Live' | 'Preview' | 'Off' | 'Unknown';

export interface RenewalPass {
    Mode: RenewalPassMode;
    NextRunAt: string | null;
}

interface JobRow {
    Status: string | null;
    Configuration: string | null;
    NextRunAt: Date | string | null;
}

/** The mode a job row means. Null row: no job on this host, so nothing renews on its own. */
export function ReadPassMode(job: Pick<JobRow, 'Status' | 'Configuration'> | null): RenewalPassMode {
    if (!job) return 'Off';
    if (String(job.Status ?? '').trim().toLowerCase() !== 'active') return 'Off';
    let params: Array<{ ActionParamID?: string; Value?: unknown }> = [];
    if (job.Configuration) {
        try {
            const parsed = JSON.parse(job.Configuration) as { Params?: Array<{ ActionParamID?: string; Value?: unknown }> };
            params = Array.isArray(parsed?.Params) ? parsed.Params : [];
        } catch {
            return 'Unknown';
        }
    }
    const preview = params.find((p) => String(p.ActionParamID ?? '').toLowerCase() === RENEWAL_PREVIEW_PARAM_ID.toLowerCase());
    // The action reads a blank as "not given", and the operation then places for real.
    const value = String(preview?.Value ?? '').trim().toLowerCase();
    return ['true', '1', 'yes', 'y'].includes(value) ? 'Preview' : 'Live';
}

/** Read the job and say what it will do. Never throws: a page that cannot learn the mode still lists the renewals. */
export async function LoadRenewalPass(provider: IMetadataProvider, user: UserInfo): Promise<RenewalPass> {
    try {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<JobRow>(
            { EntityName: 'MJ: Scheduled Jobs', ExtraFilter: `ID='${RENEWAL_JOB_ID}'`, Fields: ['Status', 'Configuration', 'NextRunAt'], ResultType: 'simple' },
            user,
        );
        if (!result.Success) throw new Error(result.ErrorMessage || 'the scheduled job could not be read');
        const job = result.Results[0] ?? null;
        const mode = ReadPassMode(job);
        const next = job?.NextRunAt;
        return { Mode: mode, NextRunAt: next == null ? null : next instanceof Date ? next.toISOString() : String(next) };
    } catch (err) {
        LogError(`RenewalPassMode: ${err instanceof Error ? err.message : String(err)}`);
        return { Mode: 'Unknown', NextRunAt: null };
    }
}
