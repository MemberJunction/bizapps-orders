/**
 * A GL account link that lists dimensions refuses journal entry lines that do not carry them (#417).
 */
import { describe, expect, it } from 'vitest';
import {
    GLAccountResolutionError,
    GLAccountResolver,
    GL_ROLE,
    IsRoleNotLinked,
    RefuseUntaggedLines,
    type LinkedAccountHit,
    type ResolvedAccountRequirement,
} from '../GLAccountResolver.js';

const E = { Product: 'ent-product', ProductCategory: 'ent-category', ProductType: 'ent-type', Company: 'ent-company' };
const asOf = new Date('2026-10-01');
const company = 'co-1';

const VENTURE = { DimensionID: 'DIM-VENTURE', Code: 'VENTURE' };
const PRODUCT = { DimensionID: 'DIM-PRODUCT', Code: 'PRODUCT' };

function resolverWith(hits: Record<string, LinkedAccountHit>) {
    const impl = new GLAccountResolver(E, {} as never, {} as never, (entityId, recordId, role) => hits[`${entityId}:${recordId}:${role}`] ?? null);
    (impl as unknown as { _categoriesLoaded: boolean })._categoriesLoaded = true;
    return impl;
}

function refusal(fn: () => void): GLAccountResolutionError {
    try {
        fn();
    } catch (err) {
        if (err instanceof GLAccountResolutionError) return err;
        throw err;
    }
    throw new Error('expected a refusal, but the lines passed');
}

const sales = (dims: Array<{ DimensionID: string; DimensionValueID: string }>, amount = 100) => ({
    GLAccountID: 'acct-sales',
    CreditAmount: amount,
    Dimensions: dims,
});

describe('GLAccountResolver records what each link requires', () => {
    it('hands back the role, account and required dimensions, and clears them on take', async () => {
        const impl = resolverWith({
            [`${E.Company}:${company}:${GL_ROLE.Sales}`]: {
                GLAccountID: 'acct-sales',
                CompanyID: company,
                AccountLabel: '4000 Sales',
                RequiredDimensions: [VENTURE],
            },
        });
        await impl.Resolve(GL_ROLE.Sales, 'prod', null, company, asOf);

        expect(impl.TakeResolved()).toEqual([
            { Role: GL_ROLE.Sales, GLAccountID: 'acct-sales', AccountLabel: '4000 Sales', RequiredDimensions: [VENTURE] },
        ]);
        expect(impl.TakeResolved()).toEqual([]);
    });

    it('records nothing for a role that failed to resolve', async () => {
        const impl = resolverWith({});
        await expect(impl.Resolve(GL_ROLE.Sales, 'prod', null, company, asOf)).rejects.toThrow();
        expect(impl.TakeResolved()).toEqual([]);
    });

    it('treats a link with no requirement list as requiring nothing', async () => {
        const impl = resolverWith({ [`${E.Company}:${company}:${GL_ROLE.Sales}`]: { GLAccountID: 'acct-sales', CompanyID: company } });
        await impl.Resolve(GL_ROLE.Sales, 'prod', null, company, asOf);
        expect(impl.TakeResolved()[0]).toMatchObject({ AccountLabel: 'acct-sales', RequiredDimensions: [] });
    });
});

describe('RefuseUntaggedLines', () => {
    const resolved: ResolvedAccountRequirement[] = [
        { Role: GL_ROLE.Sales, GLAccountID: 'acct-sales', AccountLabel: '4000 Sales', RequiredDimensions: [VENTURE, PRODUCT] },
    ];

    it('passes a line carrying every required dimension', () => {
        expect(() =>
            RefuseUntaggedLines('Order 7 line 1', resolved, [
                sales([
                    { DimensionID: 'dim-venture', DimensionValueID: 'v1' },
                    { DimensionID: 'DIM-PRODUCT', DimensionValueID: 'p1' },
                ]),
            ]),
        ).not.toThrow();
    });

    it('refuses a line missing one, naming the line, role, account and missing code', () => {
        const err = refusal(() =>
            RefuseUntaggedLines('Order 7 line 1', resolved, [sales([{ DimensionID: 'DIM-VENTURE', DimensionValueID: 'v1' }])]),
        );
        expect(err.Failure).toBe('MissingDimensions');
        expect(IsRoleNotLinked(err)).toBe(false);
        expect(err.Role).toBe(GL_ROLE.Sales);
        expect(err.message).toContain('Order 7 line 1');
        expect(err.message).toContain(`'${GL_ROLE.Sales}'`);
        expect(err.message).toContain('4000 Sales');
        expect(err.message).toContain('PRODUCT');
        expect(err.message).not.toContain('VENTURE');
        expect(err.message).toContain('Nothing was posted');
    });

    it('ignores a zero-amount line, which is never posted', () => {
        expect(() => RefuseUntaggedLines('Order 7 line 1', resolved, [sales([], 0)])).not.toThrow();
    });

    it('ignores an account no link requirement was recorded for', () => {
        expect(() =>
            RefuseUntaggedLines('Order 7 line 1', resolved, [{ GLAccountID: 'acct-ar', DebitAmount: 100, Dimensions: [] }]),
        ).not.toThrow();
    });

    it('reports one account once however many entries carry it', () => {
        const err = refusal(() => RefuseUntaggedLines('Order 7 line 1', resolved, [sales([]), sales([], 50), sales([], 25)]));
        expect(err.message.match(/4000 Sales/g)).toHaveLength(1);
    });

    it('combines requirements when two roles reach the same account', () => {
        const err = refusal(() =>
            RefuseUntaggedLines(
                'Order 7 line 1',
                [
                    { Role: GL_ROLE.Sales, GLAccountID: 'acct-sales', AccountLabel: '4000 Sales', RequiredDimensions: [VENTURE] },
                    { Role: GL_ROLE.DeferredRevenue, GLAccountID: 'acct-sales', AccountLabel: '4000 Sales', RequiredDimensions: [PRODUCT] },
                ],
                [sales([])],
            ),
        );
        expect(err.message).toContain('VENTURE, PRODUCT');
        expect(err.message).toContain(`'${GL_ROLE.Sales}' / '${GL_ROLE.DeferredRevenue}'`);
    });
});
