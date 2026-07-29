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
import { pickActiveLinkIndex } from '@mj-biz-apps/accounting-engine-base';
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
    /**
     * The raw cached links and roles, needed for the COMPANY-SCOPED lookup (D71): a globally-shared
     * record such as a charge type has one link per company, and `ResolveLinkedAccount` has no
     * company dimension to choose between them.
     */
    GLAccountLinks: Array<{
        EntityID: string;
        RecordID: string;
        GLAccountID: string;
        GLAccountRoleID: string;
        Status: 'Pending' | 'Active' | 'Disabled';
        StartedAt: Date | null;
        EndedAt: Date | null;
    }>;
    GLAccountRoles: Array<{ ID: string; Name: string }>;
}

/** MJ entity ID for a name, with an error that says which name failed rather than `undefined`. */
export function EntityIDFor(name: string): string {
    // EntityByName, not Entities.find: it is case- and trim-insensitive and O(1), and it side-steps
    // the global-provider footgun in code paths that were handed a provider (Marcelo, PR #15).
    const entity = new Metadata().EntityByName(name);
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

    return new GLAccountResolver(ResolverEntities(), provider, user, (entityId, recordId, role, asOf, forCompanyID) => {
        // COMPANY-SCOPED LOOKUP (D71). Some linked records are GLOBAL while their accounts are
        // per-company — a charge type is one config row shared by every company, but 'shipping
        // revenue' is a different account in each one. `ResolveLinkedAccount` answers "which link
        // wins for this record", which for a global record means picking arbitrarily between several
        // companies' accounts and then failing D6's cross-company guard.
        //
        // When the caller names the company, filter the candidates by the ACCOUNT's company first
        // and let the ordinary window/status rules choose among what is left.
        if (forCompanyID) {
            const key = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
            const candidates = engine.GLAccountLinks.filter((l) => {
                if (key(l.EntityID) !== key(entityId)) return false;
                if (key(l.RecordID) !== key(recordId)) return false;
                const linkRole = engine.GLAccountRoles.find((r) => key(r.ID) === key(l.GLAccountRoleID));
                if (!linkRole || linkRole.Name.trim().toLowerCase() !== role.trim().toLowerCase()) return false;
                const acct = engine.GLAccountByID(l.GLAccountID);
                return key(acct?.CompanyID) === key(forCompanyID);
            });
            const winner = pickActiveLinkIndex(
                candidates.map((l) => ({ Status: l.Status, StartedAt: l.StartedAt, EndedAt: l.EndedAt })),
                asOf,
            );
            if (winner === -1) return null;
            const chosen = candidates[winner];
            const acct = engine.GLAccountByID(chosen.GLAccountID);
            return { GLAccountID: chosen.GLAccountID, CompanyID: acct?.CompanyID ?? '' };
        }

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
