/**
 * Cancelling a subscription a payment gateway bills cancels it at the gateway FIRST (E2b, bizapps-orders#972).
 *
 * Before: Sess cancels Jane's Stripe-billed SUB-000110 in March; Orders ends her access and Stripe still
 * charges her $599 in October, because nothing in the cancel ever spoke to Stripe. After: the gateway is
 * asked before the transaction opens, nothing is written unless it confirmed, and the stamp on the
 * subscription is the one sanctioned write. A subscription no gateway bills cancels exactly as before.
 *
 * Drives the real `InternalExecute` against a fake provider that records every write (the harness of
 * CancelSubscriptionLaterTerms.test.ts). The gateway call itself (`CancelAtGateway`) and the alert reads
 * are replaced; the plan of WHEN the gateway stops (`PlanGatewayCancel`) is the real one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rows: new Map<string, Record<string, unknown>[]>(),
    cancelAtGateway: vi.fn(),
    blocking: vi.fn(),
    sanction: vi.fn(),
    sanctionReversal: vi.fn(),
    alert: vi.fn(),
    /** Snapshot of the transaction log at the moment the gateway was asked. */
    txWhenGatewayAsked: [] as string[][],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
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
vi.mock('@mj-biz-apps/common-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/common-entities')>();
    return {
        ...actual,
        BusinessTimeZoneEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), Zone: 'America/Chicago' } },
    };
});
vi.mock('../ProviderSubscriptionCancel.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../ProviderSubscriptionCancel.js')>();
    return {
        ...actual,
        CancelAtGateway: (...args: unknown[]) => mocks.cancelAtGateway(...args),
        CancelBlockingAlerts: (...args: unknown[]) => mocks.blocking(...args),
    };
});
vi.mock('../SubscriptionEntityServer.js', () => ({
    SanctionProviderBilledChange: (...args: unknown[]) => mocks.sanction(...args),
    SanctionCancellationReversal: (...args: unknown[]) => mocks.sanctionReversal(...args),
}));
vi.mock('../checkoutCaptureAlert.js', () => ({ raiseProviderSubscriptionAlert: (...args: unknown[]) => mocks.alert(...args) }));
vi.mock('../ReversalResolver.js', () => ({
    LoadReversalContext: vi.fn().mockResolvedValue({ OriginScheduled: false, Origin: {}, ScheduleRows: [] }),
}));
vi.mock('../EntitlementEngine.js', () => ({ RevokeGrantsForCanceledSubscription: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../OrderLineEntityServer.js', () => ({ MarkAsOrdersOwnWrite: vi.fn() }));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CancelSubscriptionOperation, type CancelSubscriptionOutput } from '../CancelSubscriptionOperation.js';

const SUB = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const T1 = 'term-1';
const L1 = 'line-1';

const NO_REFUND_END_OF_TERM = { CancellationMode: 'EndOfTerm', CancellationRefundMode: 'NoRefund' };
const PRORATE_NOW = { CancellationMode: 'Immediate', CancellationRefundMode: 'ProrateUnused' };

/** Jane's SUB-000110: term 1 is calendar 2026 at $599, billed by Stripe as sub_jane unless `billed` is false. */
function seed(rules: Record<string, unknown>, billed = true): void {
    mocks.rows.set('Subscriptions', [
        {
            ID: SUB,
            SubscriptionNumber: 'SUB-000110',
            PaymentProviderID: billed ? 'pp-stripe' : null,
            ProviderSubscriptionID: billed ? 'sub_jane' : null,
            CompanyID: 'co-1',
            SubscriptionTypeID: 'st-1',
            ProductID: 'p-1',
            Status: 'Active',
            HolderOrganizationID: null,
            BeneficiaryPersonID: 'person-jane',
        },
    ]);
    mocks.rows.set('Subscription Types', [
        { ID: 'st-1', Code: 'Annual', DriverClass: null, BillingCadence: 'Annual', GracePeriodDays: 0, CancellationWindowDays: null, ...rules },
    ]);
    mocks.rows.set('Subscription Terms', [
        { ID: T1, SubscriptionID: SUB, TermNumber: 1, OrderLineID: L1, StartDate: '2026-01-01', EndDate: '2026-12-31', Amount: 599, Status: 'Active' },
    ]);
    mocks.rows.set('Order Lines', [{ ID: L1, OrderHeaderID: 'oh-1', ProductID: 'p-1', Quantity: 1, UnitPrice: 599, DiscountPct: 0 }]);
}

interface Recorded {
    orders: Record<string, unknown>[];
    terms: Map<string, Record<string, unknown>>;
    subscriptions: Record<string, unknown>[];
    events: Record<string, unknown>[];
    tx: string[];
}

function fakeProvider(opts: { failEvent?: boolean } = {}): { provider: IMetadataProvider; rec: Recorded } {
    const rec: Recorded = { orders: [], terms: new Map(), subscriptions: [], events: [], tx: [] };
    const provider = {
        BeginTransaction: async () => void rec.tx.push('begin'),
        CommitTransaction: async () => void rec.tx.push('commit'),
        RollbackTransaction: async () => void rec.tx.push('rollback'),
        EntityByName: () => undefined,
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
                entity.Save = async () => {
                    if (opts.failEvent) throw new Error('deadlock victim');
                    rec.events.push({ ...entity });
                    return true;
                };
            } else if (entityName.endsWith('Subscriptions')) {
                entity.ID = keyed;
                entity.Save = async () => (rec.subscriptions.push({ ...entity }), true);
            } else {
                entity.Save = async () => true;
            }
            return entity;
        },
    } as unknown as IMetadataProvider;
    return { provider, rec };
}

async function cancel(input: Record<string, unknown>, opts: { failEvent?: boolean } = {}) {
    const { provider, rec } = fakeProvider(opts);
    mocks.cancelAtGateway.mockImplementation(async (sub: unknown, plan: { When: string; BillingEndsAt?: Date }) => {
        mocks.txWhenGatewayAsked.push([...rec.tx]);
        return {
            Success: true,
            Summary: {
                ProviderSubscriptionID: 'sub_jane',
                When: plan.When,
                BillingEndsAt: plan.When === 'EndOfCoverage' ? plan.BillingEndsAt!.toISOString() : undefined,
                Outcome: plan.When === 'Now' ? 'CanceledNow' : 'EndsAtPeriodEnd',
            },
        };
    });
    const op = new CancelSubscriptionOperation() as unknown as {
        InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<CancelSubscriptionOutput>;
    };
    const out = await op.InternalExecute({ SubscriptionID: SUB, ...input }, provider, { ID: 'user-sess' } as unknown as UserInfo);
    return { out, rec };
}

describe('cancelling a subscription the payment gateway bills (E2b)', () => {
    beforeEach(() => {
        mocks.rows.clear();
        mocks.cancelAtGateway.mockReset();
        mocks.blocking.mockReset().mockResolvedValue([]);
        mocks.sanction.mockReset();
        mocks.sanctionReversal.mockReset();
        mocks.alert.mockReset().mockResolvedValue(true);
        mocks.txWhenGatewayAsked = [];
        // "Today" is 1 Jul 2026 in Chicago, so the gateway plan is deterministic.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-07-01T15:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('end of term: Stripe is told to charge nothing after 00:00 Central on 1 Jan 2027, before anything is written', async () => {
        seed(NO_REFUND_END_OF_TERM);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success, out.Message).toBe(true);
        expect(mocks.cancelAtGateway).toHaveBeenCalledTimes(1);
        const [sub, plan] = mocks.cancelAtGateway.mock.calls[0] as [Record<string, unknown>, { When: string; BillingEndsAt: Date }];
        expect(sub).toMatchObject({ ID: SUB, PaymentProviderID: 'pp-stripe', ProviderSubscriptionID: 'sub_jane' });
        // Coverage runs through 31 Dec 2026; the gateway charges nothing after 00:00 CST on 1 Jan 2027 (06:00 UTC).
        expect(plan).toEqual({ When: 'EndOfCoverage', BillingEndsAt: new Date('2027-01-01T06:00:00.000Z') });
        // Asked before the transaction opened: a refusal leaves nothing to roll back.
        expect(mocks.txWhenGatewayAsked).toEqual([[]]);
        expect(rec.tx).toEqual(['begin', 'commit']);

        // The stamp is the one sanctioned write, on the subscription the operation loaded for it.
        expect(mocks.sanction).toHaveBeenCalledTimes(1);
        expect((mocks.sanction.mock.calls[0][0] as { ID: string }).ID).toBe(SUB);
        expect(rec.subscriptions[0]).toMatchObject({ Status: 'Canceled', AutoRenew: false });

        expect(out.Gateway).toEqual({
            ProviderSubscriptionID: 'sub_jane',
            When: 'EndOfCoverage',
            BillingEndsAt: '2027-01-01T06:00:00.000Z',
            Outcome: 'EndsAtPeriodEnd',
        });
        // The lifecycle event keeps the evidence that the gateway stopped billing.
        expect(JSON.parse(String(rec.events[0].EventData)).Gateway).toEqual(out.Gateway);
    });

    it('immediately: Stripe ends it now, and the cancel\'s own reversal order is marked as the cancel\'s', async () => {
        seed(PRORATE_NOW);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success, out.Message).toBe(true);
        expect(mocks.cancelAtGateway.mock.calls[0][1]).toEqual({ When: 'Now' });
        expect(out.Gateway).toMatchObject({ When: 'Now', Outcome: 'CanceledNow' });
        // A prorated refund books a reversal order; it may reverse the gateway-billed sale only because it is the cancel's.
        expect(rec.orders).toHaveLength(1);
        expect(mocks.sanctionReversal).toHaveBeenCalledTimes(1);
    });

    it('the gateway does not confirm: nothing is written, nothing is sanctioned, and the person is told to try again', async () => {
        seed(NO_REFUND_END_OF_TERM);
        const { provider, rec } = fakeProvider();
        mocks.cancelAtGateway.mockResolvedValue({
            Success: false,
            Reason: 'The payment gateway did not confirm the cancel of sub_jane: rate limited. Nothing was changed in Orders. Try again.',
            Summary: { ProviderSubscriptionID: 'sub_jane', When: 'EndOfCoverage' },
        });
        const op = new CancelSubscriptionOperation() as unknown as {
            InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<CancelSubscriptionOutput>;
        };
        const out = await op.InternalExecute({ SubscriptionID: SUB, RequestDate: '2026-07-01' }, provider, { ID: 'u' } as unknown as UserInfo);

        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/Nothing was changed in Orders\. Try again\./);
        expect(rec.tx).toEqual([]);
        expect(rec.subscriptions).toEqual([]);
        expect(rec.terms.size).toBe(0);
        expect(rec.events).toEqual([]);
        expect(mocks.sanction).not.toHaveBeenCalled();
    });

    it('preview: says what Stripe will do and asks it nothing', async () => {
        seed(NO_REFUND_END_OF_TERM);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01', Preview: true });

        expect(out.Success, out.Message).toBe(true);
        expect(mocks.cancelAtGateway).not.toHaveBeenCalled();
        expect(out.Gateway).toEqual({ ProviderSubscriptionID: 'sub_jane', When: 'EndOfCoverage', BillingEndsAt: '2027-01-01T06:00:00.000Z' });
        expect(rec.tx).toEqual([]);
    });

    it('an open gateway alert (a Stripe subscription Orders has not recorded) stops the cancel before anything happens', async () => {
        seed(NO_REFUND_END_OF_TERM, false);
        mocks.blocking.mockResolvedValue(['NotRecorded']);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/SUB-000110 has an open gateway alert \(NotRecorded\)/);
        expect(mocks.blocking).toHaveBeenCalledWith('SUB-000110', expect.anything(), expect.anything());
        expect(mocks.cancelAtGateway).not.toHaveBeenCalled();
        expect(rec.tx).toEqual([]);
    });

    it('in year 2, before Orders books Stripe\'s renewal, it refuses rather than end access the gateway was paid for', async () => {
        seed(NO_REFUND_END_OF_TERM);
        vi.setSystemTime(new Date('2027-03-01T15:00:00Z'));
        const { out, rec } = await cancel({ RequestDate: '2027-03-01' });

        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/no open term covers 2027-03-01: the gateway's renewal is not booked in Orders yet/);
        expect(mocks.cancelAtGateway).not.toHaveBeenCalled();
        expect(rec.tx).toEqual([]);
    });

    it('control: the same late cancel on a subscription no gateway bills goes ahead as before', async () => {
        seed(NO_REFUND_END_OF_TERM, false);
        vi.setSystemTime(new Date('2027-03-01T15:00:00Z'));
        const { out } = await cancel({ RequestDate: '2027-03-01' });
        expect(out.Success, out.Message).toBe(true);
        expect(mocks.cancelAtGateway).not.toHaveBeenCalled();
    });

    it('control: a subscription no gateway bills cancels exactly as before: no gateway, no sanction, no Gateway in the output', async () => {
        seed(NO_REFUND_END_OF_TERM, false);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success, out.Message).toBe(true);
        expect(mocks.cancelAtGateway).not.toHaveBeenCalled();
        expect(mocks.sanction).not.toHaveBeenCalled();
        expect(out.Gateway).toBeUndefined();
        expect(rec.subscriptions[0]).toMatchObject({ Status: 'Canceled' });
        expect(JSON.parse(String(rec.events[0].EventData)).Gateway).toBeNull();
    });

    it('Stripe stopped billing but recording the cancel failed: rolled back, an alert says so, and the message says to run it again', async () => {
        seed(NO_REFUND_END_OF_TERM);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' }, { failEvent: true });

        expect(out.Success).toBe(false);
        expect(rec.tx).toEqual(['begin', 'rollback']);
        expect(out.Message).toMatch(/stopped billing sub_jane, but recording the cancel in Orders failed: deadlock victim\. Run the cancel again/);
        expect(out.Gateway).toMatchObject({ Outcome: 'EndsAtPeriodEnd' });
        expect(mocks.alert).toHaveBeenCalledTimes(1);
        expect(mocks.alert.mock.calls[0][0]).toMatchObject({ SubscriptionNumber: 'SUB-000110', Code: 'CanceledAtGatewayOnly', Linked: true });
    });
});
