/**
 * Who may delete a Draft or Quoted order (#1021).
 *
 * Entity permissions say whether a role may delete order rows at all; they cannot say whose. So a
 * standalone order delete also needs one of two authorizations, the same shape sales gives deals:
 * `MJ.BizApps.Orders.Order.Delete` deletes any order, and its child
 * `MJ.BizApps.Orders.Order.DeleteOwn` only an order the user created. The parent implies the child.
 *
 * "Created" is read from the order's `Create` entry in `MJ: Record Changes`. An order with no such
 * entry (record changes not tracked, or created by the system) has no owner, and only the any-order
 * grant deletes it.
 *
 * Shared so the screens hide what the server refuses. FAILS CLOSED like {@link ReversalRefusal}: a
 * missing authorization row means the grant was never installed, and gets its own message.
 */
import { Metadata, type AuthorizationInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserHasAuthorization } from './pricing/priceOverride';

export const ORDER_DELETE_AUTH = {
    Any: 'MJ.BizApps.Orders.Order.Delete',
    Own: 'MJ.BizApps.Orders.Order.DeleteOwn',
} as const;

type AuthorizationSource = IMetadataProvider | { Authorizations?: AuthorizationInfo[] };

/** Which orders `user` may delete: any, only their own, or none. */
export function UserOrderDeleteScope(user: UserInfo | null | undefined, provider?: AuthorizationSource): 'any' | 'own' | 'none' {
    const auths = provider?.Authorizations ?? new Metadata().Authorizations ?? [];
    if (UserHasAuthorization(ORDER_DELETE_AUTH.Any, user, { Authorizations: auths })) return 'any';
    if (UserHasAuthorization(ORDER_DELETE_AUTH.Own, user, { Authorizations: auths })) return 'own';
    return 'none';
}

/**
 * Why `user` may not delete the order, or null when they may.
 *
 * @param orderLabel how the message names the order: "Order ORD-000123".
 * @param creatorUserID who created the order, or null when no one is recorded.
 */
export function OrderDeleteRefusal(
    orderLabel: string,
    creatorUserID: string | null,
    user: UserInfo | null | undefined,
    provider?: AuthorizationSource,
): string | null {
    const auths = provider?.Authorizations ?? new Metadata().Authorizations ?? [];
    if (!auths.some((a) => a.Name === ORDER_DELETE_AUTH.Any)) {
        return (
            `The ${ORDER_DELETE_AUTH.Any} authorization is not installed, so no one can delete an order. ` +
            `Sync the BizApps Orders metadata to install it.`
        );
    }
    const scope = UserOrderDeleteScope(user, { Authorizations: auths });
    if (scope === 'any') return null;
    if (scope === 'own' && !!user?.ID && !!creatorUserID && UUIDsEqual(user.ID, creatorUserID)) return null;
    if (scope === 'own') {
        return creatorUserID
            ? `${orderLabel} was created by someone else. You can delete only orders you created; ask someone with ${ORDER_DELETE_AUTH.Any} to delete it.`
            : `${orderLabel} has no recorded creator, so only someone with ${ORDER_DELETE_AUTH.Any} can delete it.`;
    }
    return `Deleting an order needs ${ORDER_DELETE_AUTH.Any}, or ${ORDER_DELETE_AUTH.Own} for an order you created. Ask an administrator for either.`;
}
