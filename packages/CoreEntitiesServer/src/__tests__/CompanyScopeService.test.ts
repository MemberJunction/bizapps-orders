import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    runViewImpl: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView(params: unknown): Promise<unknown> {
                return mocks.runViewImpl(params);
            }
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    CompanyScopeService,
    IntersectCompanyScope,
    UserHoldsAllCompaniesRole,
} from '../CompanyScopeService.js';

const CO_A = '11111111-1111-4111-8111-111111111111';
const CO_B = '22222222-2222-4222-8222-222222222222';
const CO_OTHER = '33333333-3333-4333-8333-333333333333';
const EMP_1 = '44444444-4444-4444-8444-444444444444';

describe('CompanyScopeService', () => {
    it('recognizes Finance and administrative roles as all-companies scope', () => {
        expect(
            UserHoldsAllCompaniesRole({
                UserRoles: [{ Role: 'Finance' }],
            } as unknown as UserInfo),
        ).toBe(true);

        expect(
            UserHoldsAllCompaniesRole({
                UserRoles: [{ Role: 'Sales' }],
            } as unknown as UserInfo),
        ).toBe(false);
    });

    it('intersects requested CompanyIDs with user allowed companies so non-Finance callers cannot widen scope', () => {
        expect(IntersectCompanyScope(undefined, null)).toBeNull();
        expect(IntersectCompanyScope([CO_A], null)).toEqual([CO_A]);

        expect(IntersectCompanyScope(undefined, [CO_A, CO_B])).toEqual([CO_A, CO_B]);
        expect(IntersectCompanyScope([CO_B, CO_OTHER], [CO_A, CO_B])).toEqual([CO_B]);
        expect(IntersectCompanyScope([CO_OTHER], [CO_A])).toEqual([]);
    });

    it('resolves employee company assignments for non-Finance users', async () => {
        mocks.runViewImpl.mockResolvedValueOnce({
            Success: true,
            Results: [{ CompanyID: CO_A }],
        });

        const scoped = await CompanyScopeService.ResolveReceivablesCompanyIDs(
            undefined,
            {} as unknown as IMetadataProvider,
            { ID: 'user-1', EmployeeID: EMP_1, UserRoles: [{ Role: 'Operations' }] } as unknown as UserInfo,
        );
        expect(scoped).toEqual([CO_A]);
    });
});
