/**
 * LinkProviderSubscription with a fake provider: the plan must be the subscription's product, and the elsewhere
 * check and the write run under locks so two links cannot both pass.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
    [key: string]: unknown;
}

const SUB = '33333333-0000-4000-8000-000000000001';
const ACCT = '33333333-0000-4000-8000-0000000000a1';

const state = vi.hoisted(() => ({
    mapped: [{ ProductID: 'prod-pro' }] as Row[],
    priceID: 'price_pro' as string | null,
    takenUnderLock: [] as Row[],
    log: [] as string[],
    saved: 0,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: () => undefined,
        RunView: class {
            async RunView(p: { EntityName: string; ExtraFilter?: string }) {
                if (p.EntityName.endsWith('Payment Provider Prices')) return { Success: true, Results: state.mapped };
                if (p.EntityName.endsWith('Subscriptions') && /ProviderSubscriptionID = /.test(p.ExtraFilter ?? '')) return { Success: true, Results: [] };
                if (p.EntityName.endsWith('Subscriptions')) {
                    return { Success: true, Results: [{ ID: SUB, SubscriptionNumber: 'SUB-000110', ProviderSubscriptionID: null, BeneficiaryPersonID: null, ProductID: 'prod-pro' }] };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});
vi.mock('../PaymentProviderResolver.js', () => ({
    LoadPaymentProviderConfig: async () => ({ ID: ACCT, Name: 'Stripe', Capabilities: { SupportsSubscriptionBilling: true } }),
    BuildPaymentProvider: async () => ({
        DescribeProviderSubscription: async () => ({ Success: true, State: 'Renewing', Status: 'active', ProviderPriceID: state.priceID, CustomerEmail: null }),
    }),
}));
vi.mock('../SubscriptionEntityServer.js', () => ({ SanctionProviderBilledChange: () => undefined }));
vi.mock('../isolatedProvider.js', () => ({ WithIsolatedProvider: (fn: (p: unknown) => unknown, shared: unknown) => fn(shared) }));
vi.mock('../ProviderSubscriptionSync.js', () => ({ SyncProviderSubscription: async () => ({ Outcome: 'InLine', Actions: [], Notices: [], Differences: [] }) }));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { LinkProviderSubscription } from '../LinkProviderSubscription.js';

const provider = {
    BeginTransaction: async () => void state.log.push('BEGIN'),
    CommitTransaction: async () => void state.log.push('COMMIT'),
    RollbackTransaction: async () => void state.log.push('ROLLBACK'),
    ExecuteSQL: async (q: string) => {
        if (/UPDLOCK, HOLDLOCK/.test(q)) {
            state.log.push('LOCK gateway id');
            return state.takenUnderLock;
        }
        state.log.push('LOCK own row');
        return [{ ID: SUB }];
    },
    GetEntityObject: async () => ({
        Save: async () => {
            state.log.push('SAVE');
            state.saved++;
            return true;
        },
        LatestResult: null,
    }),
} as unknown as IMetadataProvider;
const user = {} as UserInfo;
const link = (over: Row = {}) => LinkProviderSubscription({ SubscriptionID: SUB, PaymentProviderID: ACCT, ProviderSubscriptionID: 'sub_x', ...over } as never, provider, user);

beforeEach(() => {
    state.mapped = [{ ProductID: 'prod-pro' }];
    state.priceID = 'price_pro';
    state.takenUnderLock = [];
    state.log = [];
    state.saved = 0;
});

describe('LinkProviderSubscription', () => {
    it('links under locks: the gateway id range and the own row locked, THEN saved, then committed', async () => {
        const out = await link();
        expect(out.Code, out.Message).toBe('Linked');
        expect(state.log).toEqual(['BEGIN', 'LOCK gateway id', 'LOCK own row', 'SAVE', 'COMMIT']);
    });
    it('another link recorded the id while this one waited: LinkedElsewhere, rolled back, nothing saved', async () => {
        state.takenUnderLock = [{ ID: 'other' }];
        const out = await link();
        expect(out.Code).toBe('LinkedElsewhere');
        expect(state.log).toContain('ROLLBACK');
        expect(state.saved).toBe(0);
    });
    it("the gateway bills a price mapped to ANOTHER product: PriceForAnotherProduct, nothing locked or saved", async () => {
        state.mapped = [{ ProductID: 'prod-foundation' }];
        const out = await link();
        expect(out.Code).toBe('PriceForAnotherProduct');
        expect(state.log).toEqual([]);
    });
    it('a price mapped to no product: refused too', async () => {
        state.mapped = [];
        expect((await link()).Code).toBe('PriceForAnotherProduct');
    });
    it('confirmed by a person (an imported subscriber on an older price): linked', async () => {
        state.mapped = [{ ProductID: 'prod-foundation' }];
        expect((await link({ AllowPriceOfAnotherProduct: true })).Code).toBe('Linked');
    });
});
