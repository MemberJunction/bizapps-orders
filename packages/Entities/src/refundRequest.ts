/**
 * Refund requests — a refund is requested by one person and approved by another
 * (bc-aidp-next-golive#355).
 *
 * Shared so the browser and the server hold the same rule for who may decide a request
 * ({@link RefundRequestDecisionRefusal}). Whom a request's approval task is assigned to is read with
 * `LoadAccessOverrideAssignees`, which reads any approval task's assignees.
 */
export const REFUND_REQUEST_ENTITY = 'MJ_BizApps_Orders: Refund Requests';

/** Where a refund request stands. */
export type RefundRequestStatus = 'Requested' | 'Approved' | 'Rejected' | 'Withdrawn' | 'Issued';

/** A decision about to be recorded on a refund request. */
export interface RefundRequestDecisionFacts {
    DeciderUserID: string;
    RequesterUserID: string;
    /** The users the approval task is assigned to. */
    AssigneeUserIDs: readonly string[];
}

const sameUser = (a: string | null | undefined, b: string | null | undefined): boolean =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Why this decision may not be recorded, or null when it may.
 *
 *   the requester deciding their own request     → refused, either way
 *   a user the approval task is not assigned to  → refused, either way
 */
export function RefundRequestDecisionRefusal(facts: RefundRequestDecisionFacts): string | null {
    if (sameUser(facts.DeciderUserID, facts.RequesterUserID)) {
        return 'The person who requested a refund cannot approve or reject it.';
    }
    if (!facts.AssigneeUserIDs.some((id) => sameUser(id, facts.DeciderUserID))) {
        return 'Only an approver the approval task is assigned to may decide this refund request.';
    }
    return null;
}
