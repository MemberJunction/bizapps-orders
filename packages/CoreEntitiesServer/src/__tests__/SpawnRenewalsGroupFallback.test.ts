/**
 * A renewal group that fails to place is retried one member at a time, so one subscription that
 * cannot be booked holds back only itself (PR #1059 review, issue 3). The selection and the second
 * guard are answered by a stub provider; the pricer and the group placement are stubbed, since the
 * booking path itself is the `subscription-renewal` integration bundle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: {
        Load: async () => undefined,
        RenewalChargeRetryDays: [3, 7, 11],
        RenewalAccessCutoffDaysPastDue: 14,
    },
}));

vi.mock('../RenewalPricing.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../RenewalPricing.js')>();
    return {
        ...actual,
        RenewalPricer: class {
            async Price(due: { ProductID: string; TermQuantity: number }) {
                return {
                    ProductID: due.ProductID,
                    ProductName: 'Product',
                    MovesToSuccessor: false,
                    Quantity: due.TermQuantity,
                    Price: { BasePrice: 100, BaseSource: 'PriorPrice', IncreasePercent: 0, IncreaseSource: 'None', UnitPrice: 100, DiscountPct: 0 },
                    PriorLineMonths: null,
                    Term: { Start: '2027-04-01', End: '2028-03-31' },
                    PromotionCodes: [],
                };
            }
        },
    };
});

import { SpawnRenewalsOperation } from '../SpawnRenewalsOperation.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';

type Member = { due: { SubscriptionNumber: string } };
type Executor = {
    InternalExecute(
        i: unknown,
        p: IMetadataProvider,
        u: UserInfo,
    ): Promise<{ Success: boolean; Message?: string; Placed: number; Skipped: number; Candidates: Array<Record<string, unknown>> }>;
};
type Placer = { placeRenewalGroup(...args: unknown[]): Promise<{ ID: string; Number: string; Promotions: null }> };

function subject(id: string, number: string): Record<string, unknown> {
    return {
        SubscriptionID: id,
        SubscriptionNumber: number,
        SubscriptionStatus: 'Active',
        SubscriptionTypeID: 'type',
        CompanyID: 'co',
        ProductID: 'prod',
        HolderOrganizationID: 'org-1',
        BeneficiaryPersonID: null,
        AutoRenew: true,
        ProviderSubscriptionID: null,
        SubscriptionRenewalLeadDays: null,
        TypeRenewalLeadDays: 90,
        SubscriptionStartDate: '2025-04-01',
        SubscriptionIncreasePercent: null,
        CarryDiscountOnRenewal: false,
        DefaultCustomerPaymentMethodID: null,
        TermID: `term-${number}`,
        TermNumber: 2,
        TermStartDate: '2026-04-01',
        TermEndDate: '2027-03-31',
        TermStatus: 'Active',
        TermQuantity: 1,
        OrderLineID: `line-${number}`,
    };
}

/** Two subscriptions for one customer, ending the same day: one renewal group. Nothing is pending. */
function provider(): IMetadataProvider {
    return {
        ExecuteSQL: async (q: string) => (/FROM __mj_BizAppsOrders\.Subscription s\b/.test(q) ? [subject(ID_A, 'SUB-A'), subject(ID_B, 'SUB-B')] : []),
    } as unknown as IMetadataProvider;
}

/** Stub the group placement: every call is recorded, and a call whose members include `failing` throws. */
function stubPlacement(failing: string | null): ReturnType<typeof vi.fn> {
    let n = 0;
    const place = vi.fn(async (_p: unknown, _u: unknown, members: ReadonlyArray<Member>) => {
        if (failing && members.some((m) => m.due.SubscriptionNumber === failing)) throw new Error(`GL account for ${failing} could not be resolved`);
        n++;
        return { ID: `order-${n}`, Number: `ORD-${n}`, Promotions: null };
    });
    (SpawnRenewalsOperation.prototype as unknown as Placer).placeRenewalGroup = place as unknown as Placer['placeRenewalGroup'];
    return place;
}

const original = (SpawnRenewalsOperation.prototype as unknown as Placer).placeRenewalGroup;
afterEach(() => {
    (SpawnRenewalsOperation.prototype as unknown as Placer).placeRenewalGroup = original;
});

describe('Spawn Renewals: a group that fails is retried one member at a time', () => {
    it('places the healthy member on its own order and reports only the broken one, with its own reason', async () => {
        const place = stubPlacement('SUB-B');
        const op = new SpawnRenewalsOperation() as unknown as Executor;
        const out = await op.InternalExecute({ SubscriptionIDs: [ID_A, ID_B] }, provider(), USER);
        expect(out.Success, out.Message).toBe(true);
        expect(out.Placed).toBe(1);
        expect(out.Skipped).toBe(1);

        const byNumber = Object.fromEntries(out.Candidates.map((c) => [c['SubscriptionNumber'], c]));
        expect(byNumber['SUB-A']).toMatchObject({ OrderID: 'order-1', OrderNumber: 'ORD-1' });
        expect(byNumber['SUB-A']['SkippedReason']).toBeUndefined();
        expect(byNumber['SUB-B']['OrderID']).toBeUndefined();
        expect(byNumber['SUB-B']['SkippedReason']).toMatch(/GL account for SUB-B/);
        // They no longer share an order: the first keeps the group's number, the next gets its own.
        expect([byNumber['SUB-A']['OrderGroup'], byNumber['SUB-B']['OrderGroup']]).toEqual([1, 2]);

        // The group first, as one order; then each member alone.
        const sizes = place.mock.calls.map((call) => (call[2] as ReadonlyArray<Member>).map((m) => m.due.SubscriptionNumber));
        expect(sizes).toEqual([['SUB-A', 'SUB-B'], ['SUB-A'], ['SUB-B']]);
        expect(out.Message).toMatch(/1 renewal order\(s\) placed for 1 subscription\(s\), 1 skipped/);
    });

    it('places a healthy group once, on one order', async () => {
        const place = stubPlacement(null);
        const op = new SpawnRenewalsOperation() as unknown as Executor;
        const out = await op.InternalExecute({ SubscriptionIDs: [ID_A, ID_B] }, provider(), USER);
        expect(out.Placed).toBe(1);
        expect(out.Skipped).toBe(0);
        expect(place).toHaveBeenCalledTimes(1);
        expect(out.Candidates.map((c) => c['OrderNumber'])).toEqual(['ORD-1', 'ORD-1']);
        expect(out.Candidates.map((c) => c['OrderGroup'])).toEqual([1, 1]);
        expect(out.Message).toMatch(/1 renewal order\(s\) placed for 2 subscription\(s\), 0 skipped/);
    });
});
