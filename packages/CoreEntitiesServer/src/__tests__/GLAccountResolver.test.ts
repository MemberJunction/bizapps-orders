/**
 * GLAccountResolver walk: product → category → ancestors → product type → company.
 */
import { describe, expect, it } from 'vitest';
import {
    GLAccountResolutionError,
    GLAccountResolver,
    GL_ROLE,
    IsRoleNotLinked,
    UnbilledReceivableNotLinkedError,
} from '../GLAccountResolver.js';

const E = {
    Product: 'ent-product',
    ProductCategory: 'ent-category',
    ProductType: 'ent-type',
    Company: 'ent-company',
};

const asOf = new Date('2026-08-13');
const company = 'co-bcp';

type Key = `${string}:${string}:${string}`;
function key(entity: string, record: string, role: string): Key {
    return `${entity}:${record}:${role}`;
}

function resolver(links: Record<string, string>) {
    const calls: string[] = [];
    const impl = new GLAccountResolver(E, {} as never, {} as never, (entityId, recordId, role) => {
        calls.push(`${entityId}:${recordId}:${role}`);
        const account = links[key(entityId, recordId, role)];
        return account ? { GLAccountID: account, CompanyID: company } : null;
    });
    // Seed a two-level category tree: leaf → parent.
    (impl as unknown as { _categoryParent: Map<string, string | null>; _categoriesLoaded: boolean })._categoryParent =
        new Map([
            ['cat-leaf', 'cat-root'],
            ['cat-root', null],
        ]);
    (impl as unknown as { _categoriesLoaded: boolean })._categoriesLoaded = true;
    return { impl, calls };
}

describe('GLAccountResolver walk', () => {
    it('uses the product link when one exists', async () => {
        const { impl, calls } = resolver({
            [key(E.Product, 'prod', GL_ROLE.AccountsReceivable)]: 'acct-prod',
            [key(E.Company, company, GL_ROLE.AccountsReceivable)]: 'acct-co',
        });
        await expect(
            impl.Resolve(GL_ROLE.AccountsReceivable, 'prod', 'cat-leaf', company, asOf, 'type-book'),
        ).resolves.toBe('acct-prod');
        expect(calls[0]).toContain(E.Product);
    });

    it('climbs the category tree before the product type', async () => {
        const { impl } = resolver({
            [key(E.ProductCategory, 'cat-root', GL_ROLE.Sales)]: 'acct-root',
            [key(E.ProductType, 'type-book', GL_ROLE.Sales)]: 'acct-type',
            [key(E.Company, company, GL_ROLE.Sales)]: 'acct-co',
        });
        await expect(impl.Resolve(GL_ROLE.Sales, 'prod', 'cat-leaf', company, asOf, 'type-book')).resolves.toBe(
            'acct-root',
        );
    });

    it('falls through to the product type, then the company default', async () => {
        const { impl } = resolver({
            [key(E.ProductType, 'type-book', GL_ROLE.Sales)]: 'acct-type',
            [key(E.Company, company, GL_ROLE.Sales)]: 'acct-co',
        });
        await expect(impl.Resolve(GL_ROLE.Sales, 'prod', 'cat-leaf', company, asOf, 'type-book')).resolves.toBe(
            'acct-type',
        );

        const onlyCompany = resolver({
            [key(E.Company, company, GL_ROLE.AccountsReceivable)]: 'acct-co',
        });
        await expect(
            onlyCompany.impl.Resolve(GL_ROLE.AccountsReceivable, 'prod', 'cat-leaf', company, asOf, 'type-book'),
        ).resolves.toBe('acct-co');
    });

    it('fails loudly when nothing in the walk is linked', async () => {
        const { impl } = resolver({});
        await expect(
            impl.Resolve(GL_ROLE.AccountsReceivable, 'prod', 'cat-leaf', company, asOf, 'type-book'),
        ).rejects.toThrow(/product type/);
    });
});

/** Catch the rejection so its fields can be asserted, failing the test if nothing is thrown. */
async function rejectionOf(p: Promise<unknown>): Promise<GLAccountResolutionError> {
    try {
        await p;
    } catch (err) {
        expect(err).toBeInstanceOf(GLAccountResolutionError);
        return err as GLAccountResolutionError;
    }
    throw new Error('expected a GLAccountResolutionError, but the promise resolved');
}

describe('GLAccountResolutionError says WHY it failed (golive #261)', () => {
    it("reports nothing linked as 'NotLinked', which a tolerant caller may fall back on", async () => {
        const { impl } = resolver({});
        const err = await rejectionOf(
            impl.Resolve(GL_ROLE.GiftCardLiability, 'prod', 'cat-leaf', company, asOf, 'type-book'),
        );
        expect(err.Failure).toBe('NotLinked');
        expect(IsRoleNotLinked(err)).toBe(true);
    });

    it("reports a link to another company as 'CrossCompany', which no caller may fall back on (D6)", async () => {
        const impl = new GLAccountResolver(E, {} as never, {} as never, () => ({
            GLAccountID: 'acct-other',
            CompanyID: 'co-other',
        }));
        const err = await rejectionOf(impl.Resolve(GL_ROLE.UnbilledReceivable, null, null, company, asOf));
        expect(err.Failure).toBe('CrossCompany');
        expect(IsRoleNotLinked(err)).toBe(false);
    });

    it('does not mistake an unrelated error for an unlinked role', () => {
        expect(IsRoleNotLinked(new Error('connection reset'))).toBe(false);
    });
});

describe('UnbilledReceivableNotLinkedError', () => {
    it('names the entry, the role, the company, the amount and where to link it', async () => {
        const { impl } = resolver({});
        const cause = await rejectionOf(
            impl.Resolve(GL_ROLE.UnbilledReceivable, 'prod', 'cat-leaf', company, asOf, 'type-book'),
        );
        const err = UnbilledReceivableNotLinkedError('Order 1042 line 2', company, -250, cause);

        expect(err.Role).toBe(GL_ROLE.UnbilledReceivable);
        expect(err.Failure).toBe('NotLinked');
        expect(err.message).toContain('Order 1042 line 2');
        expect(err.message).toContain(`'${GL_ROLE.UnbilledReceivable}'`);
        expect(err.message).toContain(company);
        expect(err.message).toContain('250.00');
        expect(err.message).toContain('Account Links');
        expect(err.message).toContain('Nothing was posted');
    });
});
