/**
 * Approval tiers (#308): a concession goes to the highest ConcessionLimit tier whose thresholds it meets,
 * only that tier's role decides it, and a tier may require a decision even within the requester's authority.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const approval = vi.hoisted(() => ({
    ActiveRoleHolderIDs: vi.fn(),
    CloseConcessionTasks: vi.fn(),
    ConcessionSummary: vi.fn(() => 'seats concession'),
    RouteConcessionToApproval: vi.fn(),
    UnlinkConcession: vi.fn(),
}));
vi.mock('../ConcessionApprovalTask.js', () => approval);

const gate = vi.hoisted(() => ({
    FindConcessionTier: vi.fn(),
    LinePriceConcessionFor: vi.fn(),
    LoadConcessionAuthority: vi.fn(),
    OrderConcessionTotal: vi.fn(),
    OrderNetTotal: vi.fn(),
}));
vi.mock('../ConcessionGate.js', () => gate);

const roles = vi.hoisted(() => ({ UserHoldsRole: vi.fn() }));
vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return { ...actual, UserHoldsRole: roles.UserHoldsRole };
});

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

const REQUESTER = { ID: 'requester-1' };
const APPROVER = { ID: 'approver-1' };

const tier = (overrides: Record<string, unknown> = {}) => ({
    ID: 'rule-manager',
    Name: 'Manager',
    ApprovalRequiredRoleID: 'role-manager',
    ConcessionTier: null,
    MinConcessionValue: null,
    MinConcessionPctOfContract: null,
    MinTermExtensionDays: null,
    RequiresDecisionWithinAuthority: false,
    ...overrides,
});

type Row = Record<string, unknown> & {
    prepareNew(): Promise<string | null>;
    applyDecision(): Promise<string | null>;
};

/** A Seats concession worth `value` on a 10,000 order, held without metadata. */
function seatsConcession(opts: { value?: number; user?: { ID: string }; saved?: boolean; status?: string; salesRuleID?: string | null }) {
    const row = Object.create(OrderConcessionEntityServer.prototype) as Row;
    const values: Record<string, unknown> = {
        ID: 'concession-1',
        Status: opts.status ?? 'Pending',
        DeliveryForm: 'Seats',
        OrderHeaderID: 'order-1',
        OrderLineID: 'line-1',
        AddedQuantity: 2,
        AddedDays: null,
        Reason: 'retention',
        RequestedByUserID: REQUESTER.ID,
        SalesRuleID: opts.salesRuleID ?? null,
        AuthorizedBySalesAuthorityID: null,
        ComputedValue: 0,
        OrderNetTotal: null,
        CumulativeShare: null,
        DecidedByUserID: null,
        DecidedAt: null,
        ReferralProgramID: null,
    };
    for (const name of Object.keys(values)) {
        Object.defineProperty(row, name, { get: () => values[name], set: (v) => (values[name] = v) });
    }
    Object.defineProperty(row, 'ContextCurrentUser', { value: opts.user ?? REQUESTER });
    Object.defineProperty(row, 'ProviderToUse', { value: {} });
    row.valueByForm = async () => ({ Value: opts.value ?? 500, Percent: null });
    row.GetFieldByName = (name: string) =>
        name === 'Status' ? { Dirty: opts.saved === true, OldValue: 'Pending' } : { Dirty: false };
    return { row, values };
}

function withAuthority(maxValue: number | null) {
    gate.LoadConcessionAuthority.mockResolvedValue(
        maxValue == null
            ? null
            : { ID: 'auth-1', MaxDiscountPct: null, MaxConcessionValue: maxValue, MaxTermExtensionDays: null, MaxConcessionPctOfContract: null },
    );
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('recording a concession under tiers', () => {
    it('routes it to the tier the gate chooses, Pending for that tier\'s role', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(0);
        withAuthority(100);
        const senior = tier({ ID: 'rule-director', Name: 'Director', ApprovalRequiredRoleID: 'role-director', ConcessionTier: 1, MinConcessionValue: 1000 });
        gate.FindConcessionTier.mockResolvedValue({ Rule: senior, Conflict: null });
        roles.UserHoldsRole.mockResolvedValue(false);
        const { row, values } = seatsConcession({ value: 5000 });

        expect(await row.prepareNew()).toBeNull();
        expect(gate.FindConcessionTier).toHaveBeenCalledWith(
            expect.objectContaining({ Value: 5000, CumulativeShare: 0.5 }),
            expect.anything(),
            REQUESTER,
        );
        expect(values.Status).toBe('Pending');
        expect(values.SalesRuleID).toBe('rule-director');
        expect(row.approvingRole).toBe('role-director');
    });

    it('keeps a single untiered rule working as before: a holder of its role approves their own', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(0);
        withAuthority(100);
        gate.FindConcessionTier.mockResolvedValue({ Rule: tier(), Conflict: null });
        roles.UserHoldsRole.mockResolvedValue(true);
        const { row, values } = seatsConcession({ value: 500 });

        expect(await row.prepareNew()).toBeNull();
        expect(values.Status).toBe('Approved');
        expect(values.SalesRuleID).toBe('rule-manager');
        expect(values.DecidedByUserID).toBe(REQUESTER.ID);
    });

    it('approves within authority on save when the tier does not require sign-off', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(0);
        withAuthority(1000);
        gate.FindConcessionTier.mockResolvedValue({ Rule: tier(), Conflict: null });
        const { row, values } = seatsConcession({ value: 500 });

        expect(await row.prepareNew()).toBeNull();
        expect(values.Status).toBe('Approved');
        expect(values.SalesRuleID).toBeNull();
        expect(values.AuthorizedBySalesAuthorityID).toBe('auth-1');
    });

    it('saves Pending within authority when the tier requires sign-off, and records the authority', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(0);
        withAuthority(1000);
        gate.FindConcessionTier.mockResolvedValue({ Rule: tier({ RequiresDecisionWithinAuthority: true }), Conflict: null });
        approval.ActiveRoleHolderIDs.mockResolvedValue([REQUESTER.ID, APPROVER.ID]);
        const { row, values } = seatsConcession({ value: 500 });

        expect(await row.prepareNew()).toBeNull();
        expect(values.Status).toBe('Pending');
        expect(values.SalesRuleID).toBe('rule-manager');
        expect(values.AuthorizedBySalesAuthorityID).toBe('auth-1');
        expect(values.DecidedByUserID).toBeNull();
    });

    it('does not let a requester who holds a sign-off tier\'s role approve their own outside authority', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(0);
        withAuthority(100);
        gate.FindConcessionTier.mockResolvedValue({ Rule: tier({ RequiresDecisionWithinAuthority: true }), Conflict: null });
        roles.UserHoldsRole.mockResolvedValue(true);
        approval.ActiveRoleHolderIDs.mockResolvedValue([REQUESTER.ID, APPROVER.ID]);
        const { row, values } = seatsConcession({ value: 500 });

        expect(await row.prepareNew()).toBeNull();
        expect(values.Status).toBe('Pending');
        expect(values.DecidedByUserID).toBeNull();
    });

    it('refuses sign-off when the requester is the only holder of the tier\'s role', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(0);
        withAuthority(1000);
        gate.FindConcessionTier.mockResolvedValue({ Rule: tier({ RequiresDecisionWithinAuthority: true }), Conflict: null });
        approval.ActiveRoleHolderIDs.mockResolvedValue([REQUESTER.ID]);
        const { row } = seatsConcession({ value: 500 });

        expect(await row.prepareNew()).toContain("Tier 'Manager' requires a decision even within the requester's authority");
    });

    it('refuses when two met tiers share a rank', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(0);
        withAuthority(100);
        gate.FindConcessionTier.mockResolvedValue({ Rule: null, Conflict: 'share tier 0' });
        const { row } = seatsConcession({ value: 500 });

        expect(await row.prepareNew()).toBe('share tier 0');
    });

    it('refuses outside authority when no tier is met', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(0);
        withAuthority(100);
        gate.FindConcessionTier.mockResolvedValue({ Rule: null, Conflict: null });
        const { row } = seatsConcession({ value: 500 });

        expect(await row.prepareNew()).toContain('whose thresholds it meets');
    });
});

describe('deciding a concession under tiers', () => {
    it('refuses a holder of a lower tier\'s role on a higher tier\'s concession', async () => {
        const { row } = seatsConcession({ user: APPROVER, saved: true, status: 'Approved', salesRuleID: 'rule-director' });
        row.approvingRule = async () => ({ Name: 'Director', ApprovalRequiredRoleID: 'role-director', RequiresDecisionWithinAuthority: false });
        roles.UserHoldsRole.mockImplementation(async (roleID: string) => roleID === 'role-manager');

        expect(await row.applyDecision()).toBe('Only a holder of the role named by the ConcessionLimit rule can decide this concession.');
    });

    it('refuses the requester on a sign-off tier, even as a holder of its role', async () => {
        const { row } = seatsConcession({ user: REQUESTER, saved: true, status: 'Approved', salesRuleID: 'rule-manager' });
        row.approvingRule = async () => ({ Name: 'Manager', ApprovalRequiredRoleID: 'role-manager', RequiresDecisionWithinAuthority: true });
        roles.UserHoldsRole.mockResolvedValue(true);

        expect(await row.applyDecision()).toContain('requires a decision by someone other than the person who asked for it');
    });

    it('lets another holder of a sign-off tier\'s role decide it', async () => {
        gate.OrderNetTotal.mockResolvedValue(10000);
        gate.OrderConcessionTotal.mockResolvedValue(500);
        const { row, values } = seatsConcession({ user: APPROVER, saved: true, status: 'Approved', salesRuleID: 'rule-manager' });
        row.approvingRule = async () => ({ Name: 'Manager', ApprovalRequiredRoleID: 'role-manager', RequiresDecisionWithinAuthority: true });
        roles.UserHoldsRole.mockResolvedValue(true);

        expect(await row.applyDecision()).toBeNull();
        expect(values.DecidedByUserID).toBe(APPROVER.ID);
    });
});
