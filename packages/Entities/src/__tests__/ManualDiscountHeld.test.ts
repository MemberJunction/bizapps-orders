/**
 * A manual discount above the rep's Sales Authority is held for approval, not refused (golive #328).
 *
 * Refusing it sent the rep to find an approver to re-type the discount. Held, it is saved with neither
 * an authority nor an approver, and the confirm gate holds the order until an approved concession
 * covers the line. A holder of the DiscountLimit rule's role still grants it on the spot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

const { AuthorizeManualDiscount } = await import('../pricing/PromotionEngine.js');

const AUTHORITY = { ID: 'authority-1', MaxDiscountPct: 0.25, MaxConcessionValue: null, MaxOrderValue: null };
const provider = {} as never;
const user = { ID: 'user-1' } as never;

/** Answers each RunView by entity: the rep's authority, the DiscountLimit rule and the rep's roles. */
function database(opts: { rule?: { Name: string; ApprovalRequiredRoleID: string | null } | null; holdsRole?: boolean }) {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
        Success: true,
        Results: String(params?.EntityName).endsWith('Sales Authorities')
            ? [AUTHORITY]
            : String(params?.EntityName).endsWith('Sales Rules')
              ? opts.rule
                  ? [opts.rule]
                  : []
              : opts.holdsRole
                ? [{ ID: 'user-role-1' }]
                : [],
    }));
}

beforeEach(() => mockRunView.mockReset());

describe('AuthorizeManualDiscount — above the rep\'s authority', () => {
    it('holds a 100% discount with no DiscountLimit rule, recording no authority and no approver', async () => {
        database({ rule: null });

        const auth = await AuthorizeManualDiscount({ Amount: 1200, Reason: 'giveaway' }, 1200, 'user-1', provider, user);

        expect(auth.Refusal).toBeUndefined();
        expect(auth.NeedsApproval).toBe(true);
        expect(auth.AuthorityID).toBeNull();
        expect(auth.ApprovedByUserID).toBeNull();
        expect(auth.Held).toMatch(/outside this user's SalesAuthority.*needs approval/);
    });

    it('holds it when the rep lacks the DiscountLimit rule\'s role', async () => {
        database({ rule: { Name: 'Discount limit', ApprovalRequiredRoleID: 'role-1' }, holdsRole: false });

        const auth = await AuthorizeManualDiscount({ Percent: 0.5, Reason: 'giveaway' }, 1000, 'user-1', provider, user);

        expect(auth.Refusal).toBeUndefined();
        expect(auth.Held).toBeDefined();
        expect(auth.AuthorityID).toBeNull();
    });

    it('lets a holder of the DiscountLimit role grant it, recorded as theirs', async () => {
        database({ rule: { Name: 'Discount limit', ApprovalRequiredRoleID: 'role-1' }, holdsRole: true });

        const auth = await AuthorizeManualDiscount({ Amount: 500, Reason: 'renewal' }, 1000, 'user-1', provider, user);

        expect(auth.Held).toBeUndefined();
        expect(auth.AuthorityID).toBe('authority-1');
        expect(auth.ApprovedByUserID).toBe('user-1');
    });

    it('still grants a discount within the cap on the rep\'s own authority', async () => {
        database({ rule: null });

        const auth = await AuthorizeManualDiscount({ Amount: 100, Reason: 'goodwill' }, 1000, 'user-1', provider, user);

        expect(auth).toEqual({ AuthorityID: 'authority-1', NeedsApproval: false, ApprovedByUserID: null });
    });
});
