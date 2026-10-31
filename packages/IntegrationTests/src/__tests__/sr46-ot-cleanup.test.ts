/**
 * SR46-OT's cleanup when its setup fails part-way (rkihm-BC's final review of #950).
 *
 * SR46-OT commits, so its rows go only when `PurgeCheckoutRun` names them. Setup used to hand the
 * IDs over only after every row was written: a throw part-way left the run empty, every purge scope
 * became `IN (NULL)`, and the rows stayed on ORD-WORLD, which teardown keeps. Here setup fails at
 * the wallet, after the source order, subscription and provider are committed, and the purge must
 * still be asked for them. Running the purge itself needs a database.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import type { CheckoutRun } from '../fixture.js';
import { SubscriptionRenewalChecks } from '../checks/subscription-renewal.checks.js';

const SOURCE_ORDER_ID = '11111111-1111-1111-1111-111111111111';
const SUBSCRIPTION_ID = '22222222-2222-2222-2222-222222222222';
const PROVIDER_ID = '33333333-3333-3333-3333-333333333333';

/** What the check handed the purge, copied when it was called. */
const purged: CheckoutRun[] = [];

vi.mock('../fixture.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../fixture.js')>();
    return {
        ...actual,
        Fx: () => ({
            Run: 'ORD-WORLD',
            CoA: { ID: 'company-a' },
            Customers: { OrganizationID: 'org-1' },
            Products: { SubRolling: 'product-sub' },
            PaymentTypeIDs: new Map([['CreditCard', 'tender-card']]),
        }),
        // The source order's first term.
        TxOne: vi.fn(async () => ({ ID: 'term-1', SubscriptionID: SUBSCRIPTION_ID, EndDate: '2026-12-31', TermNumber: 1 })),
        // The Stripe provider type exists, so the only entity created is the provider.
        TxMaybeOne: vi.fn(async () => ({ ID: 'stripe-type' })),
        createViaEntity: vi.fn(async () => PROVIDER_ID),
        PurgeCheckoutRun: vi.fn(async (_ctx: IntegrationCheckContext, run: CheckoutRun) => {
            purged.push(structuredClone(run));
            return 0;
        }),
    };
});

vi.mock('../order-builder.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../order-builder.js')>();
    return { ...actual, ConfirmOrder: vi.fn(async () => ({ Saved: true, Order: { ID: SOURCE_ORDER_ID } })) };
});

/** A wallet whose save fails, as a constraint or a lost connection would make it. */
function failingWallet() {
    return {
        NewRecord: () => undefined,
        PaymentDetailID_Object: {},
        Save: async () => false,
        LatestResult: { CompleteMessage: 'wallet save refused' },
    };
}

describe('SR46-OT setup that fails part-way (#950 review)', () => {
    afterEach(() => {
        purged.length = 0;
        vi.restoreAllMocks();
    });

    it('still hands the purge every row it committed before the failure', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const check = SubscriptionRenewalChecks.find((c) => c.Id === 'subscription-renewal.SR46-OT');
        expect(check).toBeDefined();
        const ctx = {
            Provider: { GetEntityObject: vi.fn(async () => failingWallet()) },
            User: { ID: 'u' },
        } as unknown as IntegrationCheckContext;

        await expect(check!.Fn(ctx)).rejects.toThrow(/wallet save refused/);

        expect(purged).toHaveLength(1);
        expect(purged[0].OrderIDs).toEqual([SOURCE_ORDER_ID]);
        expect(purged[0].SubscriptionIDs).toEqual([SUBSCRIPTION_ID]);
        expect(purged[0].PaymentProviderID).toBe(PROVIDER_ID);
    });
});
