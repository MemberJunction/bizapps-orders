/**
 * A decided concession is the record of that decision and refuses deletion — except when the draft
 * line it priced is removed, where it has to go with the line or FK_OrderConcession_OrderLine
 * refuses the line's delete (golive #222).
 *
 * Withdrawing a Pending one also cancels its approval task and removes its link, in the same transaction
 * as the delete (golive #274).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

const approval = vi.hoisted(() => ({
    RouteConcessionToApproval: vi.fn(),
    CloseConcessionTasks: vi.fn(),
    UnlinkConcession: vi.fn(),
}));
vi.mock('../ConcessionApprovalTask.js', () => approval);

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

const USER = { ID: 'user-1' };
const ORDER_ID = 'order-1';

type DeletableConcession = {
    Status: string;
    WithdrawWithDraftLine: boolean;
    Delete(): Promise<boolean>;
    RegisterResultHistoryEntry: ReturnType<typeof vi.fn>;
};

function concession(status: string) {
    const scope = { Commit: vi.fn(), Rollback: vi.fn() };
    const instance = Object.create(OrderConcessionEntityServer.prototype) as DeletableConcession & Record<string, unknown>;
    // Field accessors live on BaseEntity, so they are shadowed rather than assigned.
    Object.defineProperty(instance, 'Status', { value: status, writable: true });
    Object.defineProperty(instance, 'ID', { value: 'concession-1' });
    Object.defineProperty(instance, 'OrderHeaderID', { value: ORDER_ID });
    Object.defineProperty(instance, 'IsSaved', { value: true });
    Object.defineProperty(instance, 'Fields', { value: [] });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: USER });
    Object.defineProperty(instance, 'ProviderToUse', { value: { BeginEntityTransaction: vi.fn().mockResolvedValue(scope) } });
    instance.WithdrawWithDraftLine = false;
    instance.RegisterResultHistoryEntry = vi.fn();
    return { row: instance, scope };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('OrderConcessionEntityServer.Delete', () => {
    it('refuses to delete a decided concession', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);

        expect(await concession('Approved').row.Delete()).toBe(false);
        expect(base).not.toHaveBeenCalled();
    });

    it('withdraws a Pending concession, cancels its task and unlinks it', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        const { row, scope } = concession('Pending');

        expect(await row.Delete()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
        expect(approval.UnlinkConcession).toHaveBeenCalledWith('concession-1', expect.objectContaining({ User: USER }));
        expect(approval.CloseConcessionTasks).toHaveBeenCalledWith('concession-1', ORDER_ID, 'Withdrawn', expect.objectContaining({ User: USER }), true);
        expect(scope.Commit).toHaveBeenCalledTimes(1);
    });

    it('lets a decided concession go with its removed draft line, without closing its task again', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        const { row } = concession('Approved');
        row.WithdrawWithDraftLine = true;

        expect(await row.Delete()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
        expect(approval.UnlinkConcession).toHaveBeenCalledTimes(1);
        expect(approval.CloseConcessionTasks).not.toHaveBeenCalled();
    });

    it('cancels a Pending concession\'s task with its draft line, leaving the order header to the order\'s own save', async () => {
        vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        const { row } = concession('Pending');
        row.WithdrawWithDraftLine = true;

        expect(await row.Delete()).toBe(true);
        expect(approval.CloseConcessionTasks).toHaveBeenCalledWith('concession-1', ORDER_ID, 'Withdrawn', expect.anything(), false);
        expect(approval.UnlinkConcession).toHaveBeenCalledTimes(1);
    });

    it('rolls the withdrawal back when the task cannot be closed', async () => {
        vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        approval.CloseConcessionTasks.mockRejectedValueOnce(new Error('task save failed'));
        const { row, scope } = concession('Pending');

        expect(await row.Delete()).toBe(false);
        expect(scope.Rollback).toHaveBeenCalledTimes(1);
        expect(scope.Commit).not.toHaveBeenCalled();
        expect(row.RegisterResultHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({ Message: 'task save failed' }));
    });
});
