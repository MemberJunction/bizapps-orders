/**
 * Who decides a concession its requester would otherwise approve themselves (bc-aidp-next-golive#320): the
 * `ConcessionSelfApprovalEscalation` targets, tried in order, never the requester, and a refusal when no one
 * else is there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mj-biz-apps/tasks-entities', () => ({
    mjBizAppsTasksTaskEntity: class {},
    mjBizAppsTasksTaskLinkEntity: class {},
    mjBizAppsTasksTaskAssignmentEntity: class {},
}));

const settings = vi.hoisted(() => ({ OrdersSettings: { Load: vi.fn(), ConcessionSelfApprovalEscalation: [] as string[] } }));
vi.mock('../OrdersSettings.js', () => settings);

const roles = vi.hoisted(() => ({ UserHoldsRole: vi.fn() }));
vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return { ...actual, UserHoldsRole: roles.UserHoldsRole };
});

/** The rows each entity's reads return, keyed by entity name; a filter picks rows by the IDs or name it quotes. */
const db = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        async RunView(params: { EntityName: string; ExtraFilter?: string }) {
            const quoted = [...(params.ExtraFilter ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1].toLowerCase());
            const rows = (db.rows[params.EntityName] ?? []).filter((row) => {
                const key = String(row.ID ?? row.Name ?? '').toLowerCase();
                const name = String(row.Name ?? row.Code ?? '').toLowerCase();
                if (params.EntityName === 'MJ: User Roles') return quoted.includes(String(row.RoleID).toLowerCase());
                return quoted.includes(key) || quoted.includes(name);
            });
            return { Success: true, Results: rows };
        }
    }
    return { ...actual, RunView: FakeRunView };
});

const people = vi.hoisted(() => ({ ResolvePersonIDsForUsers: vi.fn() }));
vi.mock('../person-user-link.js', () => people);

const { ChooseEscalationApprovers, RouteConcessionToApproval, SelfApprovalEscalation } = await import('../ConcessionApprovalTask.js');

const CEO = '11111111-1111-4111-8111-111111111111';
const CFO = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ORDER = '44444444-4444-4444-8444-444444444444';
const COMPANY = '55555555-5555-4555-8555-555555555555';
const TIER_ROLE = '66666666-6666-4666-8666-666666666666';
const FINANCE_ROLE = '77777777-7777-4777-8777-777777777777';

const ctx = {
    Provider: { EntityByName: (name: string) => (name.includes('Accounting Company Profiles') ? { ID: 'profile-entity' } : { ID: 'x' }) },
    User: { ID: CEO },
} as never;

function seed(opts: { cfo?: string | null; cfoActive?: boolean; financeHolders?: string[]; tierHolders?: string[] } = {}) {
    const cfo = opts.cfo === undefined ? CFO : opts.cfo;
    const active = [CEO, OTHER, ...(cfo && opts.cfoActive !== false ? [cfo] : [])];
    db.rows = {
        'MJ_BizApps_Orders: Order Headers': [{ ID: ORDER, CompanyID: COMPANY }],
        'MJ_BizApps_Tasks: Task Types': [{ ID: 'type-1', Code: 'ORDERS_CONCESSION_APPROVAL' }],
        'MJ_BizApps_Accounting: Accounting Company Profiles': [{ ID: COMPANY, ApprovalCFOUserID: cfo }],
        'MJ: Users': active.map((ID) => ({ ID })),
        'MJ: Roles': [
            { ID: FINANCE_ROLE, Name: 'Finance Approver' },
            { ID: TIER_ROLE, Name: 'Top Approver' },
        ],
        'MJ: User Roles': [
            ...(opts.financeHolders ?? [CFO]).map((UserID) => ({ RoleID: FINANCE_ROLE, UserID })),
            ...(opts.tierHolders ?? [CEO]).map((UserID) => ({ RoleID: TIER_ROLE, UserID })),
        ],
    };
}

beforeEach(() => {
    roles.UserHoldsRole.mockResolvedValue(true);
    seed();
});

afterEach(() => {
    settings.OrdersSettings.ConcessionSelfApprovalEscalation = [];
    vi.clearAllMocks();
});

describe('ChooseEscalationApprovers', () => {
    it('takes the first target that names someone other than the requester, without the requester', () => {
        expect(
            ChooseEscalationApprovers(CEO, [
                { Target: 'CompanyCFO', UserIDs: [CEO] },
                { Target: 'Top Approver', UserIDs: [CEO, OTHER, OTHER.toUpperCase()] },
            ]),
        ).toEqual({ Target: 'Top Approver', UserIDs: [OTHER] });
    });

    it('refuses when no target names anyone but the requester, saying what each came to', () => {
        const result = ChooseEscalationApprovers(CEO, [
            { Target: 'CompanyCFO', UserIDs: [], Problem: "the order's company names no ApprovalCFOUserID" },
            { Target: 'Top Approver', UserIDs: [CEO] },
            { Target: 'Nobody', UserIDs: [] },
        ]);
        expect('Refusal' in result && result.Refusal).toMatch(/ConcessionSelfApprovalEscalation/);
        expect('Refusal' in result && result.Refusal).toContain("'CompanyCFO' (the order's company names no ApprovalCFOUserID)");
        expect('Refusal' in result && result.Refusal).toContain("'Top Approver' (only the requester)");
        expect('Refusal' in result && result.Refusal).toContain("'Nobody' (no active user)");
    });

    it('refuses an empty target list rather than returning no one', () => {
        expect(ChooseEscalationApprovers(CEO, [])).toHaveProperty('Refusal');
    });
});

describe('SelfApprovalEscalation', () => {
    const concession = (requester: string) => ({ OrderHeaderID: ORDER, RequestedByUserID: requester });

    it('does not apply while the setting is unset: the requester approves their own as before', async () => {
        expect(await SelfApprovalEscalation(TIER_ROLE, concession(CEO), ctx)).toBeNull();
        expect(roles.UserHoldsRole).not.toHaveBeenCalled();
    });

    it('does not apply when the requester does not hold the approving role', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        roles.UserHoldsRole.mockResolvedValue(false);
        expect(await SelfApprovalEscalation(TIER_ROLE, concession(OTHER), ctx)).toBeNull();
    });

    it("sends a holder's own concession to the order company's CFO approver", async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        expect(await SelfApprovalEscalation(TIER_ROLE, concession(CEO), ctx)).toEqual({ Target: 'CompanyCFO', UserIDs: [CFO] });
    });

    it('matches CompanyCFO without regard to case', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['companycfo'];
        expect(await SelfApprovalEscalation(TIER_ROLE, concession(CEO), ctx)).toEqual({ Target: 'companycfo', UserIDs: [CFO] });
    });

    it("moves on to the next target when the requester is the CFO, never assigning the CFO their own", async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO', 'Top Approver'];
        seed({ tierHolders: [CEO, CFO] });
        expect(await SelfApprovalEscalation(TIER_ROLE, concession(CFO), ctx)).toEqual({ Target: 'Top Approver', UserIDs: [CEO] });
    });

    it("sends it to a named role's active holders other than the requester", async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['Finance Approver'];
        seed({ financeHolders: [CFO, CEO] });
        expect(await SelfApprovalEscalation(TIER_ROLE, concession(CEO), ctx)).toEqual({ Target: 'Finance Approver', UserIDs: [CFO] });
    });

    it('refuses when the company names no CFO approver and nothing follows', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        seed({ cfo: null });
        const result = await SelfApprovalEscalation(TIER_ROLE, concession(CEO), ctx);
        expect(result).toHaveProperty('Refusal');
        expect(result && 'Refusal' in result ? result.Refusal : '').toContain('names no ApprovalCFOUserID');
    });

    it('refuses when the CFO approver is not an active user', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        seed({ cfoActive: false });
        const result = await SelfApprovalEscalation(TIER_ROLE, concession(CEO), ctx);
        expect(result && 'Refusal' in result ? result.Refusal : '').toContain('not an active user');
    });

    it('refuses when the named role does not exist', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['No Such Role'];
        const result = await SelfApprovalEscalation(TIER_ROLE, concession(CEO), ctx);
        expect(result && 'Refusal' in result ? result.Refusal : '').toContain("'No Such Role' (no role has that name)");
    });

    it('refuses when the only holder of the named role is the requester', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['Top Approver'];
        const result = await SelfApprovalEscalation(TIER_ROLE, concession(CEO), ctx);
        expect(result && 'Refusal' in result ? result.Refusal : '').toContain("'Top Approver' (only the requester)");
    });

    it('refuses CompanyCFO when the accounting app is not installed', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        const noAccounting = { ...ctx, Provider: { EntityByName: (name: string) => (name.includes('Accounting') ? null : { ID: 'x' }) } } as never;
        const result = await SelfApprovalEscalation(TIER_ROLE, concession(CEO), noAccounting);
        expect(result && 'Refusal' in result ? result.Refusal : '').toContain('the accounting app is not installed');
    });
});

describe('RouteConcessionToApproval with the escalation set', () => {
    /** A provider whose entity objects record what was saved; the tasks entities stand in as plain objects. */
    function routingProvider() {
        const saved: Record<string, Record<string, unknown>[]> = {};
        const provider = {
            EntityByName: (name: string) => ({ ID: `entity:${name}` }),
            GetEntityObject: async (name: string) => {
                const record: Record<string, unknown> = {
                    ID: `${name}:${(saved[name]?.length ?? 0) + 1}`,
                    OrderNumber: 'ORD-1',
                    CompanyID: COMPANY,
                    NewRecord: () => undefined,
                    Load: async () => true,
                    Save: async () => {
                        (saved[name] ??= []).push({ ...record });
                        return true;
                    },
                };
                return record;
            },
        };
        return { provider, saved };
    }

    beforeEach(() => {
        people.ResolvePersonIDsForUsers.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id.toLowerCase(), `person:${id}`])));
    });

    it("assigns a holder's own concession to the CFO approver, not to the approving role's holders", async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        seed({ tierHolders: [CEO, OTHER] });
        const { provider, saved } = routingProvider();

        await RouteConcessionToApproval(
            { ID: 'concession-1', OrderHeaderID: ORDER, RequestedByUserID: CEO, SalesRuleID: 'rule-1' },
            TIER_ROLE,
            '25% discount, 3,000.00',
            { Provider: provider, User: { ID: CEO } } as never,
        );

        const assigned = (saved['MJ_BizApps_Tasks: Task Assignments'] ?? []).map((a) => a.AssigneeRecordID);
        expect(assigned).toEqual([`person:${CFO}`]);
        expect(String(saved['MJ_BizApps_Tasks: Tasks']?.[0]?.Description)).toContain("comes to 'CompanyCFO'");
    });

    it("keeps assigning the role's other holders for a shift under finance review (no ConcessionLimit rule)", async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        seed({ tierHolders: [CEO, OTHER] });
        const { provider, saved } = routingProvider();

        await RouteConcessionToApproval(
            { ID: 'concession-1', OrderHeaderID: ORDER, RequestedByUserID: CEO, SalesRuleID: null },
            TIER_ROLE,
            'term moved 10 days later',
            { Provider: provider, User: { ID: CEO } } as never,
        );

        expect((saved['MJ_BizApps_Tasks: Task Assignments'] ?? []).map((a) => a.AssigneeRecordID)).toEqual([`person:${OTHER}`]);
    });

    it('refuses before raising any task when the escalation names no one but the requester', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        seed({ cfo: CEO, tierHolders: [CEO, OTHER] });
        const { provider, saved } = routingProvider();

        await expect(
            RouteConcessionToApproval(
                { ID: 'concession-1', OrderHeaderID: ORDER, RequestedByUserID: CEO, SalesRuleID: 'rule-1' },
                TIER_ROLE,
                '25% discount, 3,000.00',
                { Provider: provider, User: { ID: CEO } } as never,
            ),
        ).rejects.toThrow(/ConcessionSelfApprovalEscalation.*'CompanyCFO' \(only the requester\)/);
        expect(saved['MJ_BizApps_Tasks: Tasks']).toBeUndefined();
        expect(saved['MJ_BizApps_Tasks: Task Assignments']).toBeUndefined();
    });

    it('refuses when the escalation approver has no person record, so no one would be told', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        people.ResolvePersonIDsForUsers.mockResolvedValue(new Map());
        const { provider, saved } = routingProvider();

        await expect(
            RouteConcessionToApproval(
                { ID: 'concession-1', OrderHeaderID: ORDER, RequestedByUserID: CEO, SalesRuleID: 'rule-1' },
                TIER_ROLE,
                '25% discount, 3,000.00',
                { Provider: provider, User: { ID: CEO } } as never,
            ),
        ).rejects.toThrow(/goes to 'CompanyCFO'.*person record/);
        expect(saved['MJ_BizApps_Tasks: Tasks']).toBeUndefined();
    });
});
