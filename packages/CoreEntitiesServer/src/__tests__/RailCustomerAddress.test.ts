/**
 * The address a new Bill.com customer is created with (#754): the order's bill-to address first,
 * the party's primary address only when the order names none.
 */
import { describe, expect, it } from 'vitest';
import type { OrderAddressSnapshot } from '@mj-biz-apps/orders-entities';

import { RailCustomerAddress, type RailCustomerAddressFacts } from '../IssueExternalInvoiceOperation.js';

const NO_PRIMARY: RailCustomerAddressFacts = { AddressLines: [], City: null, State: null, PostalCode: null, Country: null };
const PRIMARY: RailCustomerAddressFacts = { AddressLines: ['1 Primary St'], City: 'Austin', State: 'TX', PostalCode: '78701', Country: 'US' };

const billTo = (over: Partial<OrderAddressSnapshot> = {}): OrderAddressSnapshot => ({
    AddressID: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    Line1: '100 Billing Ave',
    Line2: 'Suite 2',
    Line3: null,
    City: 'Amarillo',
    StateProvince: 'TX',
    PostalCode: '79101',
    Country: 'US',
    ...over,
});

describe('RailCustomerAddress', () => {
    it("uses the order's bill-to address when the party has no primary address", () => {
        expect(RailCustomerAddress(billTo(), NO_PRIMARY)).toEqual({
            AddressLines: ['100 Billing Ave', 'Suite 2'],
            City: 'Amarillo',
            State: 'TX',
            PostalCode: '79101',
            Country: 'US',
        });
    });

    it("prefers the order's bill-to address over the party's primary address", () => {
        expect(RailCustomerAddress(billTo(), PRIMARY).City).toBe('Amarillo');
    });

    it("falls back to the party's primary address when the order names none", () => {
        expect(RailCustomerAddress(null, PRIMARY)).toBe(PRIMARY);
    });

    it("falls back when the order's address carries no postal fields", () => {
        expect(RailCustomerAddress(billTo({ Line1: null, Line2: null, City: null, PostalCode: null }), PRIMARY)).toBe(PRIMARY);
    });
});
