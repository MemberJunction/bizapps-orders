/**
 * ProductPrice.Applicability — CompositeFilterDescriptor JSON evaluated in memory.
 *
 * The builder (mj-filter-builder `[sources]`, MJ PR #4185) always writes
 * `Source.Field`. This module is the engine side of that contract.
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import {
    evaluateFilter,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
    type FilterEvalContext,
} from './mj-filter-eval.js';

export type { FilterEvalContext };

export interface PriceApplicabilitySource {
    key: string;
    label: string;
    entityName: string;
}

/** Keys the When builder writes and the resolver reads. Keep in lockstep with the mockup. */
export const PRICE_APPLICABILITY_SOURCES: readonly PriceApplicabilitySource[] = [
    { key: 'Order', label: 'Order', entityName: 'MJ_BizApps_Orders: Order Headers' },
    { key: 'Product', label: 'Product', entityName: 'MJ_BizApps_Orders: Products' },
    { key: 'BillToPerson', label: 'Bill-to person', entityName: 'MJ_BizApps_Common: People' },
    { key: 'BillToOrganization', label: 'Bill-to organization', entityName: 'MJ_BizApps_Common: Organizations' },
    { key: 'ShipToPerson', label: 'Ship-to person', entityName: 'MJ_BizApps_Common: People' },
    { key: 'ShipToOrganization', label: 'Ship-to organization', entityName: 'MJ_BizApps_Common: Organizations' },
    { key: 'BillToAddress', label: 'Bill-to address', entityName: 'MJ_BizApps_Common: Addresses' },
    { key: 'ShipToAddress', label: 'Ship-to address', entityName: 'MJ_BizApps_Common: Addresses' },
];

export function parseApplicability(
    json: string | null | undefined,
): CompositeFilterDescriptor | FilterDescriptor | null {
    if (json == null || String(json).trim() === '') return null;
    return JSON.parse(json) as CompositeFilterDescriptor | FilterDescriptor;
}

/** Null / empty Applicability always applies. Invalid JSON throws (catalog is broken). */
export function priceApplies(applicabilityJson: string | null | undefined, context: FilterEvalContext): boolean {
    const filter = parseApplicability(applicabilityJson);
    return evaluateFilter(filter, context);
}

export interface ApplicabilityPartyIDs {
    OrderHeaderID?: string | null;
    ProductID?: string | null;
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
    ShipToPersonID?: string | null;
    ShipToOrganizationID?: string | null;
    BillToAddressID?: string | null;
    ShipToAddressID?: string | null;
    /** Used when the order is not saved yet (preview) so When can still see header fields. */
    OrderFallback?: Record<string, unknown> | null;
}

async function loadRow(
    entityName: string,
    id: string | null | undefined,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Record<string, unknown> | null> {
    if (!id) return null;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<Record<string, unknown>>(
        {
            EntityName: entityName,
            ExtraFilter: `ID = '${id.replace(/'/g, "''")}'`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res?.Results?.[0] ?? null;
}

/**
 * Load the eight-record bag `evaluateFilter` reads. Missing parties are `null`,
 * so a When on ship-to is false unless the operator is empty/null.
 */
export async function loadApplicabilityContext(
    ids: ApplicabilityPartyIDs,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<FilterEvalContext> {
    const order =
        (ids.OrderHeaderID ? await loadRow('MJ_BizApps_Orders: Order Headers', ids.OrderHeaderID, provider, user) : null) ??
        ids.OrderFallback ??
        null;

    const party = (key: string, explicit?: string | null) =>
        explicit ?? (order?.[key] as string | null | undefined) ?? null;

    const [
        Product,
        BillToPerson,
        BillToOrganization,
        ShipToPerson,
        ShipToOrganization,
        BillToAddress,
        ShipToAddress,
    ] = await Promise.all([
        loadRow('MJ_BizApps_Orders: Products', ids.ProductID, provider, user),
        loadRow('MJ_BizApps_Common: People', party('BillToPersonID', ids.BillToPersonID), provider, user),
        loadRow('MJ_BizApps_Common: Organizations', party('BillToOrganizationID', ids.BillToOrganizationID), provider, user),
        loadRow('MJ_BizApps_Common: People', party('ShipToPersonID', ids.ShipToPersonID), provider, user),
        loadRow('MJ_BizApps_Common: Organizations', party('ShipToOrganizationID', ids.ShipToOrganizationID), provider, user),
        loadRow('MJ_BizApps_Common: Addresses', party('BillToAddressID', ids.BillToAddressID), provider, user),
        loadRow('MJ_BizApps_Common: Addresses', party('ShipToAddressID', ids.ShipToAddressID), provider, user),
    ]);

    return {
        Order: order,
        Product,
        BillToPerson,
        BillToOrganization,
        ShipToPerson,
        ShipToOrganization,
        BillToAddress,
        ShipToAddress,
    };
}
