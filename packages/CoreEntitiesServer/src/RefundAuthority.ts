/**
 * Who approves a refund, and when one may be issued (bc-aidp-next-golive#320 §3, #355).
 *
 * No one approves their own refund. While the `RefundApprovalThreshold` setting is set, a refund is
 * first requested (a `RefundRequest` row, ./RefundRequest.ts), approved through Tasks by someone other
 * than the requester, and only then issued by the requester with `Orders.RefundPayment`, for exactly
 * the approved amount.
 *
 * WHO APPROVES ({@link RefundApprovers}). The amount compared is what the payment's refunds come to
 * WITH this one, so a large refund cannot be split into several small ones that each pass. It is
 * counted per payment, not per order.
 *   - At or below the threshold: every active holder of the `RefundApproverRole` role except the
 *     requester. With no such holder, the CFO tier below.
 *   - Above it: the receiving company's `AccountingCompanyProfile.ApprovalCFOUserID`. When that user
 *     is the requester, every other active holder of the role the `AccessOverrideFallbackApproverRole`
 *     setting names, the same fallback access overrides use.
 * A named approver who has been deactivated counts as none. A request nobody could approve is refused.
 *
 * OFF BY DEFAULT. With `RefundApprovalThreshold` empty no request is needed, as before.
 * EXEMPT: a refund the payment gateway already made, booked by the system user's webhook handling
 * (`ProviderRefundBooking`): the money has moved, and refusing to book it would only hide it.
 *
 * CONNECTS TO:
 *   CALLERS:  ./RefundRequest.ts (approvers), ./RefundPaymentOperation.ts (issue check)
 *   SETTINGS: ./OrdersSettings.ts (RefundApprovalThreshold, RefundApproverRole, AccessOverrideFallbackApproverRole)
 */
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';

/** Round to the cent, so float noise on either side of the comparison cannot move the boundary. */
const money = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/** Everything {@link RefundApprovers} needs. */
export interface RefundApproverFacts {
    /** The `RefundApprovalThreshold` setting. */
    Threshold: number;
    /** What the payment's refunds come to with the requested one. */
    RefundedTotalAfter: number;
    /** The payment being refunded, for the message. */
    PaymentNumber: string;
    RequesterUserID: string;
    /** The `RefundApproverRole` setting. */
    ApproverRoleName: string | null;
    /** Active holders of that role. */
    ApproverRoleHolderIDs: readonly string[];
    /** The receiving company's ApprovalCFOUserID, or null when it is unset or that user is inactive. */
    CompanyApproverUserID: string | null;
    /** The `AccessOverrideFallbackApproverRole` setting. */
    FallbackRoleName: string | null;
    /** Active holders of that role. */
    FallbackHolderIDs: readonly string[];
}

export type RefundApproverBasis = 'ApproverRole' | 'CompanyApprover' | 'FallbackRole';
export type RefundApproverResult = { UserIDs: string[]; Basis: RefundApproverBasis } | { Refusal: string };

/** The ids in `ids` other than `exclude`, once each. */
function othersThan(ids: readonly string[], exclude: string): string[] {
    const out: string[] = [];
    for (const id of ids) {
        if (!UUIDsEqual(id, exclude) && !out.some((o) => UUIDsEqual(o, id))) out.push(id);
    }
    return out;
}

/**
 * Whom a refund request's approval task is assigned to, or why no one could approve it. Never the
 * requester. Defensive about its input: a threshold that is not a finite number of 0 or more is read
 * as 0, and a total that is not a finite number is treated as above any threshold.
 */
export function RefundApprovers(facts: RefundApproverFacts): RefundApproverResult {
    const threshold = Number.isFinite(facts.Threshold) && facts.Threshold > 0 ? money(facts.Threshold) : 0;
    const total = Number.isFinite(facts.RefundedTotalAfter) ? money(facts.RefundedTotalAfter) : null;
    const withinThreshold = total != null && total <= threshold;

    if (withinThreshold && facts.ApproverRoleName) {
        const holders = othersThan(facts.ApproverRoleHolderIDs, facts.RequesterUserID);
        if (holders.length > 0) return { UserIDs: holders, Basis: 'ApproverRole' };
    }

    const cfo = facts.CompanyApproverUserID;
    const above = withinThreshold
        ? `no other holder of the ${facts.ApproverRoleName ?? 'refund approver'} role can approve it`
        : `refunds on payment ${facts.PaymentNumber} would come to ${total == null ? String(facts.RefundedTotalAfter) : total.toFixed(2)}, ` +
          `above the ${threshold.toFixed(2)} refund approval threshold`;
    if (!cfo) {
        return {
            Refusal:
                `This refund needs the receiving company's approver, because ${above}, and the company has none ` +
                '(the Approval CFO on its Accounting Company Profile). Set the company approver first.',
        };
    }
    if (!UUIDsEqual(cfo, facts.RequesterUserID)) return { UserIDs: [cfo], Basis: 'CompanyApprover' };

    if (!facts.FallbackRoleName) {
        return {
            Refusal:
                `This refund needs the receiving company's approver, because ${above}. You are that approver and cannot ` +
                'approve your own refund, and no fallback approver role is configured (Orders setting AccessOverrideFallbackApproverRole).',
        };
    }
    const fallback = othersThan(facts.FallbackHolderIDs, facts.RequesterUserID);
    if (fallback.length === 0) {
        return {
            Refusal:
                `This refund needs the receiving company's approver, because ${above}. You are that approver and cannot ` +
                `approve your own refund, and no active holder of the fallback approver role '${facts.FallbackRoleName}' other than you exists.`,
        };
    }
    return { UserIDs: fallback, Basis: 'FallbackRole' };
}

/** An approved request the caller could issue against, as {@link RefundIssueRefusal} reads it. */
export interface IssuableRefundRequest {
    ID: string;
    Amount: number;
    RequestedByUserID: string;
    Status: string;
}

/** What {@link RefundIssueRefusal} needs. */
export interface RefundIssueFacts {
    /** The `RefundApprovalThreshold` setting; null switches the check off. */
    Threshold: number | null;
    /** A gateway refund booked by the system user. */
    IsProviderOriginated: boolean;
    /** The refund about to be issued. */
    Amount: number;
    PaymentNumber: string;
    CallerUserID: string;
    /** The payment's open request (Requested or Approved), if any. There is at most one. */
    OpenRequest: IssuableRefundRequest | null;
}

/**
 * Why this refund may not be issued, or null when it may. While the threshold is set, it needs the
 * payment's request to be Approved, requested by the caller, for exactly this amount.
 */
export function RefundIssueRefusal(facts: RefundIssueFacts): string | null {
    if (facts.Threshold == null || facts.IsProviderOriginated) return null;
    const request = facts.OpenRequest;
    const amount = money(facts.Amount).toFixed(2);
    if (!request) {
        return `Refunds need approval first. Request a refund of ${amount} on payment ${facts.PaymentNumber}; once someone else approves it, you can issue it.`;
    }
    if (request.Status !== 'Approved') {
        return `The refund request on payment ${facts.PaymentNumber} is still waiting for approval.`;
    }
    if (!UUIDsEqual(request.RequestedByUserID, facts.CallerUserID)) {
        return `The approved refund on payment ${facts.PaymentNumber} is issued by the person who requested it.`;
    }
    if (money(request.Amount) !== money(facts.Amount)) {
        return (
            `The approved refund on payment ${facts.PaymentNumber} is for ${money(request.Amount).toFixed(2)}, not ${amount}. ` +
            'Issue that amount, or withdraw the request and ask again.'
        );
    }
    return null;
}

/** A gateway refund, booked by the system user that webhook handling runs as. */
export function IsProviderOriginatedRefund(providerRefundID: string | null | undefined, user: UserInfo): boolean {
    if (!providerRefundID?.trim()) return false;
    const systemUser = UserCache.Instance.GetSystemUser();
    return !!systemUser && UUIDsEqual(systemUser.ID, user.ID);
}
