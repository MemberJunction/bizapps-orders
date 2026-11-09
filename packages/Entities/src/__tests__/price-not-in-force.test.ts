/**
 * A product whose only price starts after the order date (bc-aidp-next-golive#437).
 *
 * A stated price on such a line has no list price to be measured against, as for a product with no
 * price: `ResolveLinePriceStanding` answers "no engine price" instead of throwing. A line with no
 * stated price is still refused by the pricing pass, naming the price and its date.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const COMPANY = '44444444-4444-4444-8444-444444444444';
const ORDER = '55555555-5555-4555-8555-555555555555';

vi.mock('../pricing/OrdersEngine.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/OrdersEngine.js')>();
    return {
        ...actual,
        LoadOrdersEngine: async () => undefined,
        OrdersEngineReady: async () => false,
        OrdersEngine: {
            Instance: { ProductByID: () => ({ ID: PRODUCT, CompanyID: COMPANY, ProductCategoryID: null, Name: 'SP-SVC' }) },
        },
    };
});
vi.mock('../pricing/applicability.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/applicability.js')>();
    return { ...actual, loadApplicabilityContext: async () => ({}) };
});
vi.mock('../PricingDriverResolver.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../PricingDriverResolver.js')>();
    return { ...actual, ResolvePricingDriver: async () => ({ DriverClass: null, Level: null, Unresolved: null }) };
});

const { DefaultPriceResolver, NoApplicablePriceRuleError, PriceResolutionError } = await import('../pricing/PriceResolver.js');
const { ResolveLinePriceStanding } = await import('../pricing/linePriceContext.js');
const { OrderPricingService } = await import('../pricing/OrderPricingService.js');

type Row = Record<string, unknown>;

function priceRow(over: Row): Row {
    return {
        ID: '66666666-6666-4666-8666-666666666666',
        Name: 'Base',
        Description: null,
        ProductID: PRODUCT,
        ProductCategoryID: null,
        PriceListID: null,
        PricingModel: 'PerUnit',
        FeeType: 'Standard',
        Amount: 0,
        PackageQuantity: null,
        MinQuantity: null,
        MaxQuantity: null,
        EffectiveFrom: '2026-11-05',
        EffectiveTo: null,
        RecurrenceMonths: null,
        RecurrenceDaysOfWeek: null,
        RecurrenceDayOfMonthMin: null,
        RecurrenceDayOfMonthMax: null,
        TimeOfDayStart: null,
        TimeOfDayEnd: null,
        Priority: 0,
        Status: 'Active',
        Applicability: null,
        ...over,
    };
}

function providerOf(prices: Row[]): IMetadataProvider {
    const tables: Record<string, Row[]> = {
        'MJ_BizApps_Orders: Product Prices': prices,
        'MJ_BizApps_Orders: Order Headers': [
            {
                CompanyID: COMPANY,
                OrderDate: '2026-11-03',
                BillToPersonID: null,
                BillToOrganizationID: null,
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

function ctx(quantity = 1) {
    return {
        ProductID: PRODUCT,
        ProductCategoryID: null,
        CompanyID: COMPANY,
        Quantity: quantity,
        AsOf: new Date(2026, 10, 3),
        OrganizationID: null,
        PersonID: null,
        PriceListID: null,
    };
}

const statedLine = { ProductID: PRODUCT, OrderHeaderID: ORDER, Quantity: 1, UnitPrice: 6000, ProductPriceID: null };

describe('NoApplicablePriceRuleError', () => {
    it('is NoneInForce when the only price starts after the order date', async () => {
        const err = await new DefaultPriceResolver().Resolve(ctx(), providerOf([priceRow({})]), user).catch((e) => e);
        expect(err).toBeInstanceOf(NoApplicablePriceRuleError);
        expect(err.Reasons).toEqual(['NotYetEffective']);
        expect(err.NoneInForce).toBe(true);
    });

    it('is NoneInForce when the only price has expired', async () => {
        const prices = [priceRow({ EffectiveFrom: '2026-01-01', EffectiveTo: '2026-10-31' })];
        const err = await new DefaultPriceResolver().Resolve(ctx(), providerOf(prices), user).catch((e) => e);
        expect(err.NoneInForce).toBe(true);
    });

    it('is not NoneInForce when a rule in force fails on quantity', async () => {
        const prices = [priceRow({ EffectiveFrom: '2026-01-01', MinQuantity: 10 })];
        const err = await new DefaultPriceResolver().Resolve(ctx(1), providerOf(prices), user).catch((e) => e);
        expect(err).toBeInstanceOf(NoApplicablePriceRuleError);
        expect(err.Reasons).toEqual(['QuantityBelowMin']);
        expect(err.NoneInForce).toBe(false);
    });

    it('is not NoneInForce when one rule is out of its window and another fails on quantity', async () => {
        const prices = [
            priceRow({}),
            priceRow({ ID: '77777777-7777-4777-8777-777777777777', Name: 'Bulk', EffectiveFrom: '2026-01-01', MinQuantity: 10 }),
        ];
        const err = await new DefaultPriceResolver().Resolve(ctx(1), providerOf(prices), user).catch((e) => e);
        expect(err.NoneInForce).toBe(false);
    });
});

describe('ResolveLinePriceStanding with a price not yet in force', () => {
    it('gives a stated line no engine price instead of throwing', async () => {
        const standing = await ResolveLinePriceStanding(statedLine, providerOf([priceRow({})]), user);
        expect(standing).toEqual({ EngineUnitPrice: null, IsEnginePrice: false, IsNamedListPick: false });
    });

    it('still throws when a price in force does not cover the quantity', async () => {
        const prices = [priceRow({ EffectiveFrom: '2026-01-01', MinQuantity: 10 })];
        await expect(ResolveLinePriceStanding(statedLine, providerOf(prices), user)).rejects.toBeInstanceOf(
            PriceResolutionError,
        );
    });

    it('measures a stated line against a price that is in force', async () => {
        const prices = [priceRow({ EffectiveFrom: '2026-11-01', Amount: 7500 })];
        const standing = await ResolveLinePriceStanding(statedLine, providerOf(prices), user);
        expect(standing?.EngineUnitPrice).toBe(7500);
        expect(standing?.IsEnginePrice).toBe(false);
    });
});

describe('the pricing pass with a price not yet in force', () => {
    type Pass = {
        applyResolvedPrice: (line: unknown) => Promise<void>;
        loadProductForPricing: () => Promise<unknown>;
        assertProductSellable: () => void;
        resolutionContextFor: () => Promise<unknown>;
        resolveRetryingStaleCatalog: (c: unknown) => Promise<unknown>;
        refusesUnpricedLines: () => Promise<boolean>;
    };

    it('still refuses a line with no stated price, naming the date', async () => {
        const provider = providerOf([priceRow({})]);
        const pass = new OrderPricingService({ Provider: provider as never, User: user as never }) as unknown as Pass;
        pass.loadProductForPricing = async () => null;
        pass.assertProductSellable = () => undefined;
        pass.resolutionContextFor = async () => ctx();
        pass.resolveRetryingStaleCatalog = (c) => new DefaultPriceResolver().Resolve(c as never, provider, user);
        pass.refusesUnpricedLines = async () => true;
        const line = { LineNumber: 1, ProductID: PRODUCT, UnitPrice: 0, GetFieldByName: () => ({ Dirty: false }) };

        const err = await pass.applyResolvedPrice(line).catch((e) => e);
        expect(err).toBeInstanceOf(NoApplicablePriceRuleError);
        expect(err.message).toContain('not in force until 2026-11-05');
    });
});
