/**
 * The one place orders reaches into accounting.
 *
 * Both booking paths — order confirm (`Dr AR / Cr Revenue`) and payment capture
 * (`Dr Cash / Cr AR`) — need the same two things: a `GLAccountResolver` wired to the accounting
 * engine, and the MJ entity IDs the polymorphic `GLAccountLink` rows hang off. This module owns
 * both so there is exactly one copy of the coupling rather than one per entity server.
 *
 * The engine is loaded through a dynamic import ON PURPOSE. `@mj-biz-apps/accounting-engine-base` is
 * a PEER dependency: orders must not pull accounting into a bundle that does not already have it,
 * and the load order matters (accounting's server package registers the remote operation this class
 * later resolves by key). Keeping the import here means that decision is made once, in a file whose
 * whole job is the boundary, instead of being copy-pasted into every caller.
 */
import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { GLAccountResolver, type ResolverEntityIDs } from './GLAccountResolver.js';

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const COMPANY_ENTITY = 'MJ: Companies';

/** The subset of `AccountingEngineBase` used here, declared structurally so there is no type import. */
export interface AccountingEngineSurface {
    ConfigEx(options: { contextUser?: UserInfo; provider?: IMetadataProvider }): Promise<unknown>;
    ResolveLinkedAccount(
        entityId: string,
        recordId: string,
        role: string,
        asOfDate: Date,
    ): { Link?: { GLAccountID?: string } } | null;
    GLAccountByID(glAccountId: string): { CompanyID?: string } | undefined;
}

/** MJ entity ID for a name, with an error that says which name failed rather than `undefined`. */
export function EntityIDFor(name: string): string {
    const entity = new Metadata().Entities.find((e) => e.Name === name);
    if (!entity) {
        throw new Error(`Entity '${name}' not found in metadata. Has CodeGen run for this schema?`);
    }
    return entity.ID;
}

/** The entity IDs the account-link walk needs. */
export function ResolverEntities(): ResolverEntityIDs {
    return {
        Product: EntityIDFor(PRODUCT_ENTITY),
        ProductCategory: EntityIDFor(PRODUCT_CATEGORY_ENTITY),
        Company: EntityIDFor(COMPANY_ENTITY),
    };
}

/** Load the accounting engine and make sure its caches are populated. */
export async function LoadAccountingEngine(
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<AccountingEngineSurface> {
    const mod = (await import('@mj-biz-apps/accounting-engine-base')) as unknown as {
        AccountingEngineBase: { Instance: AccountingEngineSurface };
    };
    const engine = mod.AccountingEngineBase.Instance;
    await engine.ConfigEx({ contextUser: user, provider });
    return engine;
}

/** A resolver bound to the live accounting engine. */
export async function BuildGLAccountResolver(
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<GLAccountResolver> {
    const engine = await LoadAccountingEngine(provider, user);

    return new GLAccountResolver(ResolverEntities(), provider, user, (entityId, recordId, role, asOf) => {
        // ResolveLinkedAccount returns { Link, Dimensions } — the account is on the link.
        const hit = engine.ResolveLinkedAccount(entityId, recordId, role, asOf);
        const glAccountID = hit?.Link?.GLAccountID;
        if (!glAccountID) return null;

        // The company comes from the ACCOUNT, not the link. Accounting derives the entry's company
        // that way (their CH-2), so it is the value D6's cross-company guard must compare — reading
        // it off the link would compare the wrong thing and let a mismatch through.
        const account = engine.GLAccountByID(glAccountID);
        return { GLAccountID: glAccountID, CompanyID: account?.CompanyID ?? '' };
    });
}
