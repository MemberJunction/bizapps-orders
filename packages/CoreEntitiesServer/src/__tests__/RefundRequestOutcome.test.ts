/**
 * What a closed approval task means for its refund request (bc-aidp-next-golive#355). No database.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mj-biz-apps/tasks-entities', () => ({ LoadGeneratedEntities: () => undefined }));
vi.mock('@mj-biz-apps/tasks-core', () => ({ IsApprovalOutcome: () => true, IsTaskDecisionOutcomeCode: () => true, TaskOrchestrationService: class {} }));
vi.mock('@mj-biz-apps/orders-entities', () => ({ REFUND_REQUEST_ENTITY: 'MJ_BizApps_Orders: Refund Requests', RefundRequestDecisionRefusal: () => null }));
vi.mock('../AccessOverride.js', () => ({ AssigneeUserIDs: async () => [] }));
vi.mock('../ConcessionApprovalTask.js', () => ({ ActiveRoleHolderIDs: async () => [], PERSON_ENTITY: 'People', RecordTaskActivity: async () => undefined }));
vi.mock('../OrdersSettings.js', () => ({ OrdersSettings: {} }));
vi.mock('../person-user-link.js', () => ({ ResolvePersonIDsForUsers: async () => new Map() }));
vi.mock('../ReversalAuthority.js', () => ({ ReversalGate: () => null }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: { GetSystemUser: () => null } } }));

const { RefundRequestOutcome } = await import('../RefundRequest.js');

describe('RefundRequestOutcome', () => {
    it('stays open while the task is open or blocked', () => {
        expect(RefundRequestOutcome('Open', null)).toBeNull();
        expect(RefundRequestOutcome('Blocked', { IsApproval: true })).toBeNull();
    });

    it('a completed task with an approving decision approves', () => {
        expect(RefundRequestOutcome('Completed', { IsApproval: true })).toBe('Approved');
    });

    it('a cancelled task with a rejecting decision rejects', () => {
        expect(RefundRequestOutcome('Cancelled', { IsApproval: false })).toBe('Rejected');
    });

    it('a task closed without a matching decision withdraws the request', () => {
        expect(RefundRequestOutcome('Completed', null)).toBe('Withdrawn');
        expect(RefundRequestOutcome('Completed', { IsApproval: false })).toBe('Withdrawn');
        expect(RefundRequestOutcome('Cancelled', null)).toBe('Withdrawn');
        expect(RefundRequestOutcome('Cancelled', { IsApproval: true })).toBe('Withdrawn');
    });
});
