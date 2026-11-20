/**
 * Revenue-band pricing: one product, one price row per band, the band chosen from the buyer's
 * revenue — or by the rep when the revenue is unknown.
 */
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';
import {
    DefaultPriceResolver,
    ListApplicablePrices,
    PriceResolutionError,
    RevenueBandRequiredError,
} from '../pricing/PriceResolver.js';
import {
    BaseOrganizationRevenueProvider,
    FormatRevenue,
    IsRevenueBandApplicability,
    LoadOrganizationRevenue,
    ORGANIZATION_REVENUE_SOURCE,
    type OrganizationRevenue,
} from '../pricing/organizationRevenue.js';

const PRODUCT = '11111111-1111-1111-1111-111111111111';
const COMPANY = '44444444-4444-4444-4444-444444444444';
const ORG = '55555555-5555-5555-5555-555555555555';

const PRICES = 'MJ_BizApps_Orders: Product Prices';
const CATEGORIES = 'MJ_BizApps_Orders: Product Categories';
const TIERS = 'MJ_BizApps_Orders: Price Tiers';

type Row = Record<string, unknown>;

function providerOf(tables: Record<string, Row[]>): IMetadataProvider {
    return {
        RunView: async (params: { EntityName: string }) => ({ Success: true, Results: tables[params.EntityName] ?? [] }),
    } as unknown as IMetadataProvider & IRunViewProvider;
}

const user = {} as UserInfo;

/** `[min, max)` on the buyer's revenue; max null is open-ended. */
function bandWhen(min: number, max: number | null): string {
    const field = `${ORGANIZATION_REVENUE_SOURCE}.AnnualRevenue`;
    const filters: Row[] = [{ field, operator: 'gte', value: min }];
    if (max != null) filters.push({ field, operator: 'lt', value: max });
    return JSON.stringify({ logic: 'and', filters });
}

function band(id: string, name: string, amount: number, min: number, max: number | null): Row {
    return {
        ID: id,
        Name: name,
        ProductID: PRODUCT,
        ProductCategoryID: null,
        PriceListID: null,
        PricingModel: 'PerUnit',
        FeeType: 'Standard',
        Amount: amount,
        PackageQuantity: null,
        MinQuantity: null,
        MaxQuantity: null,
        EffectiveFrom: '2020-01-01',
        EffectiveTo: null,
        RecurrenceMonths: null,
        RecurrenceDaysOfWeek: null,
        RecurrenceDayOfMonthMin: null,
        RecurrenceDayOfMonthMax: null,
        TimeOfDayStart: null,
        TimeOfDayEnd: null,
        Priority: 0,
        Status: 'Active',
        Description: null,
        Applicability: bandWhen(min, max),
    };
}

const tables = {
    [CATEGORIES]: [],
    [PRICES]: [
        band('r01', 'Under $1M rev', 11000, 0, 1_000_000),
        band('r02', '$1M–$2M rev', 14000, 1_000_000, 2_000_000),
        band('r03', '$2M–$5M rev', 27000, 2_000_000, 5_000_000),
    ],
    [TIERS]: [],
};

function ctx(revenue: OrganizationRevenue | null) {
    return {
        ProductID: PRODUCT,
        ProductCategoryID: null,
        CompanyID: COMPANY,
        Quantity: 1,
        AsOf: new Date('2026-10-30T12:00:00'),
        OrganizationID: ORG,
        PersonID: null,
        PriceListID: null,
        ApplicabilityContext: { [ORGANIZATION_REVENUE_SOURCE]: revenue ? { ...revenue } : null },
    };
}

const known = (amount: number): OrganizationRevenue => ({ AnnualRevenue: amount, AsOf: null, Source: 'Tax return 2024' });

describe('revenue bands — revenue known', () => {
    it('prices the band the revenue falls in, and says so in the trail', async () => {
        const resolved = await new DefaultPriceResolver().Resolve(ctx(known(3_400_000)), providerOf(tables), user);
        expect(resolved?.ProductPriceID).toBe('r03');
        expect(resolved?.UnitPrice).toBe(27000);
        expect(resolved?.Components[0].Label).toBe('$2M–$5M rev · revenue $3.4M (Tax return 2024)');
    });

    it('treats a band edge as the start of the upper band', async () => {
        const resolved = await new DefaultPriceResolver().Resolve(ctx(known(1_000_000)), providerOf(tables), user);
        expect(resolved?.ProductPriceID).toBe('r02');
    });

    it('names the gap when the revenue falls in no band', async () => {
        const err = await new DefaultPriceResolver()
            .Resolve(ctx(known(9_000_000)), providerOf(tables), user)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PriceResolutionError);
        expect(err).not.toBeInstanceOf(RevenueBandRequiredError);
        expect((err as Error).message).toContain('$9M');
    });

    it('offers only the matching band, marked decided', async () => {
        const listed = await ListApplicablePrices(ctx(known(500_000)), providerOf(tables), user);
        expect(listed.map((p) => [p.ID, p.IsRevenueBand, p.BandUndecided])).toEqual([['r01', true, false]]);
    });
});

describe('revenue bands — revenue unknown', () => {
    it('refuses to guess and names the bands to pick from', async () => {
        const err = await new DefaultPriceResolver().Resolve(ctx(null), providerOf(tables), user).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(RevenueBandRequiredError);
        expect((err as RevenueBandRequiredError).BandNames).toEqual(['Under $1M rev', '$1M–$2M rev', '$2M–$5M rev']);
    });

    it('offers every band, marked undecided', async () => {
        const listed = await ListApplicablePrices(ctx(null), providerOf(tables), user);
        expect(listed.map((p) => p.ID)).toEqual(['r01', 'r02', 'r03']);
        expect(listed.every((p) => p.BandUndecided)).toBe(true);
    });

    it('leaves a product with no bands untouched', async () => {
        const plain = { ...tables, [PRICES]: [{ ...band('base', 'Base', 500, 0, null), Applicability: null }] };
        const resolved = await new DefaultPriceResolver().Resolve(ctx(null), providerOf(plain), user);
        expect(resolved?.UnitPrice).toBe(500);
        const listed = await ListApplicablePrices(ctx(null), providerOf(plain), user);
        expect(listed.map((p) => [p.IsRevenueBand, p.BandUndecided])).toEqual([[false, false]]);
    });
});

describe('IsRevenueBandApplicability', () => {
    it('spots the revenue source anywhere in the filter', () => {
        expect(IsRevenueBandApplicability(bandWhen(0, 1))).toBe(true);
        const nested = JSON.stringify({
            logic: 'or',
            filters: [{ logic: 'and', filters: [{ field: `${ORGANIZATION_REVENUE_SOURCE}.AnnualRevenue`, operator: 'gte', value: 1 }] }],
        });
        expect(IsRevenueBandApplicability(nested)).toBe(true);
    });

    it('is false for other filters, empty and unreadable JSON', () => {
        const member = JSON.stringify({ logic: 'and', filters: [{ field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' }] });
        expect(IsRevenueBandApplicability(member)).toBe(false);
        expect(IsRevenueBandApplicability(null)).toBe(false);
        expect(IsRevenueBandApplicability('{oops')).toBe(false);
    });
});

describe('LoadOrganizationRevenue', () => {
    // ClassFactory is global and keeps registrations; the last one registered at a priority wins,
    // so these tests run in order and each registers the provider it needs.
    function register(cls: new () => BaseOrganizationRevenueProvider): void {
        MJGlobal.Instance.ClassFactory.Register(BaseOrganizationRevenueProvider, cls, 'test', 100);
    }

    it('is null without an organization or a provider', async () => {
        expect(await LoadOrganizationRevenue(null, new Date(), {} as IMetadataProvider, user)).toBeNull();
        expect(await LoadOrganizationRevenue(ORG, new Date(), {} as IMetadataProvider, user)).toBeNull();
    });

    it('returns the registered provider’s figure', async () => {
        class Fixed extends BaseOrganizationRevenueProvider {
            public async GetRevenue(): Promise<OrganizationRevenue | null> {
                return known(2_500_000);
            }
        }
        register(Fixed);
        expect((await LoadOrganizationRevenue(ORG, new Date(), {} as IMetadataProvider, user))?.AnnualRevenue).toBe(2_500_000);
    });

    it('reads a provider that throws as no figure', async () => {
        class Broken extends BaseOrganizationRevenueProvider {
            public async GetRevenue(): Promise<OrganizationRevenue | null> {
                throw new Error('down');
            }
        }
        register(Broken);
        expect(await LoadOrganizationRevenue(ORG, new Date(), {} as IMetadataProvider, user)).toBeNull();
    });
});

describe('FormatRevenue', () => {
    it('abbreviates the way staff read revenue', () => {
        expect(FormatRevenue(3_400_000)).toBe('$3.4M');
        expect(FormatRevenue(850_000)).toBe('$850K');
        expect(FormatRevenue(2_000_000_000)).toBe('$2B');
        expect(FormatRevenue(999)).toBe('$999');
    });
});
