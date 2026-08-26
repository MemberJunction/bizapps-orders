import { describe, expect, it } from 'vitest';
import {
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
    it('bakes slug and api root into data-* attributes, never into the script block', () => {
        const evil = 'summit"</script><script>alert(1)</script>';
        const html = renderCheckoutHostPage({ slug: evil, apiRoot: '/checkout' });
        expect(html).toContain('data-slug="summit&quot;&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
        expect(html).toContain('data-api-root="/checkout"');
        const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
        expect(script).not.toContain(evil);
        expect(script).not.toContain('summit"');
        expect(script).toContain("host.getAttribute('data-slug')");
        expect(script).toContain("host.getAttribute('data-api-root')");
    });

    it('drives only the existing POST verbs (no amount/price/provider in the request shape)', () => {
        const html = renderCheckoutHostPage({ slug: 'summit-2027', apiRoot: '/checkout' });
        expect(html).toContain("post('/initialize'");
        expect(html).toContain("post('/draft'");
        expect(html).toContain("post('/payment-intent'");
        expect(html).toContain("post('/complete'");
        expect(html).toContain('if (stripe) { resolve(stripe); return; }');
        expect(html).not.toContain('amount:');
        expect(html).not.toContain('UnitPrice');
        expect(html).not.toContain('paymentProviderId');
    });

    it('is a complete HTML document with noindex and utf-8', () => {
        const html = renderCheckoutHostPage({ slug: 'summit-2027', apiRoot: '/checkout', pageTitle: 'Buy <tickets>' });
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('<title>Buy &lt;tickets&gt;</title>');
        expect(html).toContain('name="robots" content="noindex"');
        expect(html).toContain('charset="utf-8"');
    });
});

describe('renderCheckoutHostErrorPage', () => {
    it('escapes the operator-facing message and has no boot script', () => {
        const html = renderCheckoutHostErrorPage({ message: 'Not <found> & gone' });
        expect(html).toContain('Not &lt;found&gt; &amp; gone');
        expect(html).not.toContain('<script>');
        expect(html).toContain('role="alert"');
    });
});
