/**
 * @fileoverview `PartyAffiliationBehavior` — party and employer resolution helpers.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { RunView, type IRunViewProvider, type UserInfo } from '@memberjunction/core';

export type ActiveEmployerRow = {
    ToOrganizationID: string;
    StartDate?: Date | string | null;
    EndDate?: Date | string | null;
};

function durationMs(row: ActiveEmployerRow, asOf: Date): number {
    const start = row.StartDate ? new Date(row.StartDate).getTime() : 0;
    const endRaw = row.EndDate ? new Date(row.EndDate).getTime() : asOf.getTime();
    const end = Number.isFinite(endRaw) ? endRaw : asOf.getTime();
    const begin = Number.isFinite(start) ? start : 0;
    return Math.max(0, end - begin);
}

/**
 * Active Employee relationship to an organization as of `asOf`.
 * Zero matches → null. One match → that org. Several → the longest-lasting
 * (earliest StartDate / longest span; a null StartDate counts as longest).
 */
export async function ResolveActiveEmployerOrganization(
    provider: IRunViewProvider,
    personID: string,
    asOf: Date = new Date(),
    user?: UserInfo,
): Promise<string | null> {
    if (!personID || !provider) return null;

    const rv = new RunView(provider);
    const date = asOf.toISOString().slice(0, 10);

    try {
        const res = await rv.RunView<ActiveEmployerRow>(
            {
                EntityName: 'MJ_BizApps_Common: Relationships',
                ExtraFilter:
                    `FromPersonID='${personID.replace(/'/g, "''")}' AND ToOrganizationID IS NOT NULL ` +
                    `AND Status='Active' ` +
                    `AND (StartDate IS NULL OR StartDate <= '${date}') ` +
                    `AND (EndDate IS NULL OR EndDate >= '${date}') ` +
                    `AND RelationshipType IN ('Employer', 'Employee', 'Employment')`,
                Fields: ['ToOrganizationID', 'StartDate', 'EndDate'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );

        const rows = (res?.Success ? res.Results : null) ?? [];
        if (rows.length === 0) return null;
        if (rows.length === 1) return rows[0].ToOrganizationID ?? null;
        const best = [...rows].sort((a, b) => durationMs(b, asOf) - durationMs(a, asOf))[0];
        return best?.ToOrganizationID ?? null;
    } catch {
        return null;
    }
}

/** @deprecated Use {@link ResolveActiveEmployerOrganization} — multiple employers now pick the longest-lasting. */
export async function ResolveSingularActiveEmployerOrganization(
    provider: IRunViewProvider,
    personID: string,
    asOf: Date = new Date(),
    user?: UserInfo,
): Promise<string | null> {
    return ResolveActiveEmployerOrganization(provider, personID, asOf, user);
}
