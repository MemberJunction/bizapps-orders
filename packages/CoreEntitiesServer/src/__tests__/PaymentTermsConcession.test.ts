/**
 * A Terms concession changes a confirmed order's payment terms (#309): it always waits for someone other than
 * the requester, and approving it applies the change in the approval's own transaction.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

const approval = vi.hoisted(() => ({
    ActiveRoleHolderIDs: vi.fn(),
    CloseConcessionTasks: vi.fn(),
    ConcessionSummary: vi.fn(() => 'payment terms 30 days later'),
    RouteConcessionToApproval: vi.fn(),
    UnlinkConcession: vi.fn(),
}));
vi.mock('../ConcessionApprovalTask.js', () => approval);

const terms = vi.hoisted(() => ({ ApplyTermsChange: vi.fn(), CheckTermsChange: vi.fn() }));
vi.mock('../PaymentTermsChange.js', () => terms);

const gate = vi.hoisted(() => ({
    FindConcessionLimitRule: vi.fn(),
    LinePriceConcessionFor: vi.fn(),
    LoadConcessionAuthority: vi.fn(),
}));
vi.mock('../ConcessionGate.js', () => gate);

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

const REQUESTER = { ID: 'requester-1' };
const APPROVER = { ID: 'approver-1' };
const ORDER_ID = 'order-1';

type Row = Record<string, unknown> & {
    Save(): Promise<boolean>;
    RegisterResultHistoryEntry: ReturnType<typeof vi.fn>;
};

/** A Terms concession held without metadata; `fields` stands in for the dirty state `Save` reads. */
function termsConcession(opts: {
    saved: boolean;
    status: string;
    user: { ID: string };
    statusDirty?: boolean;
    previousStatus?: string;
    stubChecks?: boolean;
}) {
    const scope = { Commit: vi.fn(), Rollback: vi.fn() };
    const row = Object.create(OrderConcessionEntityServer.prototype) as Row;
    const values: Record<string, unknown> = {
        ID: 'concession-1',
        Status: opts.status,
        DeliveryForm: 'Terms',
        OrderHeaderID: ORDER_ID,
        PriorPaymentTermsTypeID: 'net30',
        NewPaymentTermsTypeID: 'net60',
        AddedDays: 30,
        ComputedValue: 0,
        RequestedByUserID: REQUESTER.ID,
        SalesRuleID: null,
        DecidedByUserID: null,
        DecidedAt: null,
    };
    for (const name of Object.keys(values)) {
        Object.defineProperty(row, name, { get: () => values[name], set: (v) => (values[name] = v) });
    }
    Object.defineProperty(row, 'IsSaved', { value: opts.saved });
    Object.defineProperty(row, 'Fields', { value: [] });
    Object.defineProperty(row, 'ContextCurrentUser', { value: opts.user });
    Object.defineProperty(row, 'ProviderToUse', { value: { BeginEntityTransaction: vi.fn().mockResolvedValue(scope) } });
    row.GetFieldByName = (name: string) =>
        name === 'Status' ? { Dirty: opts.statusDirty === true, OldValue: opts.previousStatus ?? opts.status } : { Dirty: false };
    if (opts.stubChecks) {
        row.applyDecision = async () => null;
    }
    row.DecidedThroughTask = false;
    row.RegisterResultHistoryEntry = vi.fn();
    return { row, scope, values };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('recording a Terms concession', () => {
    it('is Pending under the ConcessionLimit rule, whatever the requester holds', async () => {
        gate.FindConcessionLimitRule.mockResolvedValue({ ID: 'rule-1', ApprovalRequiredRoleID: 'role-1' });
        approval.ActiveRoleHolderIDs.mockResolvedValue([REQUESTER.ID, APPROVER.ID]);
        const { row, values } = termsConcession({ saved: false, status: 'Pending', user: REQUESTER });

        expect(await (row as unknown as { escalate(u: unknown): Promise<string | null> }).escalate(REQUESTER)).toBeNull();
        expect(values.Status).toBe('Pending');
        expect(values.SalesRuleID).toBe('rule-1');
        expect(values.DecidedByUserID).toBeNull();
        expect(approval.ConcessionSummary).toHaveBeenCalledWith(expect.objectContaining({ DeliveryForm: 'Terms' }));
    });

    it('is refused when only the requester holds the approving role', async () => {
        gate.FindConcessionLimitRule.mockResolvedValue({ ID: 'rule-1', ApprovalRequiredRoleID: 'role-1' });
        approval.ActiveRoleHolderIDs.mockResolvedValue([REQUESTER.ID]);
        const { row } = termsConcession({ saved: false, status: 'Pending', user: REQUESTER });

        const problem = await (row as unknown as { escalate(u: unknown): Promise<string | null> }).escalate(REQUESTER);
        expect(problem).toContain('cannot be decided by the person who asked for it');
    });

    it('is refused when no ConcessionLimit rule names a role', async () => {
        gate.FindConcessionLimitRule.mockResolvedValue(null);
        const { row } = termsConcession({ saved: false, status: 'Pending', user: REQUESTER });

        const problem = await (row as unknown as { escalate(u: unknown): Promise<string | null> }).escalate(REQUESTER);
        expect(problem).toContain('ConcessionLimit');
    });

    it('routes to approval with its requester, whom the task leaves off', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = termsConcession({ saved: false, status: 'Pending', user: REQUESTER });
        row.prepareNew = async () => {
            row.approvingRole = 'role-1';
            row.approvalSummary = 'payment terms 30 days later';
            return null;
        };

        expect(await row.Save()).toBe(true);
        expect(approval.RouteConcessionToApproval).toHaveBeenCalledWith(
            { ID: 'concession-1', OrderHeaderID: ORDER_ID, RequestedByUserID: REQUESTER.ID },
            'role-1',
            'payment terms 30 days later',
            expect.objectContaining({ User: REQUESTER }),
        );
    });
});

describe('deciding a Terms concession', () => {
    it('refuses the requester, even as a holder of the approving role', async () => {
        const { row } = termsConcession({ saved: true, status: 'Approved', user: REQUESTER, statusDirty: true, previousStatus: 'Pending' });

        const problem = await (row as unknown as { applyDecision(): Promise<string | null> }).applyDecision();
        expect(problem).toBe('A Terms concession cannot be decided by the person who asked for it.');
    });

    it('applies the change in the approval transaction', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row, scope } = termsConcession({ saved: true, status: 'Approved', user: APPROVER, statusDirty: true, stubChecks: true });

        expect(await row.Save()).toBe(true);
        expect(terms.ApplyTermsChange).toHaveBeenCalledWith(
            { OrderHeaderID: ORDER_ID, PriorPaymentTermsTypeID: 'net30', NewPaymentTermsTypeID: 'net60' },
            expect.objectContaining({ User: APPROVER }),
        );
        expect(approval.CloseConcessionTasks).toHaveBeenCalledWith('concession-1', ORDER_ID, 'Approved', expect.objectContaining({ User: APPROVER }));
        expect(scope.Commit).toHaveBeenCalledTimes(1);
    });

    it('does not approve when the change cannot be applied', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        terms.ApplyTermsChange.mockRejectedValueOnce(new Error("the order's payment terms have changed"));
        const { row, scope } = termsConcession({ saved: true, status: 'Approved', user: APPROVER, statusDirty: true, stubChecks: true });

        expect(await row.Save()).toBe(false);
        expect(scope.Rollback).toHaveBeenCalledTimes(1);
        expect(scope.Commit).not.toHaveBeenCalled();
    });

    it('applies nothing when it is rejected', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = termsConcession({ saved: true, status: 'Rejected', user: APPROVER, statusDirty: true, stubChecks: true });

        expect(await row.Save()).toBe(true);
        expect(terms.ApplyTermsChange).not.toHaveBeenCalled();
    });
});
