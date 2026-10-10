import { describe, expect, it } from 'vitest';
import { ToIsoCountryCode } from '../VatLocationEvidence.js';

describe('ToIsoCountryCode (#480)', () => {
    it('upper-cases and trims a two-letter code', () => {
        expect(ToIsoCountryCode('de')).toBe('DE');
        expect(ToIsoCountryCode(' GB ')).toBe('GB');
    });

    it('refuses codes that name no country', () => {
        for (const code of ['XX', 'ZZ', 'T1', 'EU', 'AP', 'xx']) {
            expect(ToIsoCountryCode(code)).toBeNull();
        }
    });

    it('refuses anything that is not a two-letter code', () => {
        for (const value of ['', 'D', 'DEU', 'Germany', 'A1', '12', null, undefined, 49]) {
            expect(ToIsoCountryCode(value)).toBeNull();
        }
    });
});
