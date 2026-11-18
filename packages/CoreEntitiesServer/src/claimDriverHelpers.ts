/**
 * @fileoverview Shared helper utilities for Identity Claim drivers in BizApps Orders.
 *
 * @module @mj-biz-apps/orders-core-entities-server/claimDriverHelpers
 */

import { RunView, UserInfo, IRunViewProvider, IEntityDataProvider, IMetadataProvider } from '@memberjunction/core';
import { ResolvePersonByEmail } from './PersonByEmail.js';

/**
 * The Person an authenticated user's e-mail means, by the same rule checkout and the entitlement
 * check use (`ResolvePersonByEmail`): a Person with Orders activity first, then the oldest, then the
 * lowest ID. A claim must attach a guest order or grant to the Person the sale went to, so it cannot
 * take whichever row the database returns first (#852).
 *
 * @param user The authenticated UserInfo from the claim context
 * @param provider Optional scoped entity/metadata provider
 * @returns Person ID string if found, or null when no Person carries the e-mail
 * @throws Error when the lookup itself fails, so a failed read is not mistaken for "no Person"
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
    const resolved = await ResolvePersonByEmail(user.Email, rv, user);
    if (!resolved.Success) {
        throw new Error(`Could not look up the Person for ${user.Email}: ${resolved.ErrorMessage ?? 'Person lookup failed'}`);
    }
    return resolved.PersonID;
}
