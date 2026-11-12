/**
 * `Orders.ChangeSubscriptionProduct`: the product on chosen subscriptions, through the entity, with
 * one line back per subscription. Products are answered by a mocked RunView; subscriptions by a
 * stub provider whose entity records what was set and saved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ products: [] as Record<string, unknown>[] }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { ExtraFilter?: string }) => {
                const id = /ID='([^']+)'/.exec(params.ExtraFilter ?? '')?.[1]?.toLowerCase();
                return Promise.resolve({ Success: true, Results: mocks.products.filter((p) => String(p.ID).toLowerCase() === id) });
            });
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersChangeSubscriptionProductOutput } from '@mj-biz-apps/orders-entities';
import { ChangeSubscriptionProductOperation } from '../ChangeSubscriptionProductOperation.js';

const USER = { ID: 'u-1' } as unknown as UserInfo;
const S1 = '0d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e61';
const S2 = '0d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e62';
const S3 = '0d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e63';
const CONVERTED = 'aaaa1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e01';
const REAL = 'bbbb1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e02';
const OTHER_TYPE = 'cccc1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e03';
const INACTIVE = 'dddd1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e04';

interface Row {
    SubscriptionNumber: string;
    ProductID: string;
    SubscriptionTypeID: string;
    CompanyID: string;
    refuse?: string;
}
interface Store {
    rows: Map<string, Row>;
    saved: { ID: string; ProductID: string; SubscriptionTypeID: string }[];
    /** A renewal order pending per subscription id, as the pending-renewal query would answer. */
    pending: Map<string, { OrderNumber: string; Status: string }>;
    sql: string[];
}

function world(): { provider: IMetadataProvider; store: Store } {
    const store: Store = {
        rows: new Map([
            [S1, { SubscriptionNumber: 'SUB-1', ProductID: CONVERTED, SubscriptionTypeID: 'annual', CompanyID: 'co-a' }],
            [S2, { SubscriptionNumber: 'SUB-2', ProductID: REAL, SubscriptionTypeID: 'annual', CompanyID: 'co-a' }],
            [S3, { SubscriptionNumber: 'SUB-3', ProductID: CONVERTED, SubscriptionTypeID: 'annual', CompanyID: 'co-a', refuse: 'the gateway bills this subscription' }],
        ]),
        saved: [],
        pending: new Map(),
        sql: [],
    };
    const provider = {
        ExecuteSQL: async (q: string) => {
            store.sql.push(q);
            const id = /RenewsSubscriptionID = '([^']+)'/.exec(q)?.[1]?.toLowerCase();
            const row = id ? store.pending.get(id) : undefined;
            return row ? [row] : [];
        },
        GetEntityObject: async () => {
            const entity = {
                ID: '',
                SubscriptionNumber: '',
                ProductID: '',
                SubscriptionTypeID: '',
                CompanyID: '',
                LatestResult: null as { CompleteMessage: string } | null,
                refuse: undefined as string | undefined,
                async Load(id: string) {
                    const row = store.rows.get(id);
                    if (!row) return false;
                    Object.assign(entity, { ID: id, ...row });
                    return true;
                },
                async Save() {
                    if (entity.refuse) {
                        entity.LatestResult = { CompleteMessage: entity.refuse };
                        return false;
                    }
                    store.saved.push({ ID: entity.ID, ProductID: entity.ProductID, SubscriptionTypeID: entity.SubscriptionTypeID });
                    Object.assign(store.rows.get(entity.ID)!, { ProductID: entity.ProductID, SubscriptionTypeID: entity.SubscriptionTypeID });
                    return true;
                },
            };
            return entity;
        },
    } as unknown as IMetadataProvider;
    return { provider, store };
}

async function run(input: unknown, provider: IMetadataProvider): Promise<OrdersChangeSubscriptionProductOutput> {
    const op = new ChangeSubscriptionProductOperation();
    return (op as unknown as { InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<OrdersChangeSubscriptionProductOutput> }).InternalExecute(input, provider, USER);
}

beforeEach(() => {
    mocks.products = [
        { ID: CONVERTED, Name: 'Betty (converted pricing)', Status: 'Active', CompanyID: 'co-a', SubscriptionTypeID: 'annual' },
        { ID: REAL, Name: 'Betty Knowledge Assistant', Status: 'Active', CompanyID: 'co-a', SubscriptionTypeID: 'annual' },
        { ID: OTHER_TYPE, Name: 'Betty Monthly', Status: 'Active', CompanyID: 'co-b', SubscriptionTypeID: 'monthly' },
        { ID: INACTIVE, Name: 'Old Betty', Status: 'Discontinued', CompanyID: 'co-a', SubscriptionTypeID: 'annual' },
    ];
});

describe('Orders.ChangeSubscriptionProduct', () => {
    it('moves each subscription onto the product through the entity, naming what it was on', async () => {
        const { provider, store } = world();
        const out = await run({ SubscriptionIDs: [S1, S2, S3], ProductID: REAL }, provider);
        expect(out).toMatchObject({ Success: true, Updated: 1, Unchanged: 1, Failed: 1 });
        expect(out.Changes[0]).toMatchObject({ SubscriptionNumber: 'SUB-1', PreviousProductName: 'Betty (converted pricing)', CurrentProductName: 'Betty Knowledge Assistant', TypeMoved: false, Changed: true });
        expect(out.Changes[1]).toMatchObject({ SubscriptionNumber: 'SUB-2', Changed: false, CurrentProductID: REAL });
        expect(out.Changes[2]).toMatchObject({ SubscriptionNumber: 'SUB-3', Changed: false, Error: 'the gateway bills this subscription' });
        expect(out.Message).toBe('Product set to Betty Knowledge Assistant: 1 subscription updated, 1 already there, 1 failed.');
        expect(store.saved).toEqual([{ ID: S1, ProductID: REAL, SubscriptionTypeID: 'annual' }]);
    });

    it('refuses a product on another subscription type unless told to move the subscription too, and warns about another company', async () => {
        const { provider, store } = world();
        const refused = await run({ SubscriptionIDs: [S1], ProductID: OTHER_TYPE }, provider);
        expect(refused.Changes[0].Error).toMatch(/different subscription type/);
        expect(store.saved).toEqual([]);

        const moved = await run({ SubscriptionIDs: [S1], ProductID: OTHER_TYPE, AdoptProductType: true }, provider);
        expect(moved.Changes[0]).toMatchObject({ Changed: true, TypeMoved: true, Warning: 'the product is sold by another company; the subscription keeps its own' });
        expect(store.saved).toEqual([{ ID: S1, ProductID: OTHER_TYPE, SubscriptionTypeID: 'monthly' }]);
        expect(moved.Message).toMatch(/\(1 moved to its subscription type\)/);
    });

    it('refuses a subscription with a renewal order pending, naming the order, and leaves it as it was', async () => {
        // Confirming the pending draft moves the subscription onto the draft line's product, so a
        // change made meanwhile would be undone without a word (PR #1059 review, issue 2).
        const { provider, store } = world();
        store.pending.set(S1, { OrderNumber: 'ORD-000029', Status: 'Draft' });
        const out = await run({ SubscriptionIDs: [S1, S2], ProductID: REAL }, provider);
        expect(out).toMatchObject({ Success: true, Updated: 0, Unchanged: 1, Failed: 1 });
        const [one, two] = out.Changes;
        expect(one.Error).toMatch(/ORD-000029 \(Draft\) is pending/);
        expect(one).toMatchObject({ Changed: false, CurrentProductID: CONVERTED });
        expect(two).toMatchObject({ Changed: false, CurrentProductID: REAL });
        expect(store.saved).toEqual([]);
        expect(store.sql[0]).toMatch(/NOT EXISTS \(SELECT 1 FROM __mj_BizAppsOrders\.SubscriptionTerm/);
        expect(store.sql[0]).toMatch(/oh\.Status <> 'Voided'/);
    });

    it('refuses an unknown, inactive or non-subscription product before touching any subscription', async () => {
        const { provider, store } = world();
        expect((await run({ SubscriptionIDs: [S1], ProductID: INACTIVE }, provider)).Message).toMatch(/Discontinued, not Active/);
        expect((await run({ SubscriptionIDs: [S1], ProductID: 'eeee1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e99' }, provider)).Message).toMatch(/No product has the ID/);
        mocks.products.push({ ID: 'ffff1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e05', Name: 'A one-off', Status: 'Active', CompanyID: 'co-a', SubscriptionTypeID: null });
        expect((await run({ SubscriptionIDs: [S1], ProductID: 'ffff1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e05' }, provider)).Message).toMatch(/not a subscription product/);
        expect((await run({ SubscriptionIDs: [], ProductID: REAL }, provider)).Success).toBe(false);
        expect((await run({ SubscriptionIDs: [S1], ProductID: 'nope' }, provider)).Success).toBe(false);
        expect(store.saved).toEqual([]);
    });
});
