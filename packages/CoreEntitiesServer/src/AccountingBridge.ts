/**
 * The one place orders reaches into accounting.
 *
 * Both booking paths — order confirm (`Dr AR / Cr Revenue`) and payment capture
 * (`Dr Cash / Cr AR`) — need the same two things: a `GLAccountResolver` wired to the accounting
 * engine, and the MJ entity IDs the polymorphic `GLAccountLink` rows hang off. This module owns
 * both so there is exactly one copy of the coupling rather than one per entity server.
 *
 * `@mj-biz-apps/accounting-engine-base` is a real `dependencies` entry on this package and a
 * static import, like every other import in the repo (CLAUDE.md forbids dynamic require/import).
 * This file used to load the engine through `await import(...)` so the package could stay a peer;
 * `pickActiveLinkIndex` below has always been a static import from the same package, so the
 * dynamic form never kept it out of the graph. It is now declared in `package.json` so pnpm
 * resolves it as an owned dependency instead of a host-provided peer.
 *
 * Load ORDER still matters — accounting's server package registers the remote operation this class
 * resolves by key — but that is a different package (`accounting-server`, wired up by the host app's
 * resolver paths) and is unaffected by how this one is imported.
 */
import { BaseRemotableOperation, IMetadataProvider, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { AccountingEngineBase, pickActiveLinkIndex } from '@mj-biz-apps/accounting-engine-base';
import { GLAccountResolver, type ResolverEntityIDs } from './GLAccountResolver.js';
import type { IntercompanyLookup } from './PaymentAllocationFactory.js';
import type { PaymentJELineDimension } from './PaymentJournalEntryFactory.js';

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const COMPANY_ENTITY = 'MJ: Companies';

/** The subset of `AccountingEngineBase` used here, declared structurally so there is no type import. */
export interface AccountingEngineSurface {
    ConfigEx(options: {
        forceRefresh?: boolean;
        contextUser?: UserInfo;
        provider?: IMetadataProvider;
    }): Promise<unknown>;
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
    /**
     * The analysis axes and their permitted values, as accounting caches them.
     *
     * Read by the order-line dimension derivation: the axes it can tag with are whatever the ERP
     * sync has pulled in, and both are resolved BY CODE because the ids are minted per environment.
     */
    Dimensions: Array<{ ID: string; Code: string; IsActive: boolean }>;
    DimensionValues: Array<{ ID: string; DimensionID: string; Code: string; IsActive: boolean }>;
    /**
     * Journal entry types this database actually has, by Code.
     *
     * Read before naming an EntryType that orders has added only as metadata JSON: a JSON row
     * reaches a host at the release's Metadata_Sync and not before, and accounting refuses an
     * unseeded code outright (ENTRY_TYPE_UNKNOWN), so an entry naming one would fail everywhere the
     * release has not reached.
     */
    JournalEntryTypeByCode(code: string): { ID: string; Code: string } | undefined;
    /**
     * The Due To / Due From pair for an ORDERED company pair (BA-D26), each leg carrying the
     * dimensions pinned on the match. `DimensionValueID` is nullable there by design.
     */
    ResolveIntercompanyAccounts(
        sourceCompanyId: string,
        targetCompanyId: string,
        asOfDate: Date,
    ): {
        DueTo: { GLAccountID: string; Dimensions: Array<{ DimensionID: string; DimensionValueID: string | null }> };
        DueFrom: { GLAccountID: string; Dimensions: Array<{ DimensionID: string; DimensionValueID: string | null }> };
    } | null;
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
        ProductType: EntityIDFor(PRODUCT_TYPE_ENTITY),
        Company: EntityIDFor(COMPANY_ENTITY),
    };
}

/** Load the accounting engine and make sure its caches are populated. */
export async function LoadAccountingEngine(
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<AccountingEngineSurface> {
    const engine = (AccountingEngineBase as unknown as { Instance: AccountingEngineSurface }).Instance;
    // GL Account Roles, accounts, and links already live in AccountingEngineBase. Config is
    // idempotent; BaseEngine save/delete events keep the arrays current. Do not force-refresh
    // on every booking — that throws away the cache the engine exists to provide.
    await engine.ConfigEx({ forceRefresh: false, contextUser: user, provider });
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

/**
 * The intercompany lookup both payment booking paths hand to `PaymentAllocationFactory`.
 *
 * It lived as a copy-pasted closure in `PaymentHeaderEntityServer` and `PaymentLineEntityServer`,
 * and that is precisely how issue #238 happened: both copies kept the two GL account IDs and threw
 * away the `Dimensions` the engine had already resolved, so the counterparty never reached the
 * ledger and the fix had to be made in two places that nothing keeps in step.
 *
 * A PIN WITH NO VALUE IS SKIPPED, not defaulted and not an error. `IntercompanyAccountMatchDimension`
 * makes `DimensionValueID` nullable to mean "take the value from context", and the table's own
 * definition says an intercompany leg has no context to take one from: it is raised to balance
 * somebody else's revenue, so there is no originating record carrying a department or a cost centre.
 * A null is therefore a Dimension named without an answer, and the only thing that can be done with
 * it here is to leave it off. Refusing to book instead would turn a legal configuration into an
 * outage.
 */
export async function BuildIntercompanyLookup(
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<IntercompanyLookup> {
    const engine = await LoadAccountingEngine(provider, user);

    const pinned = (
        requirements: Array<{ DimensionID: string; DimensionValueID: string | null }>,
    ): PaymentJELineDimension[] =>
        requirements
            .filter((d): d is { DimensionID: string; DimensionValueID: string } => !!d.DimensionValueID)
            .map((d) => ({ DimensionID: d.DimensionID, DimensionValueID: d.DimensionValueID }));

    return (source, target, asOf) => {
        const hit = engine.ResolveIntercompanyAccounts(source, target, asOf);
        if (!hit) return null;
        return {
            DueToGLAccountID: hit.DueTo.GLAccountID,
            DueFromGLAccountID: hit.DueFrom.GLAccountID,
            DueToDimensions: pinned(hit.DueTo.Dimensions),
            DueFromDimensions: pinned(hit.DueFrom.Dimensions),
        };
    };
}

/** What `Accounting.CreateJournalEntries` answers with, in the shape callers here read. */
export interface CreateJournalEntriesOutcome {
    Success: boolean;
    Results?: Array<{ Success: boolean; JournalEntryID?: string; EntryNumber?: string }>;
    Errors?: Array<{ Code?: string; Message?: string; DraftIndex?: number; LineIndex?: number }>;
}

/**
 * Submit journal-entry drafts to accounting and return its payload.
 *
 * SIDE EFFECT, DELIBERATELY NAMED: this writes journal entries. It joins the CALLER'S transaction
 * rather than opening one, so it commits or rolls back with whatever act produced the drafts.
 *
 * Resolved through MJ's class factory by key, so this package does not hard-depend on the
 * accounting server package at build time — the same indirection `OrderEntityServer` and
 * `PaymentLineEntityServer` each open-code today. Those two are older and phrase their failures in
 * their own domain's words; this exists for callers that have no reason to copy that a fourth time.
 *
 * @param what names the act in the error message, e.g. 'the instalment reclass'
 * @throws when the operation is unregistered, the call fails, or accounting refuses the drafts
 */
export async function SubmitJournalEntryDrafts(
    drafts: unknown[],
    what: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<CreateJournalEntriesOutcome> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<{ Drafts: unknown[] }, CreateJournalEntriesOutcome>
    >(BaseRemotableOperation, 'Accounting.CreateJournalEntries');
    if (!op) {
        throw new Error(
            `The 'Accounting.CreateJournalEntries' operation is not registered. The BizApps Accounting ` +
                `server package must be loaded before orders can book ${what}.`,
        );
    }

    // The envelope reports transport/authorization failure; the payload reports the
    // accounting-domain outcome. Both must be checked — a successful call can still carry a
    // failed booking.
    const result = await op.Execute({ Drafts: drafts }, { provider, user });
    if (!result.Success) {
        throw new Error(
            `Accounting.CreateJournalEntries did not execute for ${what}: ` +
                `${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`,
        );
    }
    const payload = result.Output;
    if (!payload) throw new Error(`Accounting.CreateJournalEntries returned no payload for ${what}.`);
    if (!payload.Success) {
        const detail = (payload.Errors ?? []).map((e) => `${e.Code ?? 'ERROR'}: ${e.Message ?? ''}`).join('; ');
        throw new Error(`Journal entry booking failed for ${what}. ${detail}`);
    }
    return payload;
}

// ─── Finance exception review (golive #279) ─────────────────────────────────────────────────────
//
// Accounting owns the review list, its types and their thresholds; orders only raises into it. Both
// operations are resolved by key through the class factory, like `SubmitJournalEntryDrafts`, so
// this package takes no build-time dependency on accounting's server package. An unregistered
// operation throws: a detector that quietly did nothing would look exactly like a clean month.

/** One exception type as `Accounting.GetFinanceExceptionTypes` reports it. */
export interface FinanceExceptionTypeInfo {
    Code: string;
    IsActive: boolean;
    Configuration: Record<string, unknown>;
}

interface GetFinanceExceptionTypesOutput {
    Success: boolean;
    Types: FinanceExceptionTypeInfo[];
    Errors?: Array<{ Code: string; Message: string }>;
}

/** One exception to raise, in the shape `Accounting.RaiseFinanceExceptions` takes. */
export interface FinanceExceptionToRaise {
    TypeCode: string;
    /** MJ entity name; accounting resolves it to SourceEntityID. */
    SourceEntityName: string;
    SourceRecordID: string;
    CompanyID: string;
    Amount?: number | null;
    /** `YYYY-MM-DD` — the month the exception belongs to. */
    ExceptionDate: string;
    Summary: string;
    DedupeKey: string;
    SourceCreatedByUserID?: string | null;
    /** True when a creator exists but has no linked login. */
    CreatorUnresolved?: boolean;
}

/** What `Accounting.RaiseFinanceExceptions` answers with. */
export interface RaiseFinanceExceptionsOutcome {
    Success: boolean;
    Results: Array<{ Index: number; FinanceExceptionID?: string; Created: boolean; Skipped?: boolean }>;
    Errors?: Array<{ Index?: number; Code: string; Message: string }>;
}

/**
 * `TryCreateInstance`, not `CreateInstance`: for an unregistered key `CreateInstance` hands back a
 * hollow `BaseRemotableOperation` rather than null, so a null check alone would never fire and the
 * call would route with no operation key.
 */
function resolveAccountingOperation<I, O>(key: string, what: string): BaseRemotableOperation<I, O> {
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseRemotableOperation<I, O>>(BaseRemotableOperation, key);
    const op = resolved.Resolved ? resolved.Instance : null;
    if (!op) {
        throw new Error(
            `The '${key}' operation is not registered. The BizApps Accounting server package must be loaded before orders can ${what}.`,
        );
    }
    return op;
}

/**
 * The ACTIVE configuration of one finance exception type, or null when accounting has no such type
 * or has switched it off — in which case the caller skips. No defaults are invented here: the
 * thresholds are finance's to set, and a guessed one would raise a list nobody asked for.
 *
 * @throws when the operation is unregistered or the read fails
 */
export async function GetActiveFinanceExceptionType(
    code: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<FinanceExceptionTypeInfo | null> {
    const key = 'Accounting.GetFinanceExceptionTypes';
    const op = resolveAccountingOperation<{ Codes?: string[] }, GetFinanceExceptionTypesOutput>(key, `read the ${code} exception type`);
    const result = await op.Execute({ Codes: [code] }, { provider, user });
    if (!result.Success) {
        throw new Error(`${key} did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`);
    }
    const payload = result.Output;
    if (!payload) throw new Error(`${key} returned no payload.`);
    if (!payload.Success) {
        throw new Error(`${key} failed. ${(payload.Errors ?? []).map((e) => `${e.Code}: ${e.Message}`).join('; ')}`);
    }
    const type = (payload.Types ?? []).find((t) => t.Code === code);
    if (!type) {
        LogStatus(`Finance exception type ${code} is not defined in accounting; nothing is raised for it.`);
        return null;
    }
    if (!type.IsActive) {
        LogStatus(`Finance exception type ${code} is inactive; nothing is raised for it.`);
        return null;
    }
    return { ...type, Configuration: type.Configuration ?? {} };
}

/**
 * Raise finance exceptions into accounting's review list and return its payload.
 *
 * SIDE EFFECT, DELIBERATELY NAMED: this writes review rows. It joins the CALLER'S transaction when
 * there is one, so a raise made at save time commits or rolls back with the save. Idempotent on
 * (type, dedupe key) on accounting's side: a repeat returns `Created: false`.
 *
 * @param what names the act in the error message
 * @throws when the operation is unregistered, the call fails, or accounting refuses the batch
 */
export async function RaiseFinanceExceptions(
    exceptions: FinanceExceptionToRaise[],
    what: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RaiseFinanceExceptionsOutcome> {
    const key = 'Accounting.RaiseFinanceExceptions';
    const op = resolveAccountingOperation<{ Exceptions: FinanceExceptionToRaise[] }, RaiseFinanceExceptionsOutcome>(key, `raise ${what}`);
    const result = await op.Execute({ Exceptions: exceptions }, { provider, user });
    if (!result.Success) {
        throw new Error(`${key} did not execute for ${what}: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`);
    }
    const payload = result.Output;
    if (!payload) throw new Error(`${key} returned no payload for ${what}.`);
    if (!payload.Success) {
        const detail = (payload.Errors ?? [])
            .map((e) => `${e.Index != null ? `#${e.Index} ` : ''}${e.Code}: ${e.Message}`)
            .join('; ');
        throw new Error(`Raising ${what} failed. ${detail}`);
    }
    return payload;
}
