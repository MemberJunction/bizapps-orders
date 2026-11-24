/**
 * Who may decide a refund request (bc-aidp-next-golive#355): an assignee of its approval task, never
 * the requester. The browser and the server read the same rule.
 */
import { describe, expect, it } from 'vitest';
import { RefundRequestDecisionRefusal } from '../refundRequest';

const REQUESTER = 'AAAAAAAA-0000-0000-0000-000000000001';
const APPROVER = 'AAAAAAAA-0000-0000-0000-000000000002';

describe('RefundRequestDecisionRefusal', () => {
    it('lets an assignee who is not the requester decide', () => {
        expect(RefundRequestDecisionRefusal({ DeciderUserID: APPROVER, RequesterUserID: REQUESTER, AssigneeUserIDs: [APPROVER.toLowerCase()] })).toBeNull();
    });

    it('refuses the requester, even when assigned', () => {
        expect(RefundRequestDecisionRefusal({ DeciderUserID: REQUESTER, RequesterUserID: REQUESTER.toLowerCase(), AssigneeUserIDs: [REQUESTER] })).toMatch(
            /requested a refund cannot approve or reject it/,
        );
    });

    it('refuses someone the task is not assigned to', () => {
        expect(RefundRequestDecisionRefusal({ DeciderUserID: APPROVER, RequesterUserID: REQUESTER, AssigneeUserIDs: [] })).toMatch(/Only an approver the approval task is assigned to/);
    });
});
