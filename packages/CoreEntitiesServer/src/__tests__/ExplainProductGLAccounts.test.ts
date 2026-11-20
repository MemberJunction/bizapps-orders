/**
 * Orders.ExplainProductGLAccounts — the role list it accepts and the shape it hands the product
 * screen (golive#439).
 */
import { describe, expect, it } from 'vitest';
import { PRODUCT_GL_ROLES, RequireGLRoles, ShapeRoleExplanation } from '../ExplainProductGLAccountsOperation.js';
import { GL_ROLE, type GLRoleExplanation } from '../GLAccountResolver.js';

describe('RequireGLRoles', () => {
    it('defaults to the five product roles, Sales first', () => {
        expect(RequireGLRoles(undefined)).toEqual([...PRODUCT_GL_ROLES]);
        expect(PRODUCT_GL_ROLES).toEqual([
            'Sales',
            'Deferred Revenue',
            'Sales Discounts',
            'Sales Returns and Allowances',
            'Accounts Receivable',
        ]);
    });

    it('matches a named role regardless of case and spacing', () => {
        expect(RequireGLRoles([' deferred revenue '])).toEqual([GL_ROLE.DeferredRevenue]);
    });

    it('refuses a role orders does not book', () => {
        expect(() => RequireGLRoles(['Revenue'])).toThrow(/not a GL account role/);
    });
});

describe('ShapeRoleExplanation', () => {
    const names = (level: string, id: string) =>
        ({ 'Product:p1': 'SP-SVC', 'Category:c1': 'Services', 'Company:co1': 'Placeholder Co' } as Record<string, string>)[`${level}:${id}`] ??
        null;

    it('labels each step, carries the winner, and lists the link’s dimension codes', () => {
        const explanation: GLRoleExplanation = {
            Role: GL_ROLE.Sales,
            GLAccountID: 'acct-cat',
            Failure: null,
            Message: null,
            Steps: [
                { Level: 'Product', RecordID: 'p1', Hit: null, Won: false },
                {
                    Level: 'Category',
                    RecordID: 'c1',
                    Won: true,
                    Hit: {
                        GLAccountID: 'acct-cat',
                        CompanyID: 'co1',
                        AccountCode: '40100',
                        AccountName: 'Service Revenue',
                        RequiredDimensions: [{ DimensionID: 'd1', Code: 'DEPT' }],
                    },
                },
                {
                    Level: 'Company',
                    RecordID: 'co1',
                    Won: false,
                    Hit: { GLAccountID: 'acct-co', CompanyID: 'co1', AccountCode: '40000', AccountName: 'Sales' },
                },
            ],
        };

        const shaped = ShapeRoleExplanation(explanation, names);
        expect(shaped.Steps.map((s) => s.Scope)).toEqual(['Product: SP-SVC', 'Category: Services', 'Company default: Placeholder Co']);
        expect(shaped.Steps[0]).toMatchObject({ AccountCode: null, AccountName: null, Won: false, Dimensions: [] });
        expect(shaped.Steps[1]).toMatchObject({ AccountCode: '40100', Won: true, Dimensions: ['DEPT'] });
        expect(shaped).toMatchObject({ ResolvedGLAccountID: 'acct-cat', ResolvedCode: '40100', ResolvedName: 'Service Revenue', Failure: null });
    });

    it('shows the id when a record’s name cannot be found', () => {
        const shaped = ShapeRoleExplanation(
            { Role: GL_ROLE.Sales, GLAccountID: null, Failure: 'NotLinked', Message: 'No GL account is linked', Steps: [{ Level: 'ProductType', RecordID: 't9', Hit: null, Won: false }] },
            names,
        );
        expect(shaped.Steps[0].Scope).toBe('Product type: t9');
    });

    it('resolves nothing when booking would refuse a cross-company winner, but keeps that step marked', () => {
        const shaped = ShapeRoleExplanation(
            {
                Role: GL_ROLE.Sales,
                GLAccountID: null,
                Failure: 'CrossCompany',
                Message: 'belongs to company co-other',
                Steps: [{ Level: 'Product', RecordID: 'p1', Won: true, Hit: { GLAccountID: 'acct-x', CompanyID: 'co-other', AccountCode: '49999' } }],
            },
            names,
        );
        expect(shaped).toMatchObject({ ResolvedGLAccountID: null, ResolvedCode: null, Failure: 'CrossCompany' });
        expect(shaped.Steps[0].Won).toBe(true);
    });
});
