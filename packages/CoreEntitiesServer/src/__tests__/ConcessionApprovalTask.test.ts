/**
 * The two judgements behind a concession approval task: what a task outcome decides, and when the task
 * closes (golive #274).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mj-biz-apps/tasks-entities', () => ({
    mjBizAppsTasksTaskEntity: class {},
    mjBizAppsTasksTaskLinkEntity: class {},
    mjBizAppsTasksTaskAssignmentEntity: class {},
}));

const { ClosingStatusFor, ConcessionStatusForOutcome, IsOpenApprovalTask } = await import('../ConcessionApprovalTask.js');

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

describe('ClosingStatusFor', () => {
    it('keeps the task open while any linked concession is Pending', () => {
        expect(ClosingStatusFor(['Approved', 'Pending'])).toBeNull();
    });

    it('completes the task when any linked concession was approved', () => {
        expect(ClosingStatusFor(['Rejected', 'Approved'])).toBe('Completed');
    });

    it('cancels the task when every linked concession was rejected', () => {
        expect(ClosingStatusFor(['Rejected', 'Rejected'])).toBe('Cancelled');
    });

    it('cancels the task when every linked concession was withdrawn', () => {
        expect(ClosingStatusFor([])).toBe('Cancelled');
    });
});

describe('IsOpenApprovalTask', () => {
    it('treats Completed and Cancelled as closed and every other status as open', () => {
        expect(IsOpenApprovalTask('Completed')).toBe(false);
        expect(IsOpenApprovalTask('Cancelled')).toBe(false);
        for (const status of ['Open', 'InProgress', 'Blocked']) expect(IsOpenApprovalTask(status)).toBe(true);
    });
});
