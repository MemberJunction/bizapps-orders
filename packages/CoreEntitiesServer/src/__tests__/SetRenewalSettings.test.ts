/**
 * `Orders.SetRenewalSettings`: auto-renew and the increase on chosen subscriptions, through the
 * entity, with one line back per subscription.
 *
 * The provider is a stub whose `GetEntityObject` hands back a recording entity, so the test sees
 * exactly what was loaded, set and saved. Nothing else is touched, and that is asserted too.
 */
import { describe, expect, it } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersSetRenewalSettingsOutput } from '@mj-biz-apps/orders-entities';
import { RequireIncreasePercent, SetRenewalSettingsOperation } from '../SetRenewalSettingsOperation.js';

const USER = { ID: 'u-1' } as unknown as UserInfo;
const S1 = '0d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e61';
const S2 = '0d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e62';
const S3 = '0d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e63';

interface Row {
    SubscriptionNumber: string;
    AutoRenew: boolean;
    RenewalIncreasePercent: number | null;
    refuse?: string;
}
interface Store {
    rows: Map<string, Row>;
    saved: { ID: string; AutoRenew: boolean; RenewalIncreasePercent: number | null }[];
    entitiesAsked: string[];
}

function world(): { provider: IMetadataProvider; store: Store } {
    const store: Store = {
        rows: new Map([
            [S1, { SubscriptionNumber: 'SUB-1', AutoRenew: true, RenewalIncreasePercent: null }],
            [S2, { SubscriptionNumber: 'SUB-2', AutoRenew: false, RenewalIncreasePercent: 5 }],
            [S3, { SubscriptionNumber: 'SUB-3', AutoRenew: true, RenewalIncreasePercent: 0, refuse: 'the gateway bills this subscription' }],
        ]),
        saved: [],
        entitiesAsked: [],
    };
    const provider = {
        GetEntityObject: async (entityName: string) => {
            store.entitiesAsked.push(entityName);
            const entity = {
                ID: '',
                SubscriptionNumber: '',
                AutoRenew: false,
                RenewalIncreasePercent: null as number | null,
                LatestResult: null as { CompleteMessage: string } | null,
                refuse: undefined as string | undefined,
                async Load(id: string) {
                    const row = store.rows.get(id);
                    if (!row) return false;
                    Object.assign(entity, { ID: id, SubscriptionNumber: row.SubscriptionNumber, AutoRenew: row.AutoRenew, RenewalIncreasePercent: row.RenewalIncreasePercent, refuse: row.refuse });
                    return true;
                },
                async Save() {
                    if (entity.refuse) {
                        entity.LatestResult = { CompleteMessage: entity.refuse };
                        return false;
                    }
                    store.saved.push({ ID: entity.ID, AutoRenew: entity.AutoRenew, RenewalIncreasePercent: entity.RenewalIncreasePercent });
                    Object.assign(store.rows.get(entity.ID)!, { AutoRenew: entity.AutoRenew, RenewalIncreasePercent: entity.RenewalIncreasePercent });
                    return true;
                },
            };
            return entity;
        },
    } as unknown as IMetadataProvider;
    return { provider, store };
}

async function run(input: unknown, provider: IMetadataProvider): Promise<OrdersSetRenewalSettingsOutput> {
    const op = new SetRenewalSettingsOperation();
    return (op as unknown as { InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<OrdersSetRenewalSettingsOutput> }).InternalExecute(input, provider, USER);
}

describe('RequireIncreasePercent', () => {
    it('accepts 0 to 100 with up to four decimals, null to clear, and refuses the rest', () => {
        expect(RequireIncreasePercent(5)).toBe(5);
        expect(RequireIncreasePercent('4.5')).toBe(4.5);
        expect(RequireIncreasePercent(0)).toBe(0);
        expect(RequireIncreasePercent(12.3456)).toBe(12.3456); // 12.3456 * 1e4 is not an integer in floating point
        expect(RequireIncreasePercent(2.0003)).toBe(2.0003);
        expect(RequireIncreasePercent(null)).toBeNull();
        expect(() => RequireIncreasePercent(-1)).toThrow(/between 0 and 100/);
        expect(() => RequireIncreasePercent(101)).toThrow(/between 0 and 100/);
        expect(() => RequireIncreasePercent(1.23456)).toThrow(/decimals/);
        expect(() => RequireIncreasePercent('five')).toThrow(/number of percent/);
    });
});

describe('Orders.SetRenewalSettings', () => {
    it('writes the increase to each subscription through the entity and reports each one', async () => {
        const { provider, store } = world();
        const out = await run({ SubscriptionIDs: [S1, S2, S3], IncreasePercent: 5 }, provider);
        expect(out).toMatchObject({ Success: true, Updated: 1, Unchanged: 1, Failed: 1 });
        expect(out.Changes).toEqual([
            { SubscriptionID: S1, SubscriptionNumber: 'SUB-1', Previous: { AutoRenew: true, IncreasePercent: null }, Current: { AutoRenew: true, IncreasePercent: 5 }, Changed: true },
            { SubscriptionID: S2, SubscriptionNumber: 'SUB-2', Previous: { AutoRenew: false, IncreasePercent: 5 }, Current: { AutoRenew: false, IncreasePercent: 5 }, Changed: false },
            { SubscriptionID: S3, SubscriptionNumber: 'SUB-3', Previous: { AutoRenew: true, IncreasePercent: 0 }, Current: { AutoRenew: true, IncreasePercent: 0 }, Changed: false, Error: 'the gateway bills this subscription' },
        ]);
        expect(out.Message).toBe('Renewal increase 5%: 1 subscription updated, 1 already there, 1 failed.');
        // Subscriptions only. No order, line or term entity was ever asked for.
        expect(new Set(store.entitiesAsked)).toEqual(new Set(['MJ_BizApps_Orders: Subscriptions']));
        expect(store.saved).toEqual([{ ID: S1, AutoRenew: true, RenewalIncreasePercent: 5 }]);
    });

    it('flips auto-renew and leaves the rate alone when the rate is not given', async () => {
        const { provider, store } = world();
        const out = await run({ SubscriptionIDs: [S1, S2], AutoRenew: false }, provider);
        expect(out.Changes[0]).toMatchObject({ Current: { AutoRenew: false, IncreasePercent: null }, Changed: true });
        expect(out.Changes[1]).toMatchObject({ Changed: false });
        expect(out.Message).toBe('Auto-renew off: 1 subscription updated, 1 already there.');
        expect(store.saved).toEqual([{ ID: S1, AutoRenew: false, RenewalIncreasePercent: null }]);
    });

    it('sets both in one write, and says both', async () => {
        const { provider, store } = world();
        const out = await run({ SubscriptionIDs: [S2], AutoRenew: true, IncreasePercent: 3 }, provider);
        expect(out.Message).toBe('Auto-renew on, renewal increase 3%: 1 subscription updated.');
        expect(store.saved).toEqual([{ ID: S2, AutoRenew: true, RenewalIncreasePercent: 3 }]);
    });

    it('null clears the rate so the subscription inherits, and says so', async () => {
        const { provider, store } = world();
        const out = await run({ SubscriptionIDs: [S2], IncreasePercent: null }, provider);
        expect(out.Changes[0]).toMatchObject({ Previous: { IncreasePercent: 5 }, Current: { IncreasePercent: null }, Changed: true });
        expect(out.Message).toMatch(/cleared \(inherits\)/);
        expect(store.saved).toEqual([{ ID: S2, AutoRenew: false, RenewalIncreasePercent: null }]);
    });

    it('a subscription that does not exist is reported, not thrown, and the rest still proceed', async () => {
        const { provider } = world();
        const missing = '0d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e99';
        const out = await run({ SubscriptionIDs: [missing, S1], IncreasePercent: 3 }, provider);
        expect(out.Changes[0]).toMatchObject({ SubscriptionID: missing, Changed: false, Error: 'no such subscription' });
        expect(out.Changes[1]).toMatchObject({ SubscriptionID: S1, Changed: true });
        expect(out.Success).toBe(true);
    });

    it('refuses bad input before touching anything: no IDs, a non-UUID, a rate out of range, nothing to set', async () => {
        for (const input of [
            { SubscriptionIDs: [], IncreasePercent: 5 },
            { SubscriptionIDs: ["1' OR 1=1 --"], IncreasePercent: 5 },
            { SubscriptionIDs: [S1], IncreasePercent: 250 },
            { SubscriptionIDs: [S1] },
            { SubscriptionIDs: [S1], AutoRenew: 'yes' },
        ]) {
            const { provider, store } = world();
            const out = await run(input, provider);
            expect(out.Success).toBe(false);
            expect(out.Message).toBeTruthy();
            expect(store.entitiesAsked).toHaveLength(0);
        }
    });

    it('every row failing fails the call, since nothing asked for happened', async () => {
        const { provider } = world();
        const out = await run({ SubscriptionIDs: [S3], AutoRenew: false }, provider);
        expect(out.Success).toBe(false);
        expect(out.Failed).toBe(1);
    });

    it('the same ID twice is one write', async () => {
        const { provider, store } = world();
        await run({ SubscriptionIDs: [S1, S1.toUpperCase()], IncreasePercent: 2 }, provider);
        expect(store.saved).toHaveLength(1);
    });
});
