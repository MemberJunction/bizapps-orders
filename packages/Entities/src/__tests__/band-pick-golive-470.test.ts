/**
 * golive #470: revenue-band lines when the buyer has no revenue on record.
 *
 * A. The order screen prices every line in one pass. A second band-priced line with no band picked
 *    yet made that pass refuse the whole order, so the first line, band already picked, showed no
 *    price until the second line was removed. The screen's passes now leave the unpicked line
 *    unpriced with the reason and price the rest; the save walk still refuses.
 * B. Confirm measured each stated line against the engine price, and the engine refuses a band
 *    product whose buyer has no revenue. A band the rep picked is the rules' price, so the line now
 *    reads as on its engine price.
 * Also: the bands are offered from the lowest lower edge up.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const COMPANY = '44444444-4444-4444-8444-444444444444';
const ORDER = '55555555-5555-4555-8555-555555555555';
const ORG = '66666666-6666-4666-8666-666666666666';

vi.mock('../pricing/OrdersEngine.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/OrdersEngine.js')>();
    return {
        ...actual,
        LoadOrdersEngine: async () => undefined,
        OrdersEngineReady: async () => false,
        OrdersEngine: {
            Instance: { ProductByID: () => ({ ID: PRODUCT, CompanyID: COMPANY, ProductCategoryID: null, Name: 'IZ-IMP' }) },
        },
    };
});
vi.mock('../pricing/applicability.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/applicability.js')>();
    // The bill-to organization has no revenue on record.
    return { ...actual, loadApplicabilityContext: async () => ({ BillToOrganizationRevenue: null }) };
});
vi.mock('../PricingDriverResolver.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../PricingDriverResolver.js')>();
    return { ...actual, ResolvePricingDriver: async () => ({ DriverClass: null, Level: null, Unresolved: null }) };
});

const { DefaultPriceResolver, ListApplicablePrices, RevenueBandRequiredError, SortApplicablePrices } = await import(
    '../pricing/PriceResolver.js'
);
const { ResolveLinePriceStanding, PickedUndecidedBand } = await import('../pricing/linePriceContext.js');
const { OrderPricingService } = await import('../pricing/OrderPricingService.js');
const { ORGANIZATION_REVENUE_SOURCE } = await import('../pricing/organizationRevenue.js');

type Row = Record<string, unknown>;

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
        Description: null,
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
        Applicability: bandWhen(min, max),
    };
}

// In the order the issue saw them in the dropdown.
const B60 = 'a0000000-0000-4000-8000-000000000060';
const B200 = 'a0000000-0000-4000-8000-000000000200';
const B5 = 'a0000000-0000-4000-8000-000000000005';
const B2 = 'a0000000-0000-4000-8000-000000000002';
const BANDS = [
    band(B60, '$60M-$100M', 31200, 60_000_000, 100_000_000),
    band(B200, '$200M+', 52500, 200_000_000, null),
    band(B5, '$5M-$10M', 9000, 5_000_000, 10_000_000),
    band(B2, '$2M-$5M', 7000, 2_000_000, 5_000_000),
];

function providerOf(prices: Row[]): IMetadataProvider {
    const tables: Record<string, Row[]> = {
        'MJ_BizApps_Orders: Product Prices': prices,
        'MJ_BizApps_Orders: Order Headers': [
            {
                CompanyID: COMPANY,
                OrderDate: '2026-11-03',
                BillToPersonID: null,
                BillToOrganizationID: ORG,
                ShipToPersonID: null,
                ShipToOrganizationID: null,
                BillToAddressID: null,
                ShipToAddressID: null,
            },
        ],
    };
    return {
        RunView: async (params: { EntityName: string }) => ({ Success: true, Results: tables[params.EntityName] ?? [] }),
    } as unknown as IMetadataProvider & IRunViewProvider;
}

const user = {} as UserInfo;

function ctx() {
    return {
        ProductID: PRODUCT,
        ProductCategoryID: null,
        CompanyID: COMPANY,
        Quantity: 1,
        AsOf: new Date(2026, 10, 3),
        OrganizationID: ORG,
        PersonID: null,
        PriceListID: null,
        ApplicabilityContext: { [ORGANIZATION_REVENUE_SOURCE]: null },
    };
}

describe('B. Confirm accepts a band picked on the line (golive #470)', () => {
    const picked = { ProductID: PRODUCT, OrderHeaderID: ORDER, Quantity: 1, UnitPrice: 52500, ProductPriceID: B200 };

    it('reads the picked band as the engine price instead of refusing', async () => {
        const standing = await ResolveLinePriceStanding(picked, providerOf(BANDS), user);
        expect(standing).toEqual({ EngineUnitPrice: 52500, IsEnginePrice: true, IsNamedListPick: false });
    });

    it('still refuses a band product line on a typed amount', async () => {
        const typed = { ...picked, UnitPrice: 40000, ProductPriceID: null };
        await expect(ResolveLinePriceStanding(typed, providerOf(BANDS), user)).rejects.toBeInstanceOf(RevenueBandRequiredError);
    });

    it('still refuses a band id carried at a price other than the band', async () => {
        const off = { ...picked, UnitPrice: 40000 };
        await expect(ResolveLinePriceStanding(off, providerOf(BANDS), user)).rejects.toBeInstanceOf(RevenueBandRequiredError);
    });

    it('PickedUndecidedBand matches only an undecided band at its own price', () => {
        const applicable = [
            { ID: B200, UnitPrice: 52500, BandUndecided: true },
            { ID: 'named', UnitPrice: 9000 },
        ];
        expect(PickedUndecidedBand({ UnitPrice: 52500, ProductPriceID: B200.toUpperCase() }, applicable)?.ID).toBe(B200);
        expect(PickedUndecidedBand({ UnitPrice: 9000, ProductPriceID: 'named' }, applicable)).toBeNull();
        expect(PickedUndecidedBand({ UnitPrice: 1, ProductPriceID: B200 }, applicable)).toBeNull();
    });
});

describe('the band dropdown is sorted by lower edge (golive #470)', () => {
    it('lists bands from the lowest lower edge up', async () => {
        const listed = await ListApplicablePrices(ctx(), providerOf(BANDS), user);
        expect(listed.map((p) => p.Name)).toEqual(['$2M-$5M', '$5M-$10M', '$60M-$100M', '$200M+']);
        expect(listed.every((p) => p.BandUndecided)).toBe(true);
    });

    it('keeps other named prices first, in catalog order, and an open bottom edge first among bands', () => {
        const sorted = SortApplicablePrices([
            { ID: 'b', IsRevenueBand: true, RevenueBandMin: 5 },
            { ID: 'n1', IsRevenueBand: false, RevenueBandMin: null },
            { ID: 'b0', IsRevenueBand: true, RevenueBandMin: null },
            { ID: 'n2' },
        ]);
        expect(sorted.map((p) => (p as { ID: string }).ID)).toEqual(['n1', 'n2', 'b0', 'b']);
    });
});

describe('A. One unpicked band line does not unprice the order (golive #470)', () => {
    type Pass = {
        ctx: Record<string, unknown>;
        out: { LineErrors: Map<unknown, string>; EngineDefaults: Map<unknown, unknown>; PriceComponents: Map<unknown, unknown> };
        applyResolvedPrice: (line: unknown) => Promise<void>;
        loadProductForPricing: () => Promise<unknown>;
        resolutionContextFor: () => Promise<unknown>;
        resolveRetryingStaleCatalog: (c: unknown) => Promise<unknown>;
        refusesUnpricedLines: () => Promise<boolean>;
    };

    function pass(flags: Record<string, unknown>): Pass {
        const provider = providerOf(BANDS);
        const p = new OrderPricingService({ Provider: provider as never, User: user as never }) as unknown as Pass;
        p.ctx = { IgnoreSellability: true, IncludeDefaultsForStatedLines: true, ...flags };
        p.out = { LineErrors: new Map(), EngineDefaults: new Map(), PriceComponents: new Map() };
        p.loadProductForPricing = async () => null;
        p.resolutionContextFor = async () => ctx();
        p.resolveRetryingStaleCatalog = (c) => new DefaultPriceResolver().Resolve(c as never, provider, user);
        p.refusesUnpricedLines = async () => true;
        return p;
    }

    const line = (unitPrice: number, dirty: boolean, productPriceID: string | null) => ({
        LineNumber: 1,
        ProductID: PRODUCT,
        UnitPrice: unitPrice,
        ProductPriceID: productPriceID,
        GetFieldByName: () => ({ Dirty: dirty }),
    });

    it('reproduces the refusal: without the flag the unpicked line fails the whole walk', async () => {
        const p = pass({});
        await p.applyResolvedPrice(line(31200, true, B60));
        const err = await p.applyResolvedPrice(line(0, false, null)).catch((e) => e);
        expect(err).toBeInstanceOf(RevenueBandRequiredError);
    });

    it('with the flag, the picked line keeps its band and the unpicked line is left unpriced with the reason', async () => {
        const p = pass({ LeaveUndecidedBandsUnpriced: true });
        const first = line(31200, true, B60);
        const second = line(0, false, null);
        await p.applyResolvedPrice(first);
        await p.applyResolvedPrice(second);
        expect(first.UnitPrice).toBe(31200);
        expect(first.ProductPriceID).toBe(B60);
        expect(second.UnitPrice).toBe(0);
        expect(p.out.LineErrors.has(first)).toBe(false);
        expect(p.out.LineErrors.get(second)).toMatch(/Pick the band on the line/);
        expect(p.out.EngineDefaults.get(second)).toBeNull();
    });
});
