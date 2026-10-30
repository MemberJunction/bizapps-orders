import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CREDITS_HELD_WHERE, CreditTargetFilter, OwnCreditTargets } from '../lib/pages/payments/credit-targets';

/** The Account Credit page lists only the orders the server would let a credit settle (SameCustomerRefusal). */
describe('credit targets', () => {
    const orgOrder = { ID: 'o1', BillToOrganizationID: 'org-A', BillToPersonID: 'jane' };
    const janesOwn = { ID: 'o2', BillToOrganizationID: null, BillToPersonID: 'jane' };

    it("an organization's credit: filtered by the organization, and every listed order kept", () => {
        const credit = { BillToOrganizationID: 'org-A', BillToPersonID: 'jane' };
        expect(CreditTargetFilter(credit)).toEqual({ BillToOrganizationID: 'org-A' });
        expect(OwnCreditTargets(credit, [orgOrder])).toEqual([orgOrder]);
    });
    it("a person's credit: filtered by the person, and an organization's order that merely names them is dropped", () => {
        const credit = { BillToOrganizationID: null, BillToPersonID: 'jane' };
        expect(CreditTargetFilter(credit)).toEqual({ BillToPersonID: 'jane' });
        expect(OwnCreditTargets(credit, [orgOrder, janesOwn])).toEqual([janesOwn]);
    });
    it('a credit billed to no one lists nothing (never every customer)', () => {
        expect(CreditTargetFilter({ BillToOrganizationID: null, BillToPersonID: null })).toEqual({ OrderHeaderID: '00000000-0000-0000-0000-000000000000' });
    });
    it('only a confirmed order is a target, and a credit held on a Draft, Quoted or Voided order lists nothing (the server refuses both)', () => {
        const credit = { BillToOrganizationID: 'org-A', Status: 'Confirmed' };
        const draft = { ...orgOrder, ID: 'o3', Status: 'Draft' };
        const quoted = { ...orgOrder, ID: 'o4', Status: 'Quoted' };
        const voided = { ...orgOrder, ID: 'o5', Status: 'Voided' };
        const confirmed = { ...orgOrder, ID: 'o6', Status: 'Confirmed' };
        expect(OwnCreditTargets(credit, [draft, quoted, voided, confirmed])).toEqual([confirmed]);
        for (const Status of ['Draft', 'Quoted', 'Voided']) expect(OwnCreditTargets({ ...credit, Status }, [confirmed])).toEqual([]);
    });
    it('the Credits Held list excludes Draft, Quoted and Voided orders', () => {
        expect(CREDITS_HELD_WHERE).toBe("Balance < 0 AND Status NOT IN ('Draft','Quoted','Voided')");
    });
    it("every client credit list reads the ONE filter: the credits preset, the dashboard tile and the Credits Held view", () => {
        const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
        expect(src('../lib/data/orders-queries.ts')).toMatch(/case 'credits':[\s\S]{0,200}filters\.push\(CREDITS_HELD_WHERE\)/);
        expect(src('../lib/pages/orders/orders-dashboard.page.ts')).toMatch(/case 'credits':\s*whereClause = CREDITS_HELD_WHERE;/);
        expect(src('../lib/pages/payments/account-credit.page.ts')).toMatch(/WhereClause: CREDITS_HELD_WHERE,/);
    });
});
