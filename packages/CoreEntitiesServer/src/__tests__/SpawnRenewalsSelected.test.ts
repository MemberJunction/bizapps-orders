/**
 * `Orders.SpawnRenewals` with `SubscriptionIDs`: the Renewals page's way in.
 *
 * A person who ticks rows has made the two decisions the scheduled selection makes in SQL — whether
 * the lead window is open and whether the holder consented — so that selection reads the named
 * subscriptions whatever those say, and applies the REST of the rules in code, reporting each
 * refusal on its candidate. These tests read the SQL the selection sends and the candidates that
 * come back, through a provider that answers with fixed rows and no database. The booking path
 * itself is the `subscription-renewal` integration bundle.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: {
        Load: async () => undefined,
        RenewalChargeRetryDays: [3, 7, 11],
        RenewalAccessCutoffDaysPastDue: 14,
    },
}));

import { RenewalGroupKey, SelectedRenewalRefusal, SpawnRenewalsOperation } from '../SpawnRenewalsOperation.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
const ID_C = '33333333-3333-3333-3333-333333333333';

type Executor = {
    InternalExecute(
        i: unknown,
        p: IMetadataProvider,
        u: UserInfo,
    ): Promise<{ Success: boolean; Message?: string; Placed: number; Skipped: number; Candidates: Array<Record<string, unknown>> }>;
};

/** A provider whose selection answers with `rows` and whose every other statement answers with nothing. */
function provider(rows: Array<Record<string, unknown>>): { provider: IMetadataProvider; sql: string[] } {
    const sql: string[] = [];
    const p = {
        ExecuteSQL: async (q: string) => {
            sql.push(q);
            return /FROM __mj_BizAppsOrders\.Subscription s\b/.test(q) ? rows : [];
        },
    } as unknown as IMetadataProvider;
    return { provider: p, sql };
}

function subject(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        SubscriptionID: ID_A,
        SubscriptionNumber: 'SUB-A',
        SubscriptionStatus: 'Active',
        SubscriptionTypeID: 'type',
        CompanyID: 'co',
        ProductID: 'prod',
        HolderOrganizationID: null,
        BeneficiaryPersonID: null,
        AutoRenew: false,
        ProviderSubscriptionID: null,
        SubscriptionRenewalLeadDays: null,
        TypeRenewalLeadDays: 90,
        SubscriptionStartDate: '2025-04-01',
        SubscriptionIncreasePercent: null,
        CarryDiscountOnRenewal: false,
        DefaultCustomerPaymentMethodID: null,
        TermID: 'term',
        TermNumber: 2,
        TermStartDate: '2026-04-01',
        TermEndDate: '2027-03-31',
        TermStatus: 'Active',
        TermQuantity: 1,
        OrderLineID: 'line',
        ...overrides,
    };
}

describe('Spawn Renewals with SubscriptionIDs', () => {
    it('selects the named subscriptions by id, with neither the auto-renew switch nor the lead window in the WHERE', async () => {
        const { provider: p, sql } = provider([]);
        const op = new SpawnRenewalsOperation() as unknown as Executor;
        const out = await op.InternalExecute({ SubscriptionIDs: [ID_A, ID_B], Preview: true }, p, USER);
        expect(out.Success, out.Message).toBe(true);
        const selection = sql.find((q) => /FROM __mj_BizAppsOrders\.Subscription s\b/.test(q));
        expect(selection).toBeDefined();
        expect(selection).toMatch(/WHERE s\.ID IN \('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222'\)/);
        expect(selection).not.toMatch(/AutoRenew = 1/);
        expect(selection).not.toMatch(/RenewalLeadDays, t\.RenewalLeadDays/);
        expect(selection).not.toMatch(/DATEADD/);
    });

    it('refuses an id that is not a UUID before it reaches SQL', async () => {
        const { provider: p, sql } = provider([]);
        const op = new SpawnRenewalsOperation() as unknown as Executor;
        await expect(op.InternalExecute({ SubscriptionIDs: ["x' OR 1=1 --"], Preview: true }, p, USER)).rejects.toThrow(/SubscriptionIDs/);
        expect(sql).toHaveLength(0);
    });

    it('reports every ineligible choice as a skipped candidate with its reason, and places nothing', async () => {
        const { provider: p } = provider([
            subject({ SubscriptionID: ID_A, SubscriptionNumber: 'SUB-A', SubscriptionStatus: 'Canceled' }),
            subject({ SubscriptionID: ID_B, SubscriptionNumber: 'SUB-B', ProviderSubscriptionID: 'sub_123' }),
        ]);
        const op = new SpawnRenewalsOperation() as unknown as Executor;
        const out = await op.InternalExecute({ SubscriptionIDs: [ID_A, ID_B, ID_C] }, p, USER);
        expect(out.Success, out.Message).toBe(true);
        expect(out.Placed).toBe(0);
        expect(out.Skipped).toBe(3);
        const byNumber = Object.fromEntries(out.Candidates.map((c) => [c['SubscriptionID'], c['SkippedReason']]));
        expect(byNumber[ID_A]).toMatch(/Canceled, not Active or Trialing/);
        expect(byNumber[ID_B]).toMatch(/gateway bills this subscription/);
        expect(byNumber[ID_C]).toBe('no such subscription');
        expect(out.Message).toMatch(/3 subscription\(s\) selected/);
    });

    it('defaults a selected subscription with auto-renew off to a draft, and one with it on to a confirmed order', async () => {
        // Both rows are refused by the second guard (a renewal pending) so nothing is priced or placed,
        // but the candidate records how each WOULD have been left.
        const pending = {
            ExecuteSQL: async (q: string) => {
                if (/FROM __mj_BizAppsOrders\.Subscription s\b/.test(q)) {
                    return [
                        subject({ SubscriptionID: ID_A, SubscriptionNumber: 'SUB-A', AutoRenew: false }),
                        subject({ SubscriptionID: ID_B, SubscriptionNumber: 'SUB-B', AutoRenew: true }),
                    ];
                }
                if (/RenewsSubscriptionID =/.test(q)) return [{ ID: 'line-pending' }];
                return [];
            },
        } as unknown as IMetadataProvider;
        const op = new SpawnRenewalsOperation() as unknown as Executor;
        const out = await op.InternalExecute({ SubscriptionIDs: [ID_A, ID_B] }, pending, USER);
        const statuses = Object.fromEntries(out.Candidates.map((c) => [c['SubscriptionNumber'], c['OrderStatus']]));
        expect(statuses).toEqual({ 'SUB-A': 'Draft', 'SUB-B': 'Confirmed' });
        expect(out.Candidates.every((c) => /already exists/.test(String(c['SkippedReason'])))).toBe(true);

        const forced = await op.InternalExecute({ SubscriptionIDs: [ID_A, ID_B], PlaceAs: 'Draft' }, pending, USER);
        expect(forced.Candidates.map((c) => c['OrderStatus'])).toEqual(['Draft', 'Draft']);
    });

    it('refuses a PlaceAs it does not know rather than guessing', async () => {
        const { provider: p, sql } = provider([]);
        const op = new SpawnRenewalsOperation() as unknown as Executor;
        const out = await op.InternalExecute({ SubscriptionIDs: [ID_A], PlaceAs: 'Quote' }, p, USER);
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/PlaceAs takes 'Confirmed' or 'Draft'/);
        expect(sql).toHaveLength(0);
    });

    it('leaves the scheduled selection as it was: no SubscriptionIDs, no change to its WHERE', async () => {
        const { provider: p, sql } = provider([]);
        const op = new SpawnRenewalsOperation() as unknown as Executor;
        await op.InternalExecute({ AsOfDate: '2027-01-15', Preview: true }, p, USER);
        const selection = sql.find((q) => /FROM __mj_BizAppsOrders\.Subscription s\b/.test(q));
        expect(selection).toMatch(/WHERE s\.AutoRenew = 1/);
        expect(selection).toMatch(/l\.EndDate <= DATEADD\(DAY, COALESCE\(s\.RenewalLeadDays, t\.RenewalLeadDays, 0\), '2027-01-15'\)/);
        expect(selection).toMatch(/ORDER BY l\.EndDate/);
    });
});

describe('SelectedRenewalRefusal', () => {
    it('applies the pass’s rules minus the two a person decides', () => {
        expect(SelectedRenewalRefusal({ SubscriptionStatus: 'Active', TermID: 't', TermStatus: 'Active', ProviderSubscriptionID: null })).toBeNull();
        expect(SelectedRenewalRefusal({ SubscriptionStatus: 'Trialing', TermID: 't', TermStatus: 'Scheduled', ProviderSubscriptionID: null })).toBeNull();
        expect(SelectedRenewalRefusal({ SubscriptionStatus: 'Paused', TermID: 't', TermStatus: 'Active', ProviderSubscriptionID: null })).toMatch(/Paused/);
        expect(SelectedRenewalRefusal({ SubscriptionStatus: 'Active', TermID: 't', TermStatus: 'Active', ProviderSubscriptionID: 'sub_1' })).toMatch(/gateway/);
        expect(SelectedRenewalRefusal({ SubscriptionStatus: 'Active', TermID: null, TermStatus: null, ProviderSubscriptionID: null })).toMatch(/no term/);
        expect(SelectedRenewalRefusal({ SubscriptionStatus: 'Active', TermID: 't', TermStatus: 'Canceled', ProviderSubscriptionID: null })).toMatch(/Canceled, not Scheduled or Active/);
    });
});

describe('RenewalGroupKey: which subscriptions renew on one order', () => {
    const base = { CompanyID: 'co', HolderOrganizationID: 'org-1', BeneficiaryPersonID: null, TermEndDate: '2026-12-31', DefaultCustomerPaymentMethodID: null };

    it('groups the same customer, company, term end, placement and card; case and null do not split a group', () => {
        expect(RenewalGroupKey(base, 'Confirmed')).toBe(RenewalGroupKey({ ...base, CompanyID: 'CO', HolderOrganizationID: 'ORG-1' }, 'Confirmed'));
        expect(RenewalGroupKey(base, 'Confirmed')).toBe(RenewalGroupKey({ ...base, BeneficiaryPersonID: undefined as unknown as null }, 'Confirmed'));
    });

    it('splits on anything that would change the order header or its renewal date', () => {
        const k = RenewalGroupKey(base, 'Confirmed');
        expect(RenewalGroupKey({ ...base, TermEndDate: '2027-01-31' }, 'Confirmed')).not.toBe(k); // a product added mid-term, not co-terminated
        expect(RenewalGroupKey({ ...base, HolderOrganizationID: 'org-2' }, 'Confirmed')).not.toBe(k);
        expect(RenewalGroupKey({ ...base, BeneficiaryPersonID: 'person-9' }, 'Confirmed')).not.toBe(k);
        expect(RenewalGroupKey({ ...base, CompanyID: 'other-co' }, 'Confirmed')).not.toBe(k);
        expect(RenewalGroupKey({ ...base, DefaultCustomerPaymentMethodID: 'card' }, 'Confirmed')).not.toBe(k);
        expect(RenewalGroupKey(base, 'Draft')).not.toBe(k);
    });
});
