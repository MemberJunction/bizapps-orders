/**
 * The setting -> rule wiring for the refund authority (bc-aidp-next-golive#320 §3), over the REAL
 * `OrdersSettings.RefundApprovalThreshold` getter (RefundAuthority.test.ts mocks the settings
 * wholesale). Pins the parse table, that a configured threshold turns the check on, that an
 * unreadable one tightens it to 0, and that a missing Orders app row throws rather than reading the
 * check as off. No database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CALLER = 'AAAAAAAA-0000-0000-0000-000000000001';
const CFO = 'AAAAAAAA-0000-0000-0000-000000000002';
const COMPANY = 'BBBBBBBB-0000-0000-0000-000000000001';
const ROLE = 'CCCCCCCC-0000-0000-0000-000000000001';

const h = vi.hoisted(() => ({
    userRoles: [] as Array<{ ID: string }>,
    filters: [] as string[],
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => null } },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        // No Orders application row: only an override can supply the setting.
        Metadata: class {
            get Applications() {
                return [];
            }
        },
        RunView: {
            FromMetadataProvider: () => ({
                RunView: async (p: { EntityName: string; ExtraFilter: string }) => {
                    h.filters.push(`${p.EntityName}: ${p.ExtraFilter}`);
                    if (p.EntityName === 'MJ_BizApps_Accounting: Accounting Company Profiles') return { Success: true, Results: [{ ApprovalCFOUserID: CFO }] };
                    if (p.EntityName === 'MJ: Users') return { Success: true, Results: [{ ID: CFO }] };
                    if (p.EntityName === 'MJ: Roles') return { Success: true, Results: [{ ID: ROLE }] };
                    if (p.EntityName === 'MJ: User Roles') return { Success: true, Results: h.userRoles };
                    return { Success: false, Results: [], ErrorMessage: `unexpected ${p.EntityName}` };
                },
            }),
        },
    };
});

const { OrdersSettings } = await import('../OrdersSettings.js');
const { CheckRefundAuthority } = await import('../RefundAuthority.js');

const THRESHOLD = 'RefundApprovalThreshold';
const ROLE_SETTING = 'RefundApproverRole';

describe('OrdersSettings.RefundApprovalThreshold (real getter)', () => {
    afterEach(() => OrdersSettings.ClearOverrides());

    it.each([
        ['', null],
        ['   ', null],
        ['0', 0],
        ['0.00', 0],
        ['500', 500],
        ['500.00', 500],
        ['  500  ', 500],
        ['500.5', 500.5],
        ['abc', 0],
        ['off', 0],
        ['$500', 0],
        ['1,000', 0],
        ['1e3', 0],
        ['-5', 0],
        ['NaN', 0],
    ])('reads %j as %j', (value, expected) => {
        OrdersSettings.SetOverride(THRESHOLD, value);
        expect(OrdersSettings.RefundApprovalThreshold).toBe(expected);
    });

    it('throws when the Orders application row is missing, rather than reading the check as off', () => {
        expect(() => OrdersSettings.RefundApprovalThreshold).toThrow(/Orders application \(__mj_BizAppsOrders\) is not in metadata.*RefundApprovalThreshold/);
    });
});

describe('CheckRefundAuthority over the real settings', () => {
    const request = { PaymentNumber: 'PAY-000008', ReceivingCompanyID: COMPANY, RefundedTotalAfter: 200, ProviderRefundID: null as string | null };
    const user = (id: string) => ({ ID: id }) as Parameters<typeof CheckRefundAuthority>[2];
    const provider = {} as Parameters<typeof CheckRefundAuthority>[1];

    beforeEach(() => {
        vi.spyOn(OrdersSettings, 'Load').mockResolvedValue(undefined);
        OrdersSettings.SetOverride(ROLE_SETTING, 'Refund Approver');
        h.userRoles = [];
        h.filters = [];
    });
    afterEach(() => {
        OrdersSettings.ClearOverrides();
        vi.restoreAllMocks();
    });

    it('an empty threshold leaves the check off and reads nothing', async () => {
        OrdersSettings.SetOverride(THRESHOLD, '');
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).resolves.toBeNull();
        expect(h.filters).toEqual([]);
    });

    it('a configured threshold turns the check on', async () => {
        OrdersSettings.SetOverride(THRESHOLD, '500.00');
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).resolves.toMatch(/needs the 'Refund Approver' role/);
        h.userRoles = [{ ID: 'ur-1' }];
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).resolves.toBeNull();
        await expect(CheckRefundAuthority({ ...request, RefundedTotalAfter: 500.01 }, provider, user(CALLER))).resolves.toMatch(
            /above the 500.00 refund approval threshold/,
        );
    });

    it('an unreadable threshold is treated as 0, so every refund needs the company approver', async () => {
        OrdersSettings.SetOverride(THRESHOLD, 'abc');
        h.userRoles = [{ ID: 'ur-1' }];
        await expect(CheckRefundAuthority({ ...request, RefundedTotalAfter: 0.01 }, provider, user(CALLER))).resolves.toMatch(
            /above the 0.00 refund approval threshold, so only the receiving company's approver/,
        );
        await expect(CheckRefundAuthority({ ...request, RefundedTotalAfter: 0.01 }, provider, user(CFO))).resolves.toBeNull();
    });

    it('a missing Orders application row fails the refund loudly instead of switching the check off', async () => {
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).rejects.toThrow(/is not in metadata/);
    });
});
