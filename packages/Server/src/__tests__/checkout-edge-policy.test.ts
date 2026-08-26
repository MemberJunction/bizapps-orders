import { describe, expect, it } from 'vitest';
import {
    CHECKOUT_RESERVED_SLUGS,
    isSameOrigin,
    isValidCheckoutSlug,
    originAllowed,
} from '../checkout-edge-policy.js';

describe('isValidCheckoutSlug', () => {
    it('accepts typical vanity slugs', () => {
        expect(isValidCheckoutSlug('summit-2027')).toBe(true);
        expect(isValidCheckoutSlug('A')).toBe(true);
        expect(isValidCheckoutSlug('event_1.2')).toBe(true);
    });

    it('rejects empty, too long, unsafe, and reserved POST verbs', () => {
        expect(isValidCheckoutSlug('')).toBe(false);
        expect(isValidCheckoutSlug('initialize')).toBe(false);
        expect(isValidCheckoutSlug('Draft')).toBe(false);
        expect(isValidCheckoutSlug('payment-intent')).toBe(false);
        expect(isValidCheckoutSlug('complete')).toBe(false);
        expect(isValidCheckoutSlug('../etc')).toBe(false);
        expect(isValidCheckoutSlug('has space')).toBe(false);
        expect(isValidCheckoutSlug('<script>')).toBe(false);
        expect(isValidCheckoutSlug('a'.repeat(129))).toBe(false);
    });

    it('reserved set covers every POST suffix on the edge', () => {
        expect([...CHECKOUT_RESERVED_SLUGS].sort()).toEqual(
            ['complete', 'draft', 'initialize', 'payment-intent'].sort()
        );
    });
});

describe('isSameOrigin', () => {
    it('matches scheme-less Host against Origin host:port', () => {
        expect(isSameOrigin('http://localhost:4103', 'localhost:4103')).toBe(true);
        expect(isSameOrigin('https://api.example.com', 'api.example.com')).toBe(true);
    });

    it('rejects missing values, bad URLs, and different hosts', () => {
        expect(isSameOrigin('', 'localhost:4103')).toBe(false);
        expect(isSameOrigin('http://localhost:4103', undefined)).toBe(false);
        expect(isSameOrigin('not-a-url', 'localhost:4103')).toBe(false);
        expect(isSameOrigin('http://localhost:4103', 'localhost:4303')).toBe(false);
        expect(isSameOrigin('https://evil.example', 'api.example.com')).toBe(false);
    });
});

describe('originAllowed', () => {
    it('allows same-origin even when the widget allowlist names another site', () => {
        expect(
            originAllowed('http://localhost:4103', { allowedOrigins: ['https://events.example.com'] }, 'localhost:4103')
        ).toBe(true);
    });

    it('allows any origin when the allowlist is absent or empty', () => {
        expect(originAllowed('https://anywhere.example', {}, 'api.example.com')).toBe(true);
        expect(originAllowed('https://anywhere.example', { allowedOrigins: [] }, 'api.example.com')).toBe(true);
    });

    it('enforces the allowlist for cross-origin embeds (trailing slash insensitive)', () => {
        const policy = { allowedOrigins: ['https://events.example.com/'] };
        expect(originAllowed('https://events.example.com', policy, 'api.example.com')).toBe(true);
        expect(originAllowed('https://other.example.com', policy, 'api.example.com')).toBe(false);
    });
});
