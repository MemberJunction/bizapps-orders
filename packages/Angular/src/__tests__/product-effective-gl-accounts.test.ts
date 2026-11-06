/**
 * @fileoverview golive#439 — the Effective accounts block flags roles booking would refuse.
 */
import { describe, expect, it } from 'vitest';
import type { ExplainedGLRole } from '@mj-biz-apps/orders-entities';

import { UnresolvedRoleNames } from '../lib/custom/Product/widgets/product-effective-gl-accounts.component';

function role(name: string, resolved: string | null, failure: string | null = resolved ? null : 'NotLinked'): ExplainedGLRole {
    return {
        Role: name,
        Steps: [],
        ResolvedGLAccountID: resolved,
        ResolvedCode: resolved ? '40000' : null,
        ResolvedName: resolved ? 'Sales' : null,
        Failure: failure,
        Message: failure ? 'refused' : null,
    };
}

describe('UnresolvedRoleNames', () => {
    it('names the roles with no account, in list order', () => {
        const roles = [role('Sales', 'acct'), role('Deferred Revenue', null), role('Sales Discounts', 'acct'), role('Accounts Receivable', null)];
        expect(UnresolvedRoleNames(roles)).toEqual(['Deferred Revenue', 'Accounts Receivable']);
    });

    it('counts a cross-company winner as unresolved, because confirm refuses it', () => {
        expect(UnresolvedRoleNames([role('Sales', null, 'CrossCompany')])).toEqual(['Sales']);
    });

    it('is empty when every role resolves', () => {
        expect(UnresolvedRoleNames([role('Sales', 'acct')])).toEqual([]);
    });
});
