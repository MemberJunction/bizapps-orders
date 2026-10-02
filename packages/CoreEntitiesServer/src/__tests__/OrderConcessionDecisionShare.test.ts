/**
 * A concession's share of the order is measured again when it is decided (#306). The record shows the
 * share at the decision: a draft that changed while the concession sat Pending must not carry the
 * recording's figure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({
    FindConcessionLimitRule: vi.fn(),
    LinePriceConcessionFor: vi.fn(),
    LoadConcessionAuthority: vi.fn(),
    OrderConcessionTotal: vi.fn(),
    OrderNetTotal: vi.fn(),
}));
vi.mock('../ConcessionGate.js', () => gate);

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return { ...actual, UserHoldsRole: vi.fn().mockResolvedValue(true) };
});

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

const APPROVER = { ID: 'approver-1' };
const ORDER_ID = 'order-1';

/** A Pending Seats concession recorded at 5,500 on a 10,000 draft (0.55), now being decided. */
function pendingConcession(decision: 'Approved' | 'Rejected') {
    const row = Object.create(OrderConcessionEntityServer.prototype) as Record<string, unknown> & {
        applyDecision(): Promise<string | null>;
    };
    const values: Record<string, unknown> = {
        ID: 'concession-1',
        Status: decision,
        DeliveryForm: 'Seats',
        OrderHeaderID: ORDER_ID,
        RequestedByUserID: 'requester-1',
        SalesRuleID: 'rule-1',
        ComputedValue: 5500,
        OrderNetTotal: 10000,
        CumulativeShare: 0.55,
        DecidedByUserID: null,
        DecidedAt: null,
    };
    for (const name of Object.keys(values)) {
        Object.defineProperty(row, name, { get: () => values[name], set: (v) => (values[name] = v) });
    }
    Object.defineProperty(row, 'ContextCurrentUser', { value: APPROVER });
    Object.defineProperty(row, 'ProviderToUse', { value: {} });
    row.GetFieldByName = (name: string) => (name === 'Status' ? { Dirty: true, OldValue: 'Pending' } : { Dirty: false });
    row.ApprovingRoleID = async () => 'role-1';
    return { row, values };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('deciding a concession re-measures its share of the order', () => {
    it('stamps the share at the decision, not at the recording', async () => {
        // The draft grew to 100,000 while the concession waited: 5,500 is now 5.5%.
        gate.OrderNetTotal.mockResolvedValue(100000);
        gate.OrderConcessionTotal.mockResolvedValue(5500);
        const { row, values } = pendingConcession('Approved');

        expect(await row.applyDecision()).toBeNull();
        expect(values.OrderNetTotal).toBe(100000);
        expect(values.CumulativeShare).toBe(0.055);
        expect(values.DecidedByUserID).toBe(APPROVER.ID);
    });

    it('counts every concession on the order that is not Rejected, this one included', async () => {
        gate.OrderNetTotal.mockResolvedValue(20000);
        gate.OrderConcessionTotal.mockResolvedValue(8500);
        const { row, values } = pendingConcession('Approved');

        expect(await row.applyDecision()).toBeNull();
        expect(gate.OrderConcessionTotal).toHaveBeenCalledWith(ORDER_ID, expect.anything(), APPROVER);
        expect(values.CumulativeShare).toBe(0.425);
    });

    it('records no share when the order has no net total to measure against', async () => {
        gate.OrderNetTotal.mockResolvedValue(0);
        gate.OrderConcessionTotal.mockResolvedValue(5500);
        const { row, values } = pendingConcession('Rejected');

        expect(await row.applyDecision()).toBeNull();
        expect(values.OrderNetTotal).toBe(0);
        expect(values.CumulativeShare).toBeNull();
    });
});
