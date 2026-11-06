/**
 * GLAccountResolver.Explain — the walk reported step by step (golive#439).
 *
 * Each level is pinned as the winner in turn, and every case checks that Explain names the account
 * Resolve returns for the same arguments: the two share one walk and must not disagree.
 */
import { describe, expect, it } from 'vitest';
import { GLAccountResolver, GL_ROLE, type GLRole, type LinkedAccountHit } from '../GLAccountResolver.js';

const E = {
    Product: 'ent-product',
    ProductCategory: 'ent-category',
    ProductType: 'ent-type',
    Company: 'ent-company',
};

const asOf = new Date('2026-11-05');
const company = 'co-main';

type Links = Record<string, { GLAccountID: string; CompanyID?: string }>;
const key = (entity: string, record: string, role: string) => `${entity}:${record}:${role}`;

function resolver(links: Links, legalEntityFor?: (companyID: string) => string) {
    const calls: string[] = [];
    const impl = new GLAccountResolver(
        E,
        {} as never,
        {} as never,
        (entityId, recordId, role): LinkedAccountHit | null => {
            calls.push(key(entityId, recordId, role));
            const hit = links[key(entityId, recordId, role)];
            return hit ? { GLAccountID: hit.GLAccountID, CompanyID: hit.CompanyID ?? company } : null;
        },
        legalEntityFor,
    );
    // A two-level category tree: leaf → root.
    const seeded = impl as unknown as { _categoryParent: Map<string, string | null>; _categoriesLoaded: boolean };
    seeded._categoryParent = new Map([
        ['cat-leaf', 'cat-root'],
        ['cat-root', null],
    ]);
    seeded._categoriesLoaded = true;
    return { impl, calls };
}

/** Explain and Resolve over the same links, for a product in cat-leaf of type type-svc. */
async function both(links: Links, role: GLRole = GL_ROLE.Sales) {
    const explained = await resolver(links).impl.Explain(role, 'prod', 'cat-leaf', company, asOf, 'type-svc');
    let resolved: string | null = null;
    try {
        resolved = await resolver(links).impl.Resolve(role, 'prod', 'cat-leaf', company, asOf, 'type-svc');
    } catch {
        resolved = null;
    }
    return { explained, resolved };
}

const winnerLevel = (steps: Array<{ Level: string; Won: boolean }>) => steps.filter((s) => s.Won).map((s) => s.Level);

describe('GLAccountResolver.Explain lists every level in booking order', () => {
    it('tries product, category, parent category, product type, then company', async () => {
        const { explained } = await both({});
        expect(explained.Steps.map((s) => `${s.Level}:${s.RecordID}`)).toEqual([
            'Product:prod',
            'Category:cat-leaf',
            'ParentCategory:cat-root',
            'ProductType:type-svc',
            `Company:${company}`,
        ]);
    });
});

describe('GLAccountResolver.Explain names the winner Resolve books to, per level', () => {
    const cases: Array<{ level: string; links: Links; account: string }> = [
        {
            level: 'Product',
            links: {
                [key(E.Product, 'prod', GL_ROLE.Sales)]: { GLAccountID: 'acct-prod' },
                [key(E.Company, company, GL_ROLE.Sales)]: { GLAccountID: 'acct-co' },
            },
            account: 'acct-prod',
        },
        {
            level: 'Category',
            links: {
                [key(E.ProductCategory, 'cat-leaf', GL_ROLE.Sales)]: { GLAccountID: 'acct-leaf' },
                [key(E.ProductCategory, 'cat-root', GL_ROLE.Sales)]: { GLAccountID: 'acct-root' },
            },
            account: 'acct-leaf',
        },
        {
            level: 'ParentCategory',
            links: {
                [key(E.ProductCategory, 'cat-root', GL_ROLE.Sales)]: { GLAccountID: 'acct-root' },
                [key(E.ProductType, 'type-svc', GL_ROLE.Sales)]: { GLAccountID: 'acct-type' },
            },
            account: 'acct-root',
        },
        {
            level: 'ProductType',
            links: {
                [key(E.ProductType, 'type-svc', GL_ROLE.Sales)]: { GLAccountID: 'acct-type' },
                [key(E.Company, company, GL_ROLE.Sales)]: { GLAccountID: 'acct-co' },
            },
            account: 'acct-type',
        },
        {
            level: 'Company',
            links: { [key(E.Company, company, GL_ROLE.Sales)]: { GLAccountID: 'acct-co' } },
            account: 'acct-co',
        },
    ];

    for (const c of cases) {
        it(`${c.level} wins when it is the most specific link`, async () => {
            const { explained, resolved } = await both(c.links);
            expect(winnerLevel(explained.Steps)).toEqual([c.level]);
            expect(explained.GLAccountID).toBe(c.account);
            expect(explained.Failure).toBeNull();
            expect(resolved).toBe(c.account);
        });
    }

    it('still reports the less specific links the winner overrides', async () => {
        const { explained } = await both({
            [key(E.Product, 'prod', GL_ROLE.Sales)]: { GLAccountID: 'acct-prod' },
            [key(E.Company, company, GL_ROLE.Sales)]: { GLAccountID: 'acct-co' },
        });
        const companyStep = explained.Steps.find((s) => s.Level === 'Company');
        expect(companyStep?.Hit?.GLAccountID).toBe('acct-co');
        expect(companyStep?.Won).toBe(false);
    });
});

describe('GLAccountResolver.Explain reports what booking would refuse', () => {
    it("says 'NotLinked' with Resolve's own message when nothing is linked", async () => {
        const { explained, resolved } = await both({}, GL_ROLE.DeferredRevenue);
        expect(resolved).toBeNull();
        expect(explained.GLAccountID).toBeNull();
        expect(explained.Failure).toBe('NotLinked');
        expect(winnerLevel(explained.Steps)).toEqual([]);

        const err = await resolver({})
            .impl.Resolve(GL_ROLE.DeferredRevenue, 'prod', 'cat-leaf', company, asOf, 'type-svc')
            .catch((e: Error) => e);
        expect(explained.Message).toBe((err as Error).message);
    });

    it("says 'CrossCompany' when the winning link's account is on other books, and names that step", async () => {
        const { explained, resolved } = await both({
            [key(E.ProductCategory, 'cat-leaf', GL_ROLE.Sales)]: { GLAccountID: 'acct-other', CompanyID: 'co-other' },
        });
        expect(resolved).toBeNull();
        expect(explained.Failure).toBe('CrossCompany');
        expect(explained.GLAccountID).toBeNull();
        expect(winnerLevel(explained.Steps)).toEqual(['Category']);
    });
});

describe('GLAccountResolver.Explain for a Division', () => {
    const division = 'co-division';
    const parent = 'co-parent';
    const legalEntityFor = (id: string) => (id === division ? parent : id);

    it('adds the legal entity default after the division’s own, and falls back to it', async () => {
        const links: Links = { [key(E.Company, parent, GL_ROLE.Sales)]: { GLAccountID: 'acct-parent', CompanyID: parent } };
        const explained = await resolver(links, legalEntityFor).impl.Explain(GL_ROLE.Sales, 'prod', 'cat-leaf', division, asOf, 'type-svc');
        const resolved = await resolver(links, legalEntityFor).impl.Resolve(GL_ROLE.Sales, 'prod', 'cat-leaf', division, asOf, 'type-svc');

        expect(explained.Steps.slice(-2).map((s) => `${s.Level}:${s.RecordID}`)).toEqual([
            `Company:${division}`,
            `LegalEntity:${parent}`,
        ]);
        expect(winnerLevel(explained.Steps)).toEqual(['LegalEntity']);
        expect(explained.GLAccountID).toBe(resolved);
    });
});

describe('GLAccountResolver.Resolve after the refactor', () => {
    it('stops at the first link, making no lookups past it', async () => {
        const { impl, calls } = resolver({
            [key(E.ProductCategory, 'cat-leaf', GL_ROLE.Sales)]: { GLAccountID: 'acct-leaf' },
        });
        await impl.Resolve(GL_ROLE.Sales, 'prod', 'cat-leaf', company, asOf, 'type-svc');
        expect(calls).toEqual([key(E.Product, 'prod', GL_ROLE.Sales), key(E.ProductCategory, 'cat-leaf', GL_ROLE.Sales)]);
    });

    it('records nothing for the dimension check when only explaining', async () => {
        const { impl } = resolver({ [key(E.Product, 'prod', GL_ROLE.Sales)]: { GLAccountID: 'acct-prod' } });
        await impl.Explain(GL_ROLE.Sales, 'prod', 'cat-leaf', company, asOf, 'type-svc');
        expect(impl.TakeResolved()).toEqual([]);
    });
});
