/**
 * SyncProviderSubscription / SyncProviderSubscriptions with a fake provider: what a run does with the plan's
 * steps when something downstream refuses. The planner's own cases are in ProviderSubscriptionSyncPlan.test.ts.
 *
 *   · the gateway ended it but Orders' cancel refuses → its own NON-blocking notice (never RenewalNotBooked,
 *     which blocks every later cancel); and a refusal because another delivery already recorded the cancel
 *     is success;
 *   · a renewal that will not book → urgent RenewalNotBooked, and the end state is not mirrored;
 *   · the nightly pass tells a person about every subscription it could not sync, in Preview too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewaySubscriptionInvoice } from '../BasePaymentProvider.js';

interface Row {
    [key: string]: unknown;
}

const SUB = '22222222-2222-4222-8222-222222222222';

const state = vi.hoisted(() => ({
    /** What SettleGatewayRenewalCredits applies (D20's sweep), or the error it throws; and how often it ran. */
    settle: 0 as number | Error,
    settleCalls: 0,
    status: 'Active',
    statusAfterCancel: 'Active',
    describe: {} as Record<string, unknown>,
    invoices: [] as unknown[],
    cancel: { Success: true, Output: { Success: true } } as Record<string, unknown>,
    cancelled: 0,
    book: { Outcome: 'Booked', Message: 'booked ORD-1' } as Record<string, unknown>,
    alerts: [] as Row[],
    describeFails: false,
    refunded: 0,
    cap: null as number | null,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => undefined,
        LogStatus: () => undefined,
        RunView: class {
            async RunView(params: { EntityName: string; Fields?: string[] }) {
                const e = params.EntityName;
                if (e.endsWith('Subscriptions')) {
                    if (params.Fields?.length === 2) return { Success: true, Results: [{ ID: SUB, Status: state.cancelled ? state.statusAfterCancel : state.status }] };
                    if (params.Fields?.length === 1) return { Success: true, Results: [{ ID: SUB }] };
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: SUB,
                                SubscriptionNumber: 'SUB-000110',
                                Status: state.status,
                                AutoRenew: true,
                                ProductID: 'p',
                                CompanyID: '33333333-3333-4333-8333-333333333333',
                                HolderOrganizationID: null,
                                BeneficiaryPersonID: 'per',
                                PaymentProviderID: 'acct',
                                ProviderSubscriptionID: 'sub_jane',
                            },
                        ],
                    };
                }
                if (e.endsWith('Subscription Terms')) {
                    return { Success: true, Results: [{ ID: 't1', TermNumber: 1, StartDate: '2026-10-31', EndDate: '2027-10-30', OrderLineID: null, Quantity: 1 }] };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});
vi.mock('../isolatedProvider.js', () => ({ WithIsolatedProvider: (fn: (p: unknown) => unknown, shared: unknown) => fn(shared) }));
vi.mock('../PaymentProviderResolver.js', () => ({
    LoadPaymentProviderConfig: async () => ({ ID: 'acct', CompanyID: 'c', BillsSubscriptions: true, Capabilities: { SupportsSubscriptionBilling: true } }),
    BuildPaymentProvider: async () => ({
        DescribeProviderSubscription: async () => (state.describeFails ? { Success: false, Reason: 'Stripe unreachable' } : state.describe),
        ListProviderSubscriptionInvoices: async () => ({ Success: true, Invoices: state.invoices }),
        RetrieveCharge: async () => ({ Success: true, Charge: { AmountRefunded: state.refunded } }),
    }),
}));
vi.mock('../CreateOrderFromProviderPaymentOperation.js', () => ({ functionalCurrency: async () => 'USD' }));
vi.mock('../CancelSubscriptionOperation.js', () => ({
    WithGatewayEndRecorded: (fn: () => Promise<unknown>) => {
        state.cap = 1;
        return fn();
    },
    CancelSubscriptionOperation: class {
        async ExecuteServer() {
            state.cancelled++;
            return state.cancel;
        }
    },
}));
vi.mock('../GatewayRenewalCredit.js', () => ({
    SettleGatewayRenewalCredits: async () => {
        state.settleCalls++;
        if (state.settle instanceof Error) throw state.settle;
        return state.settle;
    },
}));
vi.mock('../ProviderRenewalBooking.js', () => ({
    BookProviderRenewal: async () => {
        if ((state.book as unknown) instanceof Error) throw state.book;
        return state.book;
    },
}));
vi.mock('../checkoutCaptureAlert.js', () => ({
    raiseProviderSubscriptionAlert: async (a: Row) => {
        state.alerts.push(a);
        return true;
    },
}));

import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { SyncProviderSubscription, SyncProviderSubscriptions } from '../ProviderSubscriptionSync.js';

const provider = { GetEntityObject: async () => ({}) } as unknown as IMetadataProvider;
const user = {} as UserInfo;
const NOW = new Date('2027-11-15T12:00:00Z');

const paidRenewal = (): GatewaySubscriptionInvoice => ({
    ProviderInvoiceID: 'in_renew',
    Status: 'paid',
    BillingReason: 'subscription_cycle',
    AmountPaid: 599,
    AmountDue: 599,
    Tax: 0,
    CurrencyCode: 'USD',
    ProviderIntentID: 'pi_renew',
    ProviderChargeID: 'ch_renew',
    CreatedAt: new Date('2027-10-30T05:00:00Z'),
    PaidAt: new Date('2027-10-30T05:00:00Z'),
    PaidOutOfBand: false,
    Discounted: false,
    AttemptCount: 1,
    NextAttemptAt: null,
    ProviderPriceID: 'price_pro',
    Quantity: 1,
    PeriodStart: new Date('2027-10-30T05:00:00Z'),
    PeriodEnd: new Date('2028-10-30T05:00:00Z'),
});

beforeEach(() => {
    state.status = 'Active';
    state.statusAfterCancel = 'Active';
    state.describe = { Success: true, State: 'Ended', Status: 'canceled', EndedAt: new Date('2027-11-14T12:00:00Z') };
    state.invoices = [];
    state.cancel = { Success: true, Output: { Success: true } };
    state.cancelled = 0;
    state.book = { Outcome: 'Booked', Message: 'booked ORD-1' };
    state.alerts = [];
    state.describeFails = false;
    state.refunded = 0;
    state.cap = null;
    state.settle = 0;
    state.settleCalls = 0;
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Zone', 'get').mockReturnValue('America/Chicago');
});

describe('the gateway ended it: recording the cancel', () => {
    it('recorded: Changed, no notice', async () => {
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(r.Outcome).toBe('Changed');
        expect(state.alerts).toEqual([]);
    });
    it('refused because another delivery recorded it a moment ago (now Canceled): success, no notice', async () => {
        state.cancel = { Success: true, Output: { Success: false, Message: 'Subscription is already canceled.' } };
        state.statusAfterCancel = 'Canceled';
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(r.Outcome).toBe('Changed');
        expect(r.Actions.join(' ')).toMatch(/already recorded/);
        expect(state.alerts).toEqual([]);
    });
    it('refused for another reason: GatewayCancelNotRecorded, which does NOT block a later cancel (never RenewalNotBooked)', async () => {
        state.cancel = { Success: true, Output: { Success: false, Message: 'Could not read sub_jane at the payment gateway' } };
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.alerts.map((a) => a.Code)).toEqual(['GatewayCancelNotRecorded']);
        expect(state.alerts[0]).toMatchObject({ Urgent: false });
        expect(r.Notices).toEqual(['GatewayCancelNotRecorded']);
        const { CANCEL_BLOCKING_ALERT_CODES } = await vi.importActual<typeof import('../ProviderSubscriptionCancel.js')>('../ProviderSubscriptionCancel.js');
        expect(CANCEL_BLOCKING_ALERT_CODES).not.toContain('GatewayCancelNotRecorded');
    });
});

describe("D20's sweep: a gateway refund's credit still on account is applied to its renewal", () => {
    it('applied: an action says so', async () => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        state.settle = 200;
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(r.Actions).toContain("applied 200.00 of a gateway refund's credit to its renewal");
        expect(r.Outcome).toBe('Changed');
    });
    it('control: nothing on account: InLine, nothing said', async () => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.settleCalls).toBe(1);
        expect(r.Outcome).toBe('InLine');
    });
    it('it fails: a notice, and the rest of the sync stands', async () => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        state.settle = new Error('locked out');
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(r.Notices.join(' ')).toMatch(/could not apply a gateway refund's credit to its renewal: locked out/);
    });
    it('a FAILED sync does not run it', async () => {
        state.describeFails = true;
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(r.Outcome).toBe('Failed');
        expect(state.settleCalls).toBe(0);
    });
    it('a sync that FAILS part-way (a step throws) does not run it either', async () => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        state.invoices = [paidRenewal()];
        (state as { book: unknown }).book = new Error('database went away');
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(r.Outcome).toBe('Failed');
        expect(state.settleCalls).toBe(0);
    });
    it('a Preview writes nothing, so it does not run', async () => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        await SyncProviderSubscription(SUB, { Now: NOW, Preview: true }, provider, user);
        expect(state.settleCalls).toBe(0);
    });
});

describe('a renewal that will not book', () => {
    it('Refused → urgent RenewalNotBooked, and the end state is not mirrored (no cancel attempted)', async () => {
        state.invoices = [paidRenewal()];
        state.book = { Outcome: 'Refused', Message: 'the order was refused' };
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.alerts.map((a) => [a.Code, a.Urgent])).toEqual([['RenewalNotBooked', true]]);
        expect(state.cancelled).toBe(0);
        expect(r.Outcome).toBe('NeedsPerson');
    });
});

describe('the nightly pass tells a person about every subscription it could not sync', () => {
    it('a failed sync raises an urgent GatewaySyncFailed', async () => {
        state.describeFails = true;
        const out = await SyncProviderSubscriptions({ Now: NOW }, provider, user);
        expect(out.Failed).toBe(1);
        expect(state.alerts.map((a) => [a.Code, a.Urgent])).toEqual([['GatewaySyncFailed', true]]);
        expect(String(state.alerts[0].Reason)).toMatch(/Stripe unreachable/);
    });
    it('in Preview too: a read that fails is a person\'s problem whether or not the pass writes', async () => {
        state.describeFails = true;
        await SyncProviderSubscriptions({ Now: NOW, Preview: true }, provider, user);
        expect(state.alerts.map((a) => a.Code)).toEqual(['GatewaySyncFailed']);
    });
    it('control: a pass that syncs raises nothing', async () => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        const out = await SyncProviderSubscriptions({ Now: NOW }, provider, user);
        expect(out.Failed).toBe(0);
        expect(state.alerts).toEqual([]);
    });
});

describe('the gateway charged the renewal and then ended it', () => {
    const endedThatAfternoon = { Success: true, State: 'Ended', Status: 'canceled', EndedAt: new Date('2027-10-30T15:00:00Z') };
    it('kept: booked, the cancel runs as a record of the gateway\'s end, and EndedAfterRenewal says what was kept', async () => {
        state.describe = endedThatAfternoon;
        state.invoices = [paidRenewal()];
        state.refunded = 0;
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.alerts.map((a) => a.Code)).toEqual(['EndedAfterRenewal']);
        expect(String(state.alerts[0].Reason)).toMatch(/keeping 599\.00/);
        expect(state.cap).toBe(1);
        expect(r.Outcome).toBe('Changed');
    });
    it('refunded at the gateway: the notice says so (the cancel itself reverses what was refunded, per term)', async () => {
        state.describe = endedThatAfternoon;
        state.invoices = [paidRenewal()];
        state.refunded = 599;
        await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(String(state.alerts[0].Reason)).toMatch(/refunded 599\.00 of it/);
    });
    it('a refund reported above what the renewal took counts only what it took (599, not 700)', async () => {
        state.describe = endedThatAfternoon;
        state.invoices = [paidRenewal()];
        state.refunded = 700;
        await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(String(state.alerts[0].Reason)).toMatch(/refunded 599\.00 of it/);
    });
    it('control: an ordinary end at period end (no renewal charged): no notice', async () => {
        state.describe = endedThatAfternoon;
        state.invoices = [];
        await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.alerts).toEqual([]);
    });
});
