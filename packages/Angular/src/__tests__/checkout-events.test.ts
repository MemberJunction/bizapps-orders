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

    it('reports the applied promotion code as the coupon (#583)', async () => {
        responses['/draft'] = { Success: true, RequiresPayment: false, AppliedPromotionCodes: ['SPRING10'], Discount: 0, TotalGross: 0 };
        const c = create();
        await c.ngOnInit();
        await c.onSubmitted({ ...submission(), promotionCode: 'spring10' } as CheckoutSubmissionEvent);
        expect((seen.find((e) => e.type === 'checkout-complete')?.detail as { coupon: string | null }).coupon).toBe('SPRING10');
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

    describe('/complete outlasting the gateway in front of the server', () => {
        const GATEWAY_504 = {
            status: 504,
            json: () => Promise.reject(new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`)),
        };

        /** Answers /complete from `replies` in turn; every other path as the suite does. */
        const completeAnswers = (replies: unknown[]): void => {
            const base = vi.mocked(fetch).getMockImplementation()!;
            let i = 0;
            vi.mocked(fetch).mockImplementation((url: string, init?: RequestInit) => {
                if (!url.endsWith('/complete')) return base(url, init);
                const reply = replies[Math.min(i++, replies.length - 1)];
                return Promise.resolve(reply === GATEWAY_504 ? reply : { status: 200, json: () => Promise.resolve(reply) });
            });
        };

        it('waits, asks again, and reports the sale once the order is confirmed', async () => {
            completeAnswers([
                GATEWAY_504,
                { Success: false, Status: 'Processing', ErrorMessage: 'Session is not in an Open status' },
                { Success: true, Status: 'Confirmed', OrderNumber: 'SO-1', TotalGross: 0 },
            ]);
            const c = create();
            c.completeRetryIntervalMs = 0;
            await c.ngOnInit();
            seen = [];
            await c.onSubmitted(submission());
            expect(seen.map((e) => e.type)).toEqual(['checkout-state-change', 'checkout-state-change', 'checkout-complete']);
            expect(c.orderNumber).toBe('SO-1');
            expect(c.finishingMessage).toBeNull();
            expect(c.errorMessage).toBeNull();
            expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/complete'))).toHaveLength(3);
        });

        it('tells a paid buyer not to pay again, never a parser error, when the wait runs out', async () => {
            completeAnswers([GATEWAY_504]);
            const c = create();
            c.completeRetryIntervalMs = 0;
            c.completeRetryTimeoutMs = 0;
            await c.ngOnInit();
            seen = [];
            await c.onSubmitted(submission());
            expect(c.finishingMessage).toContain('Please do not pay again.');
            expect(c.errorMessage).toBeNull();
            expect(seen.some((e) => e.type === 'checkout-error')).toBe(false);
            expect(JSON.stringify(seen)).not.toContain('Unexpected token');
        });
    });

    describe('account step password form (#396)', () => {
        const SALE = [
            { type: 'checkout-state-change', detail: { state: 'PROCESSING' } },
            { type: 'checkout-state-change', detail: { state: 'SUCCESS' } },
            {
                type: 'checkout-complete',
                detail: { sessionId: 'sess-1', productName: 'Annual Plan', productId: 'prod-1', amount: 0, currency: 'USD', coupon: null },
            },
        ];

        beforeEach(() => {
            responses['/complete'] = { Success: true, OrderNumber: 'SO-1', TotalGross: 0, AccountStep: true };
            responses['/account'] = { Success: true, Account: { Outcome: 'Created', CanSetPassword: true } };
            vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
        });

        const sold = async (): Promise<CheckoutPublicHostComponent> => {
            const c = create();
            await c.ngOnInit();
            seen = [];
            await c.onSubmitted(submission());
            return c;
        };

        it('reports PASSWORD after the sale while the form shows, then SUCCESS once the password is set', async () => {
            const c = await sold();
            expect(seen).toEqual([...SALE, { type: 'checkout-state-change', detail: { state: 'PASSWORD' } }]);
            responses['/account/password'] = { Success: true, Account: { Outcome: 'Created', CanSetPassword: false } };
            c.password = 'pw-1';
            c.passwordConfirmation = 'pw-1';
            seen = [];
            await c.submitPassword();
            expect(seen).toEqual([{ type: 'checkout-state-change', detail: { state: 'SUCCESS' } }]);
        });

        it('stays in PASSWORD when the password is refused', async () => {
            const c = await sold();
            responses['/account/password'] = { Success: false, ErrorMessage: 'Too short.', Account: { Outcome: 'Created', CanSetPassword: true } };
            c.password = 'x';
            c.passwordConfirmation = 'x';
            seen = [];
            await c.submitPassword();
            expect(seen).toEqual([]);
        });

        it('reports SUCCESS when the buyer skips the password', async () => {
            const c = await sold();
            seen = [];
            c.skipPassword();
            expect(seen).toEqual([{ type: 'checkout-state-change', detail: { state: 'SUCCESS' } }]);
        });

        it('sends no PASSWORD when the account step offers no password', async () => {
            responses['/account'] = { Success: true, Account: { Outcome: 'Exists', CanSetPassword: false } };
            await sold();
            expect(seen).toEqual(SALE);
        });

        it('reports PASSWORD on a reload that returns to the form', async () => {
            vi.stubGlobal('sessionStorage', {
                getItem: (k: string) => (k === 'mj-checkout-completing:annual' ? 'sess-1' : null),
                setItem: () => undefined,
                removeItem: () => undefined,
            });
            const c = create();
            await c.ngOnInit();
            expect(seen).toEqual([{ type: 'checkout-state-change', detail: { state: 'PASSWORD' } }]);
            seen = [];
            c.skipPassword();
            expect(seen).toEqual([{ type: 'checkout-state-change', detail: { state: 'SUCCESS' } }]);
        });
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

        it('after a failed payment, resets without the Cancel events and starts a new session', async () => {
            responses['/draft'] = { Success: false, ErrorMessage: 'Could not price this checkout.' };
            const c = create();
            await c.ngOnInit();
            await c.onSubmitted(submission());
            const before = c.formGeneration;
            seen = [];
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            await new Promise((r) => setTimeout(r, 0));
            expect(c.errorMessage).toBeNull();
            expect(c.formGeneration).toBe(before + 1);
            expect(seen).toEqual([
                { type: 'checkout-state-change', detail: { state: 'LOADING' } },
                { type: 'checkout-state-change', detail: { state: 'CHECKOUT' } },
            ]);
            expect(removed).toContain('mj-checkout-key:annual');
            expect(inits).toBe(2);
        });

        it('clears the load error when a reset after a failed one loads (#397)', async () => {
            const c = create();
            await c.ngOnInit();
            responses['/initialize'] = { Success: false, ErrorMessage: 'This checkout is not available.' };
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            await new Promise((r) => setTimeout(r, 0));
            expect(c.loadError).toBe('This checkout is not available.');

            responses['/initialize'] = { Success: true, SessionID: 'sess-2', Configuration: CONFIG };
            seen = [];
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            await new Promise((r) => setTimeout(r, 0));
            expect(c.loadError).toBeNull();
            expect(c.config).not.toBeNull();
            expect(seen).toEqual([
                { type: 'checkout-state-change', detail: { state: 'LOADING' } },
                { type: 'checkout-state-change', detail: { state: 'CHECKOUT' } },
            ]);
            expect(inits).toBe(3);
        });

        it('a reset takes the e-mail and attribution the host set for the next conversation', async () => {
            attrs = { email: 'first@example.com', source: 'voice_agent', 'source-ref': 'conv-1' };
            const c = create();
            await c.ngOnInit();
            attrs = { email: 'second@example.com', source: 'chat_agent', 'source-ref': 'conv-2' };
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            await new Promise((r) => setTimeout(r, 0));
            expect(c.prefillEmail).toBe('second@example.com');
            await c.onSubmitted(submission());
            expect(drafts[0].attribution).toEqual({ source: 'chat_agent', reference: 'conv-2' });
        });

        it('refuses a reset while a payment is in flight', async () => {
            const c = create();
            await c.ngOnInit();
            c.processing = true;
            seen = [];
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            expect(seen).toEqual([{ type: 'checkout-reset-refused', detail: { state: 'CHECKOUT' } }]);
        });

        it('refuses a reset while the account step after a sale is unsettled', async () => {
            responses['/complete'] = { Success: true, OrderNumber: 'SO-1', TotalGross: 0, AccountStep: true };
            responses['/account'] = { Success: true, Account: { Outcome: 'Created', CanSetPassword: true } };
            const c = create();
            await c.ngOnInit();
            await c.onSubmitted(submission());
            expect(c.account?.CanSetPassword).toBe(true);
            seen = [];
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            expect(seen).toEqual([{ type: 'checkout-reset-refused', detail: { state: 'PASSWORD' } }]);
            expect(inits).toBe(1);

            c.skipPassword();
            seen = [];
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            await new Promise((r) => setTimeout(r, 0));
            expect(inits).toBe(2);
            expect(c.account).toBeNull();
            expect(c.successMessage).toBeNull();
        });

        it('after a completed sale, starts over with a new session', async () => {
            const c = create();
            await c.ngOnInit();
            await c.onSubmitted(submission());
            expect(c.successMessage).toBeTruthy();
            seen = [];
            host.dispatchEvent(new CustomEvent('checkout-reset'));
            await new Promise((r) => setTimeout(r, 0));
            expect(seen).toEqual([
                { type: 'checkout-state-change', detail: { state: 'LOADING' } },
                { type: 'checkout-state-change', detail: { state: 'CHECKOUT' } },
            ]);
            expect(removed).toContain('mj-checkout-key:annual');
            expect(inits).toBe(2);
            expect(c.successMessage).toBeNull();
            expect(c.config).not.toBeNull();
        });
    });

    describe('after the host removes the element', () => {
        let calls: string[];
        let stored: Record<string, string>;
        let location: { href: string };
        let onAccessStatus: () => void;

        beforeEach(() => {
            calls = [];
            stored = {};
            onAccessStatus = () => undefined;
            location = { href: 'https://shop.example/buy' };
            vi.stubGlobal('window', { location });
            vi.stubGlobal('sessionStorage', {
                getItem: (k: string) => stored[k] ?? null,
                setItem: (k: string, v: string) => void (stored[k] = v),
                removeItem: (k: string) => void delete stored[k],
            });
            responses['/initialize'] = { Success: true, SessionID: 'sess-1', Configuration: { ...CONFIG, redirectUrl: 'https://shop.example/thanks' } };
            const base = vi.mocked(fetch).getMockImplementation()!;
            vi.stubGlobal(
                'fetch',
                vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
                    const path = url.replace('/checkout', '');
                    calls.push(path);
                    if (path === '/access-status') onAccessStatus();
                    return base(url, init);
                })
            );
        });

        /** Holds `/complete` until the test lets it answer, and says when it was asked. */
        const holdComplete = () => {
            let release!: () => void;
            let asked!: () => void;
            const wasAsked = new Promise<void>((r) => (asked = r));
            const gate = new Promise<void>((r) => (release = r));
            const base = vi.mocked(fetch).getMockImplementation()!;
            vi.mocked(fetch).mockImplementation(async (url: string, init?: { body?: string }) => {
                if (String(url).endsWith('/complete')) {
                    asked();
                    await gate;
                }
                return base(url, init);
            });
            return { release, wasAsked };
        };

        it('still completes a sale removed mid-/complete, but sends no event and does not redirect', async () => {
            const c = create();
            await c.ngOnInit();
            seen = [];
            const { release, wasAsked } = holdComplete();
            const run = c.onSubmitted(submission());
            await wasAsked;
            c.ngOnDestroy();
            release();
            await run;
            expect(calls).toContain('/complete');
            expect(seen).toEqual([{ type: 'checkout-state-change', detail: { state: 'PROCESSING' } }]);
            expect(calls).not.toContain('/access-status');
            expect(location.href).toBe('https://shop.example/buy');
        });

        it('skips the account step but keeps the marker that lets a reload resume it', async () => {
            responses['/complete'] = { Success: true, OrderNumber: 'SO-1', TotalGross: 0, AccountStep: true };
            const c = create();
            await c.ngOnInit();
            const { release, wasAsked } = holdComplete();
            const run = c.onSubmitted(submission());
            await wasAsked;
            c.ngOnDestroy();
            release();
            await run;
            expect(calls).not.toContain('/account');
            expect(stored['mj-checkout-completing:annual']).toBe('sess-1');
        });

        it('stops polling for access once removed', async () => {
            const c = create();
            c.accessPollIntervalMs = 0;
            let answers = 0;
            responses['/access-status'] = { Success: true, State: 'Pending' };
            onAccessStatus = () => {
                answers++;
                c.ngOnDestroy();
            };
            await c.ngOnInit();
            seen = [];
            await c.onSubmitted(submission());
            expect(answers).toBe(1);
            expect(calls.filter((p) => p === '/access-status')).toHaveLength(1);
            expect(location.href).toBe('https://shop.example/buy');
        });
    });
});
