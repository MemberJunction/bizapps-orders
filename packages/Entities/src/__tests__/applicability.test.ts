import { describe, it, expect } from 'vitest';
import { priceApplies } from '../pricing/applicability.js';
import { evaluateFilter } from '../pricing/mj-filter-eval.js';

const memberWhen = {
    logic: 'and' as const,
    filters: [{ field: 'BillToOrganization.Type', operator: 'eq' as const, value: 'Member' }],
};

describe('priceApplies', () => {
    it('treats null Applicability as always', () => {
        expect(priceApplies(null, {})).toBe(true);
        expect(priceApplies('', { BillToOrganization: { Type: 'Prospect' } })).toBe(true);
    });

    it('matches a dotted Source.Field against the bag', () => {
        expect(priceApplies(JSON.stringify(memberWhen), { BillToOrganization: { Type: 'Member' } })).toBe(true);
        expect(priceApplies(JSON.stringify(memberWhen), { BillToOrganization: { Type: 'Prospect' } })).toBe(false);
    });

    it('is false when the party is missing, unless the operator is empty', () => {
        expect(priceApplies(JSON.stringify(memberWhen), {})).toBe(false);
        const emptyWhen = {
            logic: 'and' as const,
            filters: [{ field: 'ShipToPerson.ID', operator: 'isempty' as const, value: null }],
        };
        expect(priceApplies(JSON.stringify(emptyWhen), { ShipToPerson: null })).toBe(true);
    });

    it('throws on invalid JSON so a broken catalog is loud', () => {
        expect(() => priceApplies('{not json', {})).toThrow();
    });
});

describe('evaluateFilter — groups', () => {
    it('ANDs within a group and ORs between groups', () => {
        const filter = {
            logic: 'or' as const,
            filters: [
                {
                    logic: 'and' as const,
                    filters: [
                        { field: 'BillToOrganization.Type', operator: 'eq' as const, value: 'Member' },
                        { field: 'Order.CompanyID', operator: 'eq' as const, value: 'co-1' },
                    ],
                },
                { field: 'BillToPerson.Title', operator: 'eq' as const, value: 'Board' },
            ],
        };
        expect(
            evaluateFilter(filter, {
                BillToOrganization: { Type: 'Member' },
                Order: { CompanyID: 'co-1' },
                BillToPerson: { Title: 'Staff' },
            }),
        ).toBe(true);
        expect(
            evaluateFilter(filter, {
                BillToOrganization: { Type: 'Prospect' },
                Order: { CompanyID: 'co-1' },
                BillToPerson: { Title: 'Board' },
            }),
        ).toBe(true);
        expect(
            evaluateFilter(filter, {
                BillToOrganization: { Type: 'Prospect' },
                Order: { CompanyID: 'co-1' },
                BillToPerson: { Title: 'Staff' },
            }),
        ).toBe(false);
    });
});
