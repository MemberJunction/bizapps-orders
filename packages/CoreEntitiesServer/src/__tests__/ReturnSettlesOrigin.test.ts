/**
 * golive #379: a full return closes out the order it reverses.
 *
 * Jeremy returned unpaid ORD-002474 in full (return ORD-002481). The original kept a $3,000 balance,
 * stayed queued for Bill.com, and SUB-000104 stayed Active; applying the return's credit by hand was
 * refused, because the allocation guard would not let an order's applied total go below zero, and a
 * return's own total is negative. These pin the three pieces: the guard's floor, the netting the
 * confirm now does, and the subscription stamp a full return now makes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** Rows each view returns, keyed by a fragment of the entity name. */
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    views: [] as Array<{ EntityName: string; ExtraFilter?: string }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                mocks.views.push(params);
                const key = Object.keys(mocks.rows).find((k) => params.EntityName.includes(k));
                return { Success: true, Results: key ? mocks.rows[key] : [] };
            }
        },
    };
});

import type { IMetadataProvider } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { ApplyAccountCreditOperation } from '../ApplyAccountCreditOperation.js';
import { OrderEntityServer } from '../OrderEntityServer.js';
import { PaymentLineEntityServer } from '../PaymentLineEntityServer.js';

const here = import.meta.dirname;

const RETURN = 'aaaaaaaa-0000-4000-8000-000000000001';
const ORIGIN = 'bbbbbbbb-0000-4000-8000-000000000002';
const ORIGIN_LINE = 'cccccccc-0000-4000-8000-000000000003';
const RETURN_LINE = 'dddddddd-0000-4000-8000-000000000004';
const SUB = 'eeeeeeee-0000-4000-8000-000000000005';
const TERM = 'ffffffff-0000-4000-8000-000000000006';
const LATER_TERM = 'ffffffff-0000-4000-8000-000000000007';
const RETURN_DAY = new Date('2026-10-22T00:00:00Z');

/** An instance with the real prototype and only the named fields set. */
function withFields<T extends object>(proto: T, fields: Record<string, unknown>): T {
    const instance = Object.create(proto) as T;
    for (const [k, v] of Object.entries(fields)) Object.defineProperty(instance, k, { value: v, writable: true });
    return instance;
}

beforeEach(() => {
    mocks.rows = {};
    mocks.views = [];
    vi.restoreAllMocks();
});

// ── (a) The allocation guard's floor ─────────────────────────────────────────────────────────────

type GuardedLine = { checkApplicationTotal(): Promise<string | null> };

function allocation(amount: number, totalGross: number, existing: number[] = []): GuardedLine {
    mocks.rows['Order Headers'] = [{ TotalGross: totalGross, OrderNumber: 'ORD-002481' }];
    mocks.rows['Payment Lines'] = existing.map((Amount, i) => ({ ID: `line-${i}`, Amount }));
    return withFields(PaymentLineEntityServer.prototype, {
        OrderHeaderID: RETURN,
        Amount: amount,
        ID: null,
        ProviderToUse: {},
        ContextCurrentUser: {},
    }) as unknown as GuardedLine;
}

describe('the allocation guard lets a return’s credit be spent', () => {
    it('accepts applying a return’s whole negative total', async () => {
        expect(await allocation(-3000, -3000).checkApplicationTotal()).toBeNull();
    });

    it('still refuses going below the return’s total, and names the floor', async () => {
        const refusal = await allocation(-3000.01, -3000).checkApplicationTotal();
        expect(refusal).toMatch(/-3000 here/);
    });

    it('still refuses taking an ordinary order below zero', async () => {
        expect(await allocation(-1, 3000).checkApplicationTotal()).toMatch(/: 0 here/);
    });
});

// ── (b) The confirm nets the return's credit against its origin ──────────────────────────────────

type NettingOrder = { netCreditAgainstOrigin(lines: unknown[], reversals: Map<string, unknown>): Promise<void> };

const ORDER_B = '99999999-0000-4000-8000-00000000000b';
const SYSTEM_USER = { ID: 'system-user', Name: 'System' };
const CALLER = { ID: 'account-director', Name: 'Account Director' };

/** A reversal order whose lines each reverse a line of `origin`, carrying `credit` (a magnitude). */
function reversal(
    lines: Array<{ origin: string | null; credit: number; memo?: boolean }>,
    fields: Record<string, unknown> = {},
): { order: NettingOrder; run: () => Promise<void> } {
    const own = -lines.reduce((s, l) => s + l.credit, 0);
    const order = withFields(OrderEntityServer.prototype, {
        ID: RETURN,
        OrderNumber: 'ORD-002481',
        ReversesOrderHeaderID: ORIGIN,
        ProviderToUse: {},
        ContextCurrentUser: CALLER,
        readBalanceFromRow: async () => ({ TotalGross: own, AmountPaid: 0, Balance: own, FulfillmentStatus: 'NotApplicable' }),
        ...fields,
    }) as unknown as NettingOrder;
    const rows = lines.map((l, i) => ({
        ID: `line-${i}`,
        LineTotalGross: l.memo ? -99999 : -l.credit,
        CreditMemoAmount: l.memo ? l.credit : null,
    }));
    const reversals = new Map<string, unknown>(
        lines.flatMap((l, i) => (l.origin ? [[`line-${i}`, { Origin: { OrderHeaderID: l.origin } }] as [string, unknown]] : [])),
    );
    return { order, run: () => order.netCreditAgainstOrigin(rows, reversals) };
}

function owes(balances: Record<string, number>) {
    mocks.rows['Order Headers'] = Object.entries(balances).map(([ID, Balance]) => ({ ID, Balance }));
}

function spyOnApply() {
    vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(SYSTEM_USER as never);
    return vi
        .spyOn(ApplyAccountCreditOperation.prototype, 'ExecuteServer')
        .mockResolvedValue({ Success: true, Output: { Success: true } } as never);
}

const appliedTo = (apply: ReturnType<typeof spyOnApply>) =>
    apply.mock.calls.map((c) => {
        const input = c[0] as { TargetOrderHeaderID: string; Amount: number };
        return [input.TargetOrderHeaderID, input.Amount];
    });

describe('confirming a return settles the order it reverses', () => {
    it('a full return of an unpaid order applies the whole credit, leaving both balances at zero', async () => {
        owes({ [ORIGIN]: 3000 });
        const apply = spyOnApply();

        await reversal([{ origin: ORIGIN, credit: 3000 }]).run();

        expect(apply).toHaveBeenCalledTimes(1);
        const input = apply.mock.calls[0][0] as { SourceOrderHeaderID: string; TargetOrderHeaderID: string; Amount: number };
        expect(input).toMatchObject({ SourceOrderHeaderID: RETURN, TargetOrderHeaderID: ORIGIN, Amount: 3000 });
        expect(3000 - input.Amount).toBe(0);
        expect(-3000 + input.Amount).toBe(0);
    });

    it('applies nothing when the origin is already paid, leaving the credit for a refund', async () => {
        owes({ [ORIGIN]: 0 });
        const apply = spyOnApply();

        await reversal([{ origin: ORIGIN, credit: 3000 }]).run();

        expect(apply).not.toHaveBeenCalled();
    });

    it('a partial return nets only its own amount', async () => {
        owes({ [ORIGIN]: 3000 });
        const apply = spyOnApply();

        await reversal([{ origin: ORIGIN, credit: 1000 }]).run();

        expect(appliedTo(apply)).toEqual([[ORIGIN, 1000]]);
    });

    it('nets no more than the origin still owes', async () => {
        owes({ [ORIGIN]: 400 });
        const apply = spyOnApply();

        await reversal([{ origin: ORIGIN, credit: 3000 }]).run();

        expect(appliedTo(apply)).toEqual([[ORIGIN, 400]]);
    });

    it('counts a scheduled line at the credit memo it booked, as the balance does', async () => {
        // The memo line's gross is far larger than its memo; read at the gross it would take order B's credit too.
        owes({ [ORIGIN]: 3000, [ORDER_B]: 1000 });
        const apply = spyOnApply();

        await reversal([
            { origin: ORIGIN, credit: 250, memo: true },
            { origin: ORDER_B, credit: 1000 },
        ]).run();

        expect(appliedTo(apply)).toEqual([
            [ORIGIN, 250],
            [ORDER_B, 1000],
        ]);
    });

    it('settles an unpaid renewal on a second order, not only the order named on the header', async () => {
        // Review scenario 1: Term 1 on order A (paid), renewal Term 2 on order B (unpaid), one cancellation.
        owes({ [ORIGIN]: 0, [ORDER_B]: 1200 });
        const apply = spyOnApply();

        await reversal([
            { origin: ORIGIN, credit: 600 },
            { origin: ORDER_B, credit: 1200 },
        ]).run();

        expect(appliedTo(apply)).toEqual([[ORDER_B, 1200]]);
    });

    it('never spends one order’s refund on another order’s balance', async () => {
        // Review scenario 2: A unpaid and half reversed; B paid in cash and reversed in full.
        owes({ [ORIGIN]: 1200, [ORDER_B]: 0 });
        const apply = spyOnApply();

        await reversal([
            { origin: ORIGIN, credit: 600 },
            { origin: ORDER_B, credit: 1200 },
        ]).run();

        expect(appliedTo(apply)).toEqual([[ORIGIN, 600]]);
    });

    it('applies the credit as the system user, after the caller’s own save got this far', async () => {
        owes({ [ORIGIN]: 3000 });
        const apply = spyOnApply();

        await reversal([{ origin: ORIGIN, credit: 3000 }]).run();

        const context = apply.mock.calls[0][1] as { user: unknown };
        expect(context.user).toBe(SYSTEM_USER);
        expect((apply.mock.calls[0][0] as { Reason: string }).Reason).toContain('Account Director');
    });

    it('refuses rather than writing as the caller when there is no system user', async () => {
        owes({ [ORIGIN]: 3000 });
        spyOnApply();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(undefined as never);

        await expect(reversal([{ origin: ORIGIN, credit: 3000 }]).run()).rejects.toThrow(/system user/);
    });

    it('fails the confirm when the credit cannot be applied, rather than leaving half a return', async () => {
        owes({ [ORIGIN]: 3000 });
        spyOnApply().mockResolvedValue({ Success: true, Output: { Success: false, Message: 'no AccountCredit type' } } as never);

        await expect(reversal([{ origin: ORIGIN, credit: 3000 }]).run()).rejects.toThrow(/no AccountCredit type/);
    });

    it('does nothing on an order that reverses nothing', async () => {
        const apply = spyOnApply();

        await reversal([{ origin: null, credit: -100 }], { ReversesOrderHeaderID: null }).run();

        expect(apply).not.toHaveBeenCalled();
        expect(mocks.views).toHaveLength(0);
    });
});

// ── (d) A full return cancels the subscription it sold ───────────────────────────────────────────

type StampingOrder = {
    cancelReturnedSubscriptions(lines: unknown[], reversals: Map<string, unknown>): Promise<void>;
};

function stampingProvider() {
    const saved: Array<{ entity: string; row: Record<string, unknown> }> = [];
    const provider = {
        GetEntityObject: async (entity: string) => {
            const row: Record<string, unknown> = {};
            return Object.assign(row, {
                Save: async () => {
                    saved.push({ entity, row: { ...row } });
                    return true;
                },
            });
        },
    } as unknown as IMetadataProvider;
    return { provider, saved };
}

function returnOf(quantity: number | number[], originQuantity: number, alreadyReversed = 0, orderType = 'Sale') {
    const { provider, saved } = stampingProvider();
    const order = withFields(OrderEntityServer.prototype, {
        OrderNumber: 'ORD-002481',
        OrderType: orderType,
        OrderDate: RETURN_DAY,
        ProviderToUse: provider,
        ContextCurrentUser: {},
    }) as unknown as StampingOrder;
    // `quantity` may be split across sibling lines of this one return, all reversing the same origin line.
    const parts = Array.isArray(quantity) ? quantity : [quantity];
    const context = { Origin: { ID: ORIGIN_LINE, Quantity: originQuantity, SubscriptionID: SUB }, AlreadyReversed: alreadyReversed };
    const lines = parts.map((q, i) => ({ ID: `${RETURN_LINE}-${i}`, Quantity: -q, ReversesOrderLineID: ORIGIN_LINE }));
    const reversals = new Map<string, unknown>(lines.map((l) => [l.ID, context]));
    return { run: () => order.cancelReturnedSubscriptions(lines, reversals), saved };
}

describe('a full return cancels the subscription the returned line sold', () => {
    it('stamps the line’s term and the subscription Canceled, effective the return’s date', async () => {
        mocks.rows['Subscription Terms'] = [{ ID: TERM, OrderLineID: ORIGIN_LINE }];
        const { run, saved } = returnOf(1, 1);

        await run();

        const term = saved.find((s) => s.entity.includes('Subscription Terms'))!.row;
        expect(term).toMatchObject({ Status: 'Canceled', CancellationEffectiveDate: RETURN_DAY });
        const sub = saved.find((s) => s.entity.endsWith('Subscriptions'))!.row;
        expect(sub).toMatchObject({ Status: 'Canceled', EndDate: RETURN_DAY, AutoRenew: false });
    });

    it('counts earlier returns of the same line toward a full return', async () => {
        mocks.rows['Subscription Terms'] = [{ ID: TERM, OrderLineID: ORIGIN_LINE }];
        const { run, saved } = returnOf(1, 2, 1);

        await run();

        expect(saved.map((s) => s.row.Status)).toEqual(['Canceled', 'Canceled']);
    });

    it('adds up sibling lines of the same return that together take the whole line back', async () => {
        mocks.rows['Subscription Terms'] = [{ ID: TERM, OrderLineID: ORIGIN_LINE }];
        const { run, saved } = returnOf([0.5, 0.5], 1);

        await run();

        expect(saved.map((s) => s.row.Status)).toEqual(['Canceled', 'Canceled']);
    });

    it('treats a prorated quantity a hair short of the origin as the whole line', async () => {
        mocks.rows['Subscription Terms'] = [{ ID: TERM, OrderLineID: ORIGIN_LINE }];
        const { run, saved } = returnOf(0.19179999, 0.3836, 0.1918);

        await run();

        expect(saved.map((s) => s.row.Status)).toEqual(['Canceled', 'Canceled']);
    });

    it('leaves the subscription alone on a partial return', async () => {
        mocks.rows['Subscription Terms'] = [{ ID: TERM, OrderLineID: ORIGIN_LINE }];
        const { run, saved } = returnOf(1, 2);

        await run();

        expect(saved).toHaveLength(0);
    });

    it('keeps the subscription open when a term sold by another order is still running', async () => {
        mocks.rows['Subscription Terms'] = [
            { ID: TERM, OrderLineID: ORIGIN_LINE },
            { ID: LATER_TERM, OrderLineID: '99999999-0000-4000-8000-000000000009' },
        ];
        const { run, saved } = returnOf(1, 1);

        await run();

        expect(saved).toHaveLength(1);
        expect(saved[0].entity).toContain('Subscription Terms');
    });

    it('leaves a subscription cancellation’s own reversal to the cancel operation, which stamps it', async () => {
        mocks.rows['Subscription Terms'] = [{ ID: TERM, OrderLineID: ORIGIN_LINE }];
        const { run, saved } = returnOf(1, 1, 0, 'Cancellation');

        await run();

        expect(saved).toHaveLength(0);
    });
});

// ── Both run on the booking save, inside its transaction ─────────────────────────────────────────

describe('OrderEntityServer.Save', () => {
    const source = readFileSync(join(here, '../OrderEntityServer.ts'), 'utf8');
    const commit = source.indexOf('await dbProvider.CommitTransaction()');
    const booking = source.indexOf('if (booking) {\n                const lines = await this.loadLinesForBooking()');

    it.each(['await this.netCreditAgainstOrigin(lines, reversals)', 'await this.cancelReturnedSubscriptions(lines, reversals'])(
        '%s runs in the booking block, before the commit',
        (call) => {
            const at = source.indexOf(call);
            expect(booking).toBeGreaterThan(0);
            expect(at).toBeGreaterThan(booking);
            expect(at).toBeLessThan(commit);
        },
    );
});
