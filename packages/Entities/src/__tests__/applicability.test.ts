import { describe, it, expect } from 'vitest';
import { priceApplies } from '../pricing/applicability.js';
import { EvaluateFilter, IsCompositeFilter, ParseFilterField } from '../pricing/mj-filter-eval.js';

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

describe('EvaluateFilter — groups', () => {
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
            EvaluateFilter(filter, {
                BillToOrganization: { Type: 'Member' },
                Order: { CompanyID: 'co-1' },
                BillToPerson: { Title: 'Staff' },
            }),
        ).toBe(true);
        expect(
            EvaluateFilter(filter, {
                BillToOrganization: { Type: 'Prospect' },
                Order: { CompanyID: 'co-1' },
                BillToPerson: { Title: 'Board' },
            }),
        ).toBe(true);
        expect(
            EvaluateFilter(filter, {
                BillToOrganization: { Type: 'Prospect' },
                Order: { CompanyID: 'co-1' },
                BillToPerson: { Title: 'Staff' },
            }),
        ).toBe(false);
    });
});

describe('ParseFilterField / IsCompositeFilter', () => {
    it('splits Source.Field and treats a bare name as the empty source', () => {
        expect(ParseFilterField('BillToOrganization.Type')).toEqual({
            source: 'BillToOrganization',
            name: 'Type',
        });
        expect(ParseFilterField('Order.OrderDate')).toEqual({ source: 'Order', name: 'OrderDate' });
        expect(ParseFilterField('SKU')).toEqual({ source: null, name: 'SKU' });
        expect(ParseFilterField('.Type')).toEqual({ source: null, name: '.Type' });
        expect(ParseFilterField('Order.')).toEqual({ source: null, name: 'Order.' });
        expect(ParseFilterField('  Product.SKU  ')).toEqual({ source: 'Product', name: 'SKU' });
    });

    it('keeps nested dotted names after the first dot for the field path', () => {
        expect(ParseFilterField('BillToOrganization.Address.City')).toEqual({
            source: 'BillToOrganization',
            name: 'Address.City',
        });
    });

    it('distinguishes a group from a leaf rule', () => {
        expect(IsCompositeFilter({ logic: 'and', filters: [] })).toBe(true);
        expect(IsCompositeFilter({ field: 'Order.Status', operator: 'eq', value: 'Draft' })).toBe(false);
    });
});
