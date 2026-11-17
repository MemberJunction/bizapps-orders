import { describe, it, expect, vi, beforeEach } from 'vitest';

const held = vi.hoisted(() => ({ value: true }));
vi.mock('../pricing/priceOverride', () => ({
    UserHasAuthorization: () => held.value,
}));

import { ORDER_REVERSE_AUTH, ReversalRefusal, UserCanReverse } from '../order-reversal.js';

/**
 * bc-aidp-next-golive#454 — cancelling, refunding, moving a credit and lowering an agreed amount are
 * finance's, through one authorization.
 */
describe('reversing booked money', () => {
    const user = { ID: 'u1', UserRoles: [{ RoleID: 'r1' }] } as never;
    const installed = { Authorizations: [{ Name: ORDER_REVERSE_AUTH } as never] };

    beforeEach(() => {
        held.value = true;
    });

    it('fails closed when the authorization is not installed', () => {
        expect(ReversalRefusal('Refunding a payment', user, { Authorizations: [] })).toMatch(/is not installed/);
    });

    it('refuses a user without the grant, naming the action and the Finance role', () => {
        held.value = false;
        const refusal = ReversalRefusal('Refunding a payment', user, installed);
        expect(refusal).toMatch(/^Refunding a payment needs the MJ\.BizApps\.Orders\.Order\.Reverse authorization/);
        expect(refusal).toMatch(/Finance role/);
    });

    it('lets a user with the grant through', () => {
        expect(ReversalRefusal('Refunding a payment', user, installed)).toBeNull();
        expect(UserCanReverse(user, installed)).toBe(true);
    });
});
