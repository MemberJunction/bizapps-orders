/**
 * `ResolvePricingDriver` — may a client price this locally, or must it ask the server?
 *
 * WHY THE ANSWER MATTERS MORE THAN IT LOOKS. Pricing is moving to a shared class so the browser can
 * run the metadata walk itself and show a total instantly. What it cannot run is a PLUGIN — a
 * `BasePriceResolver` subclass is server-side code. So before pricing locally the client asks this,
 * and the cost of a wrong answer is asymmetric:
 *
 *   · escalate when it did not need to  →  one round trip nobody notices
 *   · price locally when a plugin applies →  a wrong price on screen, corrected at confirm, which is
 *     the "the number changed when I pressed the button" failure this app spends its guard rails on
 *
 * So every uncertain case must resolve to ESCALATE. The tests that matter here are the ones where
 * data is missing or unreadable — not the happy path.
 */
import { describe, it, expect } from 'vitest';
import { ResolvePricingDriver, CanPriceOrderLocally } from '../PricingDriverResolver';
import type { IRunViewProvider } from '@memberjunction/core';

const PRODUCT = '11111111-1111-1111-1111-111111111111';
const PRODUCT_B = '11111111-1111-1111-1111-11111111000b';
const CATEGORY = '22222222-2222-2222-2222-222222222222';
const PARENT_CATEGORY = '22222222-2222-2222-2222-2222222200aa';
const TYPE = '33333333-3333-3333-3333-333333333333';
const COMPANY = '44444444-4444-4444-4444-444444444444';

type Row = Record<string, unknown>;

/**
 * A provider answering from canned tables, keyed by entity name.
 *
 * `fail` names an entity whose read should report failure — the case the safe-direction rule is
 * really about.
 */
function providerOf(tables: Record<string, Row[]>, fail?: string): IRunViewProvider {
    return {
        RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (fail && params.EntityName === fail) {
                return { Success: false, ErrorMessage: 'connection reset', Results: [] };
            }
            const rows = tables[params.EntityName] ?? [];
            const filter = params.ExtraFilter ?? '';
            const id = /'([0-9a-fA-F-]{36})'/.exec(filter)?.[1]?.toLowerCase();
            const match = id
                ? rows.filter((r) =>
                      String(r['ID'] ?? '').toLowerCase() === id ||
                      String(r['CompanyID'] ?? '').toLowerCase() === id,
                  )
                : rows;
            return { Success: true, Results: match };
        },
    } as unknown as IRunViewProvider;
}

const PRODUCTS = 'MJ_BizApps_Orders: Products';
const CATEGORIES = 'MJ_BizApps_Orders: Product Categories';
const TYPES = 'MJ_BizApps_Orders: Product Types';
const POLICIES = 'MJ_BizApps_Orders: Order Company Policies';

/** Nothing anywhere names a driver — the ordinary case. */
function plainTables(): Record<string, Row[]> {
    return {
        [PRODUCTS]: [{ ID: PRODUCT, ProductTypeID: TYPE, ProductCategoryID: CATEGORY, PricingDriverClass: null }],
        [CATEGORIES]: [
            { ID: CATEGORY, ParentProductCategoryID: PARENT_CATEGORY, PricingDriverClass: null },
            { ID: PARENT_CATEGORY, ParentProductCategoryID: null, PricingDriverClass: null },
        ],
        [TYPES]: [{ ID: TYPE, PricingDriverClass: null }],
        [POLICIES]: [{ CompanyID: COMPANY, PricingDriverClass: null }],
    };
}

describe('ResolvePricingDriver — the local case', () => {
    it('prices locally when every level is null', async () => {
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(plainTables()));
        expect(v.CanPriceLocally).toBe(true);
        expect(v.DriverClass).toBeNull();
    });

    it('prices locally when the product has no category and no type', async () => {
        const tables = plainTables();
        tables[PRODUCTS] = [{ ID: PRODUCT, ProductTypeID: null, ProductCategoryID: null, PricingDriverClass: null }];
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(tables));
        expect(v.CanPriceLocally).toBe(true);
    });
});

describe('ResolvePricingDriver — most specific wins', () => {
    it('takes the PRODUCT driver over everything above it', async () => {
        const tables = plainTables();
        tables[PRODUCTS][0].PricingDriverClass = 'Acme.ProductPricer';
        tables[CATEGORIES][0].PricingDriverClass = 'Acme.CategoryPricer';
        tables[TYPES][0].PricingDriverClass = 'Acme.TypePricer';

        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(tables));
        expect(v.DriverClass).toBe('Acme.ProductPricer');
        expect(v.Level).toBe('product');
        expect(v.CanPriceLocally).toBe(false);
    });

    it('takes the NEAREST category, not the furthest', async () => {
        // A deeper ancestor must not override a closer one — that is what "most specific" means, and
        // reading the chain as a set rather than a walk gets it backwards.
        const tables = plainTables();
        tables[CATEGORIES][0].PricingDriverClass = 'Acme.NearPricer';
        tables[CATEGORIES][1].PricingDriverClass = 'Acme.FarPricer';

        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(tables));
        expect(v.DriverClass).toBe('Acme.NearPricer');
        expect(v.Level).toBe('category');
    });

    it('walks UP to a parent category when the child names nothing', async () => {
        const tables = plainTables();
        tables[CATEGORIES][1].PricingDriverClass = 'Acme.FarPricer';
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(tables));
        expect(v.DriverClass).toBe('Acme.FarPricer');
    });

    it('falls through to the TYPE', async () => {
        const tables = plainTables();
        tables[TYPES][0].PricingDriverClass = 'Acme.UsagePricer';
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(tables));
        expect(v.DriverClass).toBe('Acme.UsagePricer');
        expect(v.Level).toBe('type');
    });

    it('falls through to the COMPANY — where every pre-existing plugin is keyed', async () => {
        const tables = plainTables();
        tables[POLICIES][0].PricingDriverClass = `Company:${COMPANY}`;
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(tables));
        expect(v.DriverClass).toBe(`Company:${COMPANY}`);
        expect(v.Level).toBe('company');
    });
});

describe('ResolvePricingDriver — uncertainty escalates', () => {
    it('does NOT price locally when the product read fails', async () => {
        // The failure mode this guards: a failed read and "no driver configured" both produce an
        // absence, and only one of them is safe to act on.
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(plainTables(), PRODUCTS));
        expect(v.CanPriceLocally).toBe(false);
        expect(v.Unresolved).toMatch(/could not read the product/i);
    });

    it('does NOT price locally when a CATEGORY read fails', async () => {
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(plainTables(), CATEGORIES));
        expect(v.CanPriceLocally).toBe(false);
        expect(v.Unresolved).toBeTruthy();
    });

    it('does NOT price locally when the TYPE read fails', async () => {
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(plainTables(), TYPES));
        expect(v.CanPriceLocally).toBe(false);
    });

    it('does NOT price locally when the POLICY read fails', async () => {
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(plainTables(), POLICIES));
        expect(v.CanPriceLocally).toBe(false);
    });

    it('does NOT price locally for a product that does not exist', async () => {
        const v = await ResolvePricingDriver(PRODUCT_B, COMPANY, providerOf(plainTables()));
        expect(v.CanPriceLocally).toBe(false);
        expect(v.Unresolved).toMatch(/does not exist/i);
    });

    it('does NOT price locally for a malformed product id', async () => {
        const v = await ResolvePricingDriver('not-a-uuid', COMPANY, providerOf(plainTables()));
        expect(v.CanPriceLocally).toBe(false);
    });

    it('survives a category CYCLE instead of looping forever', async () => {
        // Bad data, not an infinite loop. A cycle means the walk stops, and stopping without an
        // answer is an escalation rather than a local verdict.
        const tables = plainTables();
        tables[CATEGORIES] = [
            { ID: CATEGORY, ParentProductCategoryID: PARENT_CATEGORY, PricingDriverClass: null },
            { ID: PARENT_CATEGORY, ParentProductCategoryID: CATEGORY, PricingDriverClass: null },
        ];
        const v = await ResolvePricingDriver(PRODUCT, COMPANY, providerOf(tables));
        expect(v.CanPriceLocally).toBe(true); // walked out cleanly, nothing named a driver
    });
});

describe('CanPriceOrderLocally', () => {
    it('is all-or-nothing across the order', async () => {
        // Pricing is not per-line arithmetic: promotions stack against ORDER totals, charges
        // apportion ACROSS lines, tax computes on the discounted amount. Half locally and half on
        // the server would be two answers to the same question.
        const tables = plainTables();
        tables[PRODUCTS] = [
            { ID: PRODUCT, ProductTypeID: TYPE, ProductCategoryID: null, PricingDriverClass: null },
            { ID: PRODUCT_B, ProductTypeID: TYPE, ProductCategoryID: null, PricingDriverClass: 'Acme.Special' },
        ];
        const v = await CanPriceOrderLocally([PRODUCT, PRODUCT_B], COMPANY, providerOf(tables));
        expect(v.CanPriceLocally).toBe(false);
        expect(v.DriverClass).toBe('Acme.Special');
    });

    it('prices locally when no line needs a plugin', async () => {
        const v = await CanPriceOrderLocally([PRODUCT], COMPANY, providerOf(plainTables()));
        expect(v.CanPriceLocally).toBe(true);
    });

    it('prices locally for an order with no lines at all', async () => {
        const v = await CanPriceOrderLocally([], COMPANY, providerOf(plainTables()));
        expect(v.CanPriceLocally).toBe(true);
    });
});
