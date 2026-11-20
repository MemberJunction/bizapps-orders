/**
 * The pre-purchase checks a self-serve checkout runs (#323): the built-in held-subscription rule
 * and the host seam registered through the ClassFactory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { expectTopLevelConjunct } from './selectionRule.js';

const mocks = vi.hoisted(() => ({
    subscriptionResults: [] as Array<{ ProductID: string; Product: string }>,
    subscriptionSuccess: true,
    /** Subscriptions a gateway bills (the read that names `ProviderSubscriptionID IS NOT NULL`). */
    providerBilledResults: [] as Array<{ ID: string; ProductID: string; Status?: string }>,
    /**
     * Fails ONLY the gateway-billed read: every other read still answers. Separate from
     * `subscriptionSuccess`, which fails every read and so cannot tell which read the refusal came from.
     */
    failProviderBilledRead: false,
    termResults: [] as Array<{ ID: string; SubscriptionID: string; EndDate: Date }>,
    /** Products with a subscription type (the read that names `SubscriptionTypeID IS NOT NULL`). */
    subscriptionProductResults: [] as Array<{ ID: string }>,
    filters: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { EntityName: string; ExtraFilter: string }) => {
                mocks.filters.push(params.ExtraFilter);
                const results =
                    params.EntityName === 'MJ_BizApps_Orders: Subscription Terms'
                        ? mocks.termResults
                        : params.EntityName === 'MJ_BizApps_Orders: Products'
                          ? mocks.subscriptionProductResults
                        : params.ExtraFilter.includes('ProviderSubscriptionID IS NOT NULL')
                          ? mocks.providerBilledResults
                          : mocks.subscriptionResults;
                const providerBilledRead = params.EntityName !== 'MJ_BizApps_Orders: Subscription Terms' &&
                    params.EntityName !== 'MJ_BizApps_Orders: Products' &&
                    params.ExtraFilter.includes('ProviderSubscriptionID IS NOT NULL');
                if (providerBilledRead && mocks.failProviderBilledRead) {
                    return Promise.resolve({ Success: false, ErrorMessage: 'deadlock victim', Results: [] });
                }
                if (providerBilledRead) {
                    // Rows that carry a Status are selected the way SQL would: only when the filter's IN list names it.
                    const inList = /Status IN \(([^)]*)\)/.exec(params.ExtraFilter)?.[1] ?? '';
                    const statuses = inList.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
                    return Promise.resolve({
                        Success: mocks.subscriptionSuccess,
                        ErrorMessage: mocks.subscriptionSuccess ? undefined : 'database unavailable',
                        Results: mocks.providerBilledResults.filter((r) => !r.Status || statuses.includes(r.Status)),
                    });
                }
                return Promise.resolve({
                    Success: mocks.subscriptionSuccess,
                    ErrorMessage: mocks.subscriptionSuccess ? undefined : 'database unavailable',
                    Results: results,
                });
            });
        },
    };
});

import {
    ALREADY_SUBSCRIBED_REASON,
    CheckoutPrePurchaseCheck,
    DEFAULT_PROVIDER_BILLED_SUBSCRIPTION_MESSAGE,
    FormatRenewalDay,
    RunPrePurchaseChecks,
    type PrePurchaseContext,
    type PrePurchaseVerdict,
} from '../CheckoutPrePurchaseCheck.js';

const context = (overrides: Partial<PrePurchaseContext> = {}): PrePurchaseContext => ({
    Email: 'buyer@example.com',
    PersonID: '11111111-0000-4000-8000-000000000001',
    CompanyID: '22222222-0000-4000-8000-000000000001',
    Lines: [{ ProductID: '33333333-0000-4000-8000-000000000001', Quantity: 1 }],
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
        mocks.providerBilledResults = [];
        mocks.failProviderBilledRead = false;
        mocks.termResults = [];
        mocks.filters = [];
        hostCheck = null;
        createInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance');
    });

    afterEach(() => {
        createInstance.mockRestore();
    });

    it('with no host check registered, only the built-in rule applies', async () => {
        expect(await RunPrePurchaseChecks(context())).toBeNull();

        mocks.subscriptionResults = [{ ProductID: '33333333-0000-4000-8000-000000000001', Product: 'Annual Membership' }];
        const refused = await RunPrePurchaseChecks(context());
        expect(refused?.Refusal).toEqual({ Code: 'AlreadySubscribed', Source: 'built-in', ProductIDs: ['33333333-0000-4000-8000-000000000001'] });
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
        hostCheck = async () => ({ Allowed: false, Message: 'Held elsewhere.', Reason: ALREADY_SUBSCRIBED_REASON, ProductIDs: ['33333333-0000-4000-8000-000000000001'] });

        const refused = await RunPrePurchaseChecks(context());

        expect(refused?.Refusal).toEqual({ Code: 'AlreadySubscribed', Source: 'host', ProductIDs: ['33333333-0000-4000-8000-000000000001'] });
    });

    it('the host check is told the e-mail, the resolved Person and the lines — including a buyer with no Person yet', async () => {
        createInstance.mockReturnValue(new TestHostCheck());
        const seen: PrePurchaseContext[] = [];
        hostCheck = async (ctx) => {
            seen.push(ctx);
            return { Allowed: true };
        };

        expect(await RunPrePurchaseChecks(context({ PersonID: null }))).toBeNull();

        expect(seen[0]).toMatchObject({ Email: 'buyer@example.com', PersonID: null, Lines: [{ ProductID: '33333333-0000-4000-8000-000000000001', Quantity: 1 }] });
    });

    it('the built-in refusal wins without asking the host', async () => {
        createInstance.mockReturnValue(new TestHostCheck());
        const host = vi.fn();
        hostCheck = host;
        mocks.subscriptionResults = [{ ProductID: '33333333-0000-4000-8000-000000000001', Product: 'Annual Membership' }];

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

describe('RunPrePurchaseChecks: a buyer whose gateway already bills a subscription (option E, E2)', () => {
    let createInstance: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        mocks.subscriptionResults = [];
        mocks.subscriptionSuccess = true;
        mocks.providerBilledResults = [];
        mocks.failProviderBilledRead = false;
        mocks.termResults = [];
        // The draft sells a subscription product unless a test says otherwise.
        mocks.subscriptionProductResults = [{ ID: PRODUCT }];
        mocks.filters = [];
        hostCheck = null;
        createInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance');
    });
    afterEach(() => createInstance.mockRestore());

    const PRODUCT = '33333333-0000-4000-8000-000000000001';
    const PROFESSIONAL = '33333333-0000-4000-8000-0000000000f1';
    const EXECUTIVE = '33333333-0000-4000-8000-0000000000f2';
    const JANE_SUB = '44444444-0000-4000-8000-000000000110';
    const HOST_WORDING =
        'You already have a subscription that is set to auto-renew on {renewalDate}. If you are trying to purchase for someone ' +
        'else, please enter their email address instead. Otherwise, please contact support with any questions.';

    it("refuses another subscription purchase in the company, with its own code, the widget's wording and the day the gateway next charges", async () => {
        // Jane holds Professional, billed by Stripe; she tries to buy Executive (an upgrade) on the same company's widget.
        mocks.providerBilledResults = [{ ID: JANE_SUB, ProductID: PROFESSIONAL }];
        mocks.termResults = [
            { ID: 't1', SubscriptionID: JANE_SUB, EndDate: new Date('2027-10-30T00:00:00Z') },
            { ID: 't0', SubscriptionID: JANE_SUB, EndDate: new Date('2026-10-30T00:00:00Z') },
        ];
        const refused = await RunPrePurchaseChecks(
            context({ Lines: [{ ProductID: EXECUTIVE, Quantity: 1 }], ProviderBilledSubscriptionMessage: HOST_WORDING }),
        );
        expect(refused?.Message).toBe(
            'You already have a subscription that is set to auto-renew on October 30, 2027. If you are trying to purchase for someone ' +
                'else, please enter their email address instead. Otherwise, please contact support with any questions.',
        );
        // Not AlreadySubscribed: a host listening for the same-product refusal can tell the two apart.
        expect(refused?.Refusal).toEqual({ Code: 'ProviderBilledSubscription', Source: 'built-in', ProductIDs: [PROFESSIONAL] });
        expect(mocks.filters[0]).toContain("BeneficiaryPersonID = '11111111-0000-4000-8000-000000000001'");
        expect(mocks.filters[0]).toContain("CompanyID = '22222222-0000-4000-8000-000000000001'");
        // Every held status, Paused included: a paused gateway-billed subscription is still billed.
        expect(mocks.filters[0]).toContain("Status IN ('Active', 'Trialing', 'Paused')");
        expect(mocks.filters[0]).toContain('ProviderSubscriptionID IS NOT NULL');
        // #948's rule for every READER: one top-level AND of the filter (MJ wraps it in a WHERE), no top-level OR.
        expectTopLevelConjunct(`WHERE ${mocks.filters[0]} ORDER BY ID`, 'WHERE', 'ORDER BY ID', 'ProviderSubscriptionID IS NOT NULL');
        // The draft's products are checked for a subscription type, the test the card prompt uses.
        // A product with no type of its own inherits its product type's default (golive #339), so the
        // read widened when the deal→order handoff landed; option E's original string is the first half.
        expect(mocks.filters[1]).toBe(
            `ID IN ('${EXECUTIVE}') AND (SubscriptionTypeID IS NOT NULL ` +
                `OR ProductTypeID IN (SELECT ID FROM __mj_BizAppsOrders.ProductType WHERE DefaultSubscriptionTypeID IS NOT NULL))`,
        );
    });

    it('allows a purchase that sells no subscription (a ticket, a one-off) to the same buyer', async () => {
        mocks.providerBilledResults = [{ ID: JANE_SUB, ProductID: PROFESSIONAL }];
        mocks.subscriptionProductResults = [];
        expect(await RunPrePurchaseChecks(context({ Lines: [{ ProductID: EXECUTIVE, Quantity: 1 }] }))).toBeNull();
    });

    it('reads the products only for a buyer the gateway bills: nearly every buyer costs one read', async () => {
        expect(await RunPrePurchaseChecks(context({ Lines: [{ ProductID: EXECUTIVE, Quantity: 1 }] }))).toBeNull();
        expect(mocks.filters.some((f) => f.includes('SubscriptionTypeID IS NOT NULL'))).toBe(false);
    });

    it('uses a neutral default with no widget wording, and wins over the same-product rule', async () => {
        mocks.providerBilledResults = [{ ID: JANE_SUB, ProductID: PRODUCT }];
        mocks.subscriptionResults = [{ ProductID: PRODUCT, Product: 'Annual Membership' }];
        mocks.termResults = [{ ID: 't1', SubscriptionID: JANE_SUB, EndDate: new Date('2027-10-30T00:00:00Z') }];
        const refused = await RunPrePurchaseChecks(context());
        expect(refused?.Message).toBe(DEFAULT_PROVIDER_BILLED_SUBSCRIPTION_MESSAGE.replace('{renewalDate}', 'October 30, 2027'));
        expect(refused?.Refusal.Code).toBe('ProviderBilledSubscription');
        expect(DEFAULT_PROVIDER_BILLED_SUBSCRIPTION_MESSAGE).not.toMatch(/sidecar/i);
    });

    it('still refuses when the renewal day cannot be read; only the date is missing', async () => {
        mocks.providerBilledResults = [{ ID: JANE_SUB, ProductID: PRODUCT }];
        const refused = await RunPrePurchaseChecks(context({ ProviderBilledSubscriptionMessage: 'Renews on {renewalDate}.' }));
        expect(refused?.Message).toBe('Renews on its renewal date.');
    });

    it('allows a buyer whose subscriptions Orders bills (no gateway id), a new buyer, and refuses when the read fails', async () => {
        expect(await RunPrePurchaseChecks(context())).toBeNull();
        expect(await RunPrePurchaseChecks(context({ PersonID: null }))).toBeNull();
        mocks.subscriptionSuccess = false;
        expect((await RunPrePurchaseChecks(context()))?.Refusal.Code).toBe('Unverified');
    });

    it('refuses, rather than builds a filter from, an id that is not a UUID', async () => {
        expect((await RunPrePurchaseChecks(context({ PersonID: "x' OR 1=1 --" })))?.Refusal.Code).toBe('Unverified');
        expect(mocks.filters).toHaveLength(0);
    });

    it("R4 (R09 isolation): ONLY the gateway-billed read failing still refuses as Unverified, though the held read would allow", async () => {
        // Kills: `if (!held.Success) return null;` in checkProviderBilledSubscriptions. With that, the
        // same-product read (which succeeds, empty) and the host check would let a second Stripe-billed
        // subscription through. `subscriptionSuccess = false` cannot catch it: it fails the held read too.
        mocks.failProviderBilledRead = true;
        const refused = await RunPrePurchaseChecks(context());
        expect(refused).toEqual({
            Message: 'This purchase could not be verified right now. Please try again later.',
            Refusal: { Code: 'Unverified', Source: 'built-in', ProductIDs: [] },
        });
        // Only the gateway-billed read ran: the refusal came from it, not from a later read.
        expect(mocks.filters).toHaveLength(1);
        expect(mocks.filters[0]).toContain('ProviderSubscriptionID IS NOT NULL');
    });

    it('R4 control: with the gateway-billed read answering (empty), the same buyer is allowed and the held read runs', async () => {
        // Proves the switch above fails one read only: flip it off and nothing else refuses.
        expect(await RunPrePurchaseChecks(context())).toBeNull();
        expect(mocks.filters.some((f) => !f.includes('ProviderSubscriptionID IS NOT NULL'))).toBe(true);
    });

    it("Jane's PAUSED Stripe-billed SUB-000110 still refuses another subscription purchase", async () => {
        // Kills: reverting the status list to HELD_SUBSCRIPTION_STATUSES (Active, Trialing).
        mocks.providerBilledResults = [{ ID: JANE_SUB, ProductID: PROFESSIONAL, Status: 'Paused' }];
        const refused = await RunPrePurchaseChecks(context({ Lines: [{ ProductID: EXECUTIVE, Quantity: 1 }] }));
        expect(refused?.Refusal).toEqual({ Code: 'ProviderBilledSubscription', Source: 'built-in', ProductIDs: [PROFESSIONAL] });
    });

    it('a CANCELED Stripe-billed subscription is not selected, so the buyer may buy again', async () => {
        // Kills: widening the list to every status (a cancelled member could never come back through checkout).
        mocks.providerBilledResults = [{ ID: JANE_SUB, ProductID: PROFESSIONAL, Status: 'Canceled' }];
        expect(await RunPrePurchaseChecks(context({ Lines: [{ ProductID: EXECUTIVE, Quantity: 1 }] }))).toBeNull();
        expect(mocks.filters[0]).not.toContain("'Canceled'");
    });

    it('formats a stored day without shifting it by a zone', () => {
        expect(FormatRenewalDay('2029-02-28')).toBe('February 28, 2029');
        expect(FormatRenewalDay('2027-01-01')).toBe('January 1, 2027');
    });
});
