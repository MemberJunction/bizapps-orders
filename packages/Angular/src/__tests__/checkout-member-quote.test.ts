/**
 * A verified member's discount priced in the background, before Pay (#919).
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef, ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { memberDiscountFromDraft } from '../lib/checkout-widget/checkout-draft-line';
import { CheckoutPublicHostComponent } from '../lib/checkout-widget/checkout-public-host.component';
import type { CheckoutSubmissionEvent } from '../lib/checkout-widget/checkout-widget.component';

const DISCOUNTED = {
    Success: true,
    TotalGross: 539.1,
    Tax: 0,
    Discount: 59.9,
    RequiresPayment: true,
    AppliedPromotionCodes: ['ASAE10'],
    UnusablePromotionCodes: [],
    MemberDiscountApplied: true,
};
const NOT_EARNED = {
    Success: true,
    TotalGross: 599,
    Tax: 0,
    Discount: 0,
    RequiresPayment: true,
    AppliedPromotionCodes: [],
    UnusablePromotionCodes: [],
    MemberDiscountApplied: false,
    MemberDiscountMessage: 'Membership has lapsed.',
};

describe('memberDiscountFromDraft', () => {
    it('reads the applied member code, its discount and the total', () => {
        expect(memberDiscountFromDraft(DISCOUNTED, 1)).toEqual({ code: 'ASAE10', discount: 59.9, total: 539.1, quantity: 1 });
    });

    it('is null when the token earned nothing, no token was sent, or the draft failed', () => {
        expect(memberDiscountFromDraft(NOT_EARNED, 1)).toBeNull();
        expect(memberDiscountFromDraft({ Success: true, TotalGross: 599 }, 1)).toBeNull();
        expect(memberDiscountFromDraft({ Success: false, MemberDiscountApplied: true }, 1)).toBeNull();
        expect(memberDiscountFromDraft(null, 1)).toBeNull();
    });

    it('leaves the code empty when the server names none', () => {
        expect(memberDiscountFromDraft({ ...DISCOUNTED, AppliedPromotionCodes: [] }, 2)?.code).toBe('');
    });
});

describe('CheckoutPublicHostComponent background member quote', () => {
    const CONFIG = { productId: 'prod-1', productName: 'Annual Plan', currency: 'usd', unitPrice: 599, allowCoupons: true };
    let posts: Array<{ path: string; body: Record<string, unknown> }>;
    /** Replies to `/draft` in order; a function is called when the request arrives. */
    let draftReplies: Array<Record<string, unknown> | Promise<Record<string, unknown>> | (() => Promise<Record<string, unknown>>)>;
    let responses: Record<string, Record<string, unknown>>;

    const submission = (overrides: Partial<CheckoutSubmissionEvent> = {}): CheckoutSubmissionEvent => ({
        email: 'jane@example.com',
        quantity: 1,
        billingAddress: { Country: 'US', StateProvince: 'IL', PostalCode: '60601' },
        attendees: [],
        extensionData: { entityName: '', fields: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' } },
        totalGross: 599,
        answers: {},
        choices: {},
        sessionKey: 'k',
        ...overrides,
    });

    const create = async (attributes: Record<string, string> = {}): Promise<CheckoutPublicHostComponent> => {
        const host = Object.assign(new EventTarget(), { getAttribute: (name: string) => attributes[name] ?? null });
        const injector = Injector.create({
            providers: [
                { provide: ElementRef, useValue: new ElementRef(host) },
                { provide: ChangeDetectorRef, useValue: { detectChanges: () => undefined } },
            ],
        });
        const c = runInInjectionContext(injector, () => new CheckoutPublicHostComponent());
        c.slug = 'annual';
        await c.ngOnInit();
        posts = [];
        return c;
    };

    const draftPosts = () => posts.filter((p) => p.path === '/draft');

    beforeEach(() => {
        vi.useFakeTimers();
        posts = [];
        draftReplies = [];
        responses = {
            '/initialize': { Success: true, SessionID: 'sess-1', Configuration: CONFIG },
            '/payment-intent': { Success: true, Status: 'Succeeded' },
            '/complete': { Success: true, OrderNumber: 'SO-1', TotalGross: 539.1 },
        };
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async (url: string, init: { body: string }) => {
                const path = url.replace('/checkout', '');
                posts.push({ path, body: JSON.parse(init.body) });
                const next = path === '/draft' ? draftReplies.shift() ?? DISCOUNTED : responses[path] ?? { Success: false };
                const json = await (typeof next === 'function' ? next() : next);
                return { status: 200, json: () => Promise.resolve({ ...json }) };
            })
        );
        vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('sends nothing without a member token', async () => {
        const c = await create();
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(1000);
        expect(posts).toEqual([]);
        expect(c.memberDiscount).toBeNull();
    });

    it('drafts once, after the form is still, with the token and no typed code', async () => {
        const c = await create({ 'member-token': 'tok-1' });
        c.onQuoteRequested(submission());
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(399);
        expect(posts).toEqual([]);
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(400);
        expect(draftPosts()).toHaveLength(1);
        expect(draftPosts()[0].body).toEqual(expect.objectContaining({
            memberToken: 'tok-1',
            promotionCodes: [],
            email: 'jane@example.com',
            billingAddress: { Country: 'US', StateProvince: 'IL', PostalCode: '60601' },
            lines: [expect.objectContaining({ ProductID: 'prod-1', Quantity: 1 })],
        }));
    });

    it('shows the member discount and the discounted total, so one press of Pay charges it', async () => {
        const c = await create({ 'member-token': 'tok-1', email: 'jane@example.com' });
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(400);
        expect(c.memberDiscount).toEqual({ code: 'ASAE10', discount: 59.9, total: 539.1, quantity: 1 });
        expect(c.serverPricedTotal).toEqual({ total: 539.1, quantity: 1 });
        expect(c.errorMessage).toBeNull();

        posts = [];
        await c.onSubmitted(submission({ totalGross: 539.1 }));
        expect(posts.map((p) => p.path).slice(0, 3)).toEqual(['/draft', '/payment-intent', '/complete']);
        expect(c.successMessage).toContain('SO-1');
    });

    it('keeps the full price and leaves the notice to Pay when the token earned nothing', async () => {
        const c = await create({ 'member-token': 'tok-1' });
        draftReplies.push(NOT_EARNED);
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(400);
        expect(c.memberDiscount).toBeNull();
        expect(c.serverPricedTotal).toBeNull();
        expect(c.errorMessage).toBeNull();

        draftReplies.push(NOT_EARNED);
        await c.onSubmitted(submission());
        expect(c.errorMessage).toBeNull();
        expect(c.noticeMessage).toBe('Membership has lapsed. Submit again to continue at the standard rate.');
        expect(posts.map((p) => p.path)).not.toContain('/payment-intent');
    });

    it('leaves the price as it is when the background draft fails', async () => {
        const c = await create({ 'member-token': 'tok-1' });
        draftReplies.push(() => Promise.reject(new Error('network')));
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(400);
        expect(c.memberDiscount).toBeNull();
        expect(c.errorMessage).toBeNull();
        expect(c.processing).toBe(false);
    });

    it('drops an answer for details that have since changed', async () => {
        const c = await create({ 'member-token': 'tok-1' });
        let release!: (v: Record<string, unknown>) => void;
        draftReplies.push(new Promise((resolve) => (release = resolve)));
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(400);
        expect(draftPosts()).toHaveLength(1);

        c.onQuoteInvalidated();
        release(DISCOUNTED);
        await vi.advanceTimersByTimeAsync(0);
        expect(c.memberDiscount).toBeNull();
        expect(c.serverPricedTotal).toBeNull();
    });

    it('keeps the newer answer when an older one arrives last', async () => {
        const c = await create({ 'member-token': 'tok-1' });
        let releaseOld!: (v: Record<string, unknown>) => void;
        draftReplies.push(new Promise((resolve) => (releaseOld = resolve)));
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(400);

        draftReplies.push({ ...DISCOUNTED, TotalGross: 1078.2, Discount: 119.8 });
        c.onQuoteRequested(submission({ quantity: 2 }));
        await vi.advanceTimersByTimeAsync(400);
        expect(c.memberDiscount?.total).toBe(1078.2);

        releaseOld(DISCOUNTED);
        await vi.advanceTimersByTimeAsync(0);
        expect(c.memberDiscount).toEqual({ code: 'ASAE10', discount: 119.8, total: 1078.2, quantity: 2 });
    });

    it('Pay waits for every background draft already sent, not only the latest, before its own draft', async () => {
        const c = await create({ 'member-token': 'tok-1' });
        let releaseOld!: (v: Record<string, unknown>) => void;
        draftReplies.push(new Promise((resolve) => (releaseOld = resolve)));
        c.onQuoteRequested(submission());
        await vi.advanceTimersByTimeAsync(400);
        draftReplies.push(DISCOUNTED);
        c.onQuoteRequested(submission({ quantity: 2 }));
        await vi.advanceTimersByTimeAsync(400);
        expect(draftPosts()).toHaveLength(2);

        // The first background draft is still on the server when the buyer presses Pay.
        const pay = c.onSubmitted(submission({ totalGross: 539.1 }));
        await vi.advanceTimersByTimeAsync(0);
        expect(draftPosts()).toHaveLength(2);

        releaseOld(DISCOUNTED);
        await pay;
        const paths = posts.map((p) => p.path);
        expect(paths.filter((p) => p === '/draft')).toHaveLength(3);
        expect(paths.indexOf('/payment-intent')).toBeGreaterThan(paths.lastIndexOf('/draft'));
    });

    it('locks the e-mail only when a token is attached and the host supplied the address', async () => {
        expect((await create({ 'member-token': 'tok-1', email: 'jane@example.com' })).emailLocked).toBe(true);
        expect((await create({ 'member-token': 'tok-1' })).emailLocked).toBe(false);
        expect((await create({ email: 'jane@example.com' })).emailLocked).toBe(false);
    });
});
