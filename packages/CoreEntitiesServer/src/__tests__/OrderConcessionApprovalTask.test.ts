/**
 * Recording a Pending concession routes it to the order's approval task, and deciding one on its record
 * settles that task — each in the concession's own transaction (golive #274).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

const approval = vi.hoisted(() => ({
    RouteConcessionToApproval: vi.fn(),
    SettleApprovalTask: vi.fn(),
    UnlinkConcession: vi.fn(),
}));
vi.mock('../ConcessionApprovalTask.js', () => approval);

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

const USER = { ID: 'user-1' };
const ORDER_ID = 'order-1';

type SavableConcession = {
    Status: string;
    DecidedThroughTask: boolean;
    Save(): Promise<boolean>;
    RegisterResultHistoryEntry: ReturnType<typeof vi.fn>;
};

/**
 * A concession whose own checks are stubbed: `prepareNew` for a new record, `applyDecision` for a saved one.
 * `pendingRole` is what `prepareNew` would have kept for a concession outside the requester's authority.
 */
function concession(opts: { saved: boolean; status: string; statusDirty?: boolean; pendingRole?: string | null }) {
    const scope = { Commit: vi.fn(), Rollback: vi.fn() };
    const instance = Object.create(OrderConcessionEntityServer.prototype) as SavableConcession & Record<string, unknown>;
    Object.defineProperty(instance, 'Status', { value: opts.status, writable: true });
    Object.defineProperty(instance, 'OrderHeaderID', { value: ORDER_ID });
    Object.defineProperty(instance, 'IsSaved', { value: opts.saved });
    Object.defineProperty(instance, 'Fields', { value: [] });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: USER });
    Object.defineProperty(instance, 'ProviderToUse', { value: { BeginEntityTransaction: vi.fn().mockResolvedValue(scope) } });
    instance.GetFieldByName = (name: string) => (name === 'Status' ? { Dirty: opts.statusDirty === true } : undefined);
    instance.prepareNew = async () => {
        instance.approvingRole = opts.pendingRole ?? null;
        return null;
    };
    instance.applyDecision = async () => null;
    instance.DecidedThroughTask = false;
    instance.RegisterResultHistoryEntry = vi.fn();
    return { row: instance, scope };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('OrderConcessionEntityServer.Save and the approval task', () => {
    it('routes a Pending concession to its approvers in the same transaction', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row, scope } = concession({ saved: false, status: 'Pending', pendingRole: 'role-1' });

        expect(await row.Save()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
        expect(approval.RouteConcessionToApproval).toHaveBeenCalledWith(ORDER_ID, 'role-1', expect.objectContaining({ User: USER }));
        expect(scope.Commit).toHaveBeenCalledTimes(1);
    });

    it('refuses the concession when it cannot be routed, rolling the row back', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        approval.RouteConcessionToApproval.mockRejectedValueOnce(new Error('no active user holds the role'));
        const { row, scope } = concession({ saved: false, status: 'Pending', pendingRole: 'role-1' });

        expect(await row.Save()).toBe(false);
        expect(scope.Rollback).toHaveBeenCalledTimes(1);
        expect(scope.Commit).not.toHaveBeenCalled();
        expect(row.RegisterResultHistoryEntry).toHaveBeenCalledWith(
            expect.objectContaining({ Message: 'no active user holds the role', Type: 'create' }),
        );
    });

    it('raises no task for a concession approved on save', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = concession({ saved: false, status: 'Approved' });

        expect(await row.Save()).toBe(true);
        expect(approval.RouteConcessionToApproval).not.toHaveBeenCalled();
    });

    it('settles the order task when a concession is decided on its record', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = concession({ saved: true, status: 'Approved', statusDirty: true });

        expect(await row.Save()).toBe(true);
        expect(approval.SettleApprovalTask).toHaveBeenCalledWith(ORDER_ID, expect.objectContaining({ User: USER }));
    });

    it('leaves the task alone when the decision came from the task', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = concession({ saved: true, status: 'Rejected', statusDirty: true });
        row.DecidedThroughTask = true;

        expect(await row.Save()).toBe(true);
        expect(approval.SettleApprovalTask).not.toHaveBeenCalled();
    });
});
