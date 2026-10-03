import { describe, it, expect } from 'vitest';
import {
    BILLING_COUNTRIES,
    BILLING_SUBDIVISIONS,
    BillingPostalCodeRequired,
    BillingSubdivisionRequired,
    CheckBillingLocation,
} from '../billing-location';

const reasonOf = (input: unknown): string => {
    const check = CheckBillingLocation(input);
    return check.Valid === false ? check.Reason : '';
};

describe('CheckBillingLocation', () => {
    it('refuses a missing or empty country', () => {
        for (const input of [undefined, null, 'US', [], {}, { Country: '  ' }]) {
            expect(reasonOf(input)).toMatch(/billing country is required/i);
        }
    });

    it('refuses a country that is not an ISO alpha-2 code', () => {
        expect(reasonOf({ Country: 'USA' })).toMatch(/not an ISO 3166-1 alpha-2/);
        expect(reasonOf({ Country: 'United States' })).toMatch(/not an ISO 3166-1 alpha-2/);
    });

    it('requires a subdivision code for US, CA and AU, and refuses free text', () => {
        expect(reasonOf({ Country: 'US', PostalCode: '60601' })).toMatch(/state or province is required/i);
        expect(reasonOf({ Country: 'CA', PostalCode: 'M5V 2T6' })).toMatch(/state or province is required/i);
        expect(reasonOf({ Country: 'AU', PostalCode: '2000' })).toMatch(/state or province is required/i);
        expect(reasonOf({ Country: 'US', StateProvince: 'Illinois', PostalCode: '60601' })).toMatch(/not a state or province code/);
        expect(reasonOf({ Country: 'US', StateProvince: 'ON', PostalCode: '60601' })).toMatch(/not a state or province code/);
    });

    it('requires a well-formed postal code for US, CA and AU', () => {
        expect(reasonOf({ Country: 'US', StateProvince: 'IL' })).toMatch(/postal code is required/i);
        expect(reasonOf({ Country: 'US', StateProvince: 'IL', PostalCode: '6060' })).toMatch(/not a valid postal code/);
        expect(reasonOf({ Country: 'AU', StateProvince: 'NSW', PostalCode: '20000' })).toMatch(/not a valid postal code/);
    });

    it('normalises codes to upper case and strips an ISO 3166-2 country prefix', () => {
        expect(CheckBillingLocation({ Country: ' us ', StateProvince: 'us-wa', PostalCode: '98101-1234' })).toEqual({
            Valid: true,
            Location: { Country: 'US', StateProvince: 'WA', PostalCode: '98101-1234' },
        });
        expect(CheckBillingLocation({ Country: 'CA', StateProvince: 'on', PostalCode: 'm5v 2t6' })).toEqual({
            Valid: true,
            Location: { Country: 'CA', StateProvince: 'ON', PostalCode: 'M5V 2T6' },
        });
    });

    it('accepts other countries without a region, and does not store one it cannot check', () => {
        expect(CheckBillingLocation({ Country: 'CH', StateProvince: 'Zurich' })).toEqual({
            Valid: true,
            Location: { Country: 'CH', StateProvince: null, PostalCode: null },
        });
        expect(reasonOf({ Country: 'GB', PostalCode: 'X'.repeat(21) })).toMatch(/at most 20 characters/);
    });
});

describe('billing location lists', () => {
    it('lists every ISO 3166-1 country once', () => {
        const codes = BILLING_COUNTRIES.map((c) => c.Code);
        expect(codes).toHaveLength(249);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('lists subdivisions only for countries that require one', () => {
        expect(Object.keys(BILLING_SUBDIVISIONS).sort()).toEqual(['AU', 'CA', 'US']);
        expect(BillingSubdivisionRequired('us')).toBe(true);
        expect(BillingSubdivisionRequired('GB')).toBe(false);
        expect(BillingPostalCodeRequired('CA')).toBe(true);
        expect(BillingPostalCodeRequired('CH')).toBe(false);
    });
});
