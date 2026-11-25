import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The billing worklist lists only instalments of confirmed orders (golive #469). A Draft order's
 * schedule rows were listed and offered "Issue invoice", which `Orders.IssueInstalmentInvoice` then
 * refuses. `RunView` is mocked to capture the schedule query and return no rows.
 */

const mocks = vi.hoisted(() => ({ filters: [] as string[] }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            static FromMetadataProvider() {
                return {
                    RunView: vi.fn().mockImplementation((params: { ExtraFilter?: string }) => {
                        mocks.filters.push(params.ExtraFilter ?? '');
                        return Promise.resolve({ Success: true, Results: [] });
                    }),
                };
            }
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import type { OrdersGetBillingWorklistInput, OrdersGetBillingWorklistOutput } from '@mj-biz-apps/orders-entities';

import { GetBillingWorklistOperation } from '../GetBillingWorklistOperation.js';

interface CallableOperation {
    InternalExecute(input: OrdersGetBillingWorklistInput, provider: IMetadataProvider, user: UserInfo): Promise<OrdersGetBillingWorklistOutput>;
}

describe('GetBillingWorklistOperation', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };

    afterEach(() => {
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
        mocks.filters = [];
    });

    it('asks only for instalments of confirmed orders, in the query itself', async () => {
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"UTC","sql":"UTC"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
        engine._loaded = true;

        const op = new GetBillingWorklistOperation() as unknown as CallableOperation;
        const out = await op.InternalExecute({ AsOfDate: '2026-11-10', WindowDays: 30 }, {} as IMetadataProvider, {} as UserInfo);

        expect(out.Success).toBe(true);
        expect(mocks.filters).toHaveLength(1);
        expect(mocks.filters[0]).toContain(`Status = 'Scheduled'`);
        expect(mocks.filters[0]).toContain(`DueDate <= '2026-12-10'`);
        expect(mocks.filters[0]).toContain(`OrderHeaderID IN (SELECT ID FROM __mj_BizAppsOrders.OrderHeader WHERE Status = 'Confirmed')`);
    });
});
