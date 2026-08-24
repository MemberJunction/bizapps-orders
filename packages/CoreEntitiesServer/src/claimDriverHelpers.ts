/**
 * @fileoverview Shared helper utilities for Identity Claim drivers in BizApps Orders.
 *
 * @module @mj-biz-apps/orders-core-entities-server/claimDriverHelpers
 */

import { RunView, UserInfo, IRunViewProvider, IEntityDataProvider, IMetadataProvider } from '@memberjunction/core';

const PERSON_ENTITY = 'MJ_BizApps_Common: People';

/**
 * Resolves or looks up the primary Person record associated with an authenticated UserInfo.
 *
 * @param user The authenticated UserInfo from the claim context
 * @param provider Optional scoped entity/metadata provider
 * @returns Person ID string if found, or null
 */
export async function resolvePersonID(
    user: UserInfo,
    provider?: IEntityDataProvider | IMetadataProvider | null
): Promise<string | null> {
    if (!user || !user.Email) {
        return null;
    }

    const runViewProvider = (provider && 'RunView' in provider) ? (provider as unknown as IRunViewProvider) : null;
    const rv = new RunView(runViewProvider);
    const escaped = user.Email.trim().toLowerCase().replace(/'/g, "''");
    const personResult = await rv.RunView<{ ID: string }>({
        EntityName: PERSON_ENTITY,
        ExtraFilter: `Email = '${escaped}'`,
        ResultType: 'simple'
    }, user);

    if (personResult.Success && personResult.Results && personResult.Results.length > 0) {
        return personResult.Results[0].ID;
    }

    return null;
}
