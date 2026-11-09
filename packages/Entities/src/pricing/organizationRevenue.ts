/**
 * Organization revenue for revenue-band pricing.
 *
 * Some offerings are priced by how much revenue the buying organization makes: one product, one
 * price row per band ("$2M–$5M rev"), each row's Applicability testing
 * `BillToOrganizationRevenue.AnnualRevenue`. Orders does not own that figure. The host does — AIDP
 * Next reads it from the organization's latest tax return — so the figure comes from a provider the
 * host registers:
 *
 *     @RegisterClass(BaseOrganizationRevenueProvider, 'TaxReturns')
 *     export class TaxReturnRevenueProvider extends BaseOrganizationRevenueProvider { ... }
 *
 * With no provider registered, or a provider that has no figure for the organization, the revenue
 * is UNKNOWN. A band row cannot be decided then, and the resolver says so instead of guessing: the
 * rep picks the band (see `RevenueBandRequiredError` and `ListApplicablePrices`).
 *
 * Each band row is a separate price row, so the bands of one offering may use any edges; nothing
 * here assumes a shared band list.
 */
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    IsCompositeFilter,
    ParseFilterField,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
} from './mj-filter-eval.js';

/** The applicability source key band rows test, e.g. `BillToOrganizationRevenue.AnnualRevenue`. */
export const ORGANIZATION_REVENUE_SOURCE = 'BillToOrganizationRevenue';

/** One organization's revenue, as the host knows it. */
export interface OrganizationRevenue {
    /** Annual revenue in USD. */
    AnnualRevenue: number;
    /** The day the figure describes (a tax return's period end), when known. */
    AsOf: Date | null;
    /** Where the figure came from, for the price trail: `Tax return 2024`. */
    Source: string;
}

/**
 * Host-supplied revenue lookup. Return null when the organization has no figure; never zero, which
 * would place it in the lowest band.
 */
export abstract class BaseOrganizationRevenueProvider {
    public abstract GetRevenue(
        organizationID: string,
        asOf: Date,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrganizationRevenue | null>;
}

/**
 * The organization's revenue from the highest-priority registered provider, or null when none is
 * registered or it has no figure. A provider that throws is treated as having no figure: the rep
 * picks the band, which is the same outcome as missing data and never a wrong automatic price.
 */
export async function LoadOrganizationRevenue(
    organizationID: string | null | undefined,
    asOf: Date,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<OrganizationRevenue | null> {
    if (!organizationID) return null;
    const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseOrganizationRevenueProvider) ?? [];
    if (!registrations.length) return null;
    const top = Math.max(...registrations.map((r) => r.Priority));
    const reg = registrations.filter((r) => r.Priority === top).pop();
    if (!reg) return null;
    try {
        const revenue = await (new reg.SubClass() as BaseOrganizationRevenueProvider).GetRevenue(
            organizationID,
            asOf,
            provider,
            user,
        );
        if (!revenue || !Number.isFinite(Number(revenue.AnnualRevenue))) return null;
        return { ...revenue, AnnualRevenue: Number(revenue.AnnualRevenue) };
    } catch {
        return null;
    }
}

/** Whether a price row's Applicability tests the organization's revenue, i.e. the row is a revenue band. */
export function IsRevenueBandApplicability(applicabilityJson: string | null | undefined): boolean {
    if (applicabilityJson == null || String(applicabilityJson).trim() === '') return false;
    let filter: CompositeFilterDescriptor | FilterDescriptor;
    try {
        filter = JSON.parse(applicabilityJson) as CompositeFilterDescriptor | FilterDescriptor;
    } catch {
        return false;
    }
    return referencesSource(filter, ORGANIZATION_REVENUE_SOURCE);
}

function referencesSource(filter: CompositeFilterDescriptor | FilterDescriptor | null | undefined, source: string): boolean {
    if (!filter) return false;
    if (IsCompositeFilter(filter)) return (filter.filters ?? []).some((f) => referencesSource(f, source));
    return ParseFilterField(filter.field).source === source;
}

/** `$3.4M`, `$850K`: revenue as staff read it in a price trail. */
export function FormatRevenue(amount: number): string {
    const abs = Math.abs(amount);
    if (abs >= 1e9) return `$${trim(amount / 1e9)}B`;
    if (abs >= 1e6) return `$${trim(amount / 1e6)}M`;
    if (abs >= 1e3) return `$${trim(amount / 1e3)}K`;
    return `$${Math.round(amount)}`;
}

function trim(n: number): string {
    return n.toFixed(1).replace(/\.0$/, '');
}
