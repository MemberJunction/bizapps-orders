/**
 * OrderHeaderEntity.LoadPaymentSchedule: the read behind the order form's Payment tab.
 *
 * `OrderHeaderEntity` cannot be constructed cheaply (see order-header-default-date.test.ts), so
 * `Object.create` holds one without metadata, carrying only what the read uses. RunView is stubbed
 * to record the parameters it was given.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    Calls: [] as Array<{ params: Record<string, unknown>; user: unknown }>,
    Result: { Success: true, Results: [] as unknown[], ErrorMessage: '' } as { Success: boolean; Results?: unknown[]; ErrorMessage?: string },
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    RunView: class {
        RunView = async (params: Record<string, unknown>, user: unknown) => {
            m.Calls.push({ params, user });
            return m.Result;
        };
    },
}));

import { OrderHeaderEntity } from '../OrderHeaderEntity';

const ORDER = 'A0000000-0000-4000-8000-000000000001';
const USER = { ID: 'u' };

function header(opts: { id?: string; saved?: boolean; provider?: unknown } = {}): OrderHeaderEntity {
    const instance = Object.create(OrderHeaderEntity.prototype) as OrderHeaderEntity;
    Object.defineProperty(instance, 'ID', { value: opts.id ?? ORDER });
    Object.defineProperty(instance, 'IsSaved', { value: opts.saved ?? true });
    Object.defineProperty(instance, 'ProviderToUse', { value: 'provider' in opts ? opts.provider : {} });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: USER });
    return instance;
}

beforeEach(() => {
    m.Calls = [];
    m.Result = { Success: true, Results: [] };
});

describe('LoadPaymentSchedule', () => {
    it("reads this order's rows in instalment order, as the order's user", async () => {
        const rows = [{ ID: 'r1' }, { ID: 'r2' }];
        m.Result = { Success: true, Results: rows };

        await expect(header().LoadPaymentSchedule()).resolves.toEqual(rows);
        expect(m.Calls).toHaveLength(1);
        expect(m.Calls[0].params).toMatchObject({
            EntityName: 'MJ_BizApps_Orders: Order Header Payment Schedules',
            ExtraFilter: `OrderHeaderID='${ORDER}'`,
            ResultType: 'entity_object',
        });
        // Instalment number first; company settles two rows sharing a number on a pre-collapse order.
        expect(m.Calls[0].params.OrderBy).toBe('InstallmentNumber, CompanyID');
        expect(m.Calls[0].user).toBe(USER);
    });

    it('reads nothing for an unsaved order', async () => {
        await expect(header({ saved: false }).LoadPaymentSchedule()).resolves.toEqual([]);
        expect(m.Calls).toHaveLength(0);
    });

    it('reads nothing without a provider', async () => {
        await expect(header({ provider: null }).LoadPaymentSchedule()).resolves.toEqual([]);
        expect(m.Calls).toHaveLength(0);
    });

    it('refuses an ID that is not a UUID before building the filter', async () => {
        await expect(header({ id: "x' OR 1=1 --" }).LoadPaymentSchedule()).rejects.toThrow();
        expect(m.Calls).toHaveLength(0);
    });

    it("throws with the provider's reason when the read fails", async () => {
        m.Result = { Success: false, ErrorMessage: 'timeout' };
        await expect(header().LoadPaymentSchedule()).rejects.toThrow(/payment schedule: timeout/);
    });

    it('returns an empty list when a successful read carries no results', async () => {
        m.Result = { Success: true };
        await expect(header().LoadPaymentSchedule()).resolves.toEqual([]);
    });
});
