/**
 * Withdrawing a concession sets its Status to Withdrawn and keeps the row (golive #403): stamped with who withdrew
 * it and when, its open tasks closed in the same transaction. Its requester may do this without the right to
 * update concessions; nothing else gets through on that exception.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity, EntityPermissionType } from '@memberjunction/core';

const approval = vi.hoisted(() => ({
    RouteConcessionToApproval: vi.fn(),
    CloseConcessionTasks: vi.fn(),
    UnlinkConcession: vi.fn(),
    ConcessionSummary: vi.fn(),
}));
vi.mock('../ConcessionApprovalTask.js', () => approval);
const acknowledgment = vi.hoisted(() => ({ RaiseConcessionAcknowledgment: vi.fn() }));
vi.mock('../ConcessionAcknowledgment.js', () => acknowledgment);

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');

const REQUESTER = { ID: 'requester-1' };
const OTHER_USER = { ID: 'other-1' };
const ORDER_ID = 'order-1';
const CONCESSION_ID = 'concession-1';

type WithdrawableConcession = {
    Status: string;
    WithdrawnByUserID: string | null;
    WithdrawnAt: Date | null;
    Save(): Promise<boolean>;
    CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean;
    RegisterResultHistoryEntry: ReturnType<typeof vi.fn>;
};

interface ConcessionOptions {
    previous: string;
    orderStatus?: string;
    termID?: string | null;
    user?: { ID: string };
    alsoDirty?: string[];
}

/** A saved concession whose Status is being moved from `previous` to Withdrawn. */
function withdrawing(opts: ConcessionOptions) {
    const scope = { Commit: vi.fn(), Rollback: vi.fn() };
    const instance = Object.create(OrderConcessionEntityServer.prototype) as WithdrawableConcession & Record<string, unknown>;
    Object.defineProperty(instance, 'Status', { value: 'Withdrawn', writable: true });
    Object.defineProperty(instance, 'WithdrawnByUserID', { value: null, writable: true });
    Object.defineProperty(instance, 'WithdrawnAt', { value: null, writable: true });
    Object.defineProperty(instance, 'ID', { value: CONCESSION_ID });
    Object.defineProperty(instance, 'OrderHeaderID', { value: ORDER_ID });
    Object.defineProperty(instance, 'SubscriptionTermID', { value: opts.termID ?? null });
    Object.defineProperty(instance, 'RequestedByUserID', { value: REQUESTER.ID });
    Object.defineProperty(instance, 'IsSaved', { value: true });
    Object.defineProperty(instance, 'Fields', { value: [] });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: opts.user ?? REQUESTER });
    Object.defineProperty(instance, 'EntityInfo', { value: { AllowUpdateAPI: true } });
    Object.defineProperty(instance, 'ProviderToUse', { value: { BeginEntityTransaction: vi.fn().mockResolvedValue(scope) } });
    const dirty = new Set(opts.alsoDirty ?? []);
    instance.GetFieldByName = (name: string) =>
        name === 'Status' ? { Dirty: true, OldValue: opts.previous } : { Dirty: dirty.has(name), OldValue: null };
    instance.loadRow = async () => ({ Status: opts.orderStatus ?? 'Draft' });
    instance.RegisterResultHistoryEntry = vi.fn();
    return { row: instance, scope };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('OrderConcessionEntityServer withdrawal', () => {
    it('keeps a withdrawn Pending concession, stamps who and when, and closes its task in one transaction', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row, scope } = withdrawing({ previous: 'Pending' });

        expect(await row.Save()).toBe(true);
        expect(base).toHaveBeenCalledTimes(1);
        expect(row.WithdrawnByUserID).toBe(REQUESTER.ID);
        expect(row.WithdrawnAt).toBeInstanceOf(Date);
        expect(approval.CloseConcessionTasks).toHaveBeenCalledWith(CONCESSION_ID, ORDER_ID, 'Withdrawn', expect.objectContaining({ User: REQUESTER }));
        expect(approval.UnlinkConcession).not.toHaveBeenCalled();
        expect(scope.Commit).toHaveBeenCalledTimes(1);
    });

    it('withdraws an Approved concession on a draft order, an approver-decided one included', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = withdrawing({ previous: 'Approved', orderStatus: 'Draft' });

        expect(await row.Save()).toBe(true);
        expect(acknowledgment.RaiseConcessionAcknowledgment).not.toHaveBeenCalled();
    });

    it('refuses an Approved concession on a confirmed order', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = withdrawing({ previous: 'Approved', orderStatus: 'Confirmed' });

        expect(await row.Save()).toBe(false);
        expect(base).not.toHaveBeenCalled();
        expect(row.RegisterResultHistoryEntry).toHaveBeenCalledWith(
            expect.objectContaining({ Message: expect.stringContaining('confirmed') }),
        );
    });

    it('refuses an Approved concession applied to a booked term', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = withdrawing({ previous: 'Approved', termID: 'term-1' });

        expect(await row.Save()).toBe(false);
        expect(base).not.toHaveBeenCalled();
    });

    it.each(['Rejected', 'Withdrawn'])('refuses a concession that is already %s', async (previous) => {
        const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = withdrawing({ previous });

        expect(await row.Save()).toBe(false);
        expect(base).not.toHaveBeenCalled();
    });

    it('refuses a withdrawal that changes anything but the status', async () => {
        const base = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        const { row } = withdrawing({ previous: 'Pending', alsoDirty: ['ComputedValue'] });

        expect(await row.Save()).toBe(false);
        expect(base).not.toHaveBeenCalled();
        expect(row.RegisterResultHistoryEntry).toHaveBeenCalledWith(
            expect.objectContaining({ Message: expect.stringContaining('ComputedValue') }),
        );
    });

    it('rolls the withdrawal back when its task cannot be closed', async () => {
        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        approval.CloseConcessionTasks.mockRejectedValueOnce(new Error('task could not be closed'));
        const { row, scope } = withdrawing({ previous: 'Pending' });

        expect(await row.Save()).toBe(false);
        expect(scope.Rollback).toHaveBeenCalledTimes(1);
        expect(scope.Commit).not.toHaveBeenCalled();
    });
});

describe('OrderConcessionEntityServer.CheckPermissions', () => {
    it('lets the requester withdraw without the right to update concessions', () => {
        const base = vi.spyOn(BaseEntity.prototype, 'CheckPermissions').mockReturnValue(false);
        const { row } = withdrawing({ previous: 'Pending' });

        expect(row.CheckPermissions(EntityPermissionType.Update, true)).toBe(true);
        expect(base).not.toHaveBeenCalled();
    });

    it('leaves anyone else to the ordinary update permission', () => {
        const base = vi.spyOn(BaseEntity.prototype, 'CheckPermissions').mockReturnValue(false);
        const { row } = withdrawing({ previous: 'Pending', user: OTHER_USER });

        expect(row.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        expect(base).toHaveBeenCalledWith(EntityPermissionType.Update, false);
    });

    it('does not extend to deleting', () => {
        const base = vi.spyOn(BaseEntity.prototype, 'CheckPermissions').mockReturnValue(false);
        const { row } = withdrawing({ previous: 'Pending' });

        expect(row.CheckPermissions(EntityPermissionType.Delete, false)).toBe(false);
        expect(base).toHaveBeenCalledWith(EntityPermissionType.Delete, false);
    });
});
