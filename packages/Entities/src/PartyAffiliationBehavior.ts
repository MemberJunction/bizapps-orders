/**
 * @fileoverview `PartyAffiliationBehavior` — party and employer resolution helpers.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { RunView, type IRunViewProvider, type UserInfo } from '@memberjunction/core';

/**
 * Resolves the active singular employer organization for a person as of a given date.
 * If the person has exactly one active employer relationship, returns that organization ID.
 * If the person has zero or multiple active employer relationships, returns null (not singular/ambiguous).
 */
export async function ResolveSingularActiveEmployerOrganization(
    provider: IRunViewProvider,
    personID: string,
    asOf: Date = new Date(),
    user?: UserInfo,
): Promise<string | null> {
    if (!personID || !provider) return null;

    const rv = new RunView(provider);
    const date = asOf.toISOString().slice(0, 10);

    try {
        const res = await rv.RunView<{ ToOrganizationID: string }>(
            {
                EntityName: 'MJ_BizApps_Common: Relationships',
                ExtraFilter:
                    `FromPersonID='${personID}' AND ToOrganizationID IS NOT NULL ` +
                    `AND Status='Active' ` +
                    `AND (StartDate IS NULL OR StartDate <= '${date}') ` +
                    `AND (EndDate IS NULL OR EndDate >= '${date}') ` +
                    `AND RelationshipType IN ('Employer', 'Employee', 'Employment')`,
                Fields: ['ToOrganizationID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );

        if (res?.Success && res.Results?.length === 1) {
            return res.Results[0].ToOrganizationID ?? null;
        }
    } catch {
        return null;
    }

    return null;
}
