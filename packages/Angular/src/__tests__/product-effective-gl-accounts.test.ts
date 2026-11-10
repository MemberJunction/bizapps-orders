/**
 * @fileoverview golive#439 — the Effective accounts block flags roles booking would refuse.
 */
import { describe, expect, it } from 'vitest';
import type { ExplainedGLRole } from '@mj-biz-apps/orders-entities';

import { MissingRequiredRoleNames, OptionalRoleNote, RequiredGLRoleNames, RoleFailureText, RoleSourceText, UnresolvedRoleNames } from '../lib/custom/Product/widgets/product-effective-gl-accounts.component';

function role(name: string, resolved: string | null, failure: string | null = resolved ? null : 'NotLinked'): ExplainedGLRole {
    return {
        Role: name,
        Steps: [],
        ResolvedGLAccountID: resolved,
        ResolvedCode: resolved ? '40000' : null,
        ResolvedName: resolved ? 'Sales' : null,
        Failure: failure,
        Message: failure ? 'refused' : null,
    };
}

describe('UnresolvedRoleNames', () => {
    it('names the roles with no account, in list order', () => {
        const roles = [role('Sales', 'acct'), role('Deferred Revenue', null), role('Sales Discounts', 'acct'), role('Accounts Receivable', null)];
        expect(UnresolvedRoleNames(roles)).toEqual(['Deferred Revenue', 'Accounts Receivable']);
    });

    it('counts a cross-company winner as unresolved, because confirm refuses it', () => {
        expect(UnresolvedRoleNames([role('Sales', null, 'CrossCompany')])).toEqual(['Sales']);
    });

    it('is empty when every role resolves', () => {
        expect(UnresolvedRoleNames([role('Sales', 'acct')])).toEqual([]);
    });
});

describe('Accounts in use: the Source column', () => {
    const step = (Level: string, Scope: string, Won: boolean) => ({
        Level, Scope, Won, RecordID: 'r', GLAccountID: Won ? 'a' : null, AccountCode: Won ? '4000' : null, AccountName: Won ? 'Sales' : null, Dimensions: [],
    });
    const roleWith = (steps: ReturnType<typeof step>[], failure: string | null = null): ExplainedGLRole => ({
        Role: 'Revenue', Steps: steps, ResolvedGLAccountID: failure ? null : 'a', ResolvedCode: failure ? null : '4000', ResolvedName: failure ? null : 'Sales', Failure: failure, Message: null,
    });

    it('names the level the account came from in plain words', () => {
        expect(RoleSourceText(roleWith([step('Product', 'Product: Gold', true)]), 'Betty Bot')).toBe('This product');
        expect(RoleSourceText(roleWith([step('Product', 'Product: Gold', false), step('Category', 'Category: Services', true)]), 'Betty Bot')).toBe('Category: Services');
        expect(RoleSourceText(roleWith([step('ProductType', 'Product type: Membership', true)]), 'Betty Bot')).toBe('Product type: Membership');
        expect(RoleSourceText(roleWith([step('Company', 'Company: Betty Bot', true)]), 'Betty Bot')).toBe('Company default: Betty Bot');
        expect(RoleSourceText(roleWith([step('Company', 'Company: Betty Bot', true)]), '')).toBe('Company default');
        expect(RoleSourceText(roleWith([step('Product', 'Product: Gold', false)], 'NotLinked'), 'Betty Bot')).toBe('—');
    });

    it('says why a role has no account', () => {
        expect(RoleFailureText(roleWith([], 'NotLinked'))).toBe('Not assigned');
        expect(RoleFailureText(roleWith([], 'CrossCompany'))).toBe('Assigned to another company');
    });
});

describe('Accounts in use: which roles block confirm', () => {
    const unresolved = (Role: string): ExplainedGLRole => ({
        Role, Steps: [], ResolvedGLAccountID: null, ResolvedCode: null, ResolvedName: null, Failure: 'NotLinked', Message: null,
    });

    it('requires Accounts Receivable and Sales, and Deferred Revenue only for deferred recognition', () => {
        expect(RequiredGLRoleNames(false)).toEqual(['Accounts Receivable', 'Sales']);
        expect(RequiredGLRoleNames(true)).toEqual(['Accounts Receivable', 'Sales', 'Deferred Revenue']);
    });

    it('names only the required roles that have no account, so optional ones never read as blocking', () => {
        const roles = ['Sales', 'Deferred Revenue', 'Sales Discounts', 'Sales Returns and Allowances', 'Accounts Receivable'].map(unresolved);
        expect(MissingRequiredRoleNames(roles, false)).toEqual(['Sales', 'Accounts Receivable']);
        expect(MissingRequiredRoleNames(roles, true)).toEqual(['Sales', 'Deferred Revenue', 'Accounts Receivable']);
        expect(MissingRequiredRoleNames([unresolved('Sales Discounts')], false)).toEqual([]);
    });

    it('says why an optional role is optional', () => {
        expect(OptionalRoleNote('Sales Discounts')).toMatch(/^Optional/);
        expect(OptionalRoleNote('Sales Returns and Allowances')).toMatch(/not used/);
    });
});
