/**
 * BookProviderRenewal (E4) against a fake provider: what is written, in what order, and the cross-worker guard.
 *
 * The guard is the one thing an in-process integration check cannot see: two deliveries of one renewal on two
 * workers both read "not booked", then race. The booking takes an update lock on the subscription row inside
 * its transaction and looks again under it (the intent, any payment of the charge, or the $0 renewal's
 * event). These tests pin both halves: the lock is taken before anything is written, and a booking found
 * under the lock rolls back with nothing written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewaySubscriptionInvoice } from '../BasePaymentProvider.js';

interface Row {
    [key: string]: unknown;
}

const state = vi.hoisted(() => ({
    log: [] as string[],
    /** Answers to the look-ups, by entity: before the lock (first read) and under it (second read). */
    intents: [] as Row[][],
    payments: [] as Row[][],
    events: [] as Row[][],
    saved: [] as Row[],
    capture: { Success: true, Output: { Success: true, PaymentNumber: 'PAY-1' } } as Record<string, unknown>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    const next = (list: Row[][]) => (list.length > 1 ? list.shift()! : (list[0] ?? []));
    return {
        ...actual,
        LogError: () => undefined,
        LogStatus: () => undefined,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                state.log.push(`read ${params.EntityName.replace('MJ_BizApps_Orders: ', '')}`);
                if (params.EntityName.endsWith('Payment Intents')) return { Success: true, Results: next(state.intents) };
                if (params.EntityName.endsWith('Payment Headers')) return { Success: true, Results: next(state.payments) };
                if (params.EntityName.endsWith('Subscription Events')) return { Success: true, Results: next(state.events) };
                if (params.EntityName.endsWith('Order Headers')) return { Success: true, Results: [{ ID: 'o-1', OrderNumber: 'ORD-1', Origin: 'ProviderPayment' }] };
                return { Success: true, Results: [] };
            }
        },
    };
});
vi.mock('../CapturePaymentOperation.js', () => ({
    CapturePaymentOperation: class {
        async ExecuteServer(input: Row) {
            state.log.push(`capture ${input.Amount} key=${input.IdempotencyKey} company=${input.ReceivingCompanyID}`);
            return state.capture;
        }
    },
}));
vi.mock('../ProviderRefundBooking.js', () => ({ BookProviderRefunds: async () => ({ Booked: [] }) }));

import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BookProviderRenewal, type RenewalSubscription } from '../ProviderRenewalBooking.js';

function entity(kind: string): Row {
    const row: Row = {
        kind,
        ID: `${kind}-id`,
        OrderNumber: 'ORD-1',
        NewRecord: () => undefined,
        Load: async () => true,
        Set: (k: string, v: unknown) => {
            row[k] = v;
        },
        Save: async () => {
            state.log.push(`save ${kind}${kind === 'Order Headers' ? ` ${row.Status}` : ''}`);
            state.saved.push({ kind, ...Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v !== 'function' && typeof v !== 'object')) });
            return true;
        },
        LatestResult: { CompleteMessage: '' },
        Lines: { Add: (l: Row) => state.log.push(`line ${l.UnitPrice} ${l.DiscountPct ?? 0}`) },
        Choices: { Create: async () => ({}) },
        MarkRenewalPriced: () => undefined,
    };
    return row;
}
const provider = {
    GetEntityObject: async (name: string) => entity(name.replace('MJ_BizApps_Orders: ', '')),
    ExecuteSQL: async (sql: string) => {
        state.log.push(/UPDLOCK, ROWLOCK/.test(sql) ? 'LOCK subscription' : `sql ${sql.slice(0, 30)}`);
        return [{ Status: 'Active' }];
    },
    BeginTransaction: async () => void state.log.push('BEGIN'),
    CommitTransaction: async () => void state.log.push('COMMIT'),
    RollbackTransaction: async () => void state.log.push('ROLLBACK'),
} as unknown as IMetadataProvider;
const user = {} as UserInfo;
const driver = { RetrieveCharge: async () => ({ Success: true, Charge: { AmountRefunded: 0 } }) } as never;
const config = { ID: 'acct-1', CompanyID: 'company-of-the-account' } as never;

const sub: RenewalSubscription = {
    ID: '11111111-1111-4111-8111-111111111111',
    SubscriptionNumber: 'SUB-000110',
    Status: 'Active',
    ProductID: 'prod-professional',
    CompanyID: 'company-of-the-subscription',
    HolderOrganizationID: null,
    BeneficiaryPersonID: 'person-jane',
    PaymentProviderID: 'acct-1',
    ProviderSubscriptionID: 'sub_jane',
    LatestTermOrderLineID: null,
    LatestTermQuantity: 1,
    LatestTermUnitPrice: 599,
};
const invoice = (over: Partial<GatewaySubscriptionInvoice> = {}): GatewaySubscriptionInvoice => ({
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
    PaidAt: new Date('2027-10-30T05:00:05Z'),
    PaidOutOfBand: false,
    Discounted: false,
    AttemptCount: 1,
    NextAttemptAt: null,
    ProviderPriceID: 'price_pro',
    Quantity: 1,
    PeriodStart: new Date('2027-10-30T05:00:00Z'),
    PeriodEnd: new Date('2028-10-30T05:00:00Z'),
    ...over,
});
const book = (inv = invoice(), s = sub) => BookProviderRenewal(s, inv, config, driver, provider, user);

beforeEach(() => {
    state.log = [];
    state.intents = [[]];
    state.payments = [[]];
    state.events = [[]];
    state.saved = [];
    state.capture = { Success: true, Output: { Success: true, PaymentNumber: 'PAY-1' } };
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined as never);
});

describe('BookProviderRenewal', () => {
    it('locks the subscription row inside the transaction BEFORE writing anything, re-checks under it, then intent → order → commit → capture', () => {
        return book().then((out) => {
            expect(out.Outcome).toBe('Booked');
            const at = (s: string) => state.log.indexOf(s);
            expect(at('BEGIN')).toBeGreaterThan(-1);
            expect(at('LOCK subscription')).toBeGreaterThan(at('BEGIN'));
            // the re-check reads (intent, then any payment of the charge) come after the lock
            expect(state.log.indexOf('read Payment Intents', at('LOCK subscription'))).toBeGreaterThan(at('LOCK subscription'));
            expect(state.log.indexOf('read Payment Headers', at('LOCK subscription'))).toBeGreaterThan(at('LOCK subscription'));
            expect(at('save Payment Intents')).toBeGreaterThan(at('LOCK subscription'));
            expect(at('save Order Headers Draft')).toBeGreaterThan(at('save Payment Intents'));
            expect(at('save Order Headers Confirmed')).toBeGreaterThan(at('save Order Headers Draft'));
            expect(at('COMMIT')).toBeGreaterThan(at('save Order Headers Confirmed'));
            expect(state.log.findIndex((l) => l.startsWith('capture'))).toBeGreaterThan(at('COMMIT'));
        });
    });
    it('the capture is keyed by the gateway charge and booked to the SUBSCRIPTION\'s company, not the account\'s', async () => {
        await book();
        expect(state.log.find((l) => l.startsWith('capture'))).toBe('capture 599 key=provider-charge:acct-1:ch_renew company=company-of-the-subscription');
    });
    it('another worker booked it while this one waited for the lock (its intent is there now): rolled back, nothing written', async () => {
        state.intents = [[], [{ ID: 'pi-row', OrderHeaderID: 'o-1' }]];
        const out = await book();
        expect(out.Outcome).toBe('AlreadyBooked');
        expect(state.log).toContain('ROLLBACK');
        expect(state.log).not.toContain('COMMIT');
        expect(state.saved).toEqual([]);
        expect(state.log.some((l) => l.startsWith('capture'))).toBe(false);
    });
    it("a payment already records the charge (the importer's, no intent): rolled back, nothing written", async () => {
        state.payments = [[{ ID: 'imported-pay' }]];
        const out = await book();
        expect(out.Outcome).toBe('AlreadyBooked');
        expect(state.saved).toEqual([]);
    });
    it('$0 (a 100% coupon): the last price, 100% off, no intent and no capture', async () => {
        const out = await book(invoice({ AmountPaid: 0, AmountDue: 0, ProviderIntentID: null, ProviderChargeID: null }));
        expect(out.Outcome).toBe('Booked');
        expect(state.log).toContain('line 599 1');
        expect(state.saved.some((r) => r.kind === 'Payment Intents')).toBe(false);
        expect(state.log.some((l) => l.startsWith('capture'))).toBe(false);
    });
    it('$0 with no last price to discount: refused, nothing written', async () => {
        const out = await book(invoice({ AmountPaid: 0, AmountDue: 0, ProviderIntentID: null, ProviderChargeID: null }), { ...sub, LatestTermUnitPrice: 0 });
        expect(out.Outcome).toBe('Refused');
        expect(state.log).not.toContain('BEGIN');
    });
    it('a $0 renewal already booked (its event names the invoice), found under the lock: nothing written', async () => {
        state.events = [[{ ID: 'ev-1' }]];
        const out = await book(invoice({ AmountPaid: 0, AmountDue: 0, ProviderIntentID: null, ProviderChargeID: null }));
        expect(out.Outcome).toBe('AlreadyBooked');
        expect(state.saved).toEqual([]);
    });
    it('a capture that fails: the order stands (committed), CaptureFailed for the next sync to finish', async () => {
        state.capture = { Success: true, Output: { Success: false, Message: 'declined by Orders' } };
        const out = await book();
        expect(out.Outcome).toBe('CaptureFailed');
        expect(state.log).toContain('COMMIT');
    });
});
