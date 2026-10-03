/**
 * Cancelling a subscription also cancels the terms that start after its coverage ends (#406).
 *
 * `resolveTerm` picks one term and only that term used to be stamped and reversed, so a renewal
 * booked ahead stayed Active, booked and billed on a subscription that had already ended. These
 * tests drive the real `InternalExecute` against a fake provider that records every write: the
 * reversal order's lines, each term's stamp, the lifecycle event, and the transaction calls.
 *
 * Only `RunView` and the three collaborators that reach the database on their own (the reversal
 * context, the grant revocation, the own-write mark) are replaced. The policy is the real
 * `SubscriptionBehavior`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** Rows `RunView` answers with, keyed by a fragment of the entity name. */
    rows: new Map<string, Record<string, unknown>[]>(),
    /** Order line IDs whose origin is billed by instalment. */
    instalmentLines: new Set<string>(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { EntityName: string; ExtraFilter?: string }) => {
                for (const [fragment, rows] of mocks.rows) {
                    if (!params.EntityName.endsWith(fragment)) continue;
                    const id = /(?:^|[^a-zA-Z])ID='([^']+)'/.exec(params.ExtraFilter ?? '')?.[1];
                    return Promise.resolve({ Success: true, Results: id ? rows.filter((r) => r.ID === id) : rows });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });
        },
    };
});

vi.mock('../ReversalResolver.js', () => ({
    LoadReversalContext: vi.fn().mockImplementation((lineID: string) =>
        Promise.resolve(
            mocks.instalmentLines.has(lineID)
                ? { OriginScheduled: true, Origin: { OrderNumber: 'ORD-0002' } }
                : { OriginScheduled: false, Origin: {} },
        ),
    ),
}));
vi.mock('../EntitlementEngine.js', () => ({ RevokeGrantsForCanceledSubscription: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../OrderLineEntityServer.js', () => ({ MarkAsOrdersOwnWrite: vi.fn() }));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CancelSubscriptionOperation, type CancelSubscriptionOutput } from '../CancelSubscriptionOperation.js';

const SUB = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const T1 = 'term-1';
const T2 = 'term-2';
const L1 = 'line-1';
const L2 = 'line-2';

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

function seed(rules: Record<string, unknown>, terms = [T1, T2]): void {
    mocks.rows.set('Subscriptions', [
        {
            ID: SUB,
            CompanyID: 'co-1',
            SubscriptionTypeID: 'st-1',
            ProductID: 'p-1',
            Status: 'Active',
            HolderOrganizationID: 'org-1',
            BeneficiaryPersonID: null,
        },
    ]);
    mocks.rows.set('Subscription Types', [
        {
            ID: 'st-1',
            Code: 'Annual',
            DriverClass: null,
            BillingCadence: 'Annual',
            GracePeriodDays: 0,
            CancellationWindowDays: null,
            ...rules,
        },
    ]);
    const all = [
        // Latest first, as the operation asks for it. The renewal is Active: booking writes every
        // term Active, so a later term is found by its dates, not by a 'Scheduled' status.
        { ID: T2, SubscriptionID: SUB, TermNumber: 2, OrderLineID: L2, StartDate: '2027-01-01', EndDate: '2027-12-31', Amount: 1300, Status: 'Active' },
        { ID: T1, SubscriptionID: SUB, TermNumber: 1, OrderLineID: L1, StartDate: '2026-01-01', EndDate: '2026-12-31', Amount: 1200, Status: 'Active' },
    ];
    mocks.rows.set('Subscription Terms', all.filter((t) => terms.includes(t.ID)));
    mocks.rows.set('Order Lines', [
        { ID: L1, OrderHeaderID: 'oh-1', ProductID: 'p-1', Quantity: 1, UnitPrice: 1200, DiscountPct: 0 },
        { ID: L2, OrderHeaderID: 'oh-2', ProductID: 'p-1', Quantity: 1, UnitPrice: 1300, DiscountPct: 0 },
    ]);
}

interface Recorded {
    orders: { Lines: Record<string, unknown>[]; [k: string]: unknown }[];
    terms: Map<string, Record<string, unknown>>;
    events: Record<string, unknown>[];
    tx: string[];
}

function fakeProvider(): { provider: IMetadataProvider; rec: Recorded } {
    const rec: Recorded = { orders: [], terms: new Map(), events: [], tx: [] };
    const provider = {
        BeginTransaction: async () => void rec.tx.push('begin'),
        CommitTransaction: async () => void rec.tx.push('commit'),
        RollbackTransaction: async () => void rec.tx.push('rollback'),
        GetEntityObject: async (entityName: string, keyOrUser: unknown) => {
            const keyed = (keyOrUser as { KeyValuePairs?: { Value: string }[] })?.KeyValuePairs?.[0]?.Value;
            const entity: Record<string, unknown> = { NewRecord: () => true, LatestResult: null };
            if (entityName.endsWith('Order Headers')) {
                const lines: Record<string, unknown>[] = [];
                Object.assign(entity, {
                    Lines: { Add: (l: Record<string, unknown>) => lines.push(l) },
                    Save: async () => {
                        rec.orders.push({ ...entity, Lines: lines });
                        Object.assign(entity, { ID: 'oh-rev', OrderNumber: 'ORD-REV' });
                        return true;
                    },
                });
            } else if (entityName.endsWith('Subscription Terms')) {
                entity.Save = async () => (rec.terms.set(keyed!, { ...entity }), true);
            } else if (entityName.endsWith('Subscription Events')) {
                entity.Save = async () => (rec.events.push({ ...entity }), true);
            } else {
                entity.Save = async () => true;
            }
            return entity;
        },
    } as unknown as IMetadataProvider;
    return { provider, rec };
}

async function cancel(input: Record<string, unknown>) {
    const { provider, rec } = fakeProvider();
    const op = new CancelSubscriptionOperation() as unknown as {
        InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<CancelSubscriptionOutput>;
    };
    const out = await op.InternalExecute({ SubscriptionID: SUB, ...input }, provider, { ID: 'user-1' } as unknown as UserInfo);
    return { out, rec };
}

const PRORATE_NOW = { CancellationMode: 'Immediate', CancellationRefundMode: 'ProrateUnused' };

describe('cancelling a subscription with a later term (#406)', () => {
    beforeEach(() => {
        mocks.rows.clear();
        mocks.instalmentLines.clear();
    });

    it('cancels and reverses the later term in full, on the same reversal order', async () => {
        seed(PRORATE_NOW);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success, out.Message).toBe(true);
        expect(out.SubscriptionTermID).toBe(T1);
        expect(rec.orders).toHaveLength(1);
        const [current, later] = rec.orders[0].Lines;
        expect(current.ReversesOrderLineID).toBe(L1);
        expect(Number(current.Quantity)).toBeCloseTo(-0.5, 2);
        expect(later.ReversesOrderLineID).toBe(L2);
        expect(later.Quantity).toBe(-1);
        expect(later.LineNumber).toBe(2);
        expect(day(later.ServicePeriodStart)).toBe('2027-01-01');
        expect(day(later.ServicePeriodEnd)).toBe('2027-12-31');

        expect(rec.terms.get(T1)?.Status).toBe('Canceled');
        expect(rec.terms.get(T2)?.Status).toBe('Canceled');
        expect(day(rec.terms.get(T2)?.CancellationEffectiveDate)).toBe('2027-01-01');

        expect(out.LaterTerms?.map((t) => [t.SubscriptionTermID, t.Decision.RefundAmount])).toEqual([[T2, 1300]]);
        expect(out.TotalRefundAmount).toBeCloseTo((out.Decision?.RefundAmount ?? 0) + 1300, 2);
        expect(out.ReversalOrderID).toBe('oh-rev');

        const data = JSON.parse(String(rec.events[0].EventData));
        expect(data.LaterTerms).toEqual([{ SubscriptionTermID: T2, TermNumber: 2, RefundAmount: 1300, ReversalFraction: 1 }]);
        expect(rec.events[0].RelatedOrderHeaderID).toBe('oh-rev');
        expect(rec.tx).toEqual(['begin', 'commit']);
    });

    it('reverses the later term even when the type refunds nothing for the current one', async () => {
        seed({ CancellationMode: 'EndOfTerm', CancellationRefundMode: 'NoRefund' });
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success, out.Message).toBe(true);
        // The current term rides out and reverses nothing; the renewal never starts.
        expect(rec.terms.get(T1)?.Status).toBe('Completed');
        expect(rec.terms.get(T2)?.Status).toBe('Canceled');
        expect(rec.orders).toHaveLength(1);
        expect(rec.orders[0].Lines).toHaveLength(1);
        expect(rec.orders[0].Lines[0].ReversesOrderLineID).toBe(L2);
        expect(rec.orders[0].Lines[0].LineNumber).toBe(1);
        expect(out.TotalRefundAmount).toBe(1300);
    });

    it('an early cancellation acts on the next term to start, not the latest, and leaves neither booked', async () => {
        seed(PRORATE_NOW);
        const { out, rec } = await cancel({ RequestDate: '2025-12-01' });

        expect(out.Success, out.Message).toBe(true);
        expect(out.SubscriptionTermID).toBe(T1);
        expect(out.LaterTerms?.map((t) => t.SubscriptionTermID)).toEqual([T2]);
        expect(rec.terms.get(T1)?.Status).toBe('Canceled');
        expect(rec.terms.get(T2)?.Status).toBe('Canceled');
        const [first, second] = rec.orders[0].Lines;
        expect(first.ReversesOrderLineID).toBe(L1);
        expect(Number(first.Quantity)).toBeLessThan(0);
        expect([second.ReversesOrderLineID, second.Quantity]).toEqual([L2, -1]);
    });

    it('a preview lists the later terms and the whole refund, and writes nothing', async () => {
        seed(PRORATE_NOW);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01', Preview: true });

        expect(out.Success).toBe(true);
        expect(out.LaterTerms?.map((t) => t.SubscriptionTermID)).toEqual([T2]);
        expect(out.TotalRefundAmount).toBeGreaterThan(1300);
        expect(out.Message).toMatch(/Term 2 starts 2027-01-01/);
        expect(rec.tx).toEqual([]);
        expect(rec.orders).toEqual([]);
        expect(rec.terms.size).toBe(0);
    });

    it('a later term on an instalment-billed order refuses the whole cancel and rolls back', async () => {
        seed(PRORATE_NOW);
        mocks.instalmentLines.add(L2);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/Term 2 was sold on order ORD-0002, which is billed by instalment/);
        expect(rec.tx).toEqual(['begin', 'rollback']);
        expect(rec.orders).toEqual([]);
        expect(rec.terms.size).toBe(0);
    });

    it('with no later term, behaves as before: one line, one term stamped', async () => {
        seed(PRORATE_NOW, [T1]);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success, out.Message).toBe(true);
        expect(out.LaterTerms).toEqual([]);
        expect(rec.orders[0].Lines).toHaveLength(1);
        expect([...rec.terms.keys()]).toEqual([T1]);
    });
});
