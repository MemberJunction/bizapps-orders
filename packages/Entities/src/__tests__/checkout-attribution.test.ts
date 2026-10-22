import { describe, expect, it } from 'vitest';
import { NormalizeCheckoutAttribution } from '../checkout-attribution.js';

describe('NormalizeCheckoutAttribution', () => {
    it('keeps a source and its reference, trimmed', () => {
        expect(NormalizeCheckoutAttribution({ source: ' voice_agent ', reference: ' conv-123 ' })).toEqual({ Source: 'voice_agent', Reference: 'conv-123' });
        expect(NormalizeCheckoutAttribution({ source: 'partner:acme.v2' })).toEqual({ Source: 'partner:acme.v2', Reference: null });
    });

    it('drops an attribution with no readable source', () => {
        for (const bad of [undefined, null, 'voice', ['voice'], {}, { source: '' }, { source: 'has space' }, { source: 'x'.repeat(51) }, { source: 42 }]) {
            expect(NormalizeCheckoutAttribution(bad)).toBeNull();
        }
    });

    it('keeps the source but drops a reference that is too long or has control characters', () => {
        expect(NormalizeCheckoutAttribution({ source: 'voice_agent', reference: 'r'.repeat(201) })?.Reference).toBeNull();
        expect(NormalizeCheckoutAttribution({ source: 'voice_agent', reference: 'a\nb' })?.Reference).toBeNull();
        expect(NormalizeCheckoutAttribution({ source: 'voice_agent', reference: 7 })?.Reference).toBeNull();
    });
});
