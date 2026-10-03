/**
 * The pre-purchase checks a self-serve checkout runs (#323): the built-in held-subscription rule
 * and the host seam registered through the ClassFactory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';

const mocks = vi.hoisted(() => ({
    subscriptionResults: [] as Array<{ ProductID: string; Product: string }>,
    subscriptionSuccess: true,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        RunView: class {
            RunView = vi.fn().mockImplementation(() =>
                Promise.resolve({
                    Success: mocks.subscriptionSuccess,
                    ErrorMessage: mocks.subscriptionSuccess ? undefined : 'database unavailable',
                    Results: mocks.subscriptionResults,
                }),
            );
        },
    };
});

import {
    ALREADY_SUBSCRIBED_REASON,
    CheckoutPrePurchaseCheck,
    RunPrePurchaseChecks,
    type PrePurchaseContext,
    type PrePurchaseVerdict,
} from '../CheckoutPrePurchaseCheck.js';

const context = (overrides: Partial<PrePurchaseContext> = {}): PrePurchaseContext => ({
    Email: 'buyer@example.com',
    PersonID: 'person-1',
    CompanyID: 'comp-1',
    Lines: [{ ProductID: 'prod-1', Quantity: 1 }],
    ...overrides,
});

/** Stands in for a host registration; `verdict` is swapped per test. */
let hostCheck: ((ctx: PrePurchaseContext) => Promise<PrePurchaseVerdict>) | null = null;

class TestHostCheck extends CheckoutPrePurchaseCheck {
    public override async Check(ctx: PrePurchaseContext): Promise<PrePurchaseVerdict> {
        return hostCheck ? hostCheck(ctx) : { Allowed: true };
    }
}

describe('RunPrePurchaseChecks', () => {
    let createInstance: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mocks.subscriptionResults = [];
        mocks.subscriptionSuccess = true;
        hostCheck = null;
        createInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance');
    });

    afterEach(() => {
        createInstance.mockRestore();
    });

    it('with no host check registered, only the built-in rule applies', async () => {
        expect(await RunPrePurchaseChecks(context())).toBeNull();

        mocks.subscriptionResults = [{ ProductID: 'prod-1', Product: 'Annual Membership' }];
        const refused = await RunPrePurchaseChecks(context());
        expect(refused?.Refusal).toEqual({ Code: 'AlreadySubscribed', Source: 'built-in', ProductIDs: ['prod-1'] });
    });

    it('a registered check that refuses blocks the purchase with its message', async () => {
        createInstance.mockReturnValue(new TestHostCheck());
        hostCheck = async () => ({ Allowed: false, Message: 'Not available to your account.' });

        const refused = await RunPrePurchaseChecks(context());

        expect(refused?.Message).toBe('Not available to your account.');
        expect(refused?.Refusal).toEqual({ Code: 'HostRefused', Source: 'host', ProductIDs: [] });
    });

    it('a host refusal with the already-subscribed reason is reported as AlreadySubscribed', async () => {
        createInstance.mockReturnValue(new TestHostCheck());
        hostCheck = async () => ({ Allowed: false, Message: 'Held elsewhere.', Reason: ALREADY_SUBSCRIBED_REASON, ProductIDs: ['prod-1'] });

        const refused = await RunPrePurchaseChecks(context());

        expect(refused?.Refusal).toEqual({ Code: 'AlreadySubscribed', Source: 'host', ProductIDs: ['prod-1'] });
    });

    it('the host check is told the e-mail, the resolved Person and the lines — including a buyer with no Person yet', async () => {
        createInstance.mockReturnValue(new TestHostCheck());
        const seen: PrePurchaseContext[] = [];
        hostCheck = async (ctx) => {
            seen.push(ctx);
            return { Allowed: true };
        };

        expect(await RunPrePurchaseChecks(context({ PersonID: null }))).toBeNull();

        expect(seen[0]).toMatchObject({ Email: 'buyer@example.com', PersonID: null, Lines: [{ ProductID: 'prod-1', Quantity: 1 }] });
    });

    it('the built-in refusal wins without asking the host', async () => {
        createInstance.mockReturnValue(new TestHostCheck());
        const host = vi.fn();
        hostCheck = host;
        mocks.subscriptionResults = [{ ProductID: 'prod-1', Product: 'Annual Membership' }];

        await RunPrePurchaseChecks(context());

        expect(host).not.toHaveBeenCalled();
    });

    it('refuses, rather than allows, when the host check throws', async () => {
        createInstance.mockReturnValue(new TestHostCheck());
        hostCheck = async () => {
            throw new Error('upstream timeout');
        };

        const refused = await RunPrePurchaseChecks(context());

        expect(refused?.Refusal).toEqual({ Code: 'Unverified', Source: 'host', ProductIDs: [] });
        expect(refused?.Message).not.toContain('upstream timeout');
    });

    it('refuses, rather than allows, when existing subscriptions cannot be read', async () => {
        mocks.subscriptionSuccess = false;

        const refused = await RunPrePurchaseChecks(context());

        expect(refused?.Refusal).toEqual({ Code: 'Unverified', Source: 'built-in', ProductIDs: [] });
    });
});
