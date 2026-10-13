import { describe, expect, it } from 'vitest';
import {
    MergeCheckoutTracking,
    NormalizeCheckoutTracking,
    ParseCaptureCookieNames,
    ReadNamedCookies,
} from '../checkout-tracking.js';

describe('NormalizeCheckoutTracking', () => {
    it('keeps the page URL and the cookies, trimmed', () => {
        expect(NormalizeCheckoutTracking({ pageUrl: ' https://example.com/pricing?utm_source=ad ', cookies: { visitor: ' abc123 ' } })).toEqual({
            PageURL: 'https://example.com/pricing?utm_source=ad',
            Cookies: { visitor: 'abc123' },
        });
    });

    it('keeps cookies without a page URL, and a page URL without cookies', () => {
        expect(NormalizeCheckoutTracking({ cookies: { visitor: 'abc' } })).toEqual({ PageURL: null, Cookies: { visitor: 'abc' } });
        expect(NormalizeCheckoutTracking({ pageUrl: 'http://localhost:4200/' })).toEqual({ PageURL: 'http://localhost:4200/', Cookies: {} });
    });

    it('drops a page URL that is not http(s) or too long', () => {
        expect(NormalizeCheckoutTracking({ pageUrl: 'javascript:alert(1)', cookies: { a: '1' } })?.PageURL).toBeNull();
        expect(NormalizeCheckoutTracking({ pageUrl: 'not a url', cookies: { a: '1' } })?.PageURL).toBeNull();
        expect(NormalizeCheckoutTracking({ pageUrl: `https://example.com/${'p'.repeat(2000)}`, cookies: { a: '1' } })?.PageURL).toBeNull();
    });

    it('drops each cookie it cannot read and keeps the rest', () => {
        const tracking = NormalizeCheckoutTracking({
            cookies: { good: 'ok', 'bad name': 'x', semi: 'a;b', ctrl: 'a\nb', long: 'v'.repeat(513), num: 7, empty: ' ' },
        });
        expect(tracking?.Cookies).toEqual({ good: 'ok' });
    });

    it('keeps at most ten cookies', () => {
        const cookies = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${i}`, 'v']));
        expect(Object.keys(NormalizeCheckoutTracking({ cookies })?.Cookies ?? {})).toHaveLength(10);
    });

    it('is null when nothing can be read', () => {
        for (const bad of [undefined, null, 'x', [], {}, { pageUrl: 'ftp://x' }, { cookies: { 'a b': 'c' } }]) {
            expect(NormalizeCheckoutTracking(bad)).toBeNull();
        }
    });
});

describe('MergeCheckoutTracking', () => {
    it('keeps an earlier cookie the latest draft does not carry, and lets the latest values win', () => {
        expect(
            MergeCheckoutTracking(
                { PageURL: 'https://a.example/', Cookies: { visitor: 'old', other: 'x' } },
                { PageURL: null, Cookies: { visitor: 'new' } }
            )
        ).toEqual({ PageURL: 'https://a.example/', Cookies: { visitor: 'new', other: 'x' } });
    });

    it('returns whichever side exists', () => {
        const t = { PageURL: 'https://a.example/', Cookies: {} };
        expect(MergeCheckoutTracking(null, t)).toBe(t);
        expect(MergeCheckoutTracking(t, null)).toBe(t);
        expect(MergeCheckoutTracking(null, null)).toBeNull();
    });
});

describe('ParseCaptureCookieNames', () => {
    it('reads a comma or space separated list, once each', () => {
        expect(ParseCaptureCookieNames(' visitor, _ga  visitor ')).toEqual(['visitor', '_ga']);
    });

    it('drops names that cannot be cookie names', () => {
        expect(ParseCaptureCookieNames('ok;bad =x')).toEqual([]);
        expect(ParseCaptureCookieNames(null)).toEqual([]);
    });
});

describe('ReadNamedCookies', () => {
    it('reads only the named cookies, decoding values', () => {
        expect(ReadNamedCookies('a=1; visitor=abc%20def; other=2', ['visitor', 'missing'])).toEqual({ visitor: 'abc def' });
    });

    it('keeps a value it cannot decode as it is', () => {
        expect(ReadNamedCookies('visitor=%E0%A4%A', ['visitor'])).toEqual({ visitor: '%E0%A4%A' });
    });
});
