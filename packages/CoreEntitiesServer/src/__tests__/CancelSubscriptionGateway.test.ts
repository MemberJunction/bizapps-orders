/**
 * Cancelling a subscription a payment gateway bills cancels it at the gateway FIRST (E2b, bizapps-orders#972).
 *
 * Before: Sess cancels Jane's Stripe-billed SUB-000110 in March; Orders ends her access and Stripe still
 * charges her $599 in October, because nothing in the cancel ever spoke to Stripe. After: the gateway is
 * asked before the transaction opens, nothing is written unless it confirmed, and the stamp on the
 * subscription is the one sanctioned write. A subscription no gateway bills cancels exactly as before.
 *
 * Drives the real `InternalExecute` against a fake provider that records every write (the harness of
 * CancelSubscriptionLaterTerms.test.ts). The payment driver is replaced (`DescribeProviderSubscription`,
 * `CancelProviderSubscription`); `CancelAtGateway` is spied on but runs for real against that driver, and
 * so do the read of the gateway (`ReadGatewaySubscription`), its gate (`GateGatewayCancel`) and the plan of
 * WHEN the gateway stops (`PlanGatewayCancel`). The alert read is replaced, and delegates to the real
 * `CancelBlockingAlerts` where a test needs the Tasks read itself to fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rows: new Map<string, Record<string, unknown>[]>(),
    cancelAtGateway: vi.fn(),
    blocking: vi.fn(),
    sanction: vi.fn(),
    sanctionReversal: vi.fn(),
    alert: vi.fn(),
    /** The payment driver's read of the gateway subscription, and its cancel. */
    describe: vi.fn(),
    cancelAtDriver: vi.fn(),
    /** The open-alert Tasks read behind the real `CancelBlockingAlerts`. */
    readAlerts: vi.fn(),
    /** The real `CancelAtGateway` / `CancelBlockingAlerts`, captured by the module mock below. */
    actual: {} as {
        CancelAtGateway?: (...args: unknown[]) => Promise<unknown>;
        CancelBlockingAlerts?: (...args: unknown[]) => Promise<unknown>;
    },
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
        // Today is the business day of the (faked) clock in Chicago, as the real engine computes it: the cancel
        // reads it to decide whether access ends at once (#987).
        BusinessTimeZoneEngine: {
            Instance: {
                Config: vi.fn().mockResolvedValue(undefined),
                Zone: 'America/Chicago',
                Today: () => actual.CalendarDayIn(new Date(), 'America/Chicago'),
            },
        },
    };
});
vi.mock('../ProviderSubscriptionCancel.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../ProviderSubscriptionCancel.js')>();
    mocks.actual.CancelAtGateway = actual.CancelAtGateway as (...args: unknown[]) => Promise<unknown>;
    mocks.actual.CancelBlockingAlerts = actual.CancelBlockingAlerts as (...args: unknown[]) => Promise<unknown>;
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
vi.mock('../checkoutCaptureAlert.js', () => ({
    raiseProviderSubscriptionAlert: (...args: unknown[]) => mocks.alert(...args),
    ReadOpenProviderSubscriptionAlerts: (...args: unknown[]) => mocks.readAlerts(...args),
}));
// The account that bills sub_jane: a driver that reads and cancels through the two spies above.
vi.mock('../PaymentProviderResolver.js', () => ({
    LoadPaymentProviderConfig: vi.fn().mockResolvedValue({ ID: 'pp-stripe' }),
    BuildPaymentProvider: vi.fn().mockImplementation(async () => ({
        DescribeProviderSubscription: (...args: unknown[]) => mocks.describe(...args),
        CancelProviderSubscription: (...args: unknown[]) => mocks.cancelAtDriver(...args),
    })),
}));
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
    /** Every `ExecuteSQL` statement: the row lock taken first inside the transaction. */
    sql: string[];
}

interface ProviderOptions {
    failEvent?: boolean;
    /** What the row lock reads back; the status the operation loaded unless a concurrent cancel changed it. */
    lockedStatus?: string;
}

function fakeProvider(opts: ProviderOptions = {}): { provider: IMetadataProvider; rec: Recorded } {
    const rec: Recorded = { orders: [], terms: new Map(), subscriptions: [], events: [], tx: [], sql: [] };
    const provider = {
        BeginTransaction: async () => void rec.tx.push('begin'),
        CommitTransaction: async () => void rec.tx.push('commit'),
        RollbackTransaction: async () => void rec.tx.push('rollback'),
        ExecuteSQL: async (sql: string) => {
            rec.sql.push(sql);
            return [{ Status: opts.lockedStatus ?? mocks.rows.get('Subscriptions')?.[0]?.Status ?? null }];
        },
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

async function cancel(input: Record<string, unknown>, opts: ProviderOptions = {}) {
    const { provider, rec } = fakeProvider(opts);
    // The real CancelAtGateway, against the driver spy: what the gateway answers is `mocks.cancelAtDriver`.
    mocks.cancelAtGateway.mockImplementation(async (...args: unknown[]) => {
        mocks.txWhenGatewayAsked.push([...rec.tx]);
        return mocks.actual.CancelAtGateway!(...args);
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
        mocks.blocking.mockReset().mockResolvedValue({ Codes: [] });
        mocks.readAlerts.mockReset().mockResolvedValue({ Ok: true, Open: new Map() });
        // Stripe, before the term's last day: renewing, its current period the one that began at creation
        // (E2's first charge is 2026-12-31T06:00Z, 00:00 Central on the term's last day).
        mocks.describe.mockReset().mockResolvedValue({
            Success: true,
            State: 'Renewing',
            CurrentPeriodStart: new Date('2025-11-15T17:00:00Z'),
            CurrentPeriodEnd: new Date('2026-12-31T06:00:00Z'),
            Status: 'active',
        });
        // Stripe confirms: set to end at period end when asked for an instant, ended now otherwise.
        mocks.cancelAtDriver.mockReset().mockImplementation(async (req: { BillingEndsAt: Date | null }) => ({
            Success: true,
            Outcome: req.BillingEndsAt ? 'EndsAtPeriodEnd' : 'CanceledNow',
            BillingEndsAt: req.BillingEndsAt ?? undefined,
        }));
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
        mocks.blocking.mockResolvedValue({ Codes: ['NotRecorded'] });
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

    // ─── Reading the gateway before cancelling (E2b follow-up) ──────────────────────────────────────
    //
    // Robert's case: Stripe renews Jane's SUB-000110 at 00:00 Central on 31 Dec 2026 (06:00 UTC), the
    // term's last day, and charges $599 for year 2. Orders has not booked year 2 yet (E4 does). A cancel at
    // 3 pm that day used to plan "end at period end" and stop Stripe without refunding the charge it took
    // that morning. Now the gateway is read first and the cancel refused until a person settles it there.

    /** Nothing reached the gateway's write path and nothing was written or sanctioned in Orders. */
    function expectNothingDone(rec: Recorded): void {
        expect(mocks.cancelAtGateway).not.toHaveBeenCalled();
        expect(mocks.cancelAtDriver).not.toHaveBeenCalled();
        expect(rec.tx).toEqual([]);
        expect(rec.sql).toEqual([]);
        expect(rec.orders).toEqual([]);
        expect(rec.terms.size).toBe(0);
        expect(rec.subscriptions).toEqual([]);
        expect(rec.events).toEqual([]);
        expect(mocks.sanction).not.toHaveBeenCalled();
        expect(mocks.sanctionReversal).not.toHaveBeenCalled();
        expect(mocks.alert).not.toHaveBeenCalled();
    }

    /** Stripe after its renewal at 00:00 Central on 31 Dec 2026: a new period it charged, which Orders has not booked. */
    const RENEWED_ON_LAST_DAY = {
        Success: true,
        State: 'Renewing',
        CurrentPeriodStart: new Date('2026-12-31T06:00:00Z'),
        CurrentPeriodEnd: new Date('2027-12-31T06:00:00Z'),
        Status: 'active',
    };

    it.each([
        ['the default rules, request dated the last day', { RequestDate: '2026-12-31' }],
        ['Timing EndOfTerm, request dated the last day', { RequestDate: '2026-12-31', Timing: 'EndOfTerm' }],
        ['Timing EndOfTerm, request backdated to 30 Dec', { RequestDate: '2026-12-30', Timing: 'EndOfTerm' }],
    ])(
        "Robert's case: 3 pm Chicago on 31 Dec 2026, Stripe already renewed at 06:00Z, %s: refused, Stripe untouched, nothing written",
        async (_label, input) => {
            seed(NO_REFUND_END_OF_TERM);
            vi.setSystemTime(new Date('2026-12-31T21:00:00Z'));
            mocks.describe.mockResolvedValue(RENEWED_ON_LAST_DAY);
            const { out, rec } = await cancel(input);

            expect(out.Success).toBe(false);
            expect(out.Message).toMatch(/SUB-000110 is billed by the payment gateway \(sub_jane\)/);
            expect(out.Message).toMatch(/started a new billing period on 2026-12-31T06:00:00\.000Z that Orders has not booked/);
            expect(out.Message).toMatch(/term's last day \(2026-12-31\)/);
            expect(out.Message).toMatch(/At the gateway, cancel the subscription now and refund the renewal charge/);
            expect(out.Message).toMatch(/Nothing was changed\./);
            expect(mocks.describe).toHaveBeenCalledWith('sub_jane');
            expectNothingDone(rec);
        },
    );

    it('control, the day before: 3 pm Chicago on 30 Dec 2026, Stripe still in its creation period: cancelled at Stripe at end of coverage as before', async () => {
        seed(NO_REFUND_END_OF_TERM);
        vi.setSystemTime(new Date('2026-12-30T21:00:00Z'));
        const { out, rec } = await cancel({ RequestDate: '2026-12-30', Timing: 'EndOfTerm' });

        expect(out.Success, out.Message).toBe(true);
        expect(mocks.cancelAtGateway.mock.calls[0][1]).toEqual({ When: 'EndOfCoverage', BillingEndsAt: new Date('2027-01-01T06:00:00.000Z') });
        expect(mocks.cancelAtDriver).toHaveBeenCalledTimes(1);
        expect(mocks.cancelAtDriver.mock.calls[0][0]).toMatchObject({
            ProviderSubscriptionID: 'sub_jane',
            BillingEndsAt: new Date('2027-01-01T06:00:00.000Z'),
        });
        expect(rec.tx).toEqual(['begin', 'commit']);
        expect(rec.terms.get(T1)).toMatchObject({ Status: 'Completed' });
        expect(mocks.sanction).toHaveBeenCalledTimes(1);
        expect(out.Gateway).toMatchObject({ When: 'EndOfCoverage', Outcome: 'EndsAtPeriodEnd' });
    });

    it('Stripe set to end at period end (cancel_at_period_end) but its period began 31 Dec 06:00Z: refused, since ending it would keep the renewal it charged', async () => {
        seed(NO_REFUND_END_OF_TERM);
        vi.setSystemTime(new Date('2026-12-31T21:00:00Z'));
        mocks.describe.mockResolvedValue({ ...RENEWED_ON_LAST_DAY, State: 'Ending', EndsAt: new Date('2027-12-31T06:00:00Z') });
        const { out, rec } = await cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' });

        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/started a new billing period on 2026-12-31T06:00:00\.000Z that Orders has not booked/);
        expectNothingDone(rec);
    });

    it('a stuck cancel finished: on 5 Jan 2027 Stripe says Ended: recorded at the end of coverage (31 Dec 2026), nothing refunded, no year-2 refusal', async () => {
        seed(NO_REFUND_END_OF_TERM);
        vi.setSystemTime(new Date('2027-01-05T15:00:00Z'));
        mocks.describe.mockResolvedValue({
            Success: true,
            State: 'Ended',
            CurrentPeriodStart: new Date('2025-11-15T17:00:00Z'),
            CurrentPeriodEnd: new Date('2026-12-31T06:00:00Z'),
            Status: 'canceled',
        });
        mocks.cancelAtDriver.mockResolvedValue({ Success: true, Outcome: 'AlreadyEnded', Status: 'canceled' });
        const { out, rec } = await cancel({ RequestDate: '2027-01-05' });

        expect(out.Success, out.Message).toBe(true);
        expect(out.Message ?? '').not.toMatch(/no open term covers/);
        // Clamped to the latest term's last day, not the request day.
        expect(out.Decision?.EffectiveDate).toBe('2026-12-31T00:00:00.000Z');
        expect(out.SubscriptionTermID).toBe(T1);
        expect((rec.terms.get(T1)?.CancellationEffectiveDate as Date).toISOString()).toBe('2026-12-31T00:00:00.000Z');
        // No reversal, no refund.
        expect(rec.orders).toEqual([]);
        expect(out.ReversalOrderID).toBeUndefined();
        expect(out.TotalRefundAmount).toBe(0);
        expect(mocks.sanctionReversal).not.toHaveBeenCalled();
        // Stripe is still asked (idempotently) and answers that it already ended.
        expect(mocks.cancelAtDriver).toHaveBeenCalledTimes(1);
        expect(mocks.cancelAtDriver.mock.calls[0][0]).toMatchObject({ ProviderSubscriptionID: 'sub_jane', BillingEndsAt: null });
        expect(out.Gateway).toMatchObject({ ProviderSubscriptionID: 'sub_jane', When: 'Now', Outcome: 'AlreadyEnded' });
        expect(rec.tx).toEqual(['begin', 'commit']);
        expect(mocks.sanction).toHaveBeenCalledTimes(1);
        expect(rec.subscriptions[0]).toMatchObject({ Status: 'Canceled' });
    });

    it('a stuck cancel finished, prorating type: still recorded at 31 Dec 2026 with nothing reversed', async () => {
        seed(PRORATE_NOW);
        vi.setSystemTime(new Date('2027-01-05T15:00:00Z'));
        mocks.describe.mockResolvedValue({ Success: true, State: 'Ended', CurrentPeriodStart: new Date('2025-11-15T17:00:00Z'), Status: 'canceled' });
        mocks.cancelAtDriver.mockResolvedValue({ Success: true, Outcome: 'AlreadyEnded' });
        const { out, rec } = await cancel({ RequestDate: '2027-01-05' });

        expect(out.Success, out.Message).toBe(true);
        expect(out.Decision?.EffectiveDate).toBe('2026-12-31T00:00:00.000Z');
        expect(out.TotalRefundAmount).toBe(0);
        expect(rec.orders).toEqual([]);
        expect(mocks.sanctionReversal).not.toHaveBeenCalled();
    });

    it('control for the stuck cancel: on 5 Jan 2027 Stripe is still renewing in the period it charged on 31 Dec: refused as unbooked, Stripe untouched', async () => {
        seed(NO_REFUND_END_OF_TERM);
        vi.setSystemTime(new Date('2027-01-05T15:00:00Z'));
        mocks.describe.mockResolvedValue(RENEWED_ON_LAST_DAY);
        const { out, rec } = await cancel({ RequestDate: '2027-01-05' });

        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/started a new billing period on 2026-12-31T06:00:00\.000Z that Orders has not booked/);
        expectNothingDone(rec);
    });

    it.each([
        ['answers Success:false', () => mocks.describe.mockResolvedValue({ Success: false, Reason: 'rate limited' }), /Could not read sub_jane at the payment gateway: rate limited\. Nothing was changed; try again\./],
        ['throws', () => mocks.describe.mockRejectedValue(new Error('ECONNRESET')), /Could not read sub_jane at the payment gateway: the gateway did not answer for sub_jane \(ECONNRESET\)\. Nothing was changed/],
        ['answers no state', () => mocks.describe.mockResolvedValue({ Success: true }), /Could not read sub_jane at the payment gateway: the gateway's answer for sub_jane named no state/],
    ])('Stripe cannot be read (it %s): refused on 1 Jul 2026, nothing written', async (_label, arrange, message) => {
        seed(NO_REFUND_END_OF_TERM);
        arrange();
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(message);
        expectNothingDone(rec);
    });

    it('the open alert Tasks cannot be read, gateway-billed: refused before Stripe is even read, nothing written', async () => {
        seed(NO_REFUND_END_OF_TERM);
        mocks.blocking.mockImplementation((...args: unknown[]) => mocks.actual.CancelBlockingAlerts!(...args));
        mocks.readAlerts.mockResolvedValue({ Ok: false, Reason: 'could not read the open alert Tasks: permission denied' });
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(
            /SUB-000110 is billed by the payment gateway, and its open gateway alerts could not be checked \(could not read the open alert Tasks: permission denied\)\. Nothing was changed\. Cancelling needs read access to Tasks/,
        );
        expect(mocks.readAlerts).toHaveBeenCalledTimes(1);
        expect(mocks.describe).not.toHaveBeenCalled();
        expectNothingDone(rec);
    });

    it('control: the open alert Tasks cannot be read, NOT gateway-billed: cancels as before', async () => {
        seed(NO_REFUND_END_OF_TERM, false);
        mocks.blocking.mockImplementation((...args: unknown[]) => mocks.actual.CancelBlockingAlerts!(...args));
        mocks.readAlerts.mockResolvedValue({ Ok: false, Reason: 'could not read the open alert Tasks: permission denied' });
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success, out.Message).toBe(true);
        expect(mocks.readAlerts).toHaveBeenCalledTimes(1);
        expect(mocks.describe).not.toHaveBeenCalled();
        expect(mocks.cancelAtGateway).not.toHaveBeenCalled();
        expect(rec.tx).toEqual(['begin', 'commit']);
        expect(rec.subscriptions[0]).toMatchObject({ Status: 'Canceled' });
    });

    it('two cancels at once: the second finds the row already Canceled under the lock: rolled back, nothing booked, no gateway-only alert', async () => {
        seed(PRORATE_NOW);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' }, { lockedStatus: 'Canceled' });

        expect(out.Success).toBe(false);
        expect(out.Message).toBe('Subscription is already canceled.');
        // The gateway call succeeded (Stripe answers the second request too) ...
        expect(mocks.cancelAtDriver).toHaveBeenCalledTimes(1);
        expect(out.Gateway).toMatchObject({ When: 'Now', Outcome: 'CanceledNow' });
        // ... the lock was the first statement in the transaction, and the transaction was rolled back.
        expect(rec.sql).toHaveLength(1);
        expect(rec.sql[0]).toMatch(/SELECT Status FROM __mj_BizAppsOrders\.Subscription WITH \(UPDLOCK, ROWLOCK\) WHERE ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'/);
        expect(rec.tx).toEqual(['begin', 'rollback']);
        // No second credit memo, no stamps, no event, no sanction, and no CanceledAtGatewayOnly alert.
        expect(rec.orders).toEqual([]);
        expect(mocks.sanctionReversal).not.toHaveBeenCalled();
        expect(rec.terms.size).toBe(0);
        expect(rec.subscriptions).toEqual([]);
        expect(rec.events).toEqual([]);
        expect(mocks.sanction).not.toHaveBeenCalled();
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it('control for the lock: the lock reads Active, so the cancel takes the lock first and commits', async () => {
        seed(PRORATE_NOW);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });

        expect(out.Success, out.Message).toBe(true);
        expect(rec.sql).toHaveLength(1);
        expect(rec.sql[0]).toMatch(/WITH \(UPDLOCK, ROWLOCK\)/);
        expect(rec.tx).toEqual(['begin', 'commit']);
        expect(rec.orders).toHaveLength(1);
    });

    it('the business day, not the UTC day, decides the plan: 23:30 Central on 30 Dec (05:30Z on 31 Dec), end of term on 31 Dec: Stripe ends at 00:00 Central 1 Jan, not now', async () => {
        seed(NO_REFUND_END_OF_TERM);
        // 2026-12-30T23:30-06:00: the business day is still 30 Dec, while the UTC day is already 31 Dec.
        vi.setSystemTime(new Date('2026-12-31T05:30:00Z'));
        const { out } = await cancel({ RequestDate: '2026-12-30', Timing: 'EndOfTerm' });

        expect(out.Success, out.Message).toBe(true);
        expect(out.Decision?.EffectiveDate).toBe('2026-12-31T00:00:00.000Z');
        expect(mocks.cancelAtGateway.mock.calls[0][1]).toEqual({ When: 'EndOfCoverage', BillingEndsAt: new Date('2027-01-01T06:00:00.000Z') });
        // What Stripe is asked: an instant, not null (which would end it now, a day of coverage early).
        expect((mocks.cancelAtDriver.mock.calls[0][0] as { BillingEndsAt: Date | null }).BillingEndsAt).toEqual(new Date('2027-01-01T06:00:00.000Z'));
        expect(out.Gateway).toMatchObject({ When: 'EndOfCoverage', BillingEndsAt: '2027-01-01T06:00:00.000Z' });
    });
});
