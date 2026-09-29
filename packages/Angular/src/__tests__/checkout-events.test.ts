/**
 * The DOM events the public checkout element dispatches for its host page (#294).
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef, ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { BuildCheckoutCompleteDetail, CheckoutElementEvent } from '../lib/checkout-widget/checkout-events';
import { CheckoutPublicHostComponent } from '../lib/checkout-widget/checkout-public-host.component';
import type { CheckoutSubmissionEvent } from '../lib/checkout-widget/checkout-widget.component';

describe('BuildCheckoutCompleteDetail', () => {
    it('shapes the sale for GA4: major units, upper-case currency, trimmed text', () => {
        expect(
            BuildCheckoutCompleteDetail({
                sessionId: 's-1',
                productName: ' Annual Plan ',
                productId: 'p-1',
                totalGross: 599,
                currency: 'usd',
                coupon: 'SPRING10',
            })
        ).toEqual({ sessionId: 's-1', productName: 'Annual Plan', productId: 'p-1', amount: 599, currency: 'USD', coupon: 'SPRING10' });
    });

    it('rounds to cents and reports what it does not know as null', () => {
        expect(BuildCheckoutCompleteDetail({ sessionId: 's-1', totalGross: 539.1000000001 }).amount).toBe(539.1);
        expect(BuildCheckoutCompleteDetail({ sessionId: 's-1', totalGross: 'x', currency: '', coupon: '  ' })).toEqual({
            sessionId: 's-1',
            productName: null,
            productId: null,
            amount: null,
            currency: null,
            coupon: null,
        });
    });
});

describe('CheckoutElementEvent', () => {
    it('bubbles and is composed, so document and shadow hosts hear it', () => {
        const e = CheckoutElementEvent('checkout-error', { message: 'x' });
        expect(e.bubbles).toBe(true);
        expect(e.composed).toBe(true);
        expect(e.detail).toEqual({ message: 'x' });
    });
});

/** The real host component, driven over a stubbed checkout edge. */
describe('CheckoutPublicHostComponent events', () => {
    const CONFIG = {
        productId: 'prod-1',
        productName: 'Annual Plan',
        title: 'Annual',
        currency: 'usd',
        unitPrice: 0,
        successMessage: 'Done.',
    };
    let host: EventTarget & { getAttribute(name: string): string | null };
    let seen: Array<{ type: string; detail: unknown }>;
    let responses: Record<string, Record<string, unknown>>;

    const submission = (): CheckoutSubmissionEvent => ({
        email: 'jane@example.com',
        quantity: 1,
        extensionData: { entityName: '', fields: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' } },
        totalGross: 0,
        sessionKey: 'k',
    }) as unknown as CheckoutSubmissionEvent;

    const create = (): CheckoutPublicHostComponent => {
        const injector = Injector.create({
            providers: [
                { provide: ElementRef, useValue: new ElementRef(host) },
                { provide: ChangeDetectorRef, useValue: { detectChanges: () => undefined } },
            ],
        });
        const c = runInInjectionContext(injector, () => new CheckoutPublicHostComponent());
        c.slug = 'annual';
        return c;
    };

    beforeEach(() => {
        const target = new EventTarget();
        host = Object.assign(target, { getAttribute: () => null });
        seen = [];
        for (const type of ['checkout-state-change', 'checkout-complete', 'checkout-error', 'checkout-cancel', 'checkout-close', 'checkout-reset-refused']) {
            host.addEventListener(type, (e) => seen.push({ type, detail: (e as CustomEvent).detail }));
        }
        responses = {
            '/initialize': { Success: true, SessionID: 'sess-1', Configuration: CONFIG },
            '/draft': { Success: true, RequiresPayment: false },
            '/complete': { Success: true, OrderNumber: 'SO-1', TotalGross: 0 },
        };
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) => {
                const path = url.replace('/checkout', '');
                return Promise.resolve({ status: 200, json: () => Promise.resolve({ ...(responses[path] ?? { Success: false }) }) });
            })
        );
        vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reports LOADING then CHECKOUT when the checkout loads', async () => {
        await create().ngOnInit();
        expect(seen).toEqual([
            { type: 'checkout-state-change', detail: { state: 'LOADING' } },
            { type: 'checkout-state-change', detail: { state: 'CHECKOUT' } },
        ]);
    });

    it('reports ERROR with the message when the checkout cannot load', async () => {
        responses['/initialize'] = { Success: false, ErrorMessage: 'This checkout is not available.' };
        await create().ngOnInit();
        expect(seen.slice(-2)).toEqual([
            { type: 'checkout-state-change', detail: { state: 'ERROR' } },
            { type: 'checkout-error', detail: { message: 'This checkout is not available.' } },
        ]);
    });

    it('reports PROCESSING, SUCCESS and the sale, with no personal data', async () => {
        const c = create();
        await c.ngOnInit();
        seen = [];
        await c.onSubmitted(submission());
        expect(seen).toEqual([
            { type: 'checkout-state-change', detail: { state: 'PROCESSING' } },
            { type: 'checkout-state-change', detail: { state: 'SUCCESS' } },
            {
                type: 'checkout-complete',
                detail: { sessionId: 'sess-1', productName: 'Annual Plan', productId: 'prod-1', amount: 0, currency: 'USD', coupon: null },
            },
        ]);
        expect(JSON.stringify(seen)).not.toContain('jane');
    });

    it('falls back to the widget title when there is no product name', async () => {
        responses['/initialize'] = { Success: true, SessionID: 'sess-1', Configuration: { ...CONFIG, productName: undefined } };
        const c = create();
        await c.ngOnInit();
        await c.onSubmitted(submission());
        expect((seen.find((e) => e.type === 'checkout-complete')?.detail as { productName: string }).productName).toBe('Annual');
    });

    it('reports a failed payment step as ERROR, and PROCESSING again on the next try', async () => {
        responses['/draft'] = { Success: false, ErrorMessage: 'Could not price this checkout.' };
        const c = create();
        await c.ngOnInit();
        seen = [];
        await c.onSubmitted(submission());
        expect(seen).toEqual([
            { type: 'checkout-state-change', detail: { state: 'PROCESSING' } },
            { type: 'checkout-state-change', detail: { state: 'ERROR' } },
            { type: 'checkout-error', detail: { message: 'Could not price this checkout.' } },
        ]);
        responses['/draft'] = { Success: true, RequiresPayment: false };
        seen = [];
        await c.onSubmitted(submission());
        expect(seen[0]).toEqual({ type: 'checkout-state-change', detail: { state: 'PROCESSING' } });
        expect(seen.some((e) => e.type === 'checkout-complete')).toBe(true);
    });

    describe('Cancel (#297)', () => {
        it('resets the form, clears the error and tells the host page to close', async () => {
            responses['/draft'] = { Success: false, ErrorMessage: 'Could not price this checkout.' };
            const c = create();
            await c.ngOnInit();
            await c.onSubmitted(submission());
            expect(c.errorMessage).toBe('Could not price this checkout.');
            const before = c.formGeneration;
            seen = [];

            c.onCancelled();

            expect(c.errorMessage).toBeNull();
            expect(c.formGeneration).toBe(before + 1);
            expect(seen).toEqual([
                { type: 'checkout-state-change', detail: { state: 'CHECKOUT' } },
                { type: 'checkout-cancel', detail: {} },
                { type: 'checkout-close', detail: {} },
            ]);
        });

        it('does nothing while a payment is in flight', async () => {
            const c = create();
            await c.ngOnInit();
            c.processing = true;
            seen = [];
            c.onCancelled();
            expect(seen).toEqual([]);
        });

        it('lets the buyer check out again after cancelling', async () => {
            const c = create();
            await c.ngOnInit();
            c.onCancelled();
            seen = [];
            await c.onSubmitted(submission());
            expect(seen.map((e) => e.type)).toEqual(['checkout-state-change', 'checkout-state-change', 'checkout-complete']);
        });
    });

    describe('embedded in another widget', () => {
        let attrs: Record<string, string>;
        let removed: string[];
        let drafts: Array<Record<string, unknown>>;
        let inits: number;

        beforeEach(() => {
            attrs = {};
            removed = [];
            drafts = [];
            inits = 0;
            host.getAttribute = (name: string) => attrs[name] ?? null;
            vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: (k: string) => removed.push(k) });
            const base = vi.mocked(fetch).getMockImplementation()!;
            vi.stubGlobal(
                'fetch',
                vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
                    if (url.endsWith('/draft')) drafts.push(JSON.parse(init?.body ?? '{}'));
                    if (url.endsWith('/initialize')) inits++;
                    return base(url, init);
                })
            );
        });

        it('passes the known e-mail to the form and the attribution to the draft', async () => {
            attrs = { email: 'caller@example.com', source: 'voice_agent', 'source-ref': 'conv-9' };
            const c = create();
            await c.ngOnInit();
            expect(c.prefillEmail).toBe('caller@example.com');
            await c.onSubmitted(submission());
            expect(drafts[0].attribution).toEqual({ source: 'voice_agent', reference: 'conv-9' });
        });

        it('sends no attribution when the host names no source', async () => {
            const c = create();
            await c.ngOnInit();
            await c.onSubmitted(submission());
            expect(drafts[0]).not.toHaveProperty('attribution');
        });

        it('resets on checkout-reset without the Cancel events', async () => {
            responses['/draft'] = { Success: false, ErrorMessage: 'Could not price this checkout.' };
            const c = create();
            await c.ngOnInit();
            await c.onSubmitted(submission());
            const before = c.formGeneration;
            seen = [];
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            expect(c.errorMessage).toBeNull();
            expect(c.formGeneration).toBe(before + 1);
            expect(seen).toEqual([{ type: 'checkout-state-change', detail: { state: 'CHECKOUT' } }]);
        });

        it('refuses a reset while a payment is in flight', async () => {
            const c = create();
            await c.ngOnInit();
            c.processing = true;
            seen = [];
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            expect(seen).toEqual([{ type: 'checkout-reset-refused', detail: { state: 'CHECKOUT' } }]);
        });

        it('after a completed sale, starts over with a new session', async () => {
            const c = create();
            await c.ngOnInit();
            await c.onSubmitted(submission());
            expect(c.successMessage).toBeTruthy();
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            await new Promise((r) => setTimeout(r, 0));
            expect(removed).toEqual(['mj-checkout-key:annual']);
            expect(inits).toBe(2);
            expect(c.successMessage).toBeNull();
            expect(c.config).not.toBeNull();
        });
    });
});
