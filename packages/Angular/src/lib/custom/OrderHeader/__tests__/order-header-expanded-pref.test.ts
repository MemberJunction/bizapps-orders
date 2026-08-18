import { describe, expect, it } from 'vitest';
import {
    ExpandedPartyFromPref,
    FormatPartyAddress,
    NextExpandedParty,
    OrderHeaderExpandedFromPref,
} from '../order-header-prefs';

describe('OrderHeaderExpandedFromPref', () => {
    it('always expands a new record, even if the user last collapsed an existing order', () => {
        expect(OrderHeaderExpandedFromPref(false, '0')).toBe(true);
        expect(OrderHeaderExpandedFromPref(false, undefined)).toBe(true);
    });

    it('honors the persisted pref only when opening an existing record', () => {
        expect(OrderHeaderExpandedFromPref(true, '0')).toBe(false);
        expect(OrderHeaderExpandedFromPref(true, '1')).toBe(true);
        expect(OrderHeaderExpandedFromPref(true, undefined)).toBe(true);
    });
});

describe('NextExpandedParty', () => {
    it('opens the clicked party when both are collapsed', () => {
        expect(NextExpandedParty(null, 'ship')).toBe('ship');
        expect(NextExpandedParty(null, 'bill')).toBe('bill');
    });

    it('collapses the party that is already open', () => {
        expect(NextExpandedParty('ship', 'ship')).toBeNull();
        expect(NextExpandedParty('bill', 'bill')).toBeNull();
    });

    it('switches to the other party', () => {
        expect(NextExpandedParty('ship', 'bill')).toBe('bill');
        expect(NextExpandedParty('bill', 'ship')).toBe('ship');
    });
});

describe('ExpandedPartyFromPref', () => {
    it('reads bill/ship and treats anything else as both collapsed', () => {
        expect(ExpandedPartyFromPref('bill')).toBe('bill');
        expect(ExpandedPartyFromPref('ship')).toBe('ship');
        expect(ExpandedPartyFromPref('')).toBeNull();
        expect(ExpandedPartyFromPref(undefined)).toBeNull();
    });
});

describe('FormatPartyAddress', () => {
    it('joins line, city, and region without empty slots', () => {
        expect(FormatPartyAddress({ Line1: '1 Main', City: 'Austin', StateProvince: 'TX', PostalCode: '78701' }))
            .toBe('1 Main · Austin, TX 78701');
        expect(FormatPartyAddress({ Line1: '1 Main' })).toBe('1 Main');
        expect(FormatPartyAddress({})).toBe('');
    });
});
