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
    /** `'sandbox' | 'production'` from the credential's `environment`; null when unreadable. */
    loadCredentialEnvironment(ci: MJCompanyIntegrationEntity, provider: IMetadataProvider, user: UserInfo): Promise<string | null>;
    createRecord(ci: MJCompanyIntegrationEntity, object: string, attrs: Record<string, unknown>, user: UserInfo): Promise<CRUDResult>;
    updateRecord(ci: MJCompanyIntegrationEntity, object: string, externalID: string, attrs: Record<string, unknown>, user: UserInfo): Promise<CRUDResult>;
    getRecord(ci: MJCompanyIntegrationEntity, object: string, externalID: string, user: UserInfo): Promise<ExternalRecord | null>;
    /** Every record changed since the watermark, all pages drained. */
    fetchChanges(ci: MJCompanyIntegrationEntity, object: string, watermark: string | null, user: UserInfo): Promise<FetchBatchResult>;
    /**
     * `POST /invoices/{id}/archive` — BILL's only way to archive an invoice. Verified live 2026-09-21
     * (spike S1): `PUT {archived:true}` is refused with 400 because PUT is a full replace that demands
     * `customer` and `invoiceLineItems`; the archive verb returns 200 with `archived: true`,
     * `recordStatus: INACTIVE`, and is idempotent. The connector has no verb for it (Integrations ask
     * U1), so the default gateway reaches the endpoint through the connector's own session.
     */
    archiveInvoice(ci: MJCompanyIntegrationEntity, externalID: string, user: UserInfo): Promise<CRUDResult>;
}

/**
 * The protected surface of `BaseRESTIntegrationConnector` that `archiveInvoice` borrows until the
 * connector grows an archive verb: the same session, base URL, headers and 401-retrying request the
 * generic CRUD uses. Structural, so nothing here depends on the connector's class hierarchy.
 */
interface ConnectorSession {
    Authenticate(ci: MJCompanyIntegrationEntity, user: UserInfo): Promise<unknown>;
    GetBaseURL(ci: MJCompanyIntegrationEntity, auth: unknown): string;
    BuildHeaders(auth: unknown): Record<string, string>;
    MakeHTTPRequest(auth: unknown, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<{ Status: number; Body: unknown }>;
}

let seams: BillComGatewaySeams | null = null;

/** Swap the wire for tests. Pass null to restore the real connector path. */
export function UseBillComGatewaySeams(s: BillComGatewaySeams | null): void {
    seams = s;
}

export function CurrentBillComGatewaySeams(): BillComGatewaySeams | null {
    return seams;
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
            if (!ci.CredentialID) return null;
            const cred = await p.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
            if (!(await cred.Load(ci.CredentialID))) return null;
            try {
                const values = JSON.parse(cred.Values ?? '{}') as Record<string, unknown>;
                const env = values.environment ?? values.Environment;
                return env == null ? 'sandbox' : String(env);
            } catch {
                return null;
            }
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
            const c = (await connectorFor(ci, provider, user)) as unknown as ConnectorSession;
            const auth = await c.Authenticate(ci, user);
            const url = `${c.GetBaseURL(ci, auth).replace(/\/+$/, '')}/invoices/${encodeURIComponent(externalID)}/archive`;
            const r = await c.MakeHTTPRequest(auth, url, 'POST', c.BuildHeaders(auth), undefined);
            if (r.Status >= 200 && r.Status < 300) return { Success: true, StatusCode: r.Status, ExternalID: externalID };
            return { Success: false, StatusCode: r.Status, ErrorMessage: billComErrorText(r.Body) ?? `HTTP ${r.Status} on archive` };
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
