/**
 * @fileoverview The connector-facing seam for HubSpot Payments (#482).
 *
 * Everything the HubSpot payments rail asks of `@memberjunction/connector-hubspot` goes through here,
 * for the same two reasons as `BillComGateway`: the rail is unit-tested with the wire stubbed
 * (`UseHubSpotPaymentsGatewaySeams`), and one place knows how a Company Integration becomes a live
 * connector. The connector reads the portal's credential itself; nothing here sees a secret.
 *
 * THE PROPERTIES ARE NAMED, NOT DEFAULTED. HubSpot returns only the properties a request asks for, and
 * the connector's built-in field list for `commerce_payments` does not name the ones this rail books
 * from (gross, fee, processor, method). So every fetch passes them as `RequestedSourceFields`.
 *
 * ALWAYS A WATERMARK. With no watermark the connector reads through HubSpot's list endpoint, which it
 * treats as "no data" on any non-200 answer: a portal whose app lacks the payments scope would read as
 * a portal with no payments. With a watermark it uses the search endpoint, which raises on a refusal.
 * The rail therefore always passes one, using {@link HUBSPOT_PAYMENTS_FIRST_WATERMARK} on a first poll.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { ExternalRecord, FetchBatchResult } from '@memberjunction/integration-engine';
import { ConnectorForCompanyIntegration } from './BillComGateway.js';

/** The HubSpot object holding payments. */
export const HUBSPOT_PAYMENTS_OBJECT = 'commerce_payments';

/** The watermark a first poll reads from: every payment the portal holds. */
export const HUBSPOT_PAYMENTS_FIRST_WATERMARK = '1970-01-01T00:00:00.000Z';

export interface HubSpotPaymentsGatewaySeams {
    loadCompanyIntegration(companyIntegrationID: string, provider: IMetadataProvider, user: UserInfo): Promise<MJCompanyIntegrationEntity>;
    /** Every record changed since the watermark, all pages drained, with exactly these properties. */
    fetchChanges(ci: MJCompanyIntegrationEntity, object: string, watermark: string, properties: string[], user: UserInfo): Promise<FetchBatchResult>;
}

let seams: HubSpotPaymentsGatewaySeams | null = null;

/** Swap the wire for tests. Pass null to restore the real connector path. */
export function UseHubSpotPaymentsGatewaySeams(s: HubSpotPaymentsGatewaySeams | null): void {
    seams = s;
}

const MAX_PAGES = 200;

export function DefaultHubSpotPaymentsGateway(provider: IMetadataProvider): HubSpotPaymentsGatewaySeams {
    return {
        async loadCompanyIntegration(id, p, user) {
            const ci = await p.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            if (!(await ci.Load(id))) throw new Error(`Company Integration ${id} does not exist.`);
            return ci;
        },
        async fetchChanges(ci, object, watermark, properties, user) {
            const c = await ConnectorForCompanyIntegration(ci, provider, user);
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
                    RequestedSourceFields: properties,
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
                    `HubSpot '${object}' fetch exceeded ${MAX_PAGES} pages without draining; the watermark is probably wrong. Refusing rather than reading forever.`,
                );
            }
            return { Records: all, HasMore: false, NewWatermarkValue: last?.NewWatermarkValue };
        },
    };
}

/** The gateway to use: the test seams when set, else the real connector path. */
export function HubSpotPaymentsGateway(provider: IMetadataProvider): HubSpotPaymentsGatewaySeams {
    return seams ?? DefaultHubSpotPaymentsGateway(provider);
}
