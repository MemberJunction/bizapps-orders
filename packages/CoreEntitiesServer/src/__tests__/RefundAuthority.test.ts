/**
 * Who approves a refund, and when one may be issued (bc-aidp-next-golive#355): no one approves their
 * own refund. Pure rules; no database.
 */
import type { UserInfo } from '@memberjunction/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => ({ ID: 'SYSTEM-0000-0000-0000-000000000000' }) } },
}));

const { IsProviderOriginatedRefund, RefundApprovers, RefundIssueRefusal } = await import('../RefundAuthority.js');

const REQUESTER = 'AAAAAAAA-0000-0000-0000-000000000001';
const HOLDER = 'AAAAAAAA-0000-0000-0000-000000000002';
const CFO = 'AAAAAAAA-0000-0000-0000-000000000003';
const FALLBACK = 'AAAAAAAA-0000-0000-0000-000000000004';

const facts = (over: Partial<Parameters<typeof RefundApprovers>[0]> = {}): Parameters<typeof RefundApprovers>[0] => ({
    Threshold: 500,
    RefundedTotalAfter: 200,
    PaymentNumber: 'PAY-000008',
    RequesterUserID: REQUESTER,
    ApproverRoleName: 'Refund Approver',
    ApproverRoleHolderIDs: [REQUESTER, HOLDER],
    CompanyApproverUserID: CFO,
    FallbackRoleName: 'Controller',
    FallbackHolderIDs: [FALLBACK],
    ...over,
});

describe('RefundApprovers', () => {
    it('at or below the threshold assigns the other role holders, never the requester', () => {
        expect(RefundApprovers(facts())).toEqual({ UserIDs: [HOLDER], Basis: 'ApproverRole' });
        expect(RefundApprovers(facts({ RefundedTotalAfter: 500 }))).toEqual({ UserIDs: [HOLDER], Basis: 'ApproverRole' });
    });

    it('drops the requester whatever the case of the ids, and lists each holder once', () => {
        const out = RefundApprovers(facts({ ApproverRoleHolderIDs: [REQUESTER.toLowerCase(), HOLDER, HOLDER.toLowerCase()] }));
        expect(out).toEqual({ UserIDs: [HOLDER], Basis: 'ApproverRole' });
    });

    it('goes to the company approver when the requester is the only role holder', () => {
        expect(RefundApprovers(facts({ ApproverRoleHolderIDs: [REQUESTER] }))).toEqual({ UserIDs: [CFO], Basis: 'CompanyApprover' });
    });

    it('goes to the company approver when no approver role is configured', () => {
        expect(RefundApprovers(facts({ ApproverRoleName: null }))).toEqual({ UserIDs: [CFO], Basis: 'CompanyApprover' });
    });

    it('above the threshold goes to the company approver, counting earlier refunds on the payment', () => {
        expect(RefundApprovers(facts({ RefundedTotalAfter: 500.01 }))).toEqual({ UserIDs: [CFO], Basis: 'CompanyApprover' });
    });

    it('goes to the fallback role, minus the requester, when the company approver is the requester', () => {
        const out = RefundApprovers(facts({ RequesterUserID: CFO, RefundedTotalAfter: 900, FallbackHolderIDs: [CFO, FALLBACK] }));
        expect(out).toEqual({ UserIDs: [FALLBACK], Basis: 'FallbackRole' });
    });

    it('refuses when the company has no approver', () => {
        const out = RefundApprovers(facts({ RefundedTotalAfter: 900, CompanyApproverUserID: null }));
        expect(out).toEqual({ Refusal: expect.stringMatching(/above the 500.00 refund approval threshold, and the company has none/) });
    });

    it('refuses the company approver their own refund when no fallback role is configured', () => {
        const out = RefundApprovers(facts({ RequesterUserID: CFO, RefundedTotalAfter: 900, FallbackRoleName: null }));
        expect(out).toEqual({ Refusal: expect.stringMatching(/cannot approve your own refund, and no fallback approver role/) });
    });

    it('refuses when the fallback role has no holder other than the requester', () => {
        const out = RefundApprovers(facts({ RequesterUserID: CFO, RefundedTotalAfter: 900, FallbackHolderIDs: [CFO] }));
        expect(out).toEqual({ Refusal: expect.stringMatching(/no active holder of the fallback approver role 'Controller' other than you/) });
    });

    it('reads a threshold that is not a finite number of 0 or more as 0', () => {
        for (const Threshold of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
            expect(RefundApprovers(facts({ Threshold, RefundedTotalAfter: 0.01 }))).toEqual({ UserIDs: [CFO], Basis: 'CompanyApprover' });
        }
    });

    it('treats a total that is not a number as above the threshold', () => {
        expect(RefundApprovers(facts({ RefundedTotalAfter: Number.NaN }))).toEqual({ UserIDs: [CFO], Basis: 'CompanyApprover' });
    });

    it('rounds to the cent, so float noise at the boundary stays within it', () => {
        expect(RefundApprovers(facts({ RefundedTotalAfter: 0.1 + 0.2, Threshold: 0.3 }))).toEqual({ UserIDs: [HOLDER], Basis: 'ApproverRole' });
    });
});

describe('RefundIssueRefusal', () => {
    const issue = (over: Partial<Parameters<typeof RefundIssueRefusal>[0]> = {}): Parameters<typeof RefundIssueRefusal>[0] => ({
        Threshold: 500,
        IsProviderOriginated: false,
        Amount: 250,
        PaymentNumber: 'PAY-000008',
        CallerUserID: REQUESTER,
        OpenRequest: { ID: 'R1', Amount: 250, RequestedByUserID: REQUESTER, Status: 'Approved' },
        ...over,
    });

    it('needs nothing while the threshold is unset', () => {
        expect(RefundIssueRefusal(issue({ Threshold: null, OpenRequest: null }))).toBeNull();
    });

    it('exempts a gateway refund', () => {
        expect(RefundIssueRefusal(issue({ IsProviderOriginated: true, OpenRequest: null }))).toBeNull();
    });

    it('lets the requester issue the approved amount', () => {
        expect(RefundIssueRefusal(issue())).toBeNull();
        expect(RefundIssueRefusal(issue({ CallerUserID: REQUESTER.toLowerCase() }))).toBeNull();
    });

    it('refuses without a request, saying to request one', () => {
        expect(RefundIssueRefusal(issue({ OpenRequest: null }))).toMatch(/Refunds need approval first\. Request a refund of 250\.00 on payment PAY-000008/);
    });

    it('refuses while the request is waiting for approval', () => {
        expect(RefundIssueRefusal(issue({ OpenRequest: { ID: 'R1', Amount: 250, RequestedByUserID: REQUESTER, Status: 'Requested' } }))).toMatch(/still waiting for approval/);
    });

    it('refuses anyone but the requester, the approver included', () => {
        expect(RefundIssueRefusal(issue({ CallerUserID: HOLDER }))).toMatch(/issued by the person who requested it/);
    });

    it('refuses an amount other than the approved one', () => {
        expect(RefundIssueRefusal(issue({ Amount: 250.01 }))).toMatch(/is for 250\.00, not 250\.01/);
    });
});

const asUser = (ID: string): UserInfo => ({ ID }) as UserInfo;

describe('IsProviderOriginatedRefund', () => {
    it('is a gateway refund only when the system user books one with a provider id', () => {
        expect(IsProviderOriginatedRefund('re_1', asUser('SYSTEM-0000-0000-0000-000000000000'))).toBe(true);
        expect(IsProviderOriginatedRefund('re_1', asUser(REQUESTER))).toBe(false);
        expect(IsProviderOriginatedRefund('  ', asUser('SYSTEM-0000-0000-0000-000000000000'))).toBe(false);
    });
});
