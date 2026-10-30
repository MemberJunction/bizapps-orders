import { describe, expect, it } from 'vitest';
import { CreditTargetFilter, OwnCreditTargets } from '../lib/pages/payments/credit-targets';

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
});
