import { describe, expect, it } from 'vitest';
import {
    checkoutHostSecurityHeaders,
    escapeAttr,
    escapeHtml,
    renderCheckoutHostErrorPage,
    renderCheckoutHostPage,
} from '../checkout-host-page.js';

describe('escapeHtml / escapeAttr', () => {
    it('escapes markup and quotes', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(escapeAttr('x" onclick="alert(1)')).toBe('x&quot; onclick=&quot;alert(1)');
        expect(escapeAttr('a&b<c>')).toBe('a&amp;b&lt;c&gt;');
    });
});

describe('renderCheckoutHostPage', () => {
    it('hosts the Angular Element when elementSrc is provided', () => {
        const html = renderCheckoutHostPage({
            slug: 'summit-2027',
            apiRoot: '/checkout',
            elementSrc: '/checkout/element/main.js',
            cspNonce: 'nOnce+/1',
        });
        expect(html).toContain('slug="summit-2027"');
        expect(html).toContain('api-root="/checkout"');
        expect(html).toContain('csp-nonce="nOnce+/1"');
        expect(html).toContain('src="/checkout/element/main.js"');
        expect(html).toContain('type="module"');
        expect(html).toContain('nonce="nOnce+/1"');
        expect(html).not.toContain("post('/initialize'");
    });

    it('bakes slug and api root into data-* attributes, never into the script block', () => {
        const evil = 'summit"</script><script>alert(1)</script>';
        const html = renderCheckoutHostPage({ slug: evil, apiRoot: '/checkout', cspNonce: 'nOnce+/1' });
        expect(html).toContain('data-slug="summit&quot;&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
        expect(html).toContain('data-api-root="/checkout"');
        const scriptOpen = html.indexOf('<script');
        const scriptTagEnd = html.indexOf('>', scriptOpen);
        const script = html.slice(scriptTagEnd + 1, html.indexOf('</script>'));
        expect(script).not.toContain(evil);
        expect(script).not.toContain('summit"');
        expect(script).toContain("host.getAttribute('data-slug')");
        expect(script).toContain("host.getAttribute('data-api-root')");
    });

    it('drives only the existing POST verbs (no amount/price/provider in the request shape)', () => {
        const html = renderCheckoutHostPage({ slug: 'summit-2027', apiRoot: '/checkout', cspNonce: 'nOnce+/1' });
        expect(html).toContain("post('/initialize'");
        expect(html).toContain("post('/draft'");
        expect(html).toContain("post('/payment-intent'");
        expect(html).toContain("post('/complete'");
        expect(html).toContain('if (stripe) { resolve(stripe); return; }');
        expect(html).toContain('crypto.getRandomValues');
        expect(html).not.toContain('Math.random');
        expect(html).not.toContain('amount:');
        expect(html).not.toContain('UnitPrice');
        expect(html).not.toContain('paymentProviderId');
    });

    it('is a complete HTML document with noindex and utf-8', () => {
        const html = renderCheckoutHostPage({ slug: 'summit-2027', apiRoot: '/checkout', pageTitle: 'Buy <tickets>', cspNonce: 'nOnce+/1' });
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('<title>Buy &lt;tickets&gt;</title>');
        expect(html).toContain('name="robots" content="noindex"');
        expect(html).toContain('charset="utf-8"');
    });
});

describe('renderCheckoutHostErrorPage', () => {
    it('escapes the operator-facing message and has no boot script', () => {
        const html = renderCheckoutHostErrorPage({ message: 'Not <found> & gone', cspNonce: 'nOnce+/1' });
        expect(html).toContain('Not &lt;found&gt; &amp; gone');
        expect(html).not.toContain('<script>');
        expect(html).toContain('role="alert"');
    });

    it('stamps a CSP nonce onto style and script when provided', () => {
        const html = renderCheckoutHostPage({ slug: 's', apiRoot: '/checkout', cspNonce: 'nOnce+/1' });
        expect(html).toContain('nonce="nOnce+/1"');
        expect(html).toMatch(/<style nonce="nOnce\+\/1">/);
        expect(html).toMatch(/<script nonce="nOnce\+\/1">/);
    });
});

describe('checkoutHostSecurityHeaders', () => {
    it('denies framing and scopes scripts to the nonce plus Stripe', () => {
        const h = checkoutHostSecurityHeaders('abc123');
        expect(h['X-Frame-Options']).toBe('DENY');
        expect(h['Referrer-Policy']).toBe('no-referrer');
        expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
        expect(h['Content-Security-Policy']).toContain("'nonce-abc123'");
        expect(h['Content-Security-Policy']).toContain("'self'");
        expect(h['Content-Security-Policy']).toContain('https://js.stripe.com');
        expect(h['Content-Security-Policy']).toContain("default-src 'none'");
    });
});
