import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    runViewImpl: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            static Provider = {};
            CurrentUser = {};
        },
        RunView: class {
            RunView(params: unknown): Promise<unknown> {
                return mocks.runViewImpl(params);
            }
            static FromMetadataProvider() {
                return {
                    RunView: (params: unknown) => mocks.runViewImpl(params),
                };
            }
        },
    };
});

import type { UserInfo } from '@memberjunction/core';
import {
    GetOrders,
    GetOrderSummary,
    MJOQueryError,
    RunOrdersPageLoad,
} from '../orders-queries';
import {
    ResolveEffectiveCompanyIDs,
    UserHoldsFinanceRole,
} from '../../services/company-scope.service';

describe('MJOQueryError and RunOrdersPageLoad', () => {
    it('throws MJOQueryError when RunView returns Success: false instead of silently returning []', async () => {
        mocks.runViewImpl.mockResolvedValueOnce({
            Success: false,
            ErrorMessage: 'View metadata missing',
            Results: [],
        });

        await expect(GetOrders()).rejects.toThrow(MJOQueryError);
        mocks.runViewImpl.mockResolvedValueOnce({
            Success: false,
            ErrorMessage: 'Permission denied on MJ: Orders',
            Results: [],
        });
        await expect(GetOrderSummary()).rejects.toThrow('Permission denied on MJ: Orders');
    });

    it('captures MJOQueryError in RunOrdersPageLoad and returns the message string', async () => {
        const message = await RunOrdersPageLoad(async () => {
            throw new MJOQueryError('MJ: Orders', '', 'Invalid column name Status');
        });

        expect(message).toBe('Could not load MJ: Orders: Invalid column name Status');

        const ok = await RunOrdersPageLoad(async () => {
            // succeeds
        });
        expect(ok).toBeNull();
    });
});

describe('CompanyScopeService helpers', () => {
    it('identifies Finance role holders case-insensitively and resolves effective company scope', () => {
        expect(UserHoldsFinanceRole({ UserRoles: [{ Role: 'Finance' }] } as unknown as UserInfo)).toBe(true);
        expect(UserHoldsFinanceRole({ UserRoles: [{ Role: 'Senior Finance (AR)' }] } as unknown as UserInfo)).toBe(true);
        expect(UserHoldsFinanceRole({ UserRoles: [{ Role: 'Sales Representative' }] } as unknown as UserInfo)).toBe(false);

        const co1 = '11111111-1111-4111-8111-111111111111';
        const co2 = '22222222-2222-4222-8222-222222222222';
        expect(ResolveEffectiveCompanyIDs([], null)).toBeNull();
        expect(ResolveEffectiveCompanyIDs([co1], null)).toEqual([co1]);
        expect(ResolveEffectiveCompanyIDs([], [co1, co2])).toEqual([co1, co2]);
        expect(ResolveEffectiveCompanyIDs([co2], [co1, co2])).toEqual([co2]);
    });
});
