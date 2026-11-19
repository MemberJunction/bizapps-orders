import { describe, expect, it } from 'vitest';
import {
    MergeCheckoutTracking,
    NormalizeCheckoutTracking,
    NormalizeStoredCheckoutTracking,
    ParseCaptureCookieNames,
    ReadNamedCookies,
} from '../checkout-tracking.js';

describe('NormalizeCheckoutTracking', () => {
    it('keeps the page URL and the cookies, trimmed', () => {
        expect(NormalizeCheckoutTracking({ pageUrl: ' https://example.com/pricing?utm_source=ad ', cookies: { visitor: ' abc123 ' } })).toEqual({
            PageURL: 'https://example.com/pricing?utm_source=ad',
            Cookies: { visitor: 'abc123' },
            ReferrerHost: null,
        });
    });

    it('keeps cookies without a page URL, and a page URL without cookies', () => {
        expect(NormalizeCheckoutTracking({ cookies: { visitor: 'abc' } })).toEqual({ PageURL: null, Cookies: { visitor: 'abc' }, ReferrerHost: null });
        expect(NormalizeCheckoutTracking({ pageUrl: 'http://localhost:4200/' })).toEqual({ PageURL: 'http://localhost:4200/', Cookies: {}, ReferrerHost: null });
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

    it('keeps only the origin, the path and the tracking parameters of the page URL', () => {
        const tracking = NormalizeCheckoutTracking({
            pageUrl: 'https://example.com/pricing?email=jane%40example.com&utm_source=ad&UTM_Medium=cpc&gclid=g1&gbraid=b&wbraid=w&fbclid=f&msclkid=m&li_fat_id=l&plan=pro#top',
        });
        expect(tracking?.PageURL).toBe('https://example.com/pricing?utm_source=ad&UTM_Medium=cpc&gclid=g1&gbraid=b&wbraid=w&fbclid=f&msclkid=m&li_fat_id=l');
        expect(tracking?.PageURL).not.toContain('jane');
    });

    it('drops the query entirely when it holds no tracking parameter', () => {
        expect(NormalizeCheckoutTracking({ pageUrl: 'https://example.com/checkout?token=secret&email=a%40b.com' })?.PageURL).toBe('https://example.com/checkout');
        expect(NormalizeCheckoutTracking({ pageUrl: 'https://user:pw@example.com/p' })?.PageURL).toBe('https://example.com/p');
    });

    it('keeps the referrer as a lower-case host only', () => {
        expect(NormalizeCheckoutTracking({ referrer: 'https://WWW.Google.com/search?q=jane%40example.com' })).toEqual({ PageURL: null, Cookies: {}, ReferrerHost: 'www.google.com' });
        for (const bad of ['', 'not a url', 'android-app://com.google.android.gm/', 'javascript:alert(1)', `https://example.com/${'p'.repeat(2000)}`, 7]) {
            expect(NormalizeCheckoutTracking({ referrer: bad, cookies: { a: '1' } })?.ReferrerHost).toBeNull();
        }
    });

    it('is null when nothing can be read', () => {
        for (const bad of [undefined, null, 'x', [], {}, { pageUrl: 'ftp://x' }, { cookies: { 'a b': 'c' } }, { referrer: 'ftp://x' }]) {
            expect(NormalizeCheckoutTracking(bad)).toBeNull();
        }
    });
});

describe('MergeCheckoutTracking', () => {
    it('keeps an earlier cookie the latest draft does not carry, and lets the latest values win', () => {
        expect(
            MergeCheckoutTracking(
                { PageURL: 'https://a.example/', Cookies: { visitor: 'old', other: 'x' }, ReferrerHost: 'www.google.com' },
                { PageURL: null, Cookies: { visitor: 'new' }, ReferrerHost: null }
            )
        ).toEqual({ PageURL: 'https://a.example/', Cookies: { visitor: 'new', other: 'x' }, ReferrerHost: 'www.google.com' });
    });

    it('lets a later referrer replace an earlier one', () => {
        expect(
            MergeCheckoutTracking(
                { PageURL: null, Cookies: {}, ReferrerHost: 'www.google.com' },
                { PageURL: null, Cookies: {}, ReferrerHost: 'www.bing.com' }
            )?.ReferrerHost
        ).toBe('www.bing.com');
    });

    it('returns whichever side exists', () => {
        const t = { PageURL: 'https://a.example/', Cookies: {}, ReferrerHost: null };
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

describe('a URI-encoded JSON cookie (a page script recording first and latest visits)', () => {
    const json = (size: number) => {
        const base = { ft: { s: 'google', m: 'cpc', lp: '/blog/x', at: '2026-11-11' }, pad: '' };
        base.pad = 'x'.repeat(size - JSON.stringify(base).length);
        return JSON.stringify(base);
    };

    it('arrives whole: read, decoded and kept, up to the value cap', () => {
        const value = json(512);
        const read = ReadNamedCookies(`a=1; sc_attr=${encodeURIComponent(value)}; b=2`, ['sc_attr']);
        expect(read.sc_attr).toBe(value);
        expect(NormalizeCheckoutTracking({ cookies: read })?.Cookies.sc_attr).toBe(value);
    });

    it('is dropped whole, never cut, when the decoded value is over the cap or holds a ;', () => {
        const over = ReadNamedCookies(`sc_attr=${encodeURIComponent(json(513))}`, ['sc_attr']);
        expect(NormalizeCheckoutTracking({ cookies: over })).toBeNull();
        const semi = ReadNamedCookies(`sc_attr=${encodeURIComponent('{"s":"a;b"}')}`, ['sc_attr']);
        expect(NormalizeCheckoutTracking({ cookies: semi })).toBeNull();
    });
});

describe('NormalizeStoredCheckoutTracking', () => {
    it('reads back a stored host, and what an older draft stored before the referrer existed', () => {
        expect(NormalizeStoredCheckoutTracking({ PageURL: 'https://a.example/p', Cookies: {}, ReferrerHost: 'www.google.com' })).toEqual({
            PageURL: 'https://a.example/p', Cookies: {}, ReferrerHost: 'www.google.com',
        });
        expect(NormalizeStoredCheckoutTracking({ PageURL: 'https://a.example/p?email=a%40b.com', Cookies: { v: '1' } })).toEqual({
            PageURL: 'https://a.example/p', Cookies: { v: '1' }, ReferrerHost: null,
        });
        expect(NormalizeStoredCheckoutTracking({ ReferrerHost: 'www.bing.com' })?.ReferrerHost).toBe('www.bing.com');
    });

    it('drops a stored host that is not one', () => {
        expect(NormalizeStoredCheckoutTracking({ ReferrerHost: 'https://x.com/a b' })).toBeNull();
        expect(NormalizeStoredCheckoutTracking(null)).toBeNull();
    });
});
