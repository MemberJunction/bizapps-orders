/**
 * Who may issue a refund (bc-aidp-next-golive#320 §3) — the pure rule, and the server check that
 * gathers its facts. No database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CALLER = 'AAAAAAAA-0000-0000-0000-000000000001';
const CFO = 'AAAAAAAA-0000-0000-0000-000000000002';
const SYSTEM = 'AAAAAAAA-0000-0000-0000-000000000003';
const COMPANY = 'BBBBBBBB-0000-0000-0000-000000000001';
const ROLE = 'CCCCCCCC-0000-0000-0000-000000000001';

const h = vi.hoisted(() => ({
    threshold: null as number | null,
    roleName: null as string | null,
    companyApprover: null as string | null,
    roles: [] as Array<{ ID: string }>,
    userRoles: [] as Array<{ ID: string }>,
    failCompanyRead: false,
    filters: [] as string[],
}));

vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: {
        Load: vi.fn(async () => undefined),
        get RefundApprovalThreshold() { return h.threshold; },
        get RefundApproverRole() { return h.roleName; },
    },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => ({ ID: SYSTEM }) } },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider: () => ({
                RunView: async (p: { EntityName: string; ExtraFilter: string }) => {
                    h.filters.push(`${p.EntityName}: ${p.ExtraFilter}`);
                    if (p.EntityName === 'MJ_BizApps_Accounting: Accounting Company Profiles') {
                        return h.failCompanyRead
                            ? { Success: false, Results: [], ErrorMessage: 'database unavailable' }
                            : { Success: true, Results: [{ ApprovalCFOUserID: h.companyApprover }] };
                    }
                    if (p.EntityName === 'MJ: Roles') return { Success: true, Results: h.roles };
                    if (p.EntityName === 'MJ: User Roles') return { Success: true, Results: h.userRoles };
                    return { Success: false, Results: [], ErrorMessage: `unexpected ${p.EntityName}` };
                },
            }),
        },
    };
});

const { RefundAuthorityRefusal, CheckRefundAuthority } = await import('../RefundAuthority.js');
type Facts = Parameters<typeof RefundAuthorityRefusal>[0];

const facts = (over: Partial<Facts> = {}): Facts => ({
    Threshold: 500,
    ApproverRoleName: 'Refund Approver',
    RefundedTotalAfter: 200,
    PaymentNumber: 'PAY-000008',
    IsProviderOriginated: false,
    CallerUserID: CALLER,
    CompanyApproverUserID: CFO,
    CallerHoldsApproverRole: true,
    ...over,
});

describe('RefundAuthorityRefusal', () => {
    it('allows everyone while the threshold is unset (the neutral default)', () => {
        expect(RefundAuthorityRefusal(facts({ Threshold: null, CallerHoldsApproverRole: false, RefundedTotalAfter: 1e6 }))).toBeNull();
    });

    it('lets a role holder refund at or below the threshold', () => {
        expect(RefundAuthorityRefusal(facts({ RefundedTotalAfter: 500 }))).toBeNull();
    });

    it('refuses a caller without the role at or below the threshold', () => {
        expect(RefundAuthorityRefusal(facts({ CallerHoldsApproverRole: false }))).toMatch(/needs the 'Refund Approver' role/);
    });

    it('refuses a role holder above the threshold', () => {
        expect(RefundAuthorityRefusal(facts({ RefundedTotalAfter: 500.01 }))).toMatch(/above the 500.00 refund approval threshold, so only/);
    });

    it('lets the company approver refund above the threshold (case-insensitive IDs)', () => {
        expect(RefundAuthorityRefusal(facts({ RefundedTotalAfter: 9000, CallerUserID: CFO.toLowerCase(), CallerHoldsApproverRole: false }))).toBeNull();
    });

    it('lets the company approver refund below the threshold without the role', () => {
        expect(RefundAuthorityRefusal(facts({ CallerUserID: CFO, CallerHoldsApproverRole: false }))).toBeNull();
    });

    it('refuses above the threshold when the company has no approver', () => {
        expect(RefundAuthorityRefusal(facts({ RefundedTotalAfter: 9000, CompanyApproverUserID: null }))).toMatch(/has no approver .* so nobody may issue it/);
    });

    it('with no approver role configured, only the company approver may refund', () => {
        expect(RefundAuthorityRefusal(facts({ ApproverRoleName: null }))).toMatch(/no refund approver role is configured/);
        expect(RefundAuthorityRefusal(facts({ ApproverRoleName: null, CallerUserID: CFO }))).toBeNull();
    });

    it('a threshold of 0 sends every refund to the company approver', () => {
        expect(RefundAuthorityRefusal(facts({ Threshold: 0, RefundedTotalAfter: 0.01 }))).toMatch(/only the receiving company's approver/);
    });

    it('exempts a gateway refund booked by the system user', () => {
        expect(RefundAuthorityRefusal(facts({ IsProviderOriginated: true, RefundedTotalAfter: 9000, CallerHoldsApproverRole: false }))).toBeNull();
    });
});

describe('CheckRefundAuthority', () => {
    const request = { PaymentNumber: 'PAY-000008', ReceivingCompanyID: COMPANY, RefundedTotalAfter: 200, ProviderRefundID: null as string | null };
    const user = (id: string) => ({ ID: id }) as Parameters<typeof CheckRefundAuthority>[2];
    const provider = {} as Parameters<typeof CheckRefundAuthority>[1];

    beforeEach(() => {
        h.threshold = 500;
        h.roleName = 'Refund Approver';
        h.companyApprover = CFO;
        h.roles = [{ ID: ROLE }];
        h.userRoles = [];
        h.failCompanyRead = false;
        h.filters = [];
    });

    it('reads nothing while the threshold is unset', async () => {
        h.threshold = null;
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).resolves.toBeNull();
        expect(h.filters).toEqual([]);
    });

    it('allows a holder of the configured role', async () => {
        h.userRoles = [{ ID: 'ur-1' }];
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).resolves.toBeNull();
        expect(h.filters).toContain(`MJ: User Roles: UserID = '${CALLER}' AND RoleID = '${ROLE}'`);
    });

    it('refuses someone without it', async () => {
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).resolves.toMatch(/needs the 'Refund Approver' role/);
    });

    it('reads the approver of the receiving company', async () => {
        await CheckRefundAuthority(request, provider, user(CALLER));
        expect(h.filters).toContain(`MJ_BizApps_Accounting: Accounting Company Profiles: ID = '${COMPANY}'`);
    });

    it('exempts a gateway refund only when the system user books it', async () => {
        const gateway = { ...request, RefundedTotalAfter: 9000, ProviderRefundID: 're_123' };
        await expect(CheckRefundAuthority(gateway, provider, user(SYSTEM))).resolves.toBeNull();
        await expect(CheckRefundAuthority(gateway, provider, user(CALLER))).resolves.toMatch(/only the receiving company's approver/);
    });

    it('does not exempt the system user without a gateway refund id', async () => {
        await expect(CheckRefundAuthority({ ...request, RefundedTotalAfter: 9000 }, provider, user(SYSTEM))).resolves.toMatch(/only the receiving company's approver/);
    });

    it('throws when the configured role does not exist, rather than refunding unchecked', async () => {
        h.roles = [];
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).rejects.toThrow(/'Refund Approver' \(Orders setting RefundApproverRole\) does not exist/);
    });

    it('throws when the company approver cannot be read', async () => {
        h.failCompanyRead = true;
        await expect(CheckRefundAuthority(request, provider, user(CALLER))).rejects.toThrow(/database unavailable/);
    });

    it('refuses a receiving company ID that is not a UUID before it reaches a filter', async () => {
        await expect(CheckRefundAuthority({ ...request, ReceivingCompanyID: "x' OR 1=1 --" }, provider, user(CALLER))).rejects.toThrow(/must be a UUID/);
    });
});
