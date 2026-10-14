/**
 * Running a band alongside existing coverage (bizapps-orders#511).
 *
 * A line that sets `AcknowledgesCoverageOverlap` books a second band of a subscription family over
 * coverage the holder already has, and both are billed. Until an upgrade or downgrade can be booked
 * as a change to the existing subscription, that choice needs two things at confirm:
 *
 *   - the confirming user holds `MJ.BizApps.Orders.Coverage.RunAlongside`, and
 *   - the line says why, in `CoverageOverlapReason`.
 *
 * Shared so the order lines editor warns about exactly what confirm refuses. The permission FAILS
 * CLOSED, as {@link UserHasAuthorization} does: a missing authorization row means the grant was never
 * installed, not that nobody needs one, so it gets its own message.
 */
import { Metadata, type AuthorizationInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserHasAuthorization } from './pricing/priceOverride';

export const COVERAGE_RUN_ALONGSIDE_AUTH = 'MJ.BizApps.Orders.Coverage.RunAlongside';

type AuthorizationSource = IMetadataProvider | { Authorizations?: AuthorizationInfo[] };

/** The line runs alongside existing coverage and does not say why. Whitespace is not a reason. */
export function CoverageOverlapReasonMissing(line: {
    AcknowledgesCoverageOverlap?: boolean | null;
    CoverageOverlapReason?: string | null;
}): boolean {
    return !!line.AcknowledgesCoverageOverlap && !(line.CoverageOverlapReason ?? '').trim();
}

/** Whether `user` may confirm a line that runs alongside existing coverage. */
export function UserCanRunAlongside(user: UserInfo | null | undefined, provider?: AuthorizationSource): boolean {
    return UserHasAuthorization(COVERAGE_RUN_ALONGSIDE_AUTH, user, provider);
}

/**
 * Why confirm refuses a line marked to run alongside existing coverage, or null when it may proceed.
 * Only meaningful for a line whose acknowledgment is what lets it through; the caller decides that.
 */
export function RunAlongsideRefusal(
    line: { AcknowledgesCoverageOverlap?: boolean | null; CoverageOverlapReason?: string | null },
    user: UserInfo | null | undefined,
    provider?: AuthorizationSource,
): string | null {
    const auths = provider?.Authorizations ?? new Metadata().Authorizations ?? [];
    if (!auths.some((a) => a.Name === COVERAGE_RUN_ALONGSIDE_AUTH)) {
        return (
            `The ${COVERAGE_RUN_ALONGSIDE_AUTH} authorization is not installed, so no one can run a band ` +
            `alongside existing coverage. Sync the BizApps Orders metadata to install it.`
        );
    }
    if (!UserCanRunAlongside(user, { Authorizations: auths })) {
        return (
            `Running a band alongside existing coverage needs the ${COVERAGE_RUN_ALONGSIDE_AUTH} ` +
            `authorization, held by the Account Director role.`
        );
    }
    if (CoverageOverlapReasonMissing(line)) {
        return 'The line is marked to run alongside existing coverage but gives no reason. Enter why both should be billed.';
    }
    return null;
}
