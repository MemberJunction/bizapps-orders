import { describe, expect, it } from 'vitest';
import { OrderHeaderExpandedFromPref } from '../order-header-prefs';

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
