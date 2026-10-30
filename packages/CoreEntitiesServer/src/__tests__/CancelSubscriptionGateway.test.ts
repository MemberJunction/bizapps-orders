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
    /** Renewal lines whose credit rows the cancel locked (in one order) before applying. */
    lockedCreditRows: [] as string[],
    /** The `known` figure each GatewayRenewalCreditFor call for term 2's line was given (undefined = read the gateway). */
    knownSeen: [] as unknown[],
    /** Quantity of the line already reversed (earlier credits), as ReversedQuantityOf reads it. */
    reversedQty: 0,
    rows: new Map<string, Record<string, unknown>[]>(),
    cancelAtGateway: vi.fn(),
    blocking: vi.fn(),
    sanction: vi.fn(),
    sanctionReversal: vi.fn(),
    alert: vi.fn(),
    /** The payment driver's read of the gateway subscription, and its cancel. */
    describe: vi.fn(),
    /** D20's per-term refund position, by the order line that sold the term (absent: not a gateway renewal). */
    credit: new Map<string, { Outstanding: number; Refunded: number; Credited: number; ChargeID: string }>(),
    /** ApplyGatewayCredit calls: [reversal order, renewal order, amount]. */
    applied: [] as unknown[][],
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
vi.mock('../GatewayRenewalCredit.js', async () => ({
    GatewayRenewalCreditFor: async (lineID: string, _d: unknown, _p: unknown, _u: unknown, known?: unknown) => {
        if (lineID === '22222222-0000-4000-8000-000000000002') mocks.knownSeen.push(known);
        const c = mocks.credit.get(lineID);
        return c ? { OrderID: `order-of-${lineID}`, ...c } : null;
    },
    ApplyGatewayCredit: async (...args: unknown[]) => void mocks.applied.push(args),
    // The real lock statement and the real quantity rule; only the gateway read and the reversal lookup are faked.
    LockSubscriptionForCredit: async (provider: { ExecuteSQL: (q: string) => Promise<unknown> }, id: string) => {
        const rows = (await provider.ExecuteSQL(`SELECT Status FROM __mj_BizAppsOrders.Subscription WITH (UPDLOCK, ROWLOCK) WHERE ID = '${id}'`)) as
            | Array<{ Status?: string }>
            | { Results?: Array<{ Status?: string }> }
            | undefined;
        return (Array.isArray(rows) ? rows : (rows?.Results ?? []))[0]?.Status ?? null;
    },
    CreditReversalQuantity: (await vi.importActual<typeof import('../GatewayRenewalCredit.js')>('../GatewayRenewalCredit.js')).CreditReversalQuantity,
    ReversedQuantityOf: async () => mocks.reversedQty,
    LockGatewayCreditRows: async (lines: string[]) => void mocks.lockedCreditRows.push(...lines),
    // The real rule on the line's quantity (1) and what is reversed: a tail too small to split is held (0).
    GatewayCreditQuantity: async (term: { Paid: number; Credited: number }, amount: number) =>
        (await vi.importActual<typeof import('../GatewayRenewalCredit.js')>('../GatewayRenewalCredit.js')).CreditReversalQuantity({
            Quantity: 1,
            AlreadyReversed: mocks.reversedQty,
            Credit: amount,
            Paid: term.Paid,
            Credited: term.Credited,
        }),
}));
vi.mock('../ReversalResolver.js', () => ({
    LoadReversalContext: vi.fn().mockResolvedValue({ OriginScheduled: false, Origin: {}, ScheduleRows: [] }),
}));
vi.mock('../EntitlementEngine.js', () => ({ RevokeGrantsForCanceledSubscription: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../OrderLineEntityServer.js', () => ({ MarkAsOrdersOwnWrite: vi.fn() }));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CancelSubscriptionOperation, WithGatewayEndRecorded, type CancelSubscriptionOutput } from '../CancelSubscriptionOperation.js';

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
    /** Runs when the row lock is taken: what another worker committed while this one waited for it. */
    onLock?: () => void;
}

function fakeProvider(opts: ProviderOptions = {}): { provider: IMetadataProvider; rec: Recorded } {
    const rec: Recorded = { orders: [], terms: new Map(), subscriptions: [], events: [], tx: [], sql: [] };
    const provider = {
        BeginTransaction: async () => void rec.tx.push('begin'),
        CommitTransaction: async () => void rec.tx.push('commit'),
        RollbackTransaction: async () => void rec.tx.push('rollback'),
        ExecuteSQL: async (sql: string) => {
            rec.sql.push(sql);
            if (/UPDLOCK/.test(sql)) opts.onLock?.();
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
    // The last-day case: Stripe renews Jane's SUB-000110 at 00:00 Central on 31 Dec 2026 (06:00 UTC), the
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
        "The last-day case: 3 pm Chicago on 31 Dec 2026, Stripe already renewed at 06:00Z, %s: refused, Stripe untouched, nothing written",
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

    describe("END OF TERM on a gateway-billed subscription ends with the LATEST BOOKED term (Ethan, 29 Oct)", () => {
        const T2 = { ID: 'term-2', SubscriptionID: SUB, TermNumber: 2, OrderLineID: L1, StartDate: '2027-01-01', EndDate: '2027-12-31', Amount: 599, Status: 'Active' };
        const withTerm2 = (billed = true) => {
            seed(NO_REFUND_END_OF_TERM, billed);
            mocks.rows.set('Subscription Terms', [
                { ID: T1, SubscriptionID: SUB, TermNumber: 1, OrderLineID: L1, StartDate: '2026-01-01', EndDate: '2026-12-31', Amount: 599, Status: 'Active' },
                T2,
            ]);
            vi.setSystemTime(new Date('2026-12-31T21:00:00Z'));
            // Stripe renewed at 00:00 Central on the last day, and E4 booked term 2.
            mocks.describe.mockResolvedValue({ ...RENEWED_ON_LAST_DAY });
        };
        it('term 2 booked: an EndOfTerm cancel on term 1\'s last day ends with term 2 (paid), cancels nothing, and asks Stripe to stop at the end of term 2', async () => {
            withTerm2();
            const { out } = await cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' });
            expect(out.Success, out.Message).toBe(true);
            expect(String(out.Decision?.EffectiveDate).slice(0, 10)).toBe('2027-12-31');
            expect(out.SubscriptionTermID).toBe('term-2');
            expect(out.LaterTerms ?? []).toEqual([]);
            expect(out.TotalRefundAmount ?? 0).toBe(0);
            const asked = mocks.cancelAtDriver.mock.calls[0][0] as { BillingEndsAt: Date | null };
            expect(asked.BillingEndsAt).not.toBeNull();
            expect(asked.BillingEndsAt!.toISOString() >= '2027-12-31').toBe(true);
        });
        it('the customer already set cancel-at-period-end at Stripe (Ending, nothing unbooked): EndOfTerm still ends with the paid term 2', async () => {
            withTerm2();
            mocks.describe.mockResolvedValue({
                Success: true,
                State: 'Ending',
                Status: 'active',
                CurrentPeriodStart: new Date('2026-12-31T06:00:00Z'),
                EndsAt: new Date('2027-12-31T06:00:00Z'),
            });
            const { out } = await cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' });
            expect(out.Success, out.Message).toBe(true);
            expect(out.SubscriptionTermID).toBe('term-2');
            expect(out.LaterTerms ?? []).toEqual([]);
        });
        it('the type\'s default (CancellationMode EndOfTerm, no Timing given) does the same', async () => {
            withTerm2();
            const { out } = await cancel({ RequestDate: '2026-12-31' });
            expect(String(out.Decision?.EffectiveDate).slice(0, 10)).toBe('2027-12-31');
        });
        it('control: Immediate stays "cancel now": term 1, and term 2 cancelled under the type\'s rule', async () => {
            withTerm2();
            const { out } = await cancel({ RequestDate: '2026-12-31', Timing: 'Immediate' });
            expect(out.Success, out.Message).toBe(true);
            expect(out.SubscriptionTermID).toBe(T1);
            expect(out.LaterTerms?.map((l) => l.SubscriptionTermID)).toEqual(['term-2']);
        });
        it('control: a subscription Orders bills keeps #406: EndOfTerm ends with the term covering the request, the later one cancelled', async () => {
            withTerm2(false);
            const { out } = await cancel({ RequestDate: '2026-07-01', Timing: 'EndOfTerm' });
            expect(out.Success, out.Message).toBe(true);
            expect(out.SubscriptionTermID).toBe(T1);
            expect(out.LaterTerms?.map((l) => l.SubscriptionTermID)).toEqual(['term-2']);
        });
        it("control: a cancel that only RECORDS the gateway's end (the sync) is never extended to the latest term, even if the gateway still reads as billing", async () => {
            withTerm2();
            const { out } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' }));
            expect(out.SubscriptionTermID).toBe(T1);
        });
        it('control: the gateway already ENDED it: Orders records the gateway\'s end (term 1), not the latest term', async () => {
            withTerm2();
            mocks.describe.mockResolvedValue({ Success: true, State: 'Ended', Status: 'canceled', CurrentPeriodStart: new Date('2026-12-31T06:00:00Z') });
            const { out } = await cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' });
            expect(out.SubscriptionTermID).toBe(T1);
        });
    });

    describe("the gateway ENDED it: every renewal term reverses exactly what the gateway refunded of ITS OWN charge (D20)", () => {
        const L2 = '22222222-0000-4000-8000-000000000002';
        const L3 = '22222222-0000-4000-8000-000000000003';
        const kept = (line: string, refunded = 0, credited = 0) =>
            mocks.credit.set(line, { Outstanding: Math.max(0, refunded - credited), Paid: 599, Refunded: refunded, Credited: credited, ChargeID: `ch_${line.slice(-1)}` });
        const terms = (three = false) => {
            seed(PRORATE_NOW);
            mocks.lockedCreditRows.length = 0;
            mocks.credit.clear();
            mocks.applied.length = 0;
            mocks.rows.set('Subscription Terms', [
                { ID: T1, SubscriptionID: SUB, TermNumber: 1, OrderLineID: L1, StartDate: '2026-01-01', EndDate: '2026-12-31', Amount: 599, Status: 'Active' },
                { ID: 'term-2', SubscriptionID: SUB, TermNumber: 2, OrderLineID: L2, StartDate: '2027-01-01', EndDate: '2027-12-31', Amount: 599, Status: 'Active' },
                ...(three ? [{ ID: 'term-3', SubscriptionID: SUB, TermNumber: 3, OrderLineID: L3, StartDate: '2028-01-01', EndDate: '2028-12-31', Amount: 599, Status: 'Active' }] : []),
            ]);
            mocks.rows.set('Order Lines', [
                { ID: L1, OrderHeaderID: 'oh-1', ProductID: 'p-1', Quantity: 1, UnitPrice: 599, DiscountPct: 0 },
                { ID: L2, OrderHeaderID: 'oh-2', ProductID: 'p-1', Quantity: 1, UnitPrice: 599, DiscountPct: 0 },
                { ID: L3, OrderHeaderID: 'oh-3', ProductID: 'p-1', Quantity: 1, UnitPrice: 599, DiscountPct: 0 },
            ]);
            vi.setSystemTime(new Date('2026-12-31T21:00:00Z'));
            mocks.describe.mockResolvedValue({ Success: true, State: 'Ended', Status: 'canceled', CurrentPeriodStart: new Date('2026-12-31T06:00:00Z') });
        };
        it('the type refunds, but the gateway kept the charge: nothing of term 2 is reversed (no credit Stripe never paid)', async () => {
            terms();
            kept(L2, 0);
            const { out } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' }));
            expect(out.Success, out.Message).toBe(true);
            expect(out.LaterTerms?.[0]?.Decision?.RefundAmount).toBe(0);
            expect(out.TotalRefundAmount).toBe(0);
        });
        it('the gateway refunded 300: exactly 300 reversed', async () => {
            terms();
            kept(L2, 300);
            const { out } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' }));
            expect(out.LaterTerms?.[0]?.Decision?.RefundAmount).toBe(300);
        });
        it('BLOCKING case: terms 2 and 3 both gateway renewals; Stripe charged term 3 on term 2\'s last day and refunded THAT $599: term 2 (served) reverses 0, term 3 reverses 599 — never pooled', async () => {
            terms(true);
            kept(L2, 0);
            kept(L3, 599);
            vi.setSystemTime(new Date('2027-12-31T21:00:00Z'));
            const { out } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2027-12-31', Timing: 'EndOfTerm' }));
            expect(out.Success, out.Message).toBe(true);
            expect(out.SubscriptionTermID).toBe('term-2');
            expect(out.Decision?.RefundAmount).toBe(0);
            expect(out.LaterTerms?.map((l) => [l.SubscriptionTermID, l.Decision?.RefundAmount])).toEqual([['term-3', 599]]);
        });
        it('what is already credited (a D20 credit at refund time) is not reversed again: refunded 599, credited 200 → 399', async () => {
            terms();
            kept(L2, 599, 200);
            const { out } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' }));
            expect(out.LaterTerms?.[0]?.Decision?.RefundAmount).toBe(399);
        });
        it('R4-1: a refund credited on another worker while this cancel waited for the lock is seen: it reverses 399, not 599', async () => {
            terms();
            kept(L2, 599);
            vi.setSystemTime(new Date('2027-01-03T18:00:00Z'));
            const { out, rec } = await WithGatewayEndRecorded(() =>
                cancel({ RequestDate: '2027-01-03', Timing: 'Immediate' }, { onLock: () => kept(L2, 599, 200) }),
            );
            expect(out.Success, out.Message).toBe(true);
            expect(out.TotalRefundAmount).toBe(399);
            const line = (rec.orders[0].Lines as Array<{ Quantity: number; UnitPrice: number }>)[0];
            expect(Math.round(Math.abs(line.Quantity * line.UnitPrice) * 100) / 100).toBe(399);
            // Decided under the one lock both doors take.
            expect(rec.sql[0]).toMatch(/__mj_BizAppsOrders\.Subscription WITH \(UPDLOCK, ROWLOCK\)/);
            // And its credit lands ON the renewal it refunds (D20, the credit-note model), inside the transaction.
            expect(mocks.applied.map((a) => a[0])).toEqual([L2]);
            expect(mocks.lockedCreditRows).toEqual([L2]);
        });
        it('a partial credit already booked (200 of 599, 0.3339 of the line reversed): the cancel reverses the REST of the line, exactly 399, to the cent', async () => {
            terms();
            kept(L2, 599, 200);
            mocks.reversedQty = 0.3339;
            try {
                vi.setSystemTime(new Date('2027-01-03T18:00:00Z'));
                const { out, rec } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2027-01-03', Timing: 'Immediate' }));
                expect(out.TotalRefundAmount).toBe(399);
                const line = (rec.orders[0].Lines as Array<{ Quantity: number; UnitPrice: number }>)[0];
                // The remainder of the line (1 − 0.3339), not a fresh share of it: the slices sum to the line.
                expect(line.Quantity).toBe(-0.6661);
                // The unit price is stated at the column's 4dp, so quantity × price is the refund to the cent.
                expect(Number.isInteger(Math.round(line.UnitPrice * 1e4 * 1e6) / 1e6)).toBe(true);
                expect(Math.round(Math.abs(line.Quantity * line.UnitPrice) * 100) / 100).toBe(399);
            } finally {
                mocks.reversedQty = 0;
            }
        });
        it('R6-4: a tail too small to split off the line (0.9999 reversed, 0.05 of 0.10 left): HELD, and the gateway end is still recorded', async () => {
            terms();
            kept(L2, 1199.85, 1199.8);
            mocks.credit.set(L2, { ...mocks.credit.get(L2)!, Paid: 1200 });
            mocks.reversedQty = 0.9999;
            try {
                vi.setSystemTime(new Date('2027-01-03T18:00:00Z'));
                const { out, rec } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2027-01-03', Timing: 'Immediate' }));
                expect(out.Success, out.Message).toBe(true);
                expect(out.TotalRefundAmount).toBe(0);
                expect(out.Message).toMatch(/0\.05 is held: too small to split off what is left of the line/);
                expect(rec.subscriptions[0]).toMatchObject({ Status: 'Canceled' });
            } finally {
                mocks.reversedQty = 0;
            }
        });
        it('the gateway is read ONCE per line, before the lock: the re-read under the lock passes that figure in', async () => {
            terms();
            kept(L2, 599);
            mocks.knownSeen.length = 0;
            vi.setSystemTime(new Date('2027-01-03T18:00:00Z'));
            await WithGatewayEndRecorded(() => cancel({ RequestDate: '2027-01-03', Timing: 'Immediate' }));
            expect(mocks.knownSeen.filter((k) => k === undefined).length).toBe(1);
            expect(mocks.knownSeen.filter((k) => k !== undefined)).toEqual([{ ChargeID: 'ch_2', Refunded: 599 }]);
        });
        it('R4-1 control: nothing credited meanwhile: the full 599 is reversed, as the pre-lock read said', async () => {
            terms();
            kept(L2, 599);
            vi.setSystemTime(new Date('2027-01-03T18:00:00Z'));
            const { out } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2027-01-03', Timing: 'Immediate' }));
            expect(out.TotalRefundAmount).toBe(599);
        });
        it('control: a recorded cancel that reverses nothing (the gateway kept the charge) applies nothing', async () => {
            terms();
            kept(L2, 0);
            vi.setSystemTime(new Date('2027-01-03T18:00:00Z'));
            await WithGatewayEndRecorded(() => cancel({ RequestDate: '2027-01-03', Timing: 'Immediate' }));
            expect(mocks.applied).toEqual([]);
        });
        it.each([
            ['nothing refunded', 0],
            ['a partial refund', 200],
            ['refunded in full', 599],
        ])('recording a dashboard cancel two days INTO term 2 (Immediate): term 2 reverses exactly what the gateway refunded, %s', async (_l, refunded) => {
            terms();
            kept(L2, refunded);
            vi.setSystemTime(new Date('2027-01-03T18:00:00Z'));
            const { out, rec } = await WithGatewayEndRecorded(() => cancel({ RequestDate: '2027-01-03', Timing: 'Immediate' }));
            expect(out.Success, out.Message).toBe(true);
            expect(out.SubscriptionTermID).toBe('term-2');
            expect(out.Decision?.RefundAmount).toBe(refunded);
            expect(out.TotalRefundAmount).toBe(refunded);
            if (refunded > 0) {
                // To the cent: the reversal line's unit price is stated so quantity × price is the refund.
                const line = (rec.orders[0].Lines as Array<{ Quantity: number; UnitPrice: number }>)[0];
                expect(Math.round(Math.abs(line.Quantity * line.UnitPrice) * 100) / 100).toBe(refunded);
            }
        });
        it('DESIGN CHANGE: a person finishing a cancel the gateway already ENDED follows the same rule (the gateway kept the charge → 0), not the type\'s', async () => {
            terms();
            kept(L2, 0);
            const { out } = await cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' });
            expect(out.LaterTerms?.[0]?.Decision?.RefundAmount).toBe(0);
        });
        it("control: while the gateway still bills, a person's Immediate cancel follows the type's refund rule (Ethan, D19)", async () => {
            terms();
            kept(L2, 0);
            vi.setSystemTime(new Date('2027-01-03T18:00:00Z'));
            mocks.describe.mockResolvedValue({ Success: true, State: 'Renewing', Status: 'active', CurrentPeriodStart: new Date('2026-12-31T06:00:00Z') });
            const { out } = await cancel({ RequestDate: '2027-01-03', Timing: 'Immediate' });
            expect(out.Success, out.Message).toBe(true);
            expect(out.Decision?.RefundAmount).toBeGreaterThan(590);
        });
    });

    it('the last day, and the gateway answered a 2xx that is not this subscription (no status): a failed read, refused, nothing sent or written', async () => {
        seed(NO_REFUND_END_OF_TERM);
        vi.setSystemTime(new Date('2026-12-31T21:00:00Z'));
        // What the Stripe driver now answers for a malformed 200 (StripeProviderSubscription.test.ts, fail closed).
        mocks.describe.mockResolvedValue({ Success: false, Reason: "Stripe's answer for sub_jane named no status; treated as a failed read" });
        const { out, rec } = await cancel({ RequestDate: '2026-12-31', Timing: 'EndOfTerm' });
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/Could not read sub_jane at the payment gateway: .*named no status.*Nothing was changed/);
        expectNothingDone(rec);
    });

    it('two open terms: the gate reads the LATEST term\'s last day (T2 to 2027-12-31), so a period that began on T1\'s last day is booked, and a March cancel proceeds', async () => {
        seed(NO_REFUND_END_OF_TERM);
        mocks.rows.set('Subscription Terms', [
            { ID: T1, SubscriptionID: SUB, TermNumber: 1, OrderLineID: L1, StartDate: '2026-01-01', EndDate: '2026-12-31', Amount: 599, Status: 'Active' },
            { ID: 'term-2', SubscriptionID: SUB, TermNumber: 2, OrderLineID: L1, StartDate: '2027-01-01', EndDate: '2027-12-31', Amount: 599, Status: 'Active' },
        ]);
        vi.setSystemTime(new Date('2027-03-15T18:00:00Z'));
        mocks.describe.mockResolvedValue({ ...RENEWED_ON_LAST_DAY });
        const { out } = await cancel({ RequestDate: '2027-03-15', Timing: 'EndOfTerm' });
        expect(out.Message ?? '').not.toMatch(/started a new billing period/);
        expect(out.Success).toBe(true);
    });

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

    it('an open blocking alert does NOT stop recording a cancel the gateway already ENDED (it bills nothing more): finished, the gateway read once', async () => {
        seed(NO_REFUND_END_OF_TERM);
        mocks.blocking.mockResolvedValue({ Codes: ['RenewalNotBooked'] });
        mocks.describe.mockResolvedValue({ Success: true, State: 'Ended', Status: 'canceled', CurrentPeriodStart: new Date('2026-01-01T06:00:00Z') });
        const { out } = await cancel({ RequestDate: '2026-07-01' });
        expect(out.Success, out.Message).toBe(true);
        // The early read is reused by the gate, not repeated.
        expect(mocks.describe).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['Ending (set to end, still billing this period)', { Success: true, State: 'Ending', Status: 'active', CurrentPeriodStart: new Date('2026-01-01T06:00:00Z'), EndsAt: new Date('2026-12-31T06:00:00Z') }],
        ['Collecting (retrying a charge)', { Success: true, State: 'Collecting', Status: 'past_due', CurrentPeriodStart: new Date('2026-01-01T06:00:00Z') }],
    ])('control: an open RenewalNotBooked while the gateway is %s: refused (only ENDED lets it through)', async (_l, billing) => {
        seed(NO_REFUND_END_OF_TERM);
        mocks.blocking.mockResolvedValue({ Codes: ['RenewalNotBooked'] });
        mocks.describe.mockResolvedValue(billing);
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/open gateway alert \(RenewalNotBooked\)/);
        expectNothingDone(rec);
    });

    it('control: an alert about ANOTHER gateway subscription (NotRecorded) still blocks although this one ENDED: the other may still bill', async () => {
        seed(NO_REFUND_END_OF_TERM);
        mocks.blocking.mockResolvedValue({ Codes: ['NotRecorded', 'RenewalNotBooked'] });
        mocks.describe.mockResolvedValue({ Success: true, State: 'Ended', Status: 'canceled', CurrentPeriodStart: new Date('2026-01-01T06:00:00Z') });
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });
        expect(out.Success).toBe(false);
        expectNothingDone(rec);
    });

    it('control: ENDED at the gateway but the alert Tasks cannot be read: refused (an unread list could hold another subscription\'s alert)', async () => {
        seed(NO_REFUND_END_OF_TERM);
        mocks.blocking.mockResolvedValue({ Codes: [], ReadFailure: 'permission denied' });
        mocks.describe.mockResolvedValue({ Success: true, State: 'Ended', Status: 'canceled', CurrentPeriodStart: new Date('2026-01-01T06:00:00Z') });
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/could not be checked/);
        expectNothingDone(rec);
    });

    it('control: the same open alert while the gateway still bills: refused, as before', async () => {
        seed(NO_REFUND_END_OF_TERM);
        mocks.blocking.mockResolvedValue({ Codes: ['RenewalNotBooked'] });
        mocks.describe.mockResolvedValue({ Success: true, State: 'Renewing', Status: 'active', CurrentPeriodStart: new Date('2026-01-01T06:00:00Z') });
        const { out, rec } = await cancel({ RequestDate: '2026-07-01' });
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/open gateway alert \(RenewalNotBooked\)/);
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
