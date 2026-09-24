/**
 * @fileoverview The connector-facing seam for Bill.com.
 *
 * Everything that touches `@memberjunction/connector-bill-com` goes through here, for two reasons:
 *
 *   1. The rail can be unit-tested with the wire stubbed — `UseBillComGatewaySeams` swaps the whole
 *      surface, the same way `AccountingERPEngine.UseSeams` does for the ERP verbs. Standing up a
 *      fake Bill.com over HTTP and asserting against our own mock would prove less.
 *   2. There is exactly one place that knows how an `MJ: Company Integrations` row becomes a live
 *      connector instance (`ConnectorFactory.Resolve` on the `MJ: Integrations` row behind it), and
 *      how the connector's generic verbs are spelled. The connector ships no domain methods — create
 *      customer, create invoice and read payments are all the engine's metadata-driven CRUD.
 *
 * CREDENTIALS NEVER PASS THROUGH HERE. The connector reads them itself from the Company Integration's
 * `CredentialID`. The only credential fact this file reads is the `environment` flag, so the rail can
 * refuse a live provider row pointed at a sandbox credential (design §7).
 *
 * PAGINATION IS DRAINED HERE. The engine's `FetchChanges` returns one page and a cursor; the poller
 * wants "everything since the watermark", so the default gateway walks the pages. The hard stop of
 * 200 pages (20,000 rows) is a fuse, not a target — a payments object that large in one pass means
 * the watermark is wrong.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import { ConnectorFactory, type CRUDResult, type ExternalRecord, type FetchBatchResult } from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

export interface BillComGatewaySeams {
    loadCompanyIntegration(companyIntegrationID: string, provider: IMetadataProvider, user: UserInfo): Promise<MJCompanyIntegrationEntity>;
    /**
     * Which BILL gateway this connection actually talks to.
     *
     * `Known` carries `'sandbox'` or `'production'`; `Unknown` carries why it could not be read. It is a
     * discriminated result rather than a nullable string because the caller must REFUSE on Unknown —
     * an environment nobody can read is exactly the case where sandbox money gets recorded as cash.
     */
    loadCredentialEnvironment(ci: MJCompanyIntegrationEntity, provider: IMetadataProvider, user: UserInfo): Promise<RailEnvironment>;
    createRecord(ci: MJCompanyIntegrationEntity, object: string, attrs: Record<string, unknown>, user: UserInfo): Promise<CRUDResult>;
    updateRecord(ci: MJCompanyIntegrationEntity, object: string, externalID: string, attrs: Record<string, unknown>, user: UserInfo): Promise<CRUDResult>;
    getRecord(ci: MJCompanyIntegrationEntity, object: string, externalID: string, user: UserInfo): Promise<ExternalRecord | null>;
    /** Every record changed since the watermark, all pages drained. */
    fetchChanges(ci: MJCompanyIntegrationEntity, object: string, watermark: string | null, user: UserInfo): Promise<FetchBatchResult>;
    /**
     * `POST /invoices/{id}/archive` — BILL's only way to archive an invoice. Verified live 2026-09-21
     * (spike S1): `PUT {archived:true}` is refused with 400 because PUT is a full replace that demands
     * `customer` and `invoiceLineItems`; the archive verb returns 200 with `archived: true`,
     * `recordStatus: INACTIVE`, and is idempotent. Delegates to the connector's own `ArchiveInvoice`
     * since 0.3.2 (Integrations #391); earlier builds have no such verb and this refuses with a
     * sentence rather than failing obscurely.
     */
    archiveInvoice(ci: MJCompanyIntegrationEntity, externalID: string, user: UserInfo): Promise<CRUDResult>;
}

/**
 * The connector's public archive verb, structurally typed so nothing here depends on its class
 * hierarchy — and so a host pinned to a build without it fails with a sentence a person can act on
 * rather than a TypeError.
 */
interface ArchivingConnector {
    ArchiveInvoice?(ctx: { CompanyIntegration: MJCompanyIntegrationEntity; ExternalID: string; ContextUser: UserInfo }): Promise<CRUDResult>;
}

let seams: BillComGatewaySeams | null = null;

/** Swap the wire for tests. Pass null to restore the real connector path. */
export function UseBillComGatewaySeams(s: BillComGatewaySeams | null): void {
    seams = s;
}

export function CurrentBillComGatewaySeams(): BillComGatewaySeams | null {
    return seams;
}

/** `sandbox` or `production`, or the reason it could not be determined. Never a silent default. */
export type RailEnvironment = { Known: true; Environment: 'sandbox' | 'production' } | { Known: false; Reason: string };

/**
 * Read the effective environment out of a credential or Configuration blob.
 *
 * `apiUrl` OUTRANKS `environment`, because it outranks it in the connector: `ResolveBaseURL` uses an
 * explicit apiUrl and only falls back to the environment string. Trusting `environment` alone let
 * `{environment: 'production', apiUrl: '<stage>'}` pass a live provider's check and then talk to
 * sandbox — and the reverse, which is the one that records play money as revenue.
 */
export function environmentFrom(blob: string | null | undefined, whereFrom: string): RailEnvironment {
    if (!blob || !blob.trim()) return { Known: false, Reason: `${whereFrom} is empty` };
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(blob) as Record<string, unknown>;
    } catch {
        // An encrypted value that reached us still encrypted lands here. Refusing is the point.
        return { Known: false, Reason: `${whereFrom} is not readable JSON (an encrypted value that was not decrypted reads this way)` };
    }
    const url = String(parsed.apiUrl ?? parsed.ApiUrl ?? parsed.ApiURL ?? parsed.baseUrl ?? parsed.BaseURL ?? '').trim().toLowerCase();
    if (url) {
        if (url.includes('gateway.prod.') || url.includes('//api.bill.com')) return { Known: true, Environment: 'production' };
        if (url.includes('.stage.') || url.includes('sandbox') || url.includes('-test.')) return { Known: true, Environment: 'sandbox' };
        return { Known: false, Reason: `${whereFrom} sets an apiUrl this app cannot classify as sandbox or production ('${url}')` };
    }
    const env = String(parsed.environment ?? parsed.Environment ?? '').trim().toLowerCase();
    if (env === 'production') return { Known: true, Environment: 'production' };
    if (env === 'sandbox') return { Known: true, Environment: 'sandbox' };
    if (!env) return { Known: false, Reason: `${whereFrom} sets neither environment nor apiUrl` };
    return { Known: false, Reason: `${whereFrom} sets environment '${env}', which is neither sandbox nor production` };
}

const MAX_PAGES = 200;

/**
 * BILL reports validation failures as an ARRAY of `{severity, message}` (seen live: PUT without a
 * customer → `[{message: "customer: must not be null"}, …]`), which the engine's `ExtractErrorMessage`
 * does not read. Joins those; falls back to `message`/`error` on an object; null when there is no text.
 */
export function billComErrorText(body: unknown): string | null {
    if (Array.isArray(body)) {
        const msgs = body.map((e) => (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : null)).filter((m): m is string => !!m);
        return msgs.length ? msgs.join('; ') : null;
    }
    if (body && typeof body === 'object') {
        const b = body as { message?: unknown; error?: unknown };
        if (typeof b.message === 'string') return b.message;
        if (typeof b.error === 'string') return b.error;
    }
    return typeof body === 'string' && body.trim() ? body.trim().slice(0, 300) : null;
}

async function connectorFor(ci: MJCompanyIntegrationEntity, provider: IMetadataProvider, user: UserInfo) {
    // The connector's generic CRUD reads IntegrationObject rows (API paths, body shapes) from the
    // IntegrationEngineBase cache, and nothing on this path loads it — the live sandbox run failed with
    // `IntegrationObject not found: "customers"` against a fully seeded database. Config() is a no-op
    // once loaded, so this costs one metadata read per process.
    await IntegrationEngineBase.Instance.Config(false, user, provider);
    const integration = await provider.GetEntityObject<MJIntegrationEntity>('MJ: Integrations', user);
    if (!(await integration.Load(ci.IntegrationID))) {
        throw new Error(`Integration ${ci.IntegrationID} behind Company Integration ${ci.ID} could not be loaded.`);
    }
    return ConnectorFactory.Resolve(integration);
}

export function DefaultBillComGateway(provider: IMetadataProvider): BillComGatewaySeams {
    return {
        async loadCompanyIntegration(id, p, user) {
            const ci = await p.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            if (!(await ci.Load(id))) throw new Error(`Company Integration ${id} does not exist.`);
            return ci;
        },
        async loadCredentialEnvironment(ci, p, user) {
            // The connector resolves credentials from the credential row OR, when there is none, from
            // CompanyIntegration.Configuration. Both are read here for the same reason: a connection
            // configured the second way is fully functional, and reading only the first left it with no
            // environment check at all.
            if (ci.CredentialID) {
                const cred = await p.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
                if (!(await cred.Load(ci.CredentialID))) {
                    return { Known: false, Reason: `credential ${ci.CredentialID} could not be read` };
                }
                return environmentFrom(cred.Values, 'the credential');
            }
            if (ci.Configuration) return environmentFrom(ci.Configuration, "the Company Integration's Configuration");
            return { Known: false, Reason: 'the Company Integration names neither a credential nor a Configuration' };
        },
        async createRecord(ci, object, attrs, user) {
            const c = await connectorFor(ci, provider, user);
            return c.CreateRecord({ CompanyIntegration: ci, ObjectName: object, ContextUser: user, Attributes: attrs });
        },
        async updateRecord(ci, object, externalID, attrs, user) {
            const c = await connectorFor(ci, provider, user);
            return c.UpdateRecord({ CompanyIntegration: ci, ObjectName: object, ContextUser: user, ExternalID: externalID, Attributes: attrs });
        },
        async getRecord(ci, object, externalID, user) {
            const c = await connectorFor(ci, provider, user);
            return c.GetRecord({ CompanyIntegration: ci, ObjectName: object, ContextUser: user, ExternalID: externalID });
        },
        async archiveInvoice(ci, externalID, user) {
            // The connector's own verb since 0.3.2 (Integrations #391). This used to build the URL
            // from the connector's protected session helpers, which was always a last resort and is
            // now actively wrong: 0.3.2 moved the version out of the base URL and into the paths
            // (Integrations #390), so `${base}/invoices/…/archive` silently loses the `/v3`.
            const c = (await connectorFor(ci, provider, user)) as unknown as ArchivingConnector;
            if (typeof c.ArchiveInvoice !== 'function') {
                return {
                    Success: false,
                    StatusCode: 0,
                    ErrorMessage:
                        'This build of @memberjunction/connector-bill-com has no ArchiveInvoice verb. Upgrade to 0.3.2 or later; ' +
                        'cancelling an invoice is not possible without it.',
                };
            }
            return c.ArchiveInvoice({ CompanyIntegration: ci, ExternalID: externalID, ContextUser: user });
        },
        async fetchChanges(ci, object, watermark, user) {
            const c = await connectorFor(ci, provider, user);
            const all: ExternalRecord[] = [];
            let page = 1;
            let cursor: string | undefined;
            let more = true;
            let last: FetchBatchResult | null = null;
            while (more && page <= MAX_PAGES) {
                last = await c.FetchChanges({
                    CompanyIntegration: ci,
                    ObjectName: object,
                    ContextUser: user,
                    WatermarkValue: watermark,
                    BatchSize: 100,
                    CurrentPage: page,
                    CurrentCursor: cursor,
                });
                all.push(...last.Records);
                more = last.HasMore;
                cursor = last.NextCursor;
                page++;
            }
            if (more) {
                throw new Error(
                    `Bill.com '${object}' fetch exceeded ${MAX_PAGES} pages without draining; the watermark is probably wrong. Refusing rather than reading forever.`,
                );
            }
            return { Records: all, HasMore: false, NewWatermarkValue: last?.NewWatermarkValue };
        },
    };
}

/** The gateway to use: the test seams when set, else the real connector path. */
export function BillComGateway(provider: IMetadataProvider): BillComGatewaySeams {
    return seams ?? DefaultBillComGateway(provider);
}
