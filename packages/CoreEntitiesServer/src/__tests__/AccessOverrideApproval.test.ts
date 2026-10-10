/**
 * Unit tests for who approves an access override and who may decide one (bizapps-orders#360). No database.
 */
import { describe, it, expect } from 'vitest';
import { AccessOverrideDecisionRefusal, type AccessOverrideDecisionFacts } from '@mj-biz-apps/orders-entities';
import { AccessOverrideApprovers } from '../EntitlementBehavior.js';

const REQUESTER = 'AAAAAAAA-0000-0000-0000-000000000001';
const CFO = 'AAAAAAAA-0000-0000-0000-000000000002';
const FALLBACK = 'AAAAAAAA-0000-0000-0000-000000000003';

describe('AccessOverrideApprovers', () => {
    it("assigns the order company's approver", () => {
        expect(
            AccessOverrideApprovers({ RequesterUserID: REQUESTER, CompanyApproverUserID: CFO, FallbackRoleName: null, FallbackHolderIDs: [] }),
        ).toEqual({ UserIDs: [CFO], Basis: 'CompanyApprover' });
    });

    it('refuses when the company has no approver, without falling back', () => {
        const out = AccessOverrideApprovers({
            RequesterUserID: REQUESTER,
            CompanyApproverUserID: null,
            FallbackRoleName: 'Fallback',
            FallbackHolderIDs: [FALLBACK],
        });
        expect('Refusal' in out && out.Refusal).toMatch(/ApprovalCFOUserID/);
    });

    it('routes to the fallback role, less the requester, when the requester is the company approver', () => {
        const out = AccessOverrideApprovers({
            RequesterUserID: CFO,
            CompanyApproverUserID: CFO.toLowerCase(),
            FallbackRoleName: 'Fallback',
            FallbackHolderIDs: [CFO, FALLBACK, FALLBACK.toLowerCase()],
        });
        expect(out).toEqual({ UserIDs: [FALLBACK], Basis: 'FallbackRole' });
    });

    it('refuses when the requester is the company approver and no fallback role is configured', () => {
        const out = AccessOverrideApprovers({ RequesterUserID: CFO, CompanyApproverUserID: CFO, FallbackRoleName: null, FallbackHolderIDs: [] });
        expect('Refusal' in out && out.Refusal).toMatch(/AccessOverrideFallbackApproverRole/);
    });

    it('refuses when the fallback role has no holder but the requester', () => {
        const out = AccessOverrideApprovers({ RequesterUserID: CFO, CompanyApproverUserID: CFO, FallbackRoleName: 'Fallback', FallbackHolderIDs: [CFO] });
        expect('Refusal' in out && out.Refusal).toMatch(/'Fallback'/);
    });
});

describe('AccessOverrideDecisionRefusal', () => {
    const facts = (over: Partial<AccessOverrideDecisionFacts> = {}): AccessOverrideDecisionFacts => ({
        Approving: true,
        DeciderUserID: CFO,
        RequesterUserID: REQUESTER,
        AssigneeUserIDs: [CFO],
        EffectiveThrough: '2026-10-31',
        Today: '2026-10-08',
        ...over,
    });

    it('lets an assignee approve before the last day', () => {
        expect(AccessOverrideDecisionRefusal(facts())).toBeNull();
    });

    it('lets an assignee approve on the last day', () => {
        expect(AccessOverrideDecisionRefusal(facts({ Today: '2026-10-31' }))).toBeNull();
    });

    it('refuses the requester, approving or rejecting, even when assigned', () => {
        const self = { DeciderUserID: REQUESTER, AssigneeUserIDs: [REQUESTER, CFO] };
        expect(AccessOverrideDecisionRefusal(facts(self))).toMatch(/requested/);
        expect(AccessOverrideDecisionRefusal(facts({ ...self, Approving: false }))).toMatch(/requested/);
    });

    it('refuses a user the task is not assigned to', () => {
        expect(AccessOverrideDecisionRefusal(facts({ DeciderUserID: FALLBACK }))).toMatch(/assigned/);
        expect(AccessOverrideDecisionRefusal(facts({ DeciderUserID: FALLBACK, Approving: false }))).toMatch(/assigned/);
    });

    it('matches the assignee regardless of ID case', () => {
        expect(AccessOverrideDecisionRefusal(facts({ AssigneeUserIDs: [CFO.toLowerCase()] }))).toBeNull();
    });

    it('refuses an approval after the last day but lets a rejection close it', () => {
        expect(AccessOverrideDecisionRefusal(facts({ Today: '2026-11-01' }))).toMatch(/last day/);
        expect(AccessOverrideDecisionRefusal(facts({ Today: '2026-11-01', Approving: false }))).toBeNull();
    });
});
