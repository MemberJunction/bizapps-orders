/**
 * Reversing booked money (bc-aidp-next-golive#454).
 *
 * Cancelling a subscription (its credit memo), refunding a payment, moving an account credit to
 * another order and lowering an agreed amount all undo money a booked order already holds. Finance
 * runs them: an early termination, a settlement, a refund or a credit transfer is not new sales, and
 * an account director one click away from them gets them wrong. So each needs
 * `MJ.BizApps.Orders.Order.Reverse`, held by the Finance role (and Developer, which keeps every
 * permission). A return (Returns page, a reversal order confirmed through `OrderEntityServer`) is
 * deliberately not gated: returns stay with whoever books orders.
 *
 * Shared so the screens hide what the operations refuse. The permission FAILS CLOSED, as
 * {@link UserHasAuthorization} does: a missing authorization row means the grant was never
 * installed, not that nobody needs one, so it gets its own message.
 */
import { Metadata, type AuthorizationInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserHasAuthorization } from './pricing/priceOverride';

export const ORDER_REVERSE_AUTH = 'MJ.BizApps.Orders.Order.Reverse';

type AuthorizationSource = IMetadataProvider | { Authorizations?: AuthorizationInfo[] };

/** Whether `user` may cancel, refund, move a credit or lower an agreed amount. */
export function UserCanReverse(user: UserInfo | null | undefined, provider?: AuthorizationSource): boolean {
    return UserHasAuthorization(ORDER_REVERSE_AUTH, user, provider);
}

/**
 * Why `user` may not run `action`, or null when they may.
 *
 * @param action what is being refused, as the start of a sentence: "Cancelling a subscription".
 */
export function ReversalRefusal(action: string, user: UserInfo | null | undefined, provider?: AuthorizationSource): string | null {
    const auths = provider?.Authorizations ?? new Metadata().Authorizations ?? [];
    if (!auths.some((a) => a.Name === ORDER_REVERSE_AUTH)) {
        return (
            `The ${ORDER_REVERSE_AUTH} authorization is not installed, so no one can cancel, refund or move ` +
            `credit. Sync the BizApps Orders metadata to install it.`
        );
    }
    if (!UserCanReverse(user, { Authorizations: auths })) {
        return `${action} needs the ${ORDER_REVERSE_AUTH} authorization, held by the Finance role (and Developer). Ask finance to do it.`;
    }
    return null;
}
