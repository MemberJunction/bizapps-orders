/**
 * DefaultPriceResolver: category inheritance + Applicability, against a canned RunView.
 */
import { describe, it, expect } from 'vitest';
import { DefaultPriceResolver, PriceResolutionError } from '../pricing/PriceResolver.js';
import type { IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';

const PRODUCT = '11111111-1111-1111-1111-111111111111';
const NEAR = '22222222-2222-2222-2222-222222222222';
const FAR = '33333333-3333-3333-3333-333333333333';
const COMPANY = '44444444-4444-4444-4444-444444444444';

const PRICES = 'MJ_BizApps_Orders: Product Prices';
const CATEGORIES = 'MJ_BizApps_Orders: Product Categories';
const TIERS = 'MJ_BizApps_Orders: Price Tiers';

type Row = Record<string, unknown>;

function providerOf(tables: Record<string, Row[]>): IMetadataProvider {
    return {
        RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
            const rows = tables[params.EntityName] ?? [];
            return { Success: true, Results: rows };
        },
    } as unknown as IMetadataProvider & IRunViewProvider;
}

const user = {} as UserInfo;

function priceRow(over: Row): Row {
    return {
        PriceListID: null,
        PricingModel: 'PerUnit',
        FeeType: 'Standard',
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
        Applicability: null,
        ProductID: null,
        ProductCategoryID: null,
        ...over,
    };
}

function ctx(over: Record<string, unknown> = {}) {
    return {
        ProductID: PRODUCT,
        ProductCategoryID: NEAR,
        CompanyID: COMPANY,
        Quantity: 1,
        AsOf: new Date('2026-07-15T12:00:00'),
        OrganizationID: null,
        PersonID: null,
        PriceListID: null,
        ...over,
    };
}

describe('DefaultPriceResolver — named inherit + When', () => {
    it('inherits a category Member price when the product has none', async () => {
        const tables = {
            [CATEGORIES]: [
                { ID: NEAR, ParentProductCategoryID: FAR },
                { ID: FAR, ParentProductCategoryID: null },
            ],
            [PRICES]: [
                priceRow({ ID: 'cat-member', Name: 'Member', ProductCategoryID: NEAR, Amount: 275 }),
            ],
            [TIERS]: [],
        };
        const resolved = await new DefaultPriceResolver().Resolve(ctx(), providerOf(tables), user);
        expect(resolved?.UnitPrice).toBe(275);
        expect(resolved?.PriceName).toBe('Member');
        expect(resolved?.InheritedFrom).toBe('category');
        expect(resolved?.InheritedFromCategoryID?.toLowerCase()).toBe(NEAR);
    });

    it('lets a product Member override the category Member, and still inherit Non-member', async () => {
        const tables = {
            [CATEGORIES]: [{ ID: NEAR, ParentProductCategoryID: null }],
            [PRICES]: [
                priceRow({ ID: 'cat-member', Name: 'Member', ProductCategoryID: NEAR, Amount: 200 }),
                priceRow({ ID: 'cat-non', Name: 'Non-member', ProductCategoryID: NEAR, Amount: 300 }),
                priceRow({ ID: 'prod-member', Name: 'Member', ProductID: PRODUCT, Amount: 175 }),
            ],
            [TIERS]: [],
        };
        const applicable = await new DefaultPriceResolver().CollectApplicable(ctx(), providerOf(tables), user);
        expect(applicable.map((r) => r.ID).sort()).toEqual(['cat-non', 'prod-member']);
        // Two always-applicable names at priority 0 — refuse rather than pick by row order.
        await expect(new DefaultPriceResolver().Resolve(ctx(), providerOf(tables), user)).rejects.toBeInstanceOf(
            PriceResolutionError,
        );
    });

    it('picks the When-matching name and ignores the other', async () => {
        const memberWhen = JSON.stringify({
            logic: 'and',
            filters: [{ field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' }],
        });
        const nonWhen = JSON.stringify({
            logic: 'and',
            filters: [{ field: 'BillToOrganization.Type', operator: 'neq', value: 'Member' }],
        });
        const tables = {
            [CATEGORIES]: [{ ID: NEAR, ParentProductCategoryID: null }],
            [PRICES]: [
                priceRow({
                    ID: 'prod-member',
                    Name: 'Member',
                    ProductID: PRODUCT,
                    Amount: 175,
                    Applicability: memberWhen,
                    Priority: 10,
                }),
                priceRow({
                    ID: 'prod-non',
                    Name: 'Non-member',
                    ProductID: PRODUCT,
                    Amount: 275,
                    Applicability: nonWhen,
                    Priority: 0,
                }),
            ],
            [TIERS]: [],
        };
        const member = await new DefaultPriceResolver().Resolve(
            ctx({ ApplicabilityContext: { BillToOrganization: { Type: 'Member' } } }),
            providerOf(tables),
            user,
        );
        expect(member?.UnitPrice).toBe(175);
        expect(member?.PriceName).toBe('Member');

        const guest = await new DefaultPriceResolver().Resolve(
            ctx({ ApplicabilityContext: { BillToOrganization: { Type: 'Prospect' } } }),
            providerOf(tables),
            user,
        );
        expect(guest?.UnitPrice).toBe(275);
        expect(guest?.PriceName).toBe('Non-member');
    });
});
