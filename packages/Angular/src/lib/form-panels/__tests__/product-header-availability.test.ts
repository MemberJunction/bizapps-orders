import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { AvailabilityText } from '../product-header.panel';

describe('Product header: the Available stat', () => {
    it('reads as one phrase whichever ends are set', () => {
        expect(AvailabilityText(null, null)).toBe('Always');
        expect(AvailabilityText('2026-01-01', null)).toMatch(/^From /);
        expect(AvailabilityText(null, '2026-12-31')).toMatch(/^Until /);
        expect(AvailabilityText('2026-01-01', '2026-12-31')).toMatch(/ – /);
    });
});
