/**
 * The redirect after a confirmed checkout carries the order reference (#295).
 */
import { describe, expect, it } from 'vitest';
import { WithOrderReference } from '../lib/checkout-widget/checkout-redirect';

const BASE = 'https://shop.example.com/checkout/annual';

describe('WithOrderReference', () => {
    it('appends the order number', () => {
        expect(WithOrderReference('https://learn.example.com/welcome', 'SO-00123', BASE)).toBe('https://learn.example.com/welcome?order=SO-00123');
    });

    it('keeps the query and fragment already there, and replaces an existing order parameter', () => {
        expect(WithOrderReference('https://learn.example.com/welcome?utm=x&order=old#top', 'SO-1', BASE)).toBe(
            'https://learn.example.com/welcome?utm=x&order=SO-1#top'
        );
    });

    it('resolves a relative redirect against the page', () => {
        expect(WithOrderReference('/thanks', 'SO-1', BASE)).toBe('https://shop.example.com/thanks?order=SO-1');
    });

    it('encodes the order number', () => {
        expect(WithOrderReference('https://learn.example.com/', 'SO 1&x=2', BASE)).toBe('https://learn.example.com/?order=SO+1%26x%3D2');
    });

    it('leaves the redirect unchanged with no order number or an unreadable URL', () => {
        expect(WithOrderReference('https://learn.example.com/welcome', null, BASE)).toBe('https://learn.example.com/welcome');
        expect(WithOrderReference('http://[bad', 'SO-1', 'not a url')).toBe('http://[bad');
    });
});
