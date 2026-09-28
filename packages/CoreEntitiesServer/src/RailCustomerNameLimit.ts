/**
 * @fileoverview A customer's name and an invoice's number must fit the external fields the invoice
 * rail writes them to (bc-aidp-next-golive#280).
 *
 * The rail creates the customer once, from the bill-to party's name, and nothing updates it
 * afterwards. A name longer than the rail's field is refused by the rail at send time, which is
 * days after the order was entered. So it is checked twice: when an order whose selling company
 * invoices through a rail is saved, in front of the person entering it; and before the customer
 * is created, for anything saved before this check existed. It is rejected, never truncated — a
 * truncated name no longer matches the customer across systems.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { ExternalFieldLimitEngine } from '@mj-biz-apps/common-entities';
import type { BaseInvoiceRail } from './BaseInvoiceRail.js';
import { FindInvoiceRailForCompany } from './InvoiceRailResolver.js';
import { ORGANIZATION_ENTITY, PERSON_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

export type BillToPartyKind = 'Organization' | 'Person';

/** The message for `name` on `rail`, or null when it fits or the rail declares no targets. */
export async function CheckRailCustomerName(
    rail: BaseInvoiceRail,
    partyKind: BillToPartyKind,
    name: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    await ExternalFieldLimitEngine.Instance.Config(false, user, provider);
    const targets = rail.CustomerNameTargets();
    if (targets.length === 0) return null;
    return ExternalFieldLimitEngine.Instance.Check(`${partyKind} name`, name, targets);
}

/**
 * The message for an invoice's document number on `rail`, or null when it fits or the rail
 * declares no targets. Checked before the send; the numbers Orders mints are far shorter than
 * BILL's field today, so this guards a later change to how they are built.
 */
export async function CheckRailInvoiceNumber(
    rail: BaseInvoiceRail,
    documentNumber: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    await ExternalFieldLimitEngine.Instance.Config(false, user, provider);
    const targets = rail.InvoiceNumberTargets();
    if (targets.length === 0) return null;
    return ExternalFieldLimitEngine.Instance.Check('Invoice number', documentNumber, targets);
}

/** The bill-to party's customer name, as the rail will receive it, or null when it cannot be read. */
export async function LoadBillToName(
    organizationID: string | null,
    personID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Kind: BillToPartyKind; Name: string } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    if (organizationID) {
        const r = await rv.RunView<{ Name: string | null; LegalName: string | null }>(
            { EntityName: ORGANIZATION_ENTITY, ExtraFilter: `ID = '${RequireUUID(organizationID, 'BillToOrganizationID')}'`, Fields: ['Name', 'LegalName'], ResultType: 'simple' },
            user,
        );
        const o = r.Results?.[0];
        return o ? { Kind: 'Organization', Name: OrganizationCustomerName(o) } : null;
    }
    if (!personID) return null;
    const r = await rv.RunView<{ DisplayName: string | null; FirstName: string | null; LastName: string | null }>(
        { EntityName: PERSON_ENTITY, ExtraFilter: `ID = '${RequireUUID(personID, 'BillToPersonID')}'`, Fields: ['DisplayName', 'FirstName', 'LastName'], ResultType: 'simple' },
        user,
    );
    const p = r.Results?.[0];
    return p ? { Kind: 'Person', Name: PersonCustomerName(p) } : null;
}

/** The name a rail customer is created with for an organization. */
export function OrganizationCustomerName(o: { Name?: unknown; LegalName?: unknown }): string {
    return String(o.Name ?? o.LegalName ?? 'Customer');
}

/** The name a rail customer is created with for a person. */
export function PersonCustomerName(p: { DisplayName?: unknown; FirstName?: unknown; LastName?: unknown }): string {
    return String(p.DisplayName ?? [p.FirstName, p.LastName].filter(Boolean).join(' ') ?? 'Customer');
}

/**
 * Messages for an order's bill-to name against the rail of each selling company, one per company
 * whose rail it does not fit. Companies that invoice natively are not checked.
 */
export async function CheckOrderBillToName(
    companyIDs: ReadonlyArray<string>,
    billTo: { Kind: BillToPartyKind; Name: string },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string[]> {
    const messages: string[] = [];
    for (const companyID of companyIDs) {
        const rail = await FindInvoiceRailForCompany(companyID, provider, user);
        if (!rail) continue;
        const message = await CheckRailCustomerName(rail, billTo.Kind, billTo.Name, provider, user);
        if (message) messages.push(message);
    }
    return [...new Set(messages)];
}
