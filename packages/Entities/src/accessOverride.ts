/**
 * Access overrides — exceptions to payment-gated access on an order (bizapps-orders#268).
 *
 *   MJ.BizApps.Orders.Access.Override                    parent; holding it grants both children
 *   MJ.BizApps.Orders.Access.Override.WaivePaymentHold   request a WaivePaymentHold override
 *   MJ.BizApps.Orders.Access.Override.DeferCutoff        request a DeferCutoff override
 *
 * These govern who may REQUEST an override. Who may approve one is not settled (bizapps-orders#360).
 *
 * Shared so the browser and the server read the same names and the same rule. The server refuses a
 * request outright when the rows are missing from metadata; this answer is false in that case.
 */
import {
    AuthorizationEvaluator,
    Metadata,
    type AuthorizationInfo,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';

export type AccessOverrideKind = 'WaivePaymentHold' | 'DeferCutoff';

export const ACCESS_OVERRIDE_AUTH = {
    Parent: 'MJ.BizApps.Orders.Access.Override',
    WaivePaymentHold: 'MJ.BizApps.Orders.Access.Override.WaivePaymentHold',
    DeferCutoff: 'MJ.BizApps.Orders.Access.Override.DeferCutoff',
} as const;

/** The override types `user` may request, directly or through the parent authorization. */
export function userRequestableAccessOverrides(
    user: UserInfo | null | undefined,
    provider?: IMetadataProvider | { Authorizations?: AuthorizationInfo[] },
): AccessOverrideKind[] {
    if (!user) return [];
    const auths = provider?.Authorizations ?? new Metadata().Authorizations ?? [];
    const evaluator = new AuthorizationEvaluator();
    const holds = (name: string): boolean => {
        const auth = auths.find((a) => a.Name === name);
        return !!auth && evaluator.UserCanExecuteWithAncestors(auth, user, auths);
    };
    return (['WaivePaymentHold', 'DeferCutoff'] as const).filter((t) => holds(ACCESS_OVERRIDE_AUTH[t]));
}
