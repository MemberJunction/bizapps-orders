/**
 * `ResolvePrice` and `PricingDriverClass` — the server invokes the plugin metadata names.
 *
 * The browser escalates when `ResolvePricingDriver` finds a driver at any level. These tests pin the
 * other half: the server, given the same metadata, runs THAT driver — at each level, most specific
 * first — then the older `Product:` / `Category:` / `Company:` ID keys, and refuses a name with no
 * registered resolver instead of quietly pricing by the default.
 */
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    BasePriceResolver,
    PriceResolutionError,
    ResolvePrice,
    type PriceResolutionContext,
    type ResolvedPrice,
} from '../pricing/PriceResolver.js';

const PRODUCTS = 'MJ_BizApps_Orders: Products';
const CATEGORIES = 'MJ_BizApps_Orders: Product Categories';
const TYPES = 'MJ_BizApps_Orders: Product Types';
const POLICIES = 'MJ_BizApps_Orders: Order Company Policies';

type Row = Record<string, unknown>;
const user = {} as UserInfo;

/** A fresh UUID per test, so ClassFactory registrations (global) never collide across tests. */
let seq = 0;
function uuid(): string {
    seq += 1;
    return `aaaaaaaa-0000-0000-0000-${seq.toString(16).padStart(12, '0')}`;
}

/** Canned RunView: rows matched by the first UUID in the filter; `fail` names an unreadable entity. */
function providerOf(tables: Record<string, Row[]>, fail?: string): IMetadataProvider {
    return {
        RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === fail) return { Success: false, ErrorMessage: 'connection reset', Results: [] };
            const rows = tables[params.EntityName] ?? [];
            const id = /'([0-9a-fA-F-]{36})'/.exec(params.ExtraFilter ?? '')?.[1]?.toLowerCase();
            return { Success: true, Results: id ? rows.filter((r) => String(r['ID']).toLowerCase() === id) : rows };
        },
    } as unknown as IMetadataProvider;
}

/** Register a resolver under `key` that answers with `amount` (or declines with null). */
function register(key: string, amount: number | null): void {
    class Plugin extends BasePriceResolver {
        public async Resolve(): Promise<ResolvedPrice | null> {
            if (amount === null) return null;
            return { UnitPrice: amount, ExtendedAmount: amount, ProductPriceID: null, PriceListID: null, ResolvedBy: '', Components: [] };
        }
    }
    MJGlobal.Instance.ClassFactory.Register(BasePriceResolver, Plugin, key);
}

interface World {
    ctx: PriceResolutionContext;
    tables: Record<string, Row[]>;
    product: Row;
    category: Row;
    parent: Row;
    type: Row;
    policy: Row;
}

/** Product → category → parent category, a type and a company policy; every driver null. */
function world(): World {
    const [productID, categoryID, parentID, typeID, companyID] = [uuid(), uuid(), uuid(), uuid(), uuid()];
    const product: Row = { ID: productID, ProductTypeID: typeID, ProductCategoryID: categoryID, PricingDriverClass: null };
    const category: Row = { ID: categoryID, ParentProductCategoryID: parentID, PricingDriverClass: null };
    const parent: Row = { ID: parentID, ParentProductCategoryID: null, PricingDriverClass: null };
    const type: Row = { ID: typeID, PricingDriverClass: null };
    const policy: Row = { ID: companyID, PricingDriverClass: null };
    return {
        ctx: {
            ProductID: productID,
            ProductCategoryID: categoryID,
            CompanyID: companyID,
            Quantity: 1,
            AsOf: new Date('2026-07-15T12:00:00'),
            OrganizationID: null,
            PersonID: null,
            PriceListID: null,
        },
        tables: { [PRODUCTS]: [product], [CATEGORIES]: [category, parent], [TYPES]: [type], [POLICIES]: [policy] },
        product,
        category,
        parent,
        type,
        policy,
    };
}

describe('ResolvePrice — PricingDriverClass at each level', () => {
    it.each([
        ['product', (w: World) => w.product],
        ['category', (w: World) => w.category],
        ['ancestor category', (w: World) => w.parent],
        ['type', (w: World) => w.type],
        ['company policy', (w: World) => w.policy],
    ])('runs the driver named on the %s', async (_level, pick) => {
        const w = world();
        const key = `Driver-${uuid()}`;
        register(key, 42);
        pick(w)['PricingDriverClass'] = key;
        const hit = await ResolvePrice(w.ctx, providerOf(w.tables), user);
        expect(hit?.UnitPrice).toBe(42);
        expect(hit?.ResolvedBy).toBe(key);
    });

    it('the most specific level wins: product over category over type over company', async () => {
        const w = world();
        const keys = { product: `P-${uuid()}`, category: `C-${uuid()}`, type: `T-${uuid()}`, company: `Co-${uuid()}` };
        register(keys.product, 1);
        register(keys.category, 2);
        register(keys.type, 3);
        register(keys.company, 4);
        w.product['PricingDriverClass'] = keys.product;
        w.category['PricingDriverClass'] = keys.category;
        w.type['PricingDriverClass'] = keys.type;
        w.policy['PricingDriverClass'] = keys.company;
        expect((await ResolvePrice(w.ctx, providerOf(w.tables), user))?.ResolvedBy).toBe(keys.product);

        w.product['PricingDriverClass'] = null;
        expect((await ResolvePrice(w.ctx, providerOf(w.tables), user))?.ResolvedBy).toBe(keys.category);

        w.category['PricingDriverClass'] = null;
        expect((await ResolvePrice(w.ctx, providerOf(w.tables), user))?.ResolvedBy).toBe(keys.type);

        w.type['PricingDriverClass'] = null;
        expect((await ResolvePrice(w.ctx, providerOf(w.tables), user))?.ResolvedBy).toBe(keys.company);
    });

    it('a named driver runs before the ID-key plugins', async () => {
        const w = world();
        const key = `Driver-${uuid()}`;
        register(key, 7);
        register(`Product:${w.ctx.ProductID}`, 99);
        w.type['PricingDriverClass'] = key;
        expect((await ResolvePrice(w.ctx, providerOf(w.tables), user))?.ResolvedBy).toBe(key);
    });
});

describe('ResolvePrice — fallback to the ID-key convention', () => {
    it('still runs a Company:<id> plugin when no level names a driver', async () => {
        const w = world();
        const key = `Company:${w.ctx.CompanyID}`;
        register(key, 15);
        const hit = await ResolvePrice(w.ctx, providerOf(w.tables), user);
        expect(hit?.UnitPrice).toBe(15);
        expect(hit?.ResolvedBy).toBe(key);
    });

    it('continues to the ID keys when the named driver declines', async () => {
        const w = world();
        const key = `Driver-${uuid()}`;
        register(key, null);
        register(`Category:${w.ctx.ProductCategoryID}`, 21);
        w.product['PricingDriverClass'] = key;
        const hit = await ResolvePrice(w.ctx, providerOf(w.tables), user);
        expect(hit?.ResolvedBy).toBe(`Category:${w.ctx.ProductCategoryID}`);
    });

    it('asks a driver named by its Company:<id> key once, not twice', async () => {
        const w = world();
        const key = `Company:${w.ctx.CompanyID}`;
        let calls = 0;
        class Counting extends BasePriceResolver {
            public async Resolve(): Promise<ResolvedPrice | null> {
                calls += 1;
                return null;
            }
        }
        MJGlobal.Instance.ClassFactory.Register(BasePriceResolver, Counting, key);
        w.policy['PricingDriverClass'] = key;
        await ResolvePrice(w.ctx, providerOf(w.tables), user);
        expect(calls).toBe(1);
    });
});

describe('ResolvePrice — the default', () => {
    it('ends at the no-key default, not at a plugin registered for some other key', async () => {
        const w = world();
        register(`Company:${uuid()}`, 999);
        // No rules in the canned tables, so the default resolver answers null.
        expect(await ResolvePrice(w.ctx, providerOf(w.tables), user)).toBeNull();
    });
});

describe('ResolvePrice — refusals', () => {
    it('refuses a PricingDriverClass with no registered resolver, naming the class and level', async () => {
        const w = world();
        w.type['PricingDriverClass'] = 'NobodyRegisteredThis';
        const err = await ResolvePrice(w.ctx, providerOf(w.tables), user).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PriceResolutionError);
        expect((err as Error).message).toContain(`'NobodyRegisteredThis'`);
        expect((err as Error).message).toContain('type');
    });

    it('refuses rather than pricing by the default when the driver lookup cannot be read', async () => {
        const w = world();
        const err = await ResolvePrice(w.ctx, providerOf(w.tables, POLICIES), user).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PriceResolutionError);
        expect((err as Error).message).toContain('pricing driver');
    });
});
