/**
 * Unit tests for the dimensions a payment allocation stamps on its journal entry lines (#238).
 *
 * Two independent failures are under test, and neither one shows up as an unbalanced entry:
 *
 *   THE COUNTERPARTY. A Due To / Due From leg without it identifies the other company only by a
 *   GUID in a description. Under a chart of accounts with one shared receivable and one shared
 *   payable — the direction this is heading — accounting's own line merge keys on
 *   (account, dimension set), so two owners' credits would silently collapse into one netted line.
 *   That is data loss, not a reporting inconvenience, which is why the merge case is asserted here.
 *
 *   THE ORDER LINE'S OWN TAGS. Booking DEBITED AR with them. Clearing that receivable with an
 *   untagged credit leaves every dimension permanently out of balance on an account whose whole
 *   point is to net to zero.
 *
 * The regression to protect in both directions is the UNTAGGED order: it must still produce exactly
 * the lines it produced before any of this existed.
 *
 * CONNECTS TO:
 *   TESTS: ../PaymentAllocationFactory.ts
 *   ISSUE: MemberJunction/bc-aidp-next-golive#238
 */
import { describe, it, expect } from 'vitest';
import {
    SliceByDimensions,
    PaymentAllocationFactory,
    type IntercompanyLookup,
    type OrderLineShare,
} from '../PaymentAllocationFactory.js';
import { GL_ROLE } from '../GLAccountResolver.js';

const A = 'company-a';
const B = 'company-b';
const C = 'company-c';

/** The dimension the issue is about, plus one ordinary analytical dimension to ride alongside. */
const COUNTERPARTY = 'dim-counterparty';
const FUND = 'dim-fund';

const cp = (company: string) => ({ DimensionID: COUNTERPARTY, DimensionValueID: `cp-${company}` });
const fund = (v: string) => ({ DimensionID: FUND, DimensionValueID: `fund-${v}` });

const line = (
    id: string,
    company: string,
    amount: number,
    dimensions?: Array<{ DimensionID: string; DimensionValueID: string }>,
): OrderLineShare => ({
    OrderLineID: id,
    CompanyID: company,
    Amount: amount,
    ...(dimensions ? { Dimensions: dimensions } : {}),
});

const acct = (role: string, company: string) => `${role}@${company}`;

const resolver = {
    Resolve: async (role: string, _p: unknown, _c: unknown, companyID: string) => acct(role, companyID),
} as never;

/**
 * A single shared payable and a single shared receivable — Jeremy's chart of accounts, where the
 * account no longer says who the other company is and only the pinned counterparty does.
 */
const SHARED_DUE_TO = 'gl-due-to-affiliates';
const SHARED_DUE_FROM = 'gl-due-from-affiliates';

const sharedChart: IntercompanyLookup = (source, target) => {
    if (source !== A || ![B, C].includes(target)) return null;
    return {
        DueToGLAccountID: SHARED_DUE_TO,
        DueFromGLAccountID: SHARED_DUE_FROM,
        DueToDimensions: [cp(target)],
        DueFromDimensions: [cp(source)],
    };
};

/** The same pairs with nothing pinned — the behaviour before a match is configured. */
const unpinned: IntercompanyLookup = (source, target) => {
    if (source !== A || ![B, C].includes(target)) return null;
    return { DueToGLAccountID: SHARED_DUE_TO, DueFromGLAccountID: SHARED_DUE_FROM };
};

const factory = (lookup: IntercompanyLookup = sharedChart) =>
    new PaymentAllocationFactory(resolver, lookup, 'payment-line-entity');

const ctx = (over: Record<string, unknown> = {}) => ({
    PaymentLineID: 'pl-1',
    PaymentNumber: 'PAY-1',
    OrderNumber: 'ORD-1',
    Amount: 300,
    ReceivingCompanyID: A,
    OrderLines: [line('l1', A, 100), line('l2', B, 200)],
    TargetOrderLineID: null,
    PaymentDate: new Date('2026-09-19'),
    IsReversal: false,
    ...over,
});

type Line = { GLAccountID: string; DebitAmount?: number; CreditAmount?: number; Dimensions?: Array<{ DimensionID: string; DimensionValueID: string }> };
const on = (lines: Line[], account: string) => lines.filter((l) => l.GLAccountID === account);
const valueOf = (l: Line | undefined, dimensionID: string) =>
    l?.Dimensions?.find((d) => d.DimensionID === dimensionID)?.DimensionValueID;

describe('SliceByDimensions', () => {
    it('returns the whole share as ONE slice when every line is tagged alike', () => {
        const lines = [line('l1', A, 100, [fund('x')]), line('l2', A, 300, [fund('x')])];
        expect(SliceByDimensions({ CompanyID: A, Amount: 400 }, lines)).toEqual([
            { Amount: 400, Dimensions: [fund('x')] },
        ]);
    });

    it('returns ONE untagged slice for an order that carries no dimensions at all', () => {
        const lines = [line('l1', A, 100), line('l2', A, 300)];
        expect(SliceByDimensions({ CompanyID: A, Amount: 400 }, lines)).toEqual([{ Amount: 400, Dimensions: [] }]);
    });

    it('splits the share in proportion to the lines carrying each tag set', () => {
        const lines = [line('l1', A, 100, [fund('x')]), line('l2', A, 300, [fund('y')])];
        expect(SliceByDimensions({ CompanyID: A, Amount: 200 }, lines)).toEqual([
            { Amount: 50, Dimensions: [fund('x')] },
            { Amount: 150, Dimensions: [fund('y')] },
        ]);
    });

    it('treats tag sets as unordered, so two lines tagged alike are one slice', () => {
        const lines = [
            line('l1', A, 100, [fund('x'), cp(B)]),
            line('l2', A, 100, [cp(B), fund('x')]),
        ];
        expect(SliceByDimensions({ CompanyID: A, Amount: 200 }, lines)).toHaveLength(1);
    });

    it('ignores other companies’ lines', () => {
        const lines = [line('l1', A, 100, [fund('x')]), line('l2', B, 900, [fund('y')])];
        expect(SliceByDimensions({ CompanyID: A, Amount: 100 }, lines)).toEqual([
            { Amount: 100, Dimensions: [fund('x')] },
        ]);
    });

    it('always sums to the share, giving the residue to the largest slice', () => {
        const lines = [line('l1', A, 1, [fund('x')]), line('l2', A, 1, [fund('y')]), line('l3', A, 1, [fund('z')])];
        const slices = SliceByDimensions({ CompanyID: A, Amount: 100 }, lines);
        expect(Math.round(slices.reduce((s, x) => s + x.Amount, 0) * 100) / 100).toBe(100);
        expect(slices.filter((s) => s.Amount === 33.34)).toHaveLength(1);
    });

    it('takes the targeted line’s tags for the whole amount, even at zero weight', () => {
        // A targeted allocation names the line it settles; its tags are the allocation's tags no
        // matter what the line is worth, and pro-rating never enters into it.
        const lines = [line('l1', A, 0, [fund('x')]), line('l2', A, 500, [fund('y')])];
        expect(SliceByDimensions({ CompanyID: A, Amount: 250 }, lines, 'l1')).toEqual([
            { Amount: 250, Dimensions: [fund('x')] },
        ]);
    });
});

describe('BuildAllocationDrafts — the counterparty on the intercompany legs', () => {
    it('names the OWNER on the collector’s Due To and the COLLECTOR on the owner’s Due From', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx() as never);

        const dueTo = on(Drafts[0].Lines, SHARED_DUE_TO);
        expect(dueTo).toHaveLength(1);
        expect(valueOf(dueTo[0], COUNTERPARTY)).toBe(`cp-${B}`);

        const dueFrom = on(Drafts[1].Lines, SHARED_DUE_FROM);
        expect(dueFrom).toHaveLength(1);
        // The orientation that matters: B's books name A, not themselves.
        expect(valueOf(dueFrom[0], COUNTERPARTY)).toBe(`cp-${A}`);
    });

    it('keeps two owners’ credits apart on ONE shared payable account', async () => {
        // Without the counterparty these two lines are identical to accounting's merge key and
        // become a single netted 500 — the failure the new chart of accounts would introduce.
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ Amount: 500, OrderLines: [line('l1', B, 200), line('l2', C, 300)] }) as never,
        );
        const dueTo = on(Drafts[0].Lines, SHARED_DUE_TO);
        expect(dueTo).toHaveLength(2);
        expect(dueTo.map((l) => valueOf(l, COUNTERPARTY)).sort()).toEqual([`cp-${B}`, `cp-${C}`]);
        expect(dueTo.map((l) => l.CreditAmount)).toEqual([200, 300]);
    });

    it('mirrors a refund with the counterparty intact on both legs', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({ IsReversal: true }) as never);
        const dueTo = on(Drafts[0].Lines, SHARED_DUE_TO)[0];
        expect(dueTo.DebitAmount).toBe(200);
        expect(valueOf(dueTo, COUNTERPARTY)).toBe(`cp-${B}`);
        expect(valueOf(on(Drafts[1].Lines, SHARED_DUE_FROM)[0], COUNTERPARTY)).toBe(`cp-${A}`);
    });

    it('leaves the legs untagged when the match pins nothing, rather than refusing to book', async () => {
        // A pin with no value means "take it from context", and an intercompany leg has none. The
        // allocation still has to post.
        const { Drafts } = await factory(unpinned).BuildAllocationDrafts(ctx() as never);
        expect(on(Drafts[0].Lines, SHARED_DUE_TO)[0].Dimensions).toBeUndefined();
        expect(on(Drafts[1].Lines, SHARED_DUE_FROM)[0].Dimensions).toBeUndefined();
    });
});

describe('BuildAllocationDrafts — the order line’s own tags reach cash and AR', () => {
    it('carries the settled line’s tags onto the AR credit that clears it', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ Amount: 100, OrderLines: [line('l1', A, 100, [fund('x')])] }) as never,
        );
        const ar = on(Drafts[0].Lines, acct(GL_ROLE.AccountsReceivable, A))[0];
        expect(valueOf(ar, FUND)).toBe('fund-x');
    });

    it('splits AR across the tag sets of the lines it clears', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({
                Amount: 400,
                OrderLines: [line('l1', A, 100, [fund('x')]), line('l2', A, 300, [fund('y')])],
            }) as never,
        );
        const ar = on(Drafts[0].Lines, acct(GL_ROLE.AccountsReceivable, A));
        expect(ar.map((l) => [valueOf(l, FUND), l.CreditAmount])).toEqual([
            ['fund-x', 100],
            ['fund-y', 300],
        ]);
    });

    it('splits the collector’s cash across every settled line’s tags, including other companies’', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ OrderLines: [line('l1', A, 100, [fund('x')]), line('l2', B, 200, [fund('y')])] }) as never,
        );
        const cash = on(Drafts[0].Lines, acct(GL_ROLE.Cash, A));
        expect(cash.map((l) => [valueOf(l, FUND), l.DebitAmount])).toEqual([
            ['fund-x', 100],
            ['fund-y', 200],
        ]);
    });

    it('rides alongside the pinned counterparty on the intercompany legs', async () => {
        // Both sources land on the same line: the pin says who, the order line says under what.
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ OrderLines: [line('l1', A, 100), line('l2', B, 200, [fund('y')])] }) as never,
        );
        const dueTo = on(Drafts[0].Lines, SHARED_DUE_TO)[0];
        expect(valueOf(dueTo, COUNTERPARTY)).toBe(`cp-${B}`);
        expect(valueOf(dueTo, FUND)).toBe('fund-y');
    });

    it('lets the pinned value win when the order line names the same dimension', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ OrderLines: [line('l1', A, 100), line('l2', B, 200, [cp('wrong')])] }) as never,
        );
        expect(valueOf(on(Drafts[0].Lines, SHARED_DUE_TO)[0], COUNTERPARTY)).toBe(`cp-${B}`);
    });

    it('balances every entry once, and by dimension', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ OrderLines: [line('l1', A, 100, [fund('x')]), line('l2', B, 200, [fund('y')])] }) as never,
        );
        for (const d of Drafts) {
            const debits = d.Lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0);
            const credits = d.Lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0);
            expect(Math.round(debits * 100) / 100).toBe(Math.round(credits * 100) / 100);
        }
        // …and the reason the tags are worth carrying: filtered to one fund, it still balances.
        for (const d of Drafts) {
            for (const f of ['fund-x', 'fund-y']) {
                const inFund = (d.Lines as Line[]).filter((l) => valueOf(l, FUND) === f);
                const debits = inFund.reduce((s, l) => s + (l.DebitAmount ?? 0), 0);
                const credits = inFund.reduce((s, l) => s + (l.CreditAmount ?? 0), 0);
                expect(Math.round(debits * 100) / 100).toBe(Math.round(credits * 100) / 100);
            }
        }
    });
});

describe('BuildAllocationDrafts — an untagged order is untouched by any of this', () => {
    it('emits the same two bare lines it always did', async () => {
        const { Drafts } = await factory(unpinned).BuildAllocationDrafts(
            ctx({ OrderLines: [line('l1', A, 300)] }) as never,
        );
        expect(Drafts).toHaveLength(1);
        expect(Drafts[0].Lines).toHaveLength(2);
        for (const l of Drafts[0].Lines) expect(l.Dimensions).toBeUndefined();
    });
});
