/**
 * Whether the buyer's access is ready, on the public checkout's success screen (#325).
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef, ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { AccessMessage, IsFinalAccessState, ReadAccessState } from '../lib/checkout-widget/checkout-access';
import { CheckoutPublicHostComponent } from '../lib/checkout-widget/checkout-public-host.component';
import type { CheckoutSubmissionEvent } from '../lib/checkout-widget/checkout-widget.component';

describe('access helpers', () => {
    it('reads the state from a successful response only', () => {
        expect(ReadAccessState({ Success: true, State: 'Pending' })).toBe('Pending');
        expect(ReadAccessState({ Success: false, State: 'Ready' })).toBeNull();
        expect(ReadAccessState({ Success: true, State: 'Nope' })).toBeNull();
        expect(ReadAccessState(null)).toBeNull();
    });

    it('uses the configured copy, falling back to the defaults, and says nothing when untracked', () => {
        expect(AccessMessage('Pending', null)).toContain('being set up');
        expect(AccessMessage('Ready', { ready: 'All set — start learning.' })).toBe('All set — start learning.');
        expect(AccessMessage('Failed', { failed: '  ' })).toContain('contact support');
        expect(AccessMessage('NotTracked', { ready: 'x' })).toBeNull();
        expect(AccessMessage(null)).toBeNull();
    });

    it('stops asking once the state is final', () => {
        expect(IsFinalAccessState('Pending')).toBe(false);
        expect(IsFinalAccessState('Ready')).toBe(true);
        expect(IsFinalAccessState('Failed')).toBe(true);
        expect(IsFinalAccessState('NotTracked')).toBe(true);
    });
});

describe('CheckoutPublicHostComponent access status', () => {
    let host: EventTarget & { getAttribute(name: string): string | null };
    let seen: Array<{ state: string }>;
    let accessAnswers: Array<Record<string, unknown>>;
    let accessCalls: number;

    const create = (): CheckoutPublicHostComponent => {
        const injector = Injector.create({
            providers: [
                { provide: ElementRef, useValue: new ElementRef(host) },
                { provide: ChangeDetectorRef, useValue: { detectChanges: () => undefined } },
            ],
        });
        const c = runInInjectionContext(injector, () => new CheckoutPublicHostComponent());
        c.slug = 'annual';
        c.accessPollIntervalMs = 0;
        return c;
    };
    const submission = () =>
        ({ email: 'a@b.com', quantity: 1, extensionData: { entityName: '', fields: {} }, totalGross: 0, sessionKey: 'k' }) as unknown as CheckoutSubmissionEvent;

    beforeEach(() => {
        host = Object.assign(new EventTarget(), { getAttribute: () => null });
        seen = [];
        host.addEventListener('checkout-access-state', (e) => seen.push((e as CustomEvent).detail));
        accessCalls = 0;
        accessAnswers = [];
        const responses: Record<string, Record<string, unknown>> = {
            '/initialize': { Success: true, SessionID: 'sess-1', Configuration: { productId: 'p-1', unitPrice: 0, accessMessages: { failed: 'Email help@example.com' } } },
            '/draft': { Success: true, RequiresPayment: false },
            '/complete': { Success: true, OrderNumber: 'SO-1' },
        };
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) => {
                const path = url.replace('/checkout', '');
                let body: Record<string, unknown>;
                if (path === '/access-status') {
                    body = accessAnswers[Math.min(accessCalls, accessAnswers.length - 1)] ?? { Success: false };
                    accessCalls++;
                } else body = responses[path] ?? { Success: false };
                return Promise.resolve({ status: 200, json: () => Promise.resolve({ ...body }) });
            })
        );
        vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined });
    });

    afterEach(() => vi.unstubAllGlobals());

    const checkout = async () => {
        const c = create();
        await c.ngOnInit();
        await c.onSubmitted(submission());
        return c;
    };

    it('shows "being set up", then "ready", and reports each state once', async () => {
        accessAnswers = [{ Success: true, State: 'Pending' }, { Success: true, State: 'Pending' }, { Success: true, State: 'Ready' }];
        const c = await checkout();
        expect(accessCalls).toBe(3);
        expect(seen).toEqual([{ state: 'Pending' }, { state: 'Ready' }]);
        expect(c.accessMessage).toBe('Your access is ready.');
    });

    it('shows the configured support text on failure', async () => {
        accessAnswers = [{ Success: true, State: 'Failed' }];
        const c = await checkout();
        expect(c.accessMessage).toBe('Email help@example.com');
        expect(seen).toEqual([{ state: 'Failed' }]);
    });

    it('changes nothing when access is not tracked', async () => {
        accessAnswers = [{ Success: true, State: 'NotTracked' }];
        const c = await checkout();
        expect(accessCalls).toBe(1);
        expect(c.accessMessage).toBeNull();
        expect(seen).toEqual([]);
        expect(c.successMessage).toContain('SO-1');
    });

    it('stops asking when the wait runs out', async () => {
        accessAnswers = [{ Success: true, State: 'Pending' }];
        const c = create();
        c.accessPollTimeoutMs = 0;
        await c.ngOnInit();
        await c.onSubmitted(submission());
        expect(accessCalls).toBe(1);
        expect(c.accessMessage).toContain('being set up');
    });
});
