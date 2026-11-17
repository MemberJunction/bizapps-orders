import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The overdue worklist's totals, buckets and customer credit are in the functional currency
 * (golive #492). Each row keeps its own amounts in the order's currency and names that currency; a
 * foreign order with no booking rate is left out of the totals and counted.
 *
 * `RunView` is mocked by entity and filter: the overdue read, the accounting profiles, and the credit
 * read each get their own rows.
 */

const COMPANY_US = '11111111-1111-1111-1111-111111111111';
const CUSTOMER = '22222222-2222-2222-2222-222222222222';

const mocks = vi.hoisted(() => ({
    overdue: [] as Array<Record<string, unknown>>,
    credits: [] as Array<Record<string, unknown>>,
    profiles: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            static FromMetadataProvider() {
                return {
                    RunView: vi.fn().mockImplementation((params: { EntityName: string; ExtraFilter?: string }) => {
                        if (params.EntityName.includes('Accounting Company Profiles')) return Promise.resolve({ Success: true, Results: mocks.profiles });
                        if (params.ExtraFilter?.startsWith('Balance < 0')) return Promise.resolve({ Success: true, Results: mocks.credits });
                        if (params.EntityName.includes('Order Headers')) return Promise.resolve({ Success: true, Results: mocks.overdue });
                        return Promise.resolve({ Success: true, Results: [] });
                    }),
                };
            }
        },
    };
});

vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: { Load: vi.fn().mockResolvedValue(undefined), RenewalAccessCutoffDaysPastDue: null },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import type { OrdersGetOverdueWorklistInput, OrdersGetOverdueWorklistOutput } from '@mj-biz-apps/orders-entities';

import { GetOverdueWorklistOperation } from '../GetOverdueWorklistOperation.js';

interface CallableOperation {
    InternalExecute(input: OrdersGetOverdueWorklistInput, provider: IMetadataProvider, user: UserInfo): Promise<OrdersGetOverdueWorklistOutput>;
}

function runWorklist(): Promise<OrdersGetOverdueWorklistOutput> {
    const op = new GetOverdueWorklistOperation() as unknown as CallableOperation;
    return op.InternalExecute({ AsOfDate: '2026-11-17' }, {} as IMetadataProvider, {} as UserInfo);
}

function order(id: string, due: string, balance: number, currency: string | null, rate: number | null): Record<string, unknown> {
    return {
        ID: id,
        OrderNumber: `SO-${id.slice(0, 4)}`,
        OrderDate: '2026-09-01',
        DueDate: due,
        NextDueDate: due,
        Status: 'Confirmed',
        CompanyID: COMPANY_US,
        TotalGross: balance,
        AmountPaid: 0,
        Balance: balance,
        CurrencyCode: currency,
        BookingExchangeRate: rate,
        BillToOrganizationID: CUSTOMER,
    };
}

describe('GetOverdueWorklistOperation in more than one currency (golive #492)', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };

    beforeEach(() => {
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"UTC","sql":"UTC"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
        engine._loaded = true;
        mocks.profiles = [{ ID: COMPANY_US, FunctionalCurrencyCode: 'USD' }];
        mocks.overdue = [
            order('aaaaaaaa-0000-0000-0000-000000000001', '2026-11-07', 100, null, null),
            order('aaaaaaaa-0000-0000-0000-000000000002', '2026-08-01', 1000, 'AUD', 0.65),
            order('aaaaaaaa-0000-0000-0000-000000000003', '2026-11-01', 40, 'USD', null),
        ];
        mocks.credits = [order('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-01', -200, 'AUD', 0.5)];
    });

    afterEach(() => {
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
    });

    it('totals and buckets the functional balance', async () => {
        const result = await runWorklist();
        expect(result.Success).toBe(true);
        expect(result.TotalOverdue).toBe(790);
        expect(result.UnconvertedCount).toBe(0);
        expect(result.Buckets).toEqual({ Current: 0, Days1To30: 140, Days31To60: 0, Days61Plus: 650 });
    });

    it('keeps each row in its own currency and names a foreign one', async () => {
        const rows = (await runWorklist()).Rows;
        const aud = rows.find((r) => r.Balance === 1000);
        expect(aud?.CurrencyCode).toBe('AUD');
        expect(aud?.FunctionalBalance).toBe(650);
        // Coded in its company's own functional currency: no code, no rate needed.
        const usd = rows.find((r) => r.Balance === 40);
        expect(usd?.CurrencyCode).toBeNull();
        expect(usd?.FunctionalBalance).toBe(40);
    });

    it('converts the customer credit too', async () => {
        const rows = (await runWorklist()).Rows;
        expect(rows.every((r) => r.AvailableCredit === 100)).toBe(true);
    });

    it('leaves a foreign row with no rate out of the totals and counts it', async () => {
        mocks.overdue = [...mocks.overdue, order('aaaaaaaa-0000-0000-0000-000000000004', '2026-11-01', 5000, 'EUR', null)];
        const result = await runWorklist();
        expect(result.TotalOverdue).toBe(790);
        expect(result.UnconvertedCount).toBe(1);
        expect(result.Rows.find((r) => r.Balance === 5000)?.FunctionalBalance).toBeNull();
    });
});
