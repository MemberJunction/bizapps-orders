/**
 * Entitlement read path — load the rows, then ask `EvaluateGrantAccess`.
 *
 * `Orders.CheckEntitlement` and `Orders.ListEntitlements` share this so they cannot disagree
 * about which grants count, how email resolves, or how a cancelled subscription is read.
 * The judgement itself lives in `EntitlementBehavior` and has no database.
 *
 * v1 is person grants only. Org-only rows (`BeneficiaryPersonID` null) are never loaded.
 * Email is a convenience: normalised, and refused when it matches more than one person —
 * first-match would be an authorization bug dressed as helpfulness.
 *
 * CONNECTS TO:
 *   PURE:   ./EntitlementBehavior.ts
 *   OPS:    ./CheckEntitlementOperation.ts, ./ListEntitlementsOperation.ts
 *   DOC:    plans/entitlement-read-contract.md
 */
import {
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    LogStatus,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    CacheUntilFor,
    EvaluateGrantAccess,
    PickWinningAccess,
    type EntitlementDecision,
    type GrantAccessEvaluation,
} from './EntitlementBehavior.js';
import { EscapeText, InvalidOperationInputError, RequireOptionalUUID, RequireUUID } from './sql-guards.js';

const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';

export interface CheckEntitlementInput {
    /** Authoritative. When present, Email is ignored. */
    PersonID?: string | null;
    /** Convenience. Normalised; ambiguous-if-duplicate → NoGrant, same shape as unknown. */
    Email?: string | null;
    /** Capability key (`ProductEntitlement.Code`), unique per product not globally. */
    Code: string;
    /**
     * Diagnostics only — historical audit. The trust path omits this (evaluates at now).
     * Future values are rejected. CacheUntil is always issued from wall-clock now,
     * never from this date.
     */
    AsOf?: string | Date | null;
    /** Optional company narrowing via the template's product. */
    CompanyID?: string | null;
}

export interface CheckEntitlementOutput {
    HasAccess: boolean;
    Decision: EntitlementDecision;
    ValidFrom?: string;
    ValidTo?: string;
    Quantity?: number;
    GrantID?: string;
    EvaluatedAt: string;
    CacheUntil: string;
}

export interface ListEntitlementsInput {
    PersonID?: string | null;
    Email?: string | null;
    AsOf?: string | Date | null;
    CompanyID?: string | null;
    /** When false, only in-force capabilities. Default true — a library includes lapsed ones. */
    IncludeInactive?: boolean;
}

export interface ListedEntitlement {
    Code: string;
    HasAccess: boolean;
    Decision: EntitlementDecision;
    ValidFrom?: string;
    ValidTo?: string;
    Quantity?: number;
    GrantID?: string;
    CacheUntil: string;
}

export interface ListEntitlementsOutput {
    EvaluatedAt: string;
    Items: ListedEntitlement[];
}

interface TemplateRow {
    ID: string;
    ProductID: string;
    Code: string;
}

interface GrantRow {
    ID: string;
    ProductEntitlementID: string;
    Status: string;
    ValidFrom: Date | string | null;
    ValidTo: Date | string | null;
    Quantity: number | null;
    SubscriptionID: string | null;
    SubscriptionTermID: string | null;
}

interface SubRow {
    ID: string;
    Status: string;
    EndDate: Date | string | null;
}

interface TermRow {
    ID: string;
    Status: string;
    StartDate: Date | string;
    EndDate: Date | string;
}

interface EvaluatedNamedGrant extends GrantAccessEvaluation {
    Code: string;
    GrantID: string;
    Quantity: number | null;
}

function quoteIds(ids: string[], field: string): string {
    return [...new Set(ids.map((id) => `'${RequireUUID(id, field)}'`))].join(',');
}

function toDate(value: unknown): Date | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date | null | undefined): string | undefined {
    return d ? d.toISOString() : undefined;
}

function parseAsOf(value: Date | string | null | undefined, now: Date = new Date()): Date {
    if (value == null || value === '') return now;
    let d: Date;
    if (value instanceof Date) {
        d = value;
    } else {
        const text = String(value);
        if (/['";]/.test(text)) {
            throw new InvalidOperationInputError('AsOf must be an ISO datetime.');
        }
        d = new Date(text);
    }
    if (Number.isNaN(d.getTime())) {
        throw new InvalidOperationInputError('AsOf must be an ISO datetime.');
    }
    // Historical audit ("did they have access on the 3rd?") is the point of AsOf.
    // A future date is the dangerous direction: it would mint a CacheUntil years out
    // if we ever derived the cache clock from it, and it is never a trust-path input.
    if (d.getTime() > now.getTime()) {
        throw new InvalidOperationInputError('AsOf cannot be in the future.');
    }
    return d;
}

function requireCode(value: unknown): string {
    const code = String(value ?? '').trim();
    if (!code) throw new InvalidOperationInputError('Code is required.');
    if (code.length > 80) throw new InvalidOperationInputError('Code is too long.');
    return code;
}

function normalizeEmail(value: unknown): string | null {
    const email = String(value ?? '').trim().toLowerCase();
    if (!email) return null;
    if (email.length > 254) throw new InvalidOperationInputError('Email is too long.');
    return email;
}

function closedCheck(evaluatedAt: Date, issuedAt: Date = new Date()): CheckEntitlementOutput {
    return {
        HasAccess: false,
        Decision: 'NoGrant',
        EvaluatedAt: evaluatedAt.toISOString(),
        CacheUntil: CacheUntilFor(issuedAt, null, false).toISOString(),
    };
}

function toCheckOutput(
    evaluatedAt: Date,
    picked: EvaluatedNamedGrant | null,
    issuedAt: Date = new Date(),
): CheckEntitlementOutput {
    if (!picked) return closedCheck(evaluatedAt, issuedAt);
    return {
        HasAccess: picked.HasAccess,
        Decision: picked.Decision,
        ValidFrom: toISO(picked.ValidFrom),
        ValidTo: toISO(picked.ValidTo),
        Quantity: picked.Quantity ?? undefined,
        GrantID: picked.GrantID,
        EvaluatedAt: evaluatedAt.toISOString(),
        CacheUntil: CacheUntilFor(issuedAt, picked.ValidTo, picked.HasAccess).toISOString(),
    };
}

async function runSimple<T>(
    rv: RunView,
    user: UserInfo,
    entity: string,
    extraFilter: string,
    fields?: string[],
    maxRows?: number,
): Promise<{ ok: boolean; rows: T[] }> {
    const result = await rv.RunView<T>(
        {
            EntityName: entity,
            ExtraFilter: extraFilter,
            ...(fields ? { Fields: fields } : {}),
            ...(maxRows != null ? { MaxRows: maxRows } : {}),
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!result?.Success) {
        LogError(`[ENTITLEMENT-READ] ${entity} lookup failed: ${result?.ErrorMessage ?? 'unknown error'}`);
        return { ok: false, rows: [] };
    }
    return { ok: true, rows: result.Results ?? [] };
}

/**
 * PersonID is authoritative. Email is convenience: 0 or >1 matches → null, indistinguishable
 * from unknown. Never first-match.
 */
async function resolvePersonID(
    rv: RunView,
    user: UserInfo,
    personID: string | null | undefined,
    email: string | null | undefined,
): Promise<string | null> {
    if (personID) return RequireUUID(personID, 'PersonID');
    const normalised = normalizeEmail(email);
    if (!normalised) return null;
    const escaped = EscapeText(normalised);
    const found = await runSimple<{ ID: string }>(
        rv,
        user,
        PERSON_ENTITY,
        `LOWER(Email) = '${escaped}'`,
        ['ID'],
        2,
    );
    if (!found.ok) return null;
    if (found.rows.length !== 1) return null;
    const id = found.rows[0]?.ID;
    if (!id) return null;
    try {
        return RequireUUID(id, 'PersonID');
    } catch {
        return null;
    }
}

async function filterTemplatesByCompany(
    rv: RunView,
    user: UserInfo,
    templates: TemplateRow[],
    companyID: string,
): Promise<TemplateRow[] | null> {
    const productIDs = [...new Set(templates.map((t) => t.ProductID).filter(Boolean))];
    if (!productIDs.length) return [];
    const products = await runSimple<{ ID: string; CompanyID: string }>(
        rv,
        user,
        PRODUCT_ENTITY,
        `ID IN (${quoteIds(productIDs, 'ProductID')}) AND CompanyID = '${companyID}'`,
        ['ID', 'CompanyID'],
    );
    if (!products.ok) return null;
    const allowed = new Set(products.rows.map((p) => p.ID.toLowerCase()));
    return templates.filter((t) => allowed.has(t.ProductID.toLowerCase()));
}

async function loadContext(
    rv: RunView,
    user: UserInfo,
    grants: GrantRow[],
): Promise<{
    ok: boolean;
    subs: Map<string, SubRow>;
    terms: Map<string, TermRow>;
}> {
    const subs = new Map<string, SubRow>();
    const terms = new Map<string, TermRow>();
    const subIDs = [...new Set(grants.map((g) => g.SubscriptionID).filter((id): id is string => !!id))];
    const termIDs = [...new Set(grants.map((g) => g.SubscriptionTermID).filter((id): id is string => !!id))];

    if (subIDs.length) {
        const loaded = await runSimple<SubRow>(
            rv,
            user,
            SUBSCRIPTION_ENTITY,
            `ID IN (${quoteIds(subIDs, 'SubscriptionID')})`,
            ['ID', 'Status', 'EndDate'],
        );
        if (!loaded.ok) return { ok: false, subs, terms };
        for (const row of loaded.rows) subs.set(row.ID.toLowerCase(), row);
    }
    if (termIDs.length) {
        const loaded = await runSimple<TermRow>(
            rv,
            user,
            SUBSCRIPTION_TERM_ENTITY,
            `ID IN (${quoteIds(termIDs, 'SubscriptionTermID')})`,
            ['ID', 'Status', 'StartDate', 'EndDate'],
        );
        if (!loaded.ok) return { ok: false, subs, terms };
        for (const row of loaded.rows) terms.set(row.ID.toLowerCase(), row);
    }
    return { ok: true, subs, terms };
}

function evaluateGrant(
    grant: GrantRow,
    asOf: Date,
    code: string,
    subs: Map<string, SubRow>,
    terms: Map<string, TermRow>,
): EvaluatedNamedGrant {
    const sub = grant.SubscriptionID ? subs.get(grant.SubscriptionID.toLowerCase()) : undefined;
    const term = grant.SubscriptionTermID ? terms.get(grant.SubscriptionTermID.toLowerCase()) : undefined;
    const evaluation = EvaluateGrantAccess(
        {
            Status: grant.Status,
            ValidFrom: toDate(grant.ValidFrom),
            ValidTo: toDate(grant.ValidTo),
            LinkedToSubscription: !!grant.SubscriptionID,
            LinkedToTerm: !!grant.SubscriptionTermID,
        },
        asOf,
        sub
            ? { Status: sub.Status, EndDate: toDate(sub.EndDate) }
            : grant.SubscriptionID
              ? null
              : undefined,
        term
            ? {
                  Status: term.Status,
                  StartDate: toDate(term.StartDate) ?? asOf,
                  EndDate: toDate(term.EndDate) ?? asOf,
              }
            : grant.SubscriptionTermID
              ? null
              : undefined,
    );
    return {
        ...evaluation,
        Code: code,
        GrantID: grant.ID,
        Quantity: grant.Quantity,
    };
}

/**
 * Ask: does this person currently have this capability?
 *
 * Unknown person, ambiguous email, unknown code, and known-person-without-access share one
 * response shape. Lookup faults fail closed the same way. Caller bugs (missing Code, bad
 * UUID) throw `InvalidOperationInputError` so an integrator learns they sent garbage.
 */
export async function CheckPersonEntitlement(
    input: CheckEntitlementInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<CheckEntitlementOutput> {
    const evaluatedAt = parseAsOf(input?.AsOf);
    const code = requireCode(input?.Code);
    RequireOptionalUUID(input?.PersonID ?? undefined, 'PersonID');
    const companyID = RequireOptionalUUID(input?.CompanyID ?? undefined, 'CompanyID') || undefined;

    if (!input?.PersonID && !normalizeEmail(input?.Email)) {
        throw new InvalidOperationInputError('PersonID or Email is required.');
    }

    const closed = (reason: string): CheckEntitlementOutput => {
        LogStatus(`[ENTITLEMENT-CHECK] code=${code} decision=NoGrant hasAccess=false grant=- (${reason})`);
        return closedCheck(evaluatedAt);
    };

    try {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const personID = await resolvePersonID(rv, user, input.PersonID, input.Email);
        if (!personID) return closed('unresolved-person');

        const templates = await runSimple<TemplateRow>(
            rv,
            user,
            PRODUCT_ENTITLEMENT_ENTITY,
            `Code = '${EscapeText(code)}'`,
            ['ID', 'ProductID', 'Code'],
        );
        if (!templates.ok) return closed('template-lookup-failed');
        let matching = templates.rows;
        if (companyID && matching.length) {
            const scoped = await filterTemplatesByCompany(rv, user, matching, companyID);
            if (scoped == null) return closed('company-lookup-failed');
            matching = scoped;
        }
        if (!matching.length) return closed('no-template');

        const grants = await runSimple<GrantRow>(
            rv,
            user,
            ENTITLEMENT_GRANT_ENTITY,
            `BeneficiaryPersonID = '${personID}' AND ProductEntitlementID IN (${quoteIds(
                matching.map((t) => t.ID),
                'ProductEntitlementID',
            )})`,
            [
                'ID',
                'ProductEntitlementID',
                'Status',
                'ValidFrom',
                'ValidTo',
                'Quantity',
                'SubscriptionID',
                'SubscriptionTermID',
            ],
        );
        if (!grants.ok) return closed('grant-lookup-failed');
        if (!grants.rows.length) return closed('no-grant');

        const ctx = await loadContext(rv, user, grants.rows);
        if (!ctx.ok) return closed('context-lookup-failed');

        const codeByTemplate = new Map(matching.map((t) => [t.ID.toLowerCase(), t.Code]));
        const evaluated = grants.rows.map((g) =>
            evaluateGrant(
                g,
                evaluatedAt,
                codeByTemplate.get(g.ProductEntitlementID.toLowerCase()) ?? code,
                ctx.subs,
                ctx.terms,
            ),
        );
        const picked = PickWinningAccess(evaluated);
        const out = toCheckOutput(evaluatedAt, picked);
        LogStatus(
            `[ENTITLEMENT-CHECK] code=${code} decision=${out.Decision} hasAccess=${out.HasAccess} grant=${out.GrantID ?? '-'}`,
        );
        return out;
    } catch (err) {
        if (err instanceof InvalidOperationInputError) throw err;
        LogError(`[ENTITLEMENT-CHECK] failed: ${err instanceof Error ? err.message : String(err)}`);
        return closed('fault');
    }
}

/**
 * The person's library, one row per Code, each evaluated the same way as a point check.
 * Empty when the person cannot be resolved — same non-leak as the check.
 */
export async function ListPersonEntitlements(
    input: ListEntitlementsInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ListEntitlementsOutput> {
    const evaluatedAt = parseAsOf(input?.AsOf);
    RequireOptionalUUID(input?.PersonID ?? undefined, 'PersonID');
    const companyID = RequireOptionalUUID(input?.CompanyID ?? undefined, 'CompanyID') || undefined;
    const includeInactive = input?.IncludeInactive !== false;

    if (!input?.PersonID && !normalizeEmail(input?.Email)) {
        throw new InvalidOperationInputError('PersonID or Email is required.');
    }

    const empty = (): ListEntitlementsOutput => ({
        EvaluatedAt: evaluatedAt.toISOString(),
        Items: [],
    });

    try {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const personID = await resolvePersonID(rv, user, input.PersonID, input.Email);
        if (!personID) {
            LogStatus('[ENTITLEMENT-LIST] person=- items=0 (unresolved-person)');
            return empty();
        }

        const grants = await runSimple<GrantRow>(
            rv,
            user,
            ENTITLEMENT_GRANT_ENTITY,
            `BeneficiaryPersonID = '${personID}'`,
            [
                'ID',
                'ProductEntitlementID',
                'Status',
                'ValidFrom',
                'ValidTo',
                'Quantity',
                'SubscriptionID',
                'SubscriptionTermID',
            ],
        );
        if (!grants.ok) return empty();
        if (!grants.rows.length) {
            LogStatus(`[ENTITLEMENT-LIST] person=${personID} items=0`);
            return empty();
        }

        const templateIDs = [...new Set(grants.rows.map((g) => g.ProductEntitlementID))];
        const templates = await runSimple<TemplateRow>(
            rv,
            user,
            PRODUCT_ENTITLEMENT_ENTITY,
            `ID IN (${quoteIds(templateIDs, 'ProductEntitlementID')})`,
            ['ID', 'ProductID', 'Code'],
        );
        if (!templates.ok) return empty();
        let matching = templates.rows;
        if (companyID && matching.length) {
            const scoped = await filterTemplatesByCompany(rv, user, matching, companyID);
            if (scoped == null) return empty();
            matching = scoped;
        }
        const templateByID = new Map(matching.map((t) => [t.ID.toLowerCase(), t]));
        const inScope = grants.rows.filter((g) => templateByID.has(g.ProductEntitlementID.toLowerCase()));
        if (!inScope.length) {
            LogStatus(`[ENTITLEMENT-LIST] person=${personID} items=0`);
            return empty();
        }

        const ctx = await loadContext(rv, user, inScope);
        if (!ctx.ok) return empty();

        const evaluated = inScope.map((g) => {
            const template = templateByID.get(g.ProductEntitlementID.toLowerCase())!;
            return evaluateGrant(g, evaluatedAt, template.Code, ctx.subs, ctx.terms);
        });

        const byCode = new Map<string, EvaluatedNamedGrant[]>();
        for (const row of evaluated) {
            const list = byCode.get(row.Code) ?? [];
            list.push(row);
            byCode.set(row.Code, list);
        }

        const items: ListedEntitlement[] = [...byCode.entries()]
            .map(([code, group]) => {
                const picked = PickWinningAccess(group)!;
                return {
                    Code: code,
                    HasAccess: picked.HasAccess,
                    Decision: picked.Decision,
                    ValidFrom: toISO(picked.ValidFrom),
                    ValidTo: toISO(picked.ValidTo),
                    Quantity: picked.Quantity ?? undefined,
                    GrantID: picked.GrantID,
                    CacheUntil: CacheUntilFor(new Date(), picked.ValidTo, picked.HasAccess).toISOString(),
                };
            })
            .filter((item) => includeInactive || item.HasAccess)
            .sort((a, b) => a.Code.localeCompare(b.Code));

        LogStatus(`[ENTITLEMENT-LIST] person=${personID} items=${items.length}`);
        return { EvaluatedAt: evaluatedAt.toISOString(), Items: items };
    } catch (err) {
        if (err instanceof InvalidOperationInputError) throw err;
        LogError(`[ENTITLEMENT-LIST] failed: ${err instanceof Error ? err.message : String(err)}`);
        return empty();
    }
}
