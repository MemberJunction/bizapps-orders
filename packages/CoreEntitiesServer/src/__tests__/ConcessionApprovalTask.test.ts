/**
 * The judgements behind a concession approval task: what a task outcome decides, what the task is called,
 * and who it is assigned to (golive #274).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mj-biz-apps/tasks-entities', () => ({
    mjBizAppsTasksTaskEntity: class {},
    mjBizAppsTasksTaskLinkEntity: class {},
    mjBizAppsTasksTaskAssignmentEntity: class {},
}));

const { ApprovalTaskName, ApproverAssignees, ConcessionStatusForOutcome, ConcessionSummary, IsOpenApprovalTask } = await import(
    '../ConcessionApprovalTask.js'
);

describe('ConcessionStatusForOutcome', () => {
    it('approves on either approving outcome', () => {
        expect(ConcessionStatusForOutcome('Approved')).toBe('Approved');
        expect(ConcessionStatusForOutcome('ApprovedWithConditions')).toBe('Approved');
    });

    it('rejects on Rejected', () => {
        expect(ConcessionStatusForOutcome('Rejected')).toBe('Rejected');
    });

    it('decides nothing for an outcome it does not know, rather than reading it as either answer', () => {
        expect(ConcessionStatusForOutcome('Escalated')).toBeNull();
    });
});

describe('IsOpenApprovalTask', () => {
    it('treats Completed and Cancelled as closed and every other status as open', () => {
        expect(IsOpenApprovalTask('Completed')).toBe(false);
        expect(IsOpenApprovalTask('Cancelled')).toBe(false);
        for (const status of ['Open', 'InProgress', 'Blocked']) expect(IsOpenApprovalTask(status)).toBe(true);
    });
});

describe('ApprovalTaskName', () => {
    it('names the order, the concession and its amount', () => {
        const summary = ConcessionSummary({ DeliveryForm: 'Price', ComputedValue: 3000, Percent: 0.25 });
        expect(ApprovalTaskName('SO-1042', summary)).toBe('SO-1042: 25% discount, 3,000.00');
    });

    it('describes each concession form by what was given', () => {
        expect(ConcessionSummary({ DeliveryForm: 'Duration', ComputedValue: 98.63, AddedDays: 30 })).toBe('30-day extension, 98.63');
        expect(ConcessionSummary({ DeliveryForm: 'Seats', ComputedValue: 300, AddedQuantity: 3 })).toBe('3 added seats, 300.00');
        expect(ConcessionSummary({ DeliveryForm: 'Seats', ComputedValue: 100, AddedQuantity: 1 })).toBe('1 added seat, 100.00');
        expect(ConcessionSummary({ DeliveryForm: 'Scope', ComputedValue: 40, Percent: 0.4 })).toBe('40% scope concession, 40.00');
        expect(ConcessionSummary({ DeliveryForm: 'Price', ComputedValue: 50, Percent: null })).toBe('price concession, 50.00');
    });
});

describe('ApproverAssignees', () => {
    const REQUESTER = 'AAAAAAAA-0000-0000-0000-000000000001';

    it('assigns each holder through their person record', () => {
        const result = ApproverAssignees(
            [
                { UserID: 'u-1', PersonID: 'p-1' },
                { UserID: 'u-2', PersonID: 'p-2' },
            ],
            REQUESTER,
        );
        expect(result).toEqual({ PersonIDs: ['p-1', 'p-2'], WithoutPerson: [] });
    });

    it('leaves the requester off, however the ID is cased', () => {
        const result = ApproverAssignees(
            [
                { UserID: REQUESTER.toLowerCase(), PersonID: 'p-requester' },
                { UserID: 'u-2', PersonID: 'p-2' },
            ],
            REQUESTER,
        );
        expect(result.PersonIDs).toEqual(['p-2']);
    });

    it('reports a holder with no person record instead of assigning them', () => {
        const result = ApproverAssignees(
            [
                { UserID: 'u-1', PersonID: null },
                { UserID: 'u-2', PersonID: 'p-2' },
            ],
            REQUESTER,
        );
        expect(result).toEqual({ PersonIDs: ['p-2'], WithoutPerson: ['u-1'] });
    });

    it('assigns no one when no holder has a person record', () => {
        expect(ApproverAssignees([{ UserID: 'u-1', PersonID: null }], REQUESTER).PersonIDs).toEqual([]);
    });
});
