/**
 * A Timing concession approves a new sale's payment timing (bizapps-orders#1097): it records the order's timing
 * facts, always waits for a holder of the PaymentTiming rule's role other than the requester, and is refused when
 * there is nothing to approve.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const approval = vi.hoisted(() => ({
    ActiveRoleHolderIDs: vi.fn(),
    CloseConcessionTasks: vi.fn(),
    ConcessionSummary: vi.fn(() => 'payment timing exception'),
    RouteConcessionToApproval: vi.fn(),
    UnlinkConcession: vi.fn(),
}));
vi.mock('../ConcessionApprovalTask.js', () => approval);
vi.mock('../ConcessionAcknowledgment.js', () => ({ RaiseConcessionAcknowledgment: vi.fn() }));

const gate = vi.hoisted(() => ({
    FindConcessionTier: vi.fn(),
    LinePriceConcessionFor: vi.fn(),
    LoadConcessionAuthority: vi.fn(),
}));
vi.mock('../ConcessionGate.js', () => gate);

const timing = vi.hoisted(() => ({
    CurrentPaymentTimingDeviations: vi.fn(),
    DescribePaymentTiming: vi.fn(() => 'Service starts: 2027-01-01. Payment terms: Net 30 (30 days). Instalments: none.'),
    LoadPaymentTimingFacts: vi.fn(async () => ({})),
    LoadPaymentTimingRule: vi.fn(),
}));
vi.mock('../PaymentTiming.js', () => timing);

const settings = vi.hoisted(() => ({ OrdersSettings: { Load: vi.fn(), ConcessionSelfApprovalEscalation: [] as string[] } }));
vi.mock('../OrdersSettings.js', () => settings);

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

const REQUESTER = { ID: 'requester-1' };
const APPROVER = { ID: 'approver-1' };
const ORDER_ID = 'order-1';
const RULE = { ID: 'timing-rule', Name: 'Payment timing', ApprovalRequiredRoleID: 'approver-role' };

type Row = Record<string, unknown> & {
    valueTiming(u: unknown): Promise<unknown>;
    routeTiming(u: unknown): Promise<string | null>;
    applyDecision(): Promise<string | null>;
    loadRow: (...args: unknown[]) => Promise<unknown>;
};

function timingConcession(opts: { status: string; user: { ID: string }; orderStatus?: string; statusDirty?: boolean }) {
    const row = Object.create(OrderConcessionEntityServer.prototype) as Row;
    const values: Record<string, unknown> = {
        ID: 'concession-1',
        Status: opts.status,
        DeliveryForm: 'Timing',
        OrderHeaderID: ORDER_ID,
        OrderLineID: 'stray-line',
        SubscriptionTermID: null,
        AddedDays: 5,
        AddedQuantity: null,
        TimingFacts: 'sent by the caller',
        ComputedValue: 0,
        RequestedByUserID: REQUESTER.ID,
        SalesRuleID: null,
        DecidedByUserID: null,
        DecidedAt: null,
    };
    for (const name of Object.keys(values)) {
        Object.defineProperty(row, name, { get: () => values[name], set: (v) => (values[name] = v) });
    }
    Object.defineProperty(row, 'ContextCurrentUser', { value: opts.user });
    Object.defineProperty(row, 'ProviderToUse', { value: {} });
    row.GetFieldByName = (name: string) =>
        name === 'Status' ? { Dirty: opts.statusDirty === true, OldValue: 'Pending' } : { Dirty: false };
    row.loadRow = async () => ({ Status: opts.orderStatus ?? 'Draft' });
    return { row, values };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('recording a Timing concession', () => {
    it("stamps the order's timing facts over whatever the caller sent, at no value", async () => {
        timing.LoadPaymentTimingRule.mockResolvedValue(RULE);
        timing.CurrentPaymentTimingDeviations.mockResolvedValue(['its payment terms are not due on receipt']);
        const { row, values } = timingConcession({ status: 'Pending', user: REQUESTER });

        expect(await row.valueTiming(REQUESTER)).toEqual({ Value: 0, Percent: null });
        expect(values.TimingFacts).toBe('Service starts: 2027-01-01. Payment terms: Net 30 (30 days). Instalments: none.');
        expect(values.OrderLineID).toBeNull();
        expect(values.AddedDays).toBeNull();
    });

    it('is refused when the order needs no approval', async () => {
        timing.LoadPaymentTimingRule.mockResolvedValue(RULE);
        timing.CurrentPaymentTimingDeviations.mockResolvedValue([]);
        const { row } = timingConcession({ status: 'Pending', user: REQUESTER });

        expect(await row.valueTiming(REQUESTER)).toContain('needs no approval');
    });

    it('is refused on a confirmed order', async () => {
        const { row } = timingConcession({ status: 'Pending', user: REQUESTER, orderStatus: 'Confirmed' });

        expect(await row.valueTiming(REQUESTER)).toContain('before the order is confirmed');
        expect(timing.LoadPaymentTimingFacts).not.toHaveBeenCalled();
    });

    it('is refused when no PaymentTiming rule is active', async () => {
        timing.LoadPaymentTimingRule.mockResolvedValue(null);
        const { row } = timingConcession({ status: 'Pending', user: REQUESTER });

        expect(await row.valueTiming(REQUESTER)).toContain('No SalesRule of type PaymentTiming is active');
    });

    it("waits for a holder of the PaymentTiming rule's role, not a ConcessionLimit tier", async () => {
        timing.LoadPaymentTimingRule.mockResolvedValue(RULE);
        approval.ActiveRoleHolderIDs.mockResolvedValue([REQUESTER.ID, APPROVER.ID]);
        const { row, values } = timingConcession({ status: 'Pending', user: REQUESTER });

        expect(await row.routeTiming(REQUESTER)).toBeNull();
        expect(values.Status).toBe('Pending');
        expect(values.SalesRuleID).toBe('timing-rule');
        expect(gate.FindConcessionTier).not.toHaveBeenCalled();
    });

    it('is refused when only the requester holds the role', async () => {
        timing.LoadPaymentTimingRule.mockResolvedValue(RULE);
        approval.ActiveRoleHolderIDs.mockResolvedValue([REQUESTER.ID]);
        const { row } = timingConcession({ status: 'Pending', user: REQUESTER });

        expect(await row.routeTiming(REQUESTER)).toContain('cannot be decided by the person who asked for it');
    });
});

describe('deciding a Timing concession', () => {
    it('refuses the requester', async () => {
        const { row } = timingConcession({ status: 'Approved', user: REQUESTER, statusDirty: true });

        expect(await row.applyDecision()).toBe('A Timing concession cannot be decided by the person who asked for it.');
    });
});
