/**
 * The progress worklist names the order view from entity metadata, not a literal schema (#804).
 *
 * A host may install the app under another schema name; a hard-coded `__mj_BizAppsOrders` in the
 * subquery would make the whole list fail there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';

import { GetProgressWorklistOperation } from '../GetProgressWorklistOperation.js';
import { ORDER_HEADER_ENTITY } from '../entity-names.js';

const PRODUCT = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

afterEach(() => vi.restoreAllMocks());

describe('GetProgressWorklist order subquery', () => {
    it('reads the schema and view of the Order Headers entity', async () => {
        const seen: RunViewParams[] = [];
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: (params: RunViewParams) => {
                seen.push(params);
                return Promise.resolve({ Success: true, Results: [] });
            },
        } as unknown as RunView);
        const op = new GetProgressWorklistOperation();
        vi.spyOn(op as unknown as { pocProductIDs: () => Promise<string[]> }, 'pocProductIDs').mockResolvedValue([PRODUCT]);
        const provider = {
            Authorizations: [],
            EntityByName: (name: string) =>
                name === ORDER_HEADER_ENTITY ? { SchemaName: 'host_orders', BaseView: 'vwOrderHeaders' } : undefined,
        } as unknown as IMetadataProvider;

        const out = await op.Build({}, provider, {} as UserInfo);

        expect(out.Success).toBe(true);
        expect(seen[0].ExtraFilter).toContain('SELECT ID FROM [host_orders].[vwOrderHeaders] WHERE ConfirmedAt IS NOT NULL');
        expect(seen[0].ExtraFilter).not.toContain('__mj_BizAppsOrders');
    });
});
