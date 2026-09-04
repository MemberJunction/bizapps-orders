import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * bc-aidp-next-golive#196 — the Catalog's Product types and Categories panels reported `0` and rendered
 * their empty state over a database holding 11 active types and 2 active categories.
 *
 * IT WAS NEVER A QUERY DEFECT, which is the part worth pinning. `GetProductTypes` and
 * `GetProductCategories` already existed, already filtered `IsActive = 1`, and were already exported —
 * and nothing called either one. `Types` and `Categories` were declared as empty arrays and never
 * assigned, so the template rendered `{{ Types.length }}` over a field that could only ever be zero. The
 * grid above them looked correct because it is an entity viewer that loads its own data, which is what
 * made the screen read as missing data rather than missing wiring.
 *
 * So the assertion that matters is not "the panels show the right count" — a count is downstream of the
 * call. It is that `ngOnInit` CALLS the two queries and assigns what they return. A test that only
 * checked the rendered number would pass again the day someone deletes the assignment and hard-codes a
 * literal.
 *
 * The queries and `Metadata` are mocked at the module boundary: this page's `ngOnInit` reaches MJ core
 * for entity metadata, which needs a configured provider that a unit test has no business standing up.
 * The page itself is instantiated through `Object.create` because it injects `ChangeDetectorRef` in a
 * field initializer, which throws outside an injection context.
 */

const H = vi.hoisted(() => ({
    getTypes: vi.fn(async () => [
        { ID: 't1', Name: 'Subscription' },
        { ID: 't2', Name: 'Physical Good' },
    ]),
    getCategories: vi.fn(async () => [{ ID: 'c1', Name: 'Education' }]),
    order: [] as string[],
}));

vi.mock('../../../data/orders-queries', () => ({
    GetProductTypes: async () => {
        H.order.push('types');
        return H.getTypes();
    },
    GetProductCategories: async () => {
        H.order.push('categories');
        return H.getCategories();
    },
    GetProducts: async () => [],
    GetChargeTypes: async () => [],
    GetTaxExemptions: async () => [],
    GetTaxJurisdictions: async () => [],
    GetTaxNexus: async () => [],
    GetTaxRates: async () => [],
}));

vi.mock('@memberjunction/core', async (importActual) => {
    const actual = await importActual<Record<string, unknown>>();
    return {
        ...actual,
        // Only Metadata is replaced: the page reaches core for entity metadata, which needs a
        // configured provider a unit test has no business standing up. Everything else stays real so
        // the import chain resolves.
        Metadata: class {
            public Entities = [{ Name: 'MJ_BizApps_Orders: Products', ID: 'e1' }];
        },
    };
});

const { MJOProductsPageComponent } = await import('../products.page');

/** The real page, with the one injected field it uses supplied directly. */
function page() {
    const p = Object.create(MJOProductsPageComponent.prototype) as {
        ngOnInit(): Promise<void>;
        Types: Array<Record<string, unknown>>;
        Categories: Array<Record<string, unknown>>;
        ProductEntityInfo: unknown;
        cdr: { detectChanges(): void };
    };
    p.Types = [];
    p.Categories = [];
    Object.defineProperty(p, 'cdr', { value: { detectChanges: () => undefined }, configurable: true });
    return p;
}

beforeEach(() => {
    vi.clearAllMocks();
    H.order.length = 0;
});

describe('#196 — the panels are wired to their queries', () => {
    it('asks for product types on init', async () => {
        await page().ngOnInit();
        expect(H.order).toContain('types');
    });

    it('asks for categories on init', async () => {
        await page().ngOnInit();
        expect(H.order).toContain('categories');
    });

    it('assigns what the type query returned, rather than leaving the array empty', async () => {
        const p = page();
        await p.ngOnInit();
        expect(p.Types).toHaveLength(2);
        expect(p.Types.map((t) => t['Name'])).toEqual(['Subscription', 'Physical Good']);
    });

    it('assigns what the category query returned', async () => {
        const p = page();
        await p.ngOnInit();
        expect(p.Categories).toHaveLength(1);
        expect(p.Categories[0]['Name']).toBe('Education');
    });

    /**
     * The defect rendered `0` over a populated database. An empty result must still be possible — a
     * genuinely empty catalog is not a bug — so this pins that the panels report what the query says
     * rather than a hard-coded anything.
     */
    it('reports empty when the queries genuinely return nothing', async () => {
        H.getTypes.mockResolvedValueOnce([] as never);
        H.getCategories.mockResolvedValueOnce([] as never);
        const p = page();
        await p.ngOnInit();
        expect(p.Types).toEqual([]);
        expect(p.Categories).toEqual([]);
    });

    /**
     * Two independent reads with no ordering between them. Awaiting them in sequence would double the
     * screen's latency for no reason, and this is the assertion that keeps the `Promise.all` honest.
     */
    it('issues both reads without waiting for the first to finish', async () => {
        let resolveTypes: (v: unknown) => void = () => undefined;
        H.getTypes.mockImplementationOnce(
            () => new Promise((r) => { resolveTypes = r as (v: unknown) => void; }) as never,
        );
        const p = page();
        const done = p.ngOnInit();
        await Promise.resolve();
        expect(H.order).toContain('categories');
        resolveTypes([]);
        await done;
    });

    it('still resolves the entity info the grid needs', async () => {
        const p = page();
        await p.ngOnInit();
        expect(p.ProductEntityInfo).toBeTruthy();
    });
});
