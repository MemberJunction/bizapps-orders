/**
 * The pay-renewal mode of the public checkout (#289): the update-card link's page pays an open
 * renewal order, with no product and no draft.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef, ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { CheckoutPublicHostComponent } from '../lib/checkout-widget/checkout-public-host.component';
import { FormatRenewalAmount, ReadRenewalPayment, RenewalPaidMessage } from '../lib/checkout-widget/checkout-renewal';

const RENEWAL = { OrderNumber: 'ORD-000123', Amount: 1200, Description: 'Annual Plan', SubscriptionNumber: 'SUB-000045', DueDate: '2027-01-01' };

describe('ReadRenewalPayment', () => {
    it('reads the renewal an /initialize response describes', () => {
        expect(ReadRenewalPayment({ Success: true, RenewalPayment: RENEWAL })).toEqual(RENEWAL);
    });

    it('is null for an ordinary checkout, or a renewal with nothing to pay', () => {
        expect(ReadRenewalPayment({ Success: true })).toBeNull();
        expect(ReadRenewalPayment({ RenewalPayment: { ...RENEWAL, Amount: 0 } })).toBeNull();
        expect(ReadRenewalPayment({ RenewalPayment: { ...RENEWAL, OrderNumber: '' } })).toBeNull();
        expect(ReadRenewalPayment(null)).toBeNull();
    });

    it('rounds the amount to cents and blanks what is missing', () => {
        expect(ReadRenewalPayment({ RenewalPayment: { OrderNumber: 'ORD-1', Amount: 99.999 } })).toEqual({
            OrderNumber: 'ORD-1',
            Amount: 100,
            Description: '',
            SubscriptionNumber: null,
            DueDate: null,
        });
    });

    it('formats the amount and the paid message', () => {
        expect(FormatRenewalAmount(1200, 'usd')).toBe('1200.00 USD');
        expect(FormatRenewalAmount(5.5)).toBe('5.50');
        expect(RenewalPaidMessage(RENEWAL)).toContain('ORD-000123 is paid');
    });
});

describe('CheckoutPublicHostComponent — pay-renewal mode', () => {
    let host: EventTarget & { getAttribute(name: string): string | null };
    let seen: Array<{ type: string; detail: unknown }>;
    let responses: Record<string, Record<string, unknown>>;
    let calls: Array<{ path: string; body: Record<string, unknown> }>;

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
        host = Object.assign(target, {
            getAttribute: (name: string) => (name === 'renewal-token' ? 'signed.token' : null),
        });
        seen = [];
        calls = [];
        for (const type of ['checkout-state-change', 'checkout-complete', 'checkout-error']) {
            host.addEventListener(type, (e) => seen.push({ type, detail: (e as CustomEvent).detail }));
        }
        responses = {
            '/initialize': { Success: true, SessionID: 'sess-r', Configuration: { currency: 'usd' }, RenewalPayment: RENEWAL },
            '/payment-intent': { Success: true, Status: 'Succeeded' },
            '/complete': { Success: true, OrderID: 'order-1', OrderNumber: 'ORD-000123', TotalGross: 1200 },
        };
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string, init: { body: string }) => {
                const path = url.replace('/checkout', '');
                calls.push({ path, body: JSON.parse(init.body) as Record<string, unknown> });
                return Promise.resolve({ status: 200, json: () => Promise.resolve({ ...(responses[path] ?? { Success: false }) }) });
            })
        );
        vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('opens the session with the link token and shows the renewal, with no product configured', async () => {
        const c = create();
        await c.ngOnInit();
        expect(calls[0]).toEqual({ path: '/initialize', body: expect.objectContaining({ slug: 'annual', renewalToken: 'signed.token' }) });
        expect(c.loadError).toBeNull();
        expect(c.renewal).toEqual(RENEWAL);
        expect(c.renewalAmount).toBe('1200.00 USD');
    });

    it('shows the server refusal of a used or expired link', async () => {
        responses['/initialize'] = { Success: false, ErrorMessage: 'This renewal is already paid.' };
        const c = create();
        await c.ngOnInit();
        expect(c.loadError).toBe('This renewal is already paid.');
        expect(c.renewal).toBeNull();
    });

    it('refuses a link whose session describes no renewal', async () => {
        responses['/initialize'] = { Success: true, SessionID: 'sess-r', Configuration: {} };
        const c = create();
        await c.ngOnInit();
        expect(c.loadError).toBe('This renewal cannot be paid here.');
    });

    it('pays through payment-intent and complete, never drafting, and reports the renewal paid', async () => {
        const c = create();
        await c.ngOnInit();
        seen = [];
        await c.payRenewal();
        expect(calls.map((x) => x.path)).toEqual(['/initialize', '/payment-intent', '/complete']);
        expect(c.successMessage).toBe(RenewalPaidMessage(RENEWAL));
        expect(seen.map((e) => e.type)).toEqual(['checkout-state-change', 'checkout-state-change', 'checkout-complete']);
        expect(seen[1]).toEqual({ type: 'checkout-state-change', detail: { state: 'SUCCESS' } });
        expect(seen[2].detail).toEqual({ sessionId: 'sess-r', productName: 'Annual Plan', productId: null, amount: 1200, currency: 'USD', coupon: null });
    });

    it('confirms the new card with Stripe when the intent still needs it', async () => {
        responses['/payment-intent'] = { Success: true, Status: 'RequiresPayment', ClientSecret: 'pi_x_secret' };
        const c = create();
        await c.ngOnInit();
        const confirm = vi.fn().mockResolvedValue({ paymentIntent: { status: 'succeeded' } });
        const card = { mount: () => undefined, on: () => undefined };
        Object.assign(c as unknown as Record<string, unknown>, { stripe: { confirmCardPayment: confirm }, card });
        await c.payRenewal();
        expect(confirm).toHaveBeenCalledWith('pi_x_secret', { payment_method: { card } });
        expect(c.successMessage).not.toBeNull();
    });

    it('shows a declined new card and stays on the page', async () => {
        responses['/payment-intent'] = { Success: true, Status: 'RequiresPayment', ClientSecret: 'pi_x_secret' };
        const c = create();
        await c.ngOnInit();
        const confirm = vi.fn().mockResolvedValue({ error: { message: 'Your card was declined.', code: 'card_declined' } });
        Object.assign(c as unknown as Record<string, unknown>, { stripe: { confirmCardPayment: confirm }, card: { mount: () => undefined, on: () => undefined } });
        await c.payRenewal();
        expect(c.errorMessage).toBe('Your card was declined.');
        expect(c.successMessage).toBeNull();
        expect(calls.some((x) => x.path === '/complete')).toBe(false);
    });
});
