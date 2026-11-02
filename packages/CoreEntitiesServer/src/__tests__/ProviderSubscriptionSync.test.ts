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
    /** Gateway charge ids an Orders payment records (the importer's: a charge and no intent), and every filter read. */
    paymentCharges: [] as string[],
    /** Payments with their subscription and status (the scope `BookedChargeFilter` asks for); `paymentCharges` are SUB's, Captured. */
    paymentRows: [] as Array<{ charge: string; sub: string; status: string }>,
    paymentFilters: [] as string[],
    /** What the sync asked the gateway for (`CreatedSince`), and how many renewals it booked. */
    listedSince: [] as unknown[],
    booked: 0,
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
                if (e.endsWith('Payment Headers')) {
                    // HONOURS the filter: only payments recording one of the charges asked for come back.
                    const f = (params as { ExtraFilter?: string }).ExtraFilter ?? '';
                    state.paymentFilters.push(f);
                    const asked = /ProviderChargeID IN \(([^)]*)\)/.exec(f)?.[1]?.split(',').map((c) => c.trim().replace(/^'|'$/g, '')) ?? [];
                    // Honours the scope too, as SQL would: Failed rows only when not excluded; only payments on the orders
                    // of the subscription(s) the filter names, by BOTH routes (a term's line, or a line renewing it).
                    const notFailed = /Status <> 'Failed'/.test(f);
                    const renews = /RenewsSubscriptionID = '([^']+)'/.exec(f)?.[1];
                    const terms = /t\.SubscriptionID = '([^']+)'/.exec(f)?.[1];
                    const rows = [...state.paymentCharges.map((c) => ({ charge: c, sub: SUB, status: 'Captured' })), ...state.paymentRows].filter(
                        (r) => asked.includes(r.charge) && (!notFailed || r.status !== 'Failed') && r.sub === renews && r.sub === terms,
                    );
                    return { Success: true, Results: rows.map((r, i) => ({ ID: `pay-${i}`, ProviderChargeID: r.charge })) };
                }
                if (e.endsWith('Subscription Terms')) {
                    return { Success: true, Results: [{ ID: '22222222-2222-4222-8222-0000000000f1', TermNumber: 1, StartDate: '2026-10-31', EndDate: '2027-10-30', OrderLineID: null, Quantity: 1 }] };
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
        ListProviderSubscriptionInvoices: async (req: { CreatedSince: unknown }) => {
            state.listedSince.push(req.CreatedSince);
            return { Success: true, Invoices: state.invoices };
        },
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
        state.booked++;
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
import { BookedChargeFilter, SyncProviderSubscription, SyncProviderSubscriptions } from '../ProviderSubscriptionSync.js';

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
    state.paymentCharges = [];
    state.paymentFilters = [];
    state.paymentRows = [];
    state.listedSince = [];
    state.booked = 0;
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Zone', 'get').mockReturnValue('America/Chicago');
});

describe('the gateway ended it: recording the cancel', () => {
    it('recorded: Changed, no notice', async () => {
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(r.Outcome, r.Error).toBe('Changed');
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

describe("BookedChargeIDs: the fact behind the imported-subscriber rule (#989 review's top pick)", () => {
    beforeEach(() => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        state.invoices = [paidRenewal()];
    });
    it("an Orders payment already records the renewal's charge (the importer's: a charge, no intent): never booked again", async () => {
        state.paymentCharges = ['ch_renew'];
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.booked).toBe(0);
        expect(r.Outcome).toBe('InLine');
        // Read by the charge, across every key and account.
        expect(state.paymentFilters[0]).toBe(BookedChargeFilter(SUB, ['ch_renew']));
    });
    it('control: no payment records that charge: the renewal is booked once', async () => {
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.booked).toBe(1);
        expect(r.Outcome).toBe('Changed');
    });
    it("control: a payment recording ANOTHER charge does not hide this one", async () => {
        state.paymentCharges = ['ch_other'];
        await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.booked).toBe(1);
    });
    it("L3 review: the same charge on ANOTHER subscription's payment is not this one's money: the renewal is booked", async () => {
        state.paymentRows = [{ charge: 'ch_renew', sub: '99999999-9999-4999-8999-999999999999', status: 'Captured' }];
        const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.booked).toBe(1);
        expect(r.Differences.length).toBeGreaterThan(0);
    });
    it('L3 review: a FAILED payment recording the charge is not money: the renewal is booked', async () => {
        state.paymentRows = [{ charge: 'ch_renew', sub: SUB, status: 'Failed' }];
        expect((await SyncProviderSubscription(SUB, { Now: NOW }, provider, user)).Outcome).toBe('Changed');
        expect(state.booked).toBe(1);
    });
    it("control: this subscription's payment, Refunded or Pending as well as Captured, counts: in line", async () => {
        for (const status of ['Captured', 'Refunded', 'Pending']) {
            state.paymentRows = [{ charge: 'ch_renew', sub: SUB, status }];
            state.booked = 0;
            const r = await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
            expect(`${status}:${r.Outcome}:${state.booked}`).toBe(`${status}:InLine:0`);
        }
    });
    it('BookedChargeFilter: the charges, not Failed, and only payments on this subscription\'s orders (a term\'s line or a line renewing it)', () => {
        expect(BookedChargeFilter(SUB, ['ch_a', "ch_o'b"])).toBe(
            `ProviderChargeID IN ('ch_a','ch_o''b') AND Status <> 'Failed' AND ID IN (SELECT pl.PaymentHeaderID FROM __mj_BizAppsOrders.PaymentLine pl ` +
                `WHERE pl.OrderHeaderID IN (SELECT ol.OrderHeaderID FROM __mj_BizAppsOrders.OrderLine ol WHERE ol.RenewsSubscriptionID = '${SUB}' ` +
                `OR ol.ID IN (SELECT t.OrderLineID FROM __mj_BizAppsOrders.SubscriptionTerm t WHERE t.SubscriptionID = '${SUB}')))`,
        );
        expect(() => BookedChargeFilter("x' OR 1=1 --", ['ch_a'])).toThrow();
    });
    it('every invoice charge is asked for, de-duplicated; an invoice with no charge asks nothing', async () => {
        state.invoices = [paidRenewal(), { ...paidRenewal(), ProviderInvoiceID: 'in_dup' }, { ...paidRenewal(), ProviderInvoiceID: 'in_2', ProviderIntentID: 'pi_2', ProviderChargeID: 'ch_2' }];
        state.paymentCharges = ['ch_renew', 'ch_2'];
        await SyncProviderSubscription(SUB, { Now: NOW }, provider, user);
        expect(state.paymentFilters[0]).toMatch(/^ProviderChargeID IN \('ch_renew','ch_2'\) AND /);
        expect(state.booked).toBe(0);
        state.paymentFilters = [];
        state.invoices = [{ ...paidRenewal(), ProviderChargeID: null }];
        await SyncProviderSubscription(SUB, { Now: NOW, Preview: true }, provider, user);
        expect(state.paymentFilters).toEqual([]);
    });
});

describe('the invoices read: since 24 h BEFORE the latest term began', () => {
    it("term 1 starts 2026-10-31: the gateway is asked for invoices created since 2026-10-30T00:00Z (StartDate − 24 h, never + 24 h)", async () => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        await SyncProviderSubscription(SUB, { Now: NOW, Preview: true }, provider, user);
        expect((state.listedSince[0] as Date).toISOString()).toBe('2026-10-30T00:00:00.000Z');
    });
});

describe('the nightly pass passes Preview down to each subscription', () => {
    beforeEach(() => {
        state.describe = { Success: true, State: 'Renewing', Status: 'active' };
        state.invoices = [paidRenewal()];
    });
    it('Preview: nothing is booked, and the subscription reports Previewed', async () => {
        const out = (await SyncProviderSubscriptions({ Now: NOW, Preview: true }, provider, user)) as { Results?: { Outcome: string }[] };
        expect(state.booked).toBe(0);
        expect(out.Results?.map((r) => r.Outcome)).toEqual(['Previewed']);
    });
    it('control: Preview off books the renewal', async () => {
        await SyncProviderSubscriptions({ Now: NOW, Preview: false }, provider, user);
        expect(state.booked).toBe(1);
    });
});
