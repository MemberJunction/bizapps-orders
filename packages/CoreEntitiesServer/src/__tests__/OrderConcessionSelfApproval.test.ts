/**
 * A holder of the approving role no longer approves their own concession once `ConcessionSelfApprovalEscalation`
 * is set (bc-aidp-next-golive#320): it is Pending for the next approver up, only they decide it, and it is
 * refused when no one other than the requester is there. Unset, nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const approval = vi.hoisted(() => ({
    ActiveRoleHolderIDs: vi.fn(),
    CloseConcessionTasks: vi.fn(),
    ConcessionSummary: vi.fn(() => 'seats concession'),
    RouteConcessionToApproval: vi.fn(),
    SelfApprovalEscalation: vi.fn(),
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

const settings = vi.hoisted(() => ({ OrdersSettings: { Load: vi.fn(), ConcessionSelfApprovalEscalation: [] as string[] } }));
vi.mock('../OrdersSettings.js', () => settings);

const roles = vi.hoisted(() => ({ UserHoldsRole: vi.fn() }));
vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return { ...actual, UserHoldsRole: roles.UserHoldsRole };
});

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

const CEO = { ID: 'ceo-1' };
const CFO = { ID: 'cfo-1' };
const PEER = { ID: 'peer-1' };

const rule = (overrides: Record<string, unknown> = {}) => ({
    ID: 'rule-top',
    Name: 'Top',
    ApprovalRequiredRoleID: 'role-top',
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

/** A Seats concession the CEO requested, worth 5,000 on a 10,000 order, held without metadata. */
function concession(opts: { user?: { ID: string }; saved?: boolean; status?: string; salesRuleID?: string | null } = {}) {
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
        RequestedByUserID: CEO.ID,
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
    Object.defineProperty(row, 'ContextCurrentUser', { value: opts.user ?? CEO });
    Object.defineProperty(row, 'ProviderToUse', { value: {} });
    row.valueByForm = async () => ({ Value: 5000, Percent: null });
    row.loadRow = async () => rule();
    row.GetFieldByName = (name: string) =>
        name === 'Status' ? { Dirty: opts.saved === true, OldValue: 'Pending' } : { Dirty: false };
    return { row, values };
}

beforeEach(() => {
    gate.OrderNetTotal.mockResolvedValue(10000);
    gate.OrderConcessionTotal.mockResolvedValue(0);
    gate.LoadConcessionAuthority.mockResolvedValue({
        ID: 'auth-1',
        MaxDiscountPct: null,
        MaxConcessionValue: 100,
        MaxTermExtensionDays: null,
        MaxConcessionPctOfContract: null,
    });
    gate.FindConcessionTier.mockResolvedValue({ Rule: rule(), Conflict: null });
});

afterEach(() => {
    settings.OrdersSettings.ConcessionSelfApprovalEscalation = [];
    vi.clearAllMocks();
});

describe('recording a holder\'s own concession', () => {
    it('is approved by its requester while the setting is unset, as before', async () => {
        roles.UserHoldsRole.mockResolvedValue(true);
        const { row, values } = concession();

        expect(await row.prepareNew()).toBeNull();
        expect(values.Status).toBe('Approved');
        expect(values.DecidedByUserID).toBe(CEO.ID);
        expect(approval.SelfApprovalEscalation).not.toHaveBeenCalled();
    });

    it('is Pending for the next approver up when the setting is set', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        roles.UserHoldsRole.mockResolvedValue(true);
        approval.SelfApprovalEscalation.mockResolvedValue({ Target: 'CompanyCFO', UserIDs: [CFO.ID] });
        const { row, values } = concession();

        expect(await row.prepareNew()).toBeNull();
        expect(values.Status).toBe('Pending');
        expect(values.SalesRuleID).toBe('rule-top');
        expect(values.DecidedByUserID).toBeNull();
        expect(row.approvingRole).toBe('role-top');
        expect(approval.SelfApprovalEscalation).toHaveBeenCalledWith(
            'role-top',
            { OrderHeaderID: 'order-1', RequestedByUserID: CEO.ID },
            expect.objectContaining({ User: CEO }),
        );
    });

    it('is refused, not left unassigned, when no one other than the requester is there', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        roles.UserHoldsRole.mockResolvedValue(true);
        approval.SelfApprovalEscalation.mockResolvedValue({ Refusal: 'no one other than the requester is there' });
        const { row, values } = concession();

        expect(await row.prepareNew()).toBe('no one other than the requester is there');
        expect(values.Status).toBe('Pending');
        expect(values.DecidedByUserID).toBeNull();
    });

    it('is routed to the role as before when the requester does not hold it', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        roles.UserHoldsRole.mockResolvedValue(false);
        const { row, values } = concession({ user: PEER });

        expect(await row.prepareNew()).toBeNull();
        expect(values.Status).toBe('Pending');
        expect(approval.SelfApprovalEscalation).not.toHaveBeenCalled();
    });

    it('goes up, not to peers, on a sign-off tier when the requester holds its role', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        gate.FindConcessionTier.mockResolvedValue({ Rule: rule({ RequiresDecisionWithinAuthority: true }), Conflict: null });
        approval.SelfApprovalEscalation.mockResolvedValue({ Target: 'CompanyCFO', UserIDs: [CFO.ID] });
        const { row, values } = concession();

        expect(await row.prepareNew()).toBeNull();
        expect(values.Status).toBe('Pending');
        expect(approval.ActiveRoleHolderIDs).not.toHaveBeenCalled();
    });

    it('is refused on a sign-off tier, with the tier\'s reason first, when the escalation has no one', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        gate.FindConcessionTier.mockResolvedValue({ Rule: rule({ RequiresDecisionWithinAuthority: true }), Conflict: null });
        approval.SelfApprovalEscalation.mockResolvedValue({ Refusal: 'No one is there.' });
        const { row } = concession();

        expect(await row.prepareNew()).toBe("Tier 'Top' requires a decision by someone other than the requester. No one is there.");
    });

    it('falls back to the tier\'s other holders when the escalation does not apply', async () => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        gate.FindConcessionTier.mockResolvedValue({ Rule: rule({ RequiresDecisionWithinAuthority: true }), Conflict: null });
        approval.SelfApprovalEscalation.mockResolvedValue(null);
        approval.ActiveRoleHolderIDs.mockResolvedValue([CEO.ID]);
        const { row } = concession();

        expect(await row.prepareNew()).toContain('no active user other than the requester holds the role');
    });
});

describe('deciding a holder\'s own concession', () => {
    beforeEach(() => {
        settings.OrdersSettings.ConcessionSelfApprovalEscalation = ['CompanyCFO'];
        approval.SelfApprovalEscalation.mockResolvedValue({ Target: 'CompanyCFO', UserIDs: [CFO.ID] });
    });

    it('lets the escalation approver decide it without holding the approving role', async () => {
        roles.UserHoldsRole.mockResolvedValue(false);
        const { row, values } = concession({ user: CFO, saved: true, status: 'Approved', salesRuleID: 'rule-top' });

        expect(await row.applyDecision()).toBeNull();
        expect(values.DecidedByUserID).toBe(CFO.ID);
    });

    it('refuses its requester, though they hold the approving role', async () => {
        roles.UserHoldsRole.mockResolvedValue(true);
        const { row } = concession({ user: CEO, saved: true, status: 'Approved', salesRuleID: 'rule-top' });

        expect(await row.applyDecision()).toContain('its requester cannot decide it');
    });

    it('refuses another holder of the approving role who is not the escalation', async () => {
        roles.UserHoldsRole.mockResolvedValue(true);
        const { row, values } = concession({ user: PEER, saved: true, status: 'Approved', salesRuleID: 'rule-top' });

        expect(await row.applyDecision()).toContain("only 'CompanyCFO' can decide it");
        expect(values.DecidedByUserID).toBeNull();
    });

    it('refuses when the escalation now has no one, saying why', async () => {
        approval.SelfApprovalEscalation.mockResolvedValue({ Refusal: 'No one is there.' });
        const { row } = concession({ user: CFO, saved: true, status: 'Rejected', salesRuleID: 'rule-top' });

        expect(await row.applyDecision()).toBe('No one is there.');
    });

    it('keeps the role check when the escalation does not apply (the requester does not hold the role)', async () => {
        approval.SelfApprovalEscalation.mockResolvedValue(null);
        roles.UserHoldsRole.mockResolvedValue(false);
        const { row } = concession({ user: CFO, saved: true, status: 'Approved', salesRuleID: 'rule-top' });

        expect(await row.applyDecision()).toBe('Only a holder of the role named by the ConcessionLimit rule can decide this concession.');
    });
});
