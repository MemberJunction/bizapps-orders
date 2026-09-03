/**
 * Two-level order-line price override, gated by MJ authorizations.
 *
 *   MJ.BizApps.Orders.Price.Override        parent
 *   MJ.BizApps.Orders.Price.OverrideList    pick another named applicable price
 *   MJ.BizApps.Orders.Price.OverrideAny     type any unit price (implies list via parent)
 *
 * The catalog missing the parent row means metadata has not been synced — the gate is off so
 * existing IT / pre-sync saves keep working. Once the rows exist, a stated price that is not
 * the engine result needs a grant.
 */
import {
    AuthorizationEvaluator,
    Metadata,
    type AuthorizationInfo,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { Money } from './PricingBehavior.js';

export const PRICE_OVERRIDE_AUTH = {
    Parent: 'MJ.BizApps.Orders.Price.Override',
    List: 'MJ.BizApps.Orders.Price.OverrideList',
    Any: 'MJ.BizApps.Orders.Price.OverrideAny',
} as const;

export type PriceOverrideKind = 'none' | 'list' | 'any';

function authorizationCatalog(provider?: IMetadataProvider | { Authorizations?: AuthorizationInfo[] }): AuthorizationInfo[] {
    return provider?.Authorizations ?? new Metadata().Authorizations ?? [];
}

export function priceOverrideCatalogInstalled(provider?: IMetadataProvider | { Authorizations?: AuthorizationInfo[] }): boolean {
    return authorizationCatalog(provider).some((a) => a.Name === PRICE_OVERRIDE_AUTH.Parent);
}

export function userPriceOverrideKind(
    user: UserInfo | null | undefined,
    provider?: IMetadataProvider | { Authorizations?: AuthorizationInfo[] },
): PriceOverrideKind {
    if (!user) return 'none';
    const auths = authorizationCatalog(provider);
    const find = (name: string) => auths.find((a) => a.Name === name);
    const evaluator = new AuthorizationEvaluator();
    const any = find(PRICE_OVERRIDE_AUTH.Any);
    if (any && evaluator.UserCanExecuteWithAncestors(any, user, auths)) return 'any';
    const list = find(PRICE_OVERRIDE_AUTH.List);
    if (list && evaluator.UserCanExecuteWithAncestors(list, user, auths)) return 'list';
    const parent = find(PRICE_OVERRIDE_AUTH.Parent);
    if (parent && evaluator.UserCanExecuteWithAncestors(parent, user, auths)) return 'any';
    return 'none';
}

export function moneyEqual(a: number, b: number): boolean {
    return Money(a) === Money(b);
}

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

export function isEnginePrice(
    line: { UnitPrice?: number | null; ProductPriceID?: string | null },
    engine: { UnitPrice: number; ProductPriceID: string | null },
): boolean {
    if (!moneyEqual(Number(line.UnitPrice ?? 0), engine.UnitPrice)) return false;
    return uuidKey(line.ProductPriceID) === uuidKey(engine.ProductPriceID);
}

export function isNamedListPick(
    line: { UnitPrice?: number | null; ProductPriceID?: string | null },
    applicable: Array<{ ID: string; UnitPrice: number }>,
): boolean {
    const id = uuidKey(line.ProductPriceID);
    if (!id) return false;
    const hit = applicable.find((p) => uuidKey(p.ID) === id);
    if (!hit) return false;
    return moneyEqual(Number(line.UnitPrice ?? 0), hit.UnitPrice);
}
