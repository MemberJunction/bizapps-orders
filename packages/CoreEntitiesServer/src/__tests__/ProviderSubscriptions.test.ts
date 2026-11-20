/**
 * Option E, E2: handing a new auto-renewing subscription to the gateway that bills it.
 *
 * Two halves. The FIRST-CHARGE RULE is pure and tested against real dates in the business zone
 * (America/Chicago, a US host's zone): an evening purchase, both DST changes, 29 Feb, and a term that starts
 * after the purchase day. The SERVICE is tested against a fake gateway and a fake database for every
 * branch: it creates and records once, never twice, never while Orders still has a term to collect,
 * refuses visibly, raises a problem once while its Task is open, and never throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogError, type UserInfo } from '@memberjunction/core';
import type { PaymentProviderConfig } from '../BasePaymentProvider.js';

const mocks = vi.hoisted(() => ({
    loadConfig: vi.fn(),
    buildDriver: vi.fn(),
    alert: vi.fn(),
    openAlerts: vi.fn(),
    runView: vi.fn(),
    subscriptionType: vi.fn(),
    /** The record step's sanction (E2b): a spy, so the reloaded subscription can be a plain fake. */
    sanction: vi.fn(),
    /** The real sanction, which refuses an object the server subclass did not produce. */
    realSanction: null as null | ((subscription: unknown) => void),
}));

vi.mock('../PaymentProviderResolver.js', () => ({
    LoadPaymentProviderConfig: (...args: unknown[]) => mocks.loadConfig(...args),
    BuildPaymentProvider: (...args: unknown[]) => mocks.buildDriver(...args),
}));
vi.mock('../checkoutCaptureAlert.js', () => ({
    raiseProviderSubscriptionAlert: (...args: unknown[]) => mocks.alert(...args),
    OpenProviderSubscriptionAlerts: (...args: unknown[]) => mocks.openAlerts(...args),
}));
// The reloaded subscription in these tests is a plain object, which the real sanction refuses (it is not
// a SubscriptionEntityServer). The spy records the call and its order against Save; the one test that
// needs the real refusal installs it.
vi.mock('../SubscriptionEntityServer.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../SubscriptionEntityServer.js')>();
    mocks.realSanction = actual.SanctionProviderBilledChange as (subscription: unknown) => void;
    return { ...actual, SanctionProviderBilledChange: (...args: unknown[]) => mocks.sanction(...args) };
});
vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return {
        ...actual,
        LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
        OrdersEngine: { Instance: { SubscriptionTypeByID: (id: string) => mocks.subscriptionType(id) } },
    };
});
vi.mock('@mj-biz-apps/common-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/common-entities')>();
    return {
        ...actual,
        BusinessTimeZoneEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), Zone: 'America/Chicago' } },
    };
});
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: class {
            RunView = (...args: unknown[]) => mocks.runView(...args);
        },
    };
});

import {
    EnsureProviderSubscriptions,
    EnsureProviderSubscriptionsOnOwnProvider,
    GatewayIntervalMonths,
    PlanProviderSubscriptionCharge,
    ProviderBillsNewSubscriptions,
    ProviderSubscriptionFirstChargeAt,
    ProviderSubscriptionIdempotencyKey,
    RetiredGatewayIDsFromEvents,
} from '../ProviderSubscriptions.js';
import { OneYearLaterAsStripeCounts } from '../StripePaymentProvider.js';
import { SubscriptionEntityServer } from '../SubscriptionEntityServer.js';
import { codeOnly, depthAt, expectTopLevelConjunct } from './selectionRule.js';

const ZONE = 'America/Chicago';
/** Stripe's limit, as the Stripe driver reports it. */
const stripeLimit = (now: Date) => OneYearLaterAsStripeCounts(now);

describe('the first gateway charge: 00:00 business time on the last day of the term', () => {
    it('Jane buys at 20:30 Central on 31 Oct 2026: charged 00:00 Central on 30 Oct 2027, inside Stripe\'s limit', () => {
        // 20:30 CDT is already 1 Nov in UTC; term 1 is still the Central day, 31 Oct 2026 → 30 Oct 2027.
        const now = new Date('2026-11-01T01:30:00Z');
        const plan = PlanProviderSubscriptionCharge('2027-10-30', ZONE, now, stripeLimit(now));
        expect(plan).toEqual({ Kind: 'Ready', FirstChargeAt: new Date('2027-10-30T05:00:00Z') });
    });

    it('the same term bought at 09:00 Central gets the same first charge (the anchor comes from the term, not the clock)', () => {
        const now = new Date('2026-10-31T14:00:00Z');
        expect(PlanProviderSubscriptionCharge('2027-10-30', ZONE, now, stripeLimit(now))).toEqual({
            Kind: 'Ready',
            FirstChargeAt: new Date('2027-10-30T05:00:00Z'),
        });
    });

    it('spring forward: bought 00:30 CDT on 10 Mar 2026, charged 00:00 CST (06:00 UTC) on 9 Mar 2027, still inside the limit', () => {
        // The rule this replaced (00:00 on the DAY AFTER the term) gives 10 Mar 2027 06:00 UTC, which is
        // past Stripe's limit of 10 Mar 2027 05:30 UTC and would have been refused with a 400.
        const now = new Date('2026-03-10T05:30:00Z');
        const plan = PlanProviderSubscriptionCharge('2027-03-09', ZONE, now, stripeLimit(now));
        expect(plan).toEqual({ Kind: 'Ready', FirstChargeAt: new Date('2027-03-09T06:00:00Z') });
        expect(ProviderSubscriptionFirstChargeAt('2027-03-10', ZONE).getTime()).toBeGreaterThan(stripeLimit(now).getTime());
    });

    it('fall back: bought 00:30 CDT on 6 Nov 2027, charged 00:00 CDT on 5 Nov 2028 (DST ends later that day)', () => {
        const now = new Date('2027-11-06T05:30:00Z');
        expect(PlanProviderSubscriptionCharge('2028-11-05', ZONE, now, stripeLimit(now))).toEqual({
            Kind: 'Ready',
            FirstChargeAt: new Date('2028-11-05T05:00:00Z'),
        });
    });

    it('29 Feb 2028: term 29 Feb 2028 → 28 Feb 2029, charged 00:00 CST on 28 Feb 2029, inside the limit even at 00:30', () => {
        for (const bought of ['2028-02-29T18:00:00Z', '2028-02-29T06:30:00Z']) {
            const now = new Date(bought);
            expect(PlanProviderSubscriptionCharge('2029-02-28', ZONE, now, stripeLimit(now))).toEqual({
                Kind: 'Ready',
                FirstChargeAt: new Date('2029-02-28T06:00:00Z'),
            });
        }
    });

    it('a term that starts after the purchase day is DEFERRED, then ready once the charge fits (SUB-000079)', () => {
        // Order 18 Oct 2026 19:49 CDT; term 1 Nov 2026 → 31 Oct 2027.
        const atPurchase = new Date('2026-10-19T00:49:00Z');
        expect(PlanProviderSubscriptionCharge('2027-10-31', ZONE, atPurchase, stripeLimit(atPurchase))).toEqual({
            Kind: 'Deferred',
            FirstChargeAt: new Date('2027-10-31T05:00:00Z'),
            LatestAccepted: new Date('2027-10-19T00:49:00Z'),
        });
        const dayTermStarts = new Date('2026-11-01T08:00:00Z');
        expect(PlanProviderSubscriptionCharge('2027-10-31', ZONE, dayTermStarts, stripeLimit(dayTermStarts)).Kind).toBe('Ready');
    });

    it('a first charge that is not in the future is PASSED (creating it would bill at once)', () => {
        const now = new Date('2027-10-30T05:00:00Z');
        expect(PlanProviderSubscriptionCharge('2027-10-30', ZONE, now, stripeLimit(now)).Kind).toBe('Passed');
        expect(PlanProviderSubscriptionCharge('2027-10-29', ZONE, now, stripeLimit(now)).Kind).toBe('Passed');
    });

    it('a driver with no known limit never defers', () => {
        const now = new Date('2026-01-01T00:00:00Z');
        expect(PlanProviderSubscriptionCharge('2029-12-31', ZONE, now, null).Kind).toBe('Ready');
    });
});

describe('ProviderBillsNewSubscriptions', () => {
    const c = (supports: boolean, bills: boolean) => ({
        BillsSubscriptions: bills,
        Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true, SupportsSubscriptionBilling: supports },
    });
    it('needs the type capability AND the account switch', () => {
        expect(ProviderBillsNewSubscriptions(c(true, true))).toBe(true);
        expect(ProviderBillsNewSubscriptions(c(true, false))).toBe(false);
        expect(ProviderBillsNewSubscriptions(c(false, true))).toBe(false);
        expect(ProviderBillsNewSubscriptions(c(false, false))).toBe(false);
    });
});

describe('ProviderSubscriptionIdempotencyKey', () => {
    const base = {
        SubscriptionID: 'AAAAAAAA-0000-4000-8000-000000000001',
        ProviderPriceID: 'price_pro',
        ProviderInstrumentRef: 'pm_1',
        Quantity: 1,
        FirstChargeAt: new Date('2027-10-30T05:00:00Z'),
        AttemptDay: '2026-10-31' as const,
    };
    it('is the same for the same request (racing runs share it) and different when any parameter changes', () => {
        const key = ProviderSubscriptionIdempotencyKey(base);
        expect(ProviderSubscriptionIdempotencyKey({ ...base })).toBe(key);
        expect(key).toBe('provider-subscription:aaaaaaaa-0000-4000-8000-000000000001:price_pro:pm_1:1:1824872400:2026-10-31');
        for (const changed of [
            { ProviderPriceID: 'price_new' },
            { ProviderInstrumentRef: 'pm_2' },
            { Quantity: 2 },
            { FirstChargeAt: new Date('2027-10-29T05:00:00Z') },
        ]) {
            expect(ProviderSubscriptionIdempotencyKey({ ...base, ...changed })).not.toBe(key);
        }
        expect(key.length).toBeLessThanOrEqual(255);
    });

    it("L3: a retry on another business day is a new key, so Stripe's cached refusal (about 24 h) is not replayed after staff fix it", () => {
        // The page and its webhook, seconds apart, share the day and so the key; the next daily pass does not.
        expect(ProviderSubscriptionIdempotencyKey({ ...base, AttemptDay: '2026-11-01' })).not.toBe(ProviderSubscriptionIdempotencyKey(base));
    });
});

// ─── The service ───────────────────────────────────────────────────────────────

const user = { ID: 'user-1' } as unknown as UserInfo;
const SUB_ID = 'AAAAAAAA-0000-4000-8000-000000000110';
const ORDER_ID = 'BBBBBBBB-0000-4000-8000-000000002465';
const PROVIDER_ID = '88EB5F2E-0000-4000-8000-000000000001';
const PRODUCT_ID = 'CCCCCCCC-0000-4000-8000-0000000000F0';
const NOW = new Date('2026-11-01T01:30:00Z');

const providerConfig = (overrides: Partial<PaymentProviderConfig> = {}): PaymentProviderConfig => ({
    ID: PROVIDER_ID,
    TypeCode: 'Stripe',
    CompanyID: 'company-1',
    Name: 'Acme Stripe',
    CredentialsRef: 'STRIPE_TEST',
    IsLiveMode: true,
    BillsSubscriptions: true,
    Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true, SupportsSubscriptionBilling: true },
    ...overrides,
});

const TYPE_ID = 'EEEEEEEE-0000-4000-8000-0000000000A1';
/** Annual Rolling, as booking reads it: twelve-month terms. */
const ANNUAL = { ID: TYPE_ID, Code: 'AnnualRolling', DriverClass: null, DefaultTermMonths: 12, BillingCadence: 'Annual', CustomCycleDays: null };

const janeRow = (overrides: Record<string, unknown> = {}) => ({
    SubscriptionID: SUB_ID,
    SubscriptionNumber: 'SUB-000110',
    SubscriptionTypeID: TYPE_ID,
    ProductID: PRODUCT_ID,
    CompanyID: 'company-1',
    OrderHeaderID: ORDER_ID,
    ProviderSubscriptionID: null,
    DefaultCustomerPaymentMethodID: 'DDDDDDDD-0000-4000-8000-000000000001',
    CardIsActive: true,
    CardPaymentProviderID: PROVIDER_ID,
    ProviderCustomerRef: 'cus_jane',
    ProviderInstrumentRef: 'pm_jane',
    LastTermEndDate: new Date('2027-10-30T00:00:00Z'),
    LastTermQuantity: 1,
    // The checkout's own order, just paid.
    LastTermOrderNumber: 'ORD-002465',
    LastTermOrderStatus: 'Confirmed',
    LastTermOrderBalance: 0,
    LastTermPaid: 1,
    ...overrides,
});

let rows: Array<Record<string, unknown>>;
let sql: string[];
let prices: Array<Record<string, unknown>>;
let switchedOn: Array<{ ID: string }>;
let entity: {
    Load: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    ProviderSubscriptionID: string | null;
    PaymentProviderID: string | null;
    Status: string;
    AutoRenew: boolean;
    LatestResult: { CompleteMessage: string };
};
/** The subscription's lifecycle events, as the retired-id read sees them (E2b). */
let events: Array<{ ID: string; EventData: string | null }>;
let driver: {
    LatestFirstChargeAt: ReturnType<typeof vi.fn>;
    DescribeProviderPrice: ReturnType<typeof vi.fn>;
    FindProviderSubscriptions: ReturnType<typeof vi.fn>;
    CreateProviderSubscription: ReturnType<typeof vi.fn>;
    CancelProviderSubscription: ReturnType<typeof vi.fn>;
};
const provider = {
    ExecuteSQL: vi.fn(async (statement: string) => {
        sql.push(statement);
        return rows;
    }),
    GetEntityObject: vi.fn(async () => entity),
};

const ensure = (input: Parameters<typeof EnsureProviderSubscriptions>[0] = { OrderHeaderID: ORDER_ID }) =>
    EnsureProviderSubscriptions({ Now: NOW, ...input }, provider as never, user);
const alertCodes = () => mocks.alert.mock.calls.map((c) => (c[0] as { Code: string }).Code);

beforeEach(() => {
    rows = [janeRow()];
    sql = [];
    prices = [{ ID: 'p1', PaymentProviderID: PROVIDER_ID, ProductID: PRODUCT_ID, ProviderPriceID: 'price_pro_599' }];
    switchedOn = [{ ID: PROVIDER_ID }];
    entity = {
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        ProviderSubscriptionID: null,
        PaymentProviderID: null,
        Status: 'Active',
        AutoRenew: true,
        LatestResult: { CompleteMessage: '' },
    };
    events = [];
    driver = {
        LatestFirstChargeAt: vi.fn((now: Date) => stripeLimit(now)),
        DescribeProviderPrice: vi.fn().mockResolvedValue({ Success: true, Active: true, Interval: { Unit: 'year', Count: 1 } }),
        FindProviderSubscriptions: vi.fn().mockResolvedValue({ Success: true, Subscriptions: [] }),
        CreateProviderSubscription: vi.fn().mockResolvedValue({ Success: true, ProviderSubscriptionID: 'sub_new', Status: 'active', ChargedAtCreation: false }),
        CancelProviderSubscription: vi.fn().mockResolvedValue({ Success: true, Outcome: 'CanceledNow' }),
    };
    mocks.loadConfig.mockReset().mockResolvedValue(providerConfig());
    mocks.buildDriver.mockReset().mockImplementation(async () => driver);
    mocks.alert.mockReset().mockResolvedValue(true);
    mocks.openAlerts.mockReset().mockResolvedValue(new Map());
    mocks.subscriptionType.mockReset().mockReturnValue(ANNUAL);
    mocks.sanction.mockReset();
    mocks.runView.mockReset().mockImplementation(async (params: { EntityName: string }) => ({
        Success: true,
        Results:
            params.EntityName === 'MJ_BizApps_Orders: Payment Provider Prices'
                ? prices
                : params.EntityName === 'MJ_BizApps_Orders: Subscription Events'
                  ? events
                  : switchedOn,
    }));
    provider.ExecuteSQL.mockClear();
    provider.GetEntityObject.mockClear();
});

describe('EnsureProviderSubscriptions', () => {
    it("creates Jane's gateway subscription with the anchored first charge, then records the id and the account", async () => {
        const result = await ensure({ OrderHeaderID: ORDER_ID, CheckoutPaymentProviderID: PROVIDER_ID });
        expect(result.Outcomes).toEqual([
            expect.objectContaining({ Code: 'Created', ProviderSubscriptionID: 'sub_new', FirstChargeAt: '2027-10-30T05:00:00.000Z', PaymentProviderID: PROVIDER_ID }),
        ]);
        expect(result).toMatchObject({ Success: true, Linked: 1, Alerts: 0 });
        expect(driver.FindProviderSubscriptions).toHaveBeenCalledWith({ ProviderCustomerRef: 'cus_jane', MetadataKey: 'OrdersSubscriptionID', MetadataValue: SUB_ID });
        expect(driver.CreateProviderSubscription).toHaveBeenCalledWith({
            ProviderCustomerRef: 'cus_jane',
            ProviderInstrumentRef: 'pm_jane',
            ProviderPriceID: 'price_pro_599',
            Quantity: 1,
            FirstChargeAt: new Date('2027-10-30T05:00:00Z'),
            // The attempt's business day: 01:30 UTC on 1 Nov is still 31 Oct in Chicago.
            IdempotencyKey: `provider-subscription:${SUB_ID.toLowerCase()}:price_pro_599:pm_jane:1:1824872400:2026-10-31`,
            Metadata: { OrdersSubscriptionID: SUB_ID, OrdersSubscriptionNumber: 'SUB-000110', OrdersCompanyID: 'company-1', OrdersOrderHeaderID: ORDER_ID },
        });
        expect(entity.ProviderSubscriptionID).toBe('sub_new');
        expect(entity.PaymentProviderID).toBe(PROVIDER_ID);
        expect(entity.Save).toHaveBeenCalledTimes(1);
        expect(mocks.alert).not.toHaveBeenCalled();
        // The price's period is read and checked, and the gateway's limit is the one for that period.
        expect(driver.DescribeProviderPrice).toHaveBeenCalledWith('price_pro_599');
        expect(driver.LatestFirstChargeAt).toHaveBeenCalledWith(NOW, { Unit: 'year', Count: 1 });
    });

    it('selects only Active/Trialing subscriptions with automatic renewal on, for the checkout order', async () => {
        await ensure();
        expect(sql[0]).toMatch(/s\.AutoRenew = 1/);
        expect(sql[0]).toMatch(/s\.Status IN \('Active', 'Trialing'\)/);
        expect(sql[0]).toContain(`ol.OrderHeaderID = '${ORDER_ID}'`);
        // The latest live term gives the first charge day.
        expect(sql[0]).toMatch(/st\.Status IN \('Scheduled', 'Active'\)\s+ORDER BY st\.EndDate DESC/);
    });

    it('does nothing, silently, when the account switch is off, or the type cannot bill subscriptions', async () => {
        for (const config of [providerConfig({ BillsSubscriptions: false }), providerConfig({ Capabilities: { ...providerConfig().Capabilities, SupportsSubscriptionBilling: false } })]) {
            mocks.loadConfig.mockResolvedValue(config);
            const result = await ensure();
            expect(result.Outcomes.map((o) => o.Code)).toEqual(['NotEnabled']);
        }
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(mocks.alert).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('a subscription already linked is left alone, with no gateway call', async () => {
        rows = [janeRow({ ProviderSubscriptionID: 'sub_earlier' })];
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'AlreadyLinked', ProviderSubscriptionID: 'sub_earlier' });
        expect(mocks.buildDriver).not.toHaveBeenCalled();
    });

    it('refuses visibly on a stub account (IsLiveMode = 0), writing nothing', async () => {
        mocks.loadConfig.mockResolvedValue(providerConfig({ IsLiveMode: false }));
        const result = await ensure();
        expect(result.Outcomes[0].Code).toBe('StubMode');
        expect(alertCodes()).toEqual(['StubMode']);
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('refuses visibly when no price is flagged UseForNewSubscriptions for the product', async () => {
        prices = [];
        const result = await ensure();
        expect(result.Outcomes[0].Code).toBe('NoProviderPrice');
        expect(alertCodes()).toEqual(['NoProviderPrice']);
        // Read for this account only, not every account's prices.
        expect(mocks.runView.mock.calls[0][0]).toMatchObject({ ExtraFilter: `PaymentProviderID = '${PROVIDER_ID}' AND IsActive = 1 AND UseForNewSubscriptions = 1` });
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
    });

    it('raises NoCard when the checkout account bills subscriptions but no card was kept', async () => {
        rows = [janeRow({ DefaultCustomerPaymentMethodID: null, CardPaymentProviderID: null, ProviderCustomerRef: null, ProviderInstrumentRef: null })];
        const result = await ensure({ OrderHeaderID: ORDER_ID, CheckoutPaymentProviderID: PROVIDER_ID });
        expect(result.Outcomes[0].Code).toBe('NoCard');
        expect(alertCodes()).toEqual(['NoCard']);
    });

    it('defers a term that starts after the purchase day, quietly, and creates nothing', async () => {
        rows = [janeRow({ LastTermEndDate: new Date('2027-11-14T00:00:00Z') })];
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Deferred', FirstChargeAt: '2027-11-14T06:00:00.000Z' });
        expect(result.Deferred).toBe(1);
        expect(mocks.alert).not.toHaveBeenCalled();
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
    });

    it('raises ChargeDayPassed rather than create a subscription that would bill at once', async () => {
        rows = [janeRow({ LastTermEndDate: new Date('2026-10-31T00:00:00Z') })];
        const result = await ensure();
        expect(result.Outcomes[0].Code).toBe('ChargeDayPassed');
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
    });

    it('records a gateway subscription an earlier run created (found by its metadata) instead of creating a second', async () => {
        driver.FindProviderSubscriptions.mockResolvedValue({
            Success: true,
            Subscriptions: [
                { ProviderSubscriptionID: 'sub_old_canceled', Status: 'canceled', IsLive: false, Metadata: {} },
                { ProviderSubscriptionID: 'sub_from_yesterday', Status: 'active', IsLive: true, Metadata: {} },
            ],
        });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Found', ProviderSubscriptionID: 'sub_from_yesterday' });
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(entity.ProviderSubscriptionID).toBe('sub_from_yesterday');
    });

    it('two live gateway subscriptions, or only ended ones, need a person and create nothing', async () => {
        driver.FindProviderSubscriptions.mockResolvedValue({
            Success: true,
            Subscriptions: [
                { ProviderSubscriptionID: 'sub_a', Status: 'active', IsLive: true, Metadata: {} },
                { ProviderSubscriptionID: 'sub_b', Status: 'past_due', IsLive: true, Metadata: {} },
            ],
        });
        expect((await ensure()).Outcomes[0].Code).toBe('AmbiguousAtGateway');
        driver.FindProviderSubscriptions.mockResolvedValue({
            Success: true,
            Subscriptions: [{ ProviderSubscriptionID: 'sub_a', Status: 'canceled', IsLive: false, Metadata: {} }],
        });
        expect((await ensure()).Outcomes[0].Code).toBe('EndedAtGateway');
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
        expect(alertCodes()).toEqual(['AmbiguousAtGateway', 'EndedAtGateway']);
    });

    it('a racing run that recorded the same id first makes this one AlreadyLinked, with no alert and no second write', async () => {
        entity.ProviderSubscriptionID = 'sub_new';
        const result = await ensure();
        expect(result.Outcomes[0].Code).toBe('AlreadyLinked');
        expect(entity.Save).not.toHaveBeenCalled();
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it('a different id already recorded is never overwritten: LinkedElsewhere alert', async () => {
        entity.ProviderSubscriptionID = 'sub_someone_else';
        const result = await ensure();
        expect(result.Outcomes[0].Code).toBe('LinkedElsewhere');
        expect(entity.ProviderSubscriptionID).toBe('sub_someone_else');
        expect(entity.Save).not.toHaveBeenCalled();
        expect(alertCodes()).toEqual(['LinkedElsewhere']);
    });

    it('a gateway refusal is an alert, unless a racing run recorded the id meanwhile (Stripe 409 "key in use")', async () => {
        driver.CreateProviderSubscription.mockResolvedValue({ Success: false, Reason: 'There is currently another in-progress request using this Idempotent Key' });
        expect((await ensure()).Outcomes[0].Code).toBe('GatewayRefused');
        expect(alertCodes()).toEqual(['GatewayRefused']);

        mocks.alert.mockClear();
        entity.Load.mockImplementation(async () => {
            entity.ProviderSubscriptionID = 'sub_racer';
            return true;
        });
        expect((await ensure()).Outcomes[0]).toMatchObject({ Code: 'AlreadyLinked', ProviderSubscriptionID: 'sub_racer' });
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it("a racing run still holding the gateway's key (Stripe 409) is not a problem for a person", async () => {
        driver.CreateProviderSubscription.mockResolvedValue({ Success: false, InFlightElsewhere: true, Reason: 'another in-progress request' });
        const result = await ensure();
        expect(result.Outcomes[0].Code).toBe('InProgressElsewhere');
        expect(mocks.alert).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('a gateway fault (5xx, unreachable) is an alert and never escapes', async () => {
        driver.CreateProviderSubscription.mockRejectedValue(new Error('Stripe returned 503 calling POST /subscriptions.'));
        const result = await ensure();
        expect(result.Success).toBe(true);
        expect(result.Outcomes[0]).toMatchObject({ Code: 'GatewayFault', Message: expect.stringMatching(/503/) });
        expect(alertCodes()).toEqual(['GatewayFault']);
    });

    it('a failed save names the gateway id so a person can record it', async () => {
        entity.Save.mockResolvedValue(false);
        entity.LatestResult = { CompleteMessage: 'deadlock' };
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'NotRecorded', ProviderSubscriptionID: 'sub_new' });
        expect((mocks.alert.mock.calls[0][0] as { Reason: string }).Reason).toMatch(/sub_new.*deadlock/);
    });

    it("never writes an empty id: a created or found answer with '' or only spaces is NotRecorded, nothing saved", async () => {
        for (const empty of ['', '   ']) {
            for (const lane of ['created', 'found'] as const) {
                vi.clearAllMocks();
                entity.ProviderSubscriptionID = null;
                if (lane === 'created') {
                    driver.FindProviderSubscriptions.mockResolvedValue({ Success: true, Subscriptions: [] });
                    driver.CreateProviderSubscription.mockResolvedValue({ Success: true, ProviderSubscriptionID: empty, Status: 'active', ChargedAtCreation: false });
                } else {
                    driver.FindProviderSubscriptions.mockResolvedValue({ Success: true, Subscriptions: [{ ProviderSubscriptionID: empty, Status: 'active', IsLive: true, Metadata: {} }] });
                }
                const result = await ensure();
                expect(result.Outcomes[0], `${lane} ${JSON.stringify(empty)}`).toMatchObject({ Code: 'NotRecorded' });
                expect(result.Outcomes[0].Recorded).not.toBe(true);
                expect(entity.ProviderSubscriptionID).toBeNull();
                expect(entity.Save).not.toHaveBeenCalled();
                expect((mocks.alert.mock.calls[0][0] as { Reason: string }).Reason).toMatch(/without a subscription id.*OrdersSubscriptionID/);
            }
        }
    });

    it('a subscription the gateway billed at creation is recorded AND raised as urgent', async () => {
        driver.CreateProviderSubscription.mockResolvedValue({ Success: true, ProviderSubscriptionID: 'sub_billed', Status: 'active', ChargedAtCreation: true });
        const result = await ensure();
        expect(result.Outcomes[0].Code).toBe('ChargedAtCreation');
        expect(entity.ProviderSubscriptionID).toBe('sub_billed');
        expect(mocks.alert.mock.calls[0][0]).toMatchObject({ Code: 'ChargedAtCreation', Urgent: true });
    });

    it('preview searches the gateway read-only and reports what would be created; it writes, creates and raises nothing', async () => {
        const result = await ensure({ OrderHeaderID: ORDER_ID, Preview: true });
        expect(result.Outcomes[0]).toMatchObject({ Code: 'WouldCreate', FirstChargeAt: '2027-10-30T05:00:00.000Z' });
        // Read-only: the search runs, so the preview list is real; nothing is created or cancelled.
        expect(driver.FindProviderSubscriptions).toHaveBeenCalledWith({
            ProviderCustomerRef: 'cus_jane',
            MetadataKey: 'OrdersSubscriptionID',
            MetadataValue: SUB_ID,
        });
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(driver.CancelProviderSubscription).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();

        prices = [];
        expect((await ensure({ OrderHeaderID: ORDER_ID, Preview: true })).Outcomes[0].Code).toBe('NoProviderPrice');
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it('preview names a gateway subscription a run would record, and one it would leave for a person, without raising either', async () => {
        driver.FindProviderSubscriptions.mockResolvedValueOnce({
            Success: true,
            Subscriptions: [{ ProviderSubscriptionID: 'sub_from_yesterday', Status: 'active', IsLive: true, Metadata: {} }],
        });
        const found = await ensure({ OrderHeaderID: ORDER_ID, Preview: true });
        expect(found.Outcomes[0]).toMatchObject({ Code: 'WouldRecordFound', ProviderSubscriptionID: 'sub_from_yesterday' });
        expect(found.Message).toMatch(/1 found at the gateway and would be recorded/);

        driver.FindProviderSubscriptions.mockResolvedValueOnce({
            Success: true,
            Subscriptions: [
                { ProviderSubscriptionID: 'sub_a', Status: 'active', IsLive: true, Metadata: {} },
                { ProviderSubscriptionID: 'sub_b', Status: 'active', IsLive: true, Metadata: {} },
            ],
        });
        const two = await ensure({ OrderHeaderID: ORDER_ID, Preview: true });
        expect(two.Outcomes[0]).toMatchObject({ Code: 'WouldNeedPerson', Message: expect.stringMatching(/2 live subscriptions.*sub_a, sub_b/) });

        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: false, Reason: 'rate limited' });
        const unread = await ensure({ OrderHeaderID: ORDER_ID, Preview: true });
        expect(unread.Outcomes[0]).toMatchObject({ Code: 'WouldNeedPerson', Message: expect.stringMatching(/rate limited/) });

        expect(mocks.alert).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
    });

    it('never throws: a selection that fails is reported, not raised', async () => {
        provider.ExecuteSQL.mockRejectedValueOnce(new Error('connection reset'));
        const result = await ensure();
        expect(result).toMatchObject({ Success: false, Outcomes: [], Message: expect.stringMatching(/connection reset/) });
    });

    it('the backfill selects only unlinked subscriptions whose card is on an account that bills subscriptions', async () => {
        const result = await ensure({});
        expect(mocks.runView.mock.calls[0][0]).toMatchObject({ EntityName: 'MJ_BizApps_Orders: Payment Providers', ExtraFilter: 'BillsSubscriptions = 1 AND IsActive = 1' });
        expect(sql[0]).toContain('s.ProviderSubscriptionID IS NULL');
        // #948's rule for every READER: one top-level AND of the WHERE, outside comments, no top-level OR.
        expectTopLevelConjunct(sql[0], 'WHERE s.AutoRenew = 1', 'ORDER BY s.SubscriptionNumber', 's.ProviderSubscriptionID IS NULL');
        expect(sql[0]).toContain(`pd.PaymentProviderID IN ('${PROVIDER_ID}')`);
        expect(result.Outcomes[0].Code).toBe('Created');
    });

    it('the backfill runs no selection at all when no account passes the rule', async () => {
        mocks.loadConfig.mockResolvedValue(providerConfig({ Capabilities: { ...providerConfig().Capabilities, SupportsSubscriptionBilling: false } }));
        const result = await ensure({});
        expect(result.Outcomes).toEqual([]);
        expect(provider.ExecuteSQL).not.toHaveBeenCalled();
    });

    it('MaxCount caps a pass; configs and drivers are read once for many subscriptions', async () => {
        rows = [1, 2, 3].map((n) => janeRow({ SubscriptionID: `AAAAAAAA-0000-4000-8000-00000000011${n}`, SubscriptionNumber: `SUB-00011${n}` }));
        const capped = await ensure({ MaxCount: 2 });
        expect(capped.Outcomes).toHaveLength(2);
        expect(mocks.loadConfig).toHaveBeenCalledTimes(1);
        expect(mocks.buildDriver).toHaveBeenCalledTimes(1);
    });
    // ─── H1: never while Orders still has a term to collect ────────────────────────────────────

    it('leaves a subscription whose latest term is an unpaid renewal with Orders, quietly, calling no gateway', async () => {
        // Spawn Renewals booked term 2 (Active) on ORD-002901; Charge Renewals has not collected it yet.
        rows = [janeRow({ LastTermEndDate: new Date('2028-10-30T00:00:00Z'), LastTermOrderNumber: 'ORD-002901', LastTermOrderBalance: 599, LastTermPaid: 0 })];
        const result = await ensure({ Now: new Date('2027-10-31T02:45:00Z') });
        expect(result.Outcomes[0]).toMatchObject({ Code: 'TermUnpaid', Message: expect.stringMatching(/ORD-002901, Confirmed, 599\.00 owing/) });
        expect(mocks.buildDriver).not.toHaveBeenCalled();
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(mocks.alert).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
        expect(result).toMatchObject({ Linked: 0, Alerts: 0, Waiting: 0 });
    });

    it('treats a latest term with no order found, or a draft, as unpaid (never hands over on a guess)', async () => {
        for (const unpaid of [{ LastTermOrderNumber: null, LastTermOrderStatus: null, LastTermOrderBalance: null, LastTermPaid: 0 }, { LastTermOrderStatus: 'Draft', LastTermPaid: 0 }]) {
            rows = [janeRow(unpaid)];
            expect((await ensure()).Outcomes[0].Code).toBe('TermUnpaid');
        }
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
    });

    it('the selection computes "paid" from the term\'s own order: a real order (not Draft/Quoted/Voided) owing nothing', async () => {
        await ensure();
        expect(sql[0]).toContain('LEFT JOIN __mj_BizAppsOrders.OrderLine tol ON tol.ID = lt.OrderLineID');
        expect(sql[0]).toContain('LEFT JOIN __mj_BizAppsOrders.vwOrderHeaders toh ON toh.ID = tol.OrderHeaderID');
        expect(sql[0]).toContain(`toh.Status NOT IN ('Draft','Quoted','Voided') AND toh.Balance <= 0 THEN 1 ELSE 0 END AS LastTermPaid`);
    });

    // ─── H2: on a provider of its own ───────────────────────────────────────────────────────────

    it('EnsureProviderSubscriptionsOnOwnProvider records the id on an isolated provider, never the shared one, and releases it', async () => {
        const isolated = { ...provider, ReleaseIndependentInstance: vi.fn().mockResolvedValue(undefined) };
        const shared = { CreateIndependentInstance: vi.fn().mockResolvedValue(isolated), ExecuteSQL: vi.fn(), GetEntityObject: vi.fn() };
        const result = await EnsureProviderSubscriptionsOnOwnProvider({ OrderHeaderID: ORDER_ID, Now: NOW }, shared as never, user);
        expect(result.Outcomes[0].Code).toBe('Created');
        expect(shared.CreateIndependentInstance).toHaveBeenCalledTimes(1);
        expect(shared.ExecuteSQL).not.toHaveBeenCalled();
        expect(shared.GetEntityObject).not.toHaveBeenCalled();
        expect(provider.GetEntityObject).toHaveBeenCalled(); // the isolated instance reloads and saves
        expect(entity.Save).toHaveBeenCalledTimes(1);
        expect(isolated.ReleaseIndependentInstance).toHaveBeenCalledTimes(1);
    });

    // ─── M2: a problem is raised once while open; only a person clears a gateway-side one ───────

    it('a problem whose Task is already open is reported as waiting, not as a new alert', async () => {
        prices = [];
        mocks.alert.mockResolvedValue(false);
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'NoProviderPrice', NewAlert: false });
        expect(result).toMatchObject({ Alerts: 0, Waiting: 1 });
        mocks.alert.mockResolvedValue(true);
        expect(await ensure()).toMatchObject({ Alerts: 1, Waiting: 0 });
    });

    it('the daily pass does not ask the gateway again about a subscription whose gateway-side problem has an open Task', async () => {
        mocks.openAlerts.mockResolvedValue(new Map([['SUB-000110', new Set(['EndedAtGateway'])]]));
        const sweep = await ensure({});
        expect(sweep.Outcomes[0]).toMatchObject({ Code: 'AwaitingPerson', Message: expect.stringMatching(/EndedAtGateway Task is open/) });
        expect(driver.DescribeProviderPrice).not.toHaveBeenCalled();
        expect(driver.FindProviderSubscriptions).not.toHaveBeenCalled();
        expect(mocks.alert).not.toHaveBeenCalled();
        expect(sweep).toMatchObject({ Alerts: 0, Waiting: 1 });

        // A targeted run (an operator who fixed it) asks the gateway anyway.
        const targeted = await ensure({ SubscriptionIDs: [SUB_ID] });
        expect(targeted.Outcomes[0].Code).toBe('Created');
        expect(mocks.openAlerts).toHaveBeenCalledTimes(1);
    });

    it('an open Task for a problem Orders re-checks itself (no price) or a retryable one (a fault) does not park the subscription', async () => {
        mocks.openAlerts.mockResolvedValue(new Map([['SUB-000110', new Set(['NoProviderPrice', 'GatewayFault'])]]));
        expect((await ensure({})).Outcomes[0].Code).toBe('Created');
    });

    it('could not search the gateway is its own code, not GatewayRefused, whether refused or thrown', async () => {
        driver.FindProviderSubscriptions.mockResolvedValue({ Success: false, Reason: 'This API key lacks the rak_subscription_read permission' });
        expect((await ensure()).Outcomes[0]).toMatchObject({ Code: 'GatewayReadFailed', Message: expect.stringMatching(/could not search/) });
        driver.FindProviderSubscriptions.mockRejectedValue(new Error('Stripe was unreachable calling GET /subscriptions: The operation was aborted due to timeout'));
        expect((await ensure()).Outcomes[0]).toMatchObject({ Code: 'GatewayReadFailed', Message: expect.stringMatching(/timeout/) });
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(alertCodes()).toEqual(['GatewayReadFailed', 'GatewayReadFailed']);
    });

    // ─── M4: the price's period must be the term's ──────────────────────────────────────────────

    it('refuses visibly when the gateway price bills on another period than the term, or is inactive or one-time', async () => {
        for (const described of [
            { Success: true, Active: true, Interval: { Unit: 'month', Count: 1 } },
            { Success: true, Active: true, Interval: null },
            { Success: true, Active: false, Interval: { Unit: 'year', Count: 1 } },
        ]) {
            driver.DescribeProviderPrice.mockResolvedValue(described);
            const result = await ensure({ OrderHeaderID: ORDER_ID, Now: NOW });
            expect(result.Outcomes[0].Code).toBe('PriceMismatch');
        }
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(alertCodes()).toEqual(['PriceMismatch', 'PriceMismatch', 'PriceMismatch']);
        expect((mocks.alert.mock.calls[0][0] as { Reason: string }).Reason).toMatch(/bills every 1 month\(s\), but this subscription's terms are 12 month\(s\)/);
    });

    it('a monthly price on a monthly type is accepted, with the gateway limit for a month', async () => {
        mocks.subscriptionType.mockReturnValue({ ...ANNUAL, DefaultTermMonths: 1, BillingCadence: 'Monthly' });
        driver.DescribeProviderPrice.mockResolvedValue({ Success: true, Active: true, Interval: { Unit: 'month', Count: 1 } });
        rows = [janeRow({ LastTermEndDate: new Date('2026-11-30T00:00:00Z') })];
        expect((await ensure()).Outcomes[0].Code).toBe('Created');
        expect(driver.LatestFirstChargeAt).toHaveBeenCalledWith(NOW, { Unit: 'month', Count: 1 });
    });

    it('a price the gateway cannot read is a read failure, and the price is read once per pass', async () => {
        driver.DescribeProviderPrice.mockResolvedValue({ Success: false, Reason: 'No such price' });
        rows = [janeRow(), janeRow({ SubscriptionID: 'AAAAAAAA-0000-4000-8000-000000000111', SubscriptionNumber: 'SUB-000111' })];
        const result = await ensure();
        expect(result.Outcomes.map((o) => o.Code)).toEqual(['GatewayReadFailed', 'GatewayReadFailed']);
        expect(driver.DescribeProviderPrice).toHaveBeenCalledTimes(1);
    });

    it('GatewayIntervalMonths: years and months convert, days and weeks do not', () => {
        expect(GatewayIntervalMonths({ Unit: 'year', Count: 1 })).toBe(12);
        expect(GatewayIntervalMonths({ Unit: 'month', Count: 3 })).toBe(3);
        expect(GatewayIntervalMonths({ Unit: 'week', Count: 52 })).toBeNull();
        expect(GatewayIntervalMonths(null)).toBeNull();
    });

    // ─── M5: the double-charge alert never depends on the record ────────────────────────────────

    it('a subscription billed at creation whose record then FAILED still raises the urgent alert, and the record alert', async () => {
        driver.CreateProviderSubscription.mockResolvedValue({ Success: true, ProviderSubscriptionID: 'sub_billed', Status: 'active', ChargedAtCreation: true });
        entity.Save.mockResolvedValue(false);
        entity.LatestResult = { CompleteMessage: 'deadlock' };
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'ChargedAtCreation', Recorded: undefined, NewAlert: true });
        expect(result.Outcomes[0].Message).toMatch(/NOT recorded on the Orders subscription \(NotRecorded\)/);
        expect(alertCodes()).toEqual(['NotRecorded', 'ChargedAtCreation']);
        expect(mocks.alert.mock.calls[1][0]).toMatchObject({ Urgent: true, Linked: undefined });
        expect(result.Linked).toBe(0);
    });

    it('billed at creation when another id is already recorded: LinkedElsewhere AND the urgent alert', async () => {
        driver.CreateProviderSubscription.mockResolvedValue({ Success: true, ProviderSubscriptionID: 'sub_billed', Status: 'active', ChargedAtCreation: true });
        entity.ProviderSubscriptionID = 'sub_other';
        await ensure();
        expect(alertCodes()).toEqual(['LinkedElsewhere', 'ChargedAtCreation']);
    });

    // ─── Nit 4: what the gateway holds vs the plan ──────────────────────────────────────────────

    it('records a found gateway subscription but raises AnchorMismatch when its first charge is not the planned one', async () => {
        driver.FindProviderSubscriptions.mockResolvedValue({
            Success: true,
            Subscriptions: [{ ProviderSubscriptionID: 'sub_old', Status: 'active', IsLive: true, Metadata: {}, ProviderPriceID: 'price_pro_599', Quantity: 1, FirstChargeAt: new Date('2027-10-31T05:00:00Z') }],
        });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'AnchorMismatch', ProviderSubscriptionID: 'sub_old', Recorded: true });
        expect(entity.ProviderSubscriptionID).toBe('sub_old');
        expect(mocks.alert.mock.calls[0][0]).toMatchObject({ Code: 'AnchorMismatch', Linked: true });
    });

    it('a found gateway subscription with the planned first charge is simply Found', async () => {
        driver.FindProviderSubscriptions.mockResolvedValue({
            Success: true,
            Subscriptions: [{ ProviderSubscriptionID: 'sub_old', Status: 'active', IsLive: true, Metadata: {}, FirstChargeAt: new Date('2027-10-30T05:00:00Z') }],
        });
        expect((await ensure()).Outcomes[0]).toMatchObject({ Code: 'Found', Recorded: true });
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it('a created gateway subscription whose returned first charge differs from the request raises AnchorMismatch', async () => {
        driver.CreateProviderSubscription.mockResolvedValue({ Success: true, ProviderSubscriptionID: 'sub_new', Status: 'active', FirstChargeAt: new Date('2027-10-30T00:00:00Z') });
        expect((await ensure()).Outcomes[0].Code).toBe('AnchorMismatch');
    });

    // ─── M6: the checkout's cost on an account that does not bill subscriptions ─────────────────

    it("the checkout's call on an account that does not bill subscriptions reads the account and runs no SELECT", async () => {
        mocks.loadConfig.mockResolvedValue(providerConfig({ BillsSubscriptions: false }));
        const result = await ensure({ OrderHeaderID: ORDER_ID, CheckoutPaymentProviderID: PROVIDER_ID });
        expect(result).toMatchObject({ Success: true, Outcomes: [] });
        expect(provider.ExecuteSQL).not.toHaveBeenCalled();
        expect(mocks.runView).not.toHaveBeenCalled();
    });

    // ─── Nit 8: MaxCount caps creations, as Spawn Renewals caps placements ──────────────────────

    it('MaxCount counts gateway subscriptions created, not rows: a deferred or unpaid one does not use the cap', async () => {
        rows = [
            janeRow({ SubscriptionID: 'AAAAAAAA-0000-4000-8000-000000000111', SubscriptionNumber: 'SUB-000111', LastTermPaid: 0 }),
            janeRow({ SubscriptionID: 'AAAAAAAA-0000-4000-8000-000000000112', SubscriptionNumber: 'SUB-000112', LastTermEndDate: new Date('2027-11-14T00:00:00Z') }),
            janeRow({ SubscriptionID: 'AAAAAAAA-0000-4000-8000-000000000113', SubscriptionNumber: 'SUB-000113' }),
            janeRow({ SubscriptionID: 'AAAAAAAA-0000-4000-8000-000000000114', SubscriptionNumber: 'SUB-000114' }),
        ];
        const result = await ensure({ MaxCount: 1 });
        expect(result.Outcomes.map((o) => o.Code)).toEqual(['TermUnpaid', 'Deferred', 'Created']);
        expect(driver.CreateProviderSubscription).toHaveBeenCalledTimes(1);
        const preview = await ensure({ MaxCount: 1, Preview: true });
        expect(preview.Outcomes.map((o) => o.Code)).toEqual(['TermUnpaid', 'Deferred', 'WouldCreate']);
    });

    it('counts as linked only what this pass recorded', async () => {
        rows = [janeRow({ ProviderSubscriptionID: 'sub_earlier' }), janeRow({ SubscriptionID: 'AAAAAAAA-0000-4000-8000-000000000111', SubscriptionNumber: 'SUB-000111' })];
        expect(await ensure()).toMatchObject({ Linked: 1 });
    });

    // ─── Round 2 ────────────────────────────────────────────────────────────────────────────────

    it('Medium 1: a found live gateway subscription on another price or quantity is still recorded, and raised as a linked Task', async () => {
        driver.FindProviderSubscriptions.mockResolvedValue({
            Success: true,
            Subscriptions: [{ ProviderSubscriptionID: 'sub_old', Status: 'active', IsLive: true, Metadata: {}, ProviderPriceID: 'price_other', Quantity: 2, FirstChargeAt: new Date('2027-10-30T05:00:00Z') }],
        });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'FoundMismatch', ProviderSubscriptionID: 'sub_old', Recorded: true, NewAlert: true });
        // Recorded: it is live and bills either way, so Orders must stop renewing it.
        expect(entity.ProviderSubscriptionID).toBe('sub_old');
        expect(entity.Save).toHaveBeenCalledTimes(1);
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(mocks.alert.mock.calls[0][0]).toMatchObject({ Code: 'FoundMismatch', Linked: true });
        expect((mocks.alert.mock.calls[0][0] as { Reason: string }).Reason).toMatch(/bills price price_other, not price_pro_599 and quantity 2, not 1/);
        expect(result).toMatchObject({ Linked: 1, Alerts: 1 });
    });

    it('Medium 1: a mismatched price AND first charge raises both Tasks; a recorded found one with neither raises nothing', async () => {
        driver.FindProviderSubscriptions.mockResolvedValue({
            Success: true,
            Subscriptions: [{ ProviderSubscriptionID: 'sub_old', Status: 'active', IsLive: true, Metadata: {}, ProviderPriceID: 'price_other', Quantity: 1, FirstChargeAt: new Date('2027-10-31T05:00:00Z') }],
        });
        expect((await ensure()).Outcomes[0]).toMatchObject({ Code: 'AnchorMismatch', Recorded: true, NewAlert: true });
        expect(alertCodes()).toEqual(['AnchorMismatch', 'FoundMismatch']);
    });

    it('Medium 1: a found mismatch whose record failed keeps NotRecorded as the outcome, and its Task says Orders still renews it', async () => {
        driver.FindProviderSubscriptions.mockResolvedValue({
            Success: true,
            Subscriptions: [{ ProviderSubscriptionID: 'sub_old', Status: 'active', IsLive: true, Metadata: {}, ProviderPriceID: 'price_other', Quantity: 1 }],
        });
        entity.Save.mockResolvedValue(false);
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'NotRecorded', NewAlert: true });
        expect(alertCodes()).toEqual(['NotRecorded', 'FoundMismatch']);
        expect(mocks.alert.mock.calls[1][0]).toMatchObject({ Linked: false, Reason: expect.stringMatching(/not recorded \(NotRecorded\)/) });
    });

    it('L1: a term Spawn Renewals booked after the pass read the row is seen just before the create, and nothing is handed over', async () => {
        // The sweep read term 1, paid. By the create, term 2 is booked on ORD-002901, unpaid.
        const term2 = janeRow({ LastTermEndDate: new Date('2028-10-30T00:00:00Z'), LastTermOrderNumber: 'ORD-002901', LastTermOrderBalance: 599, LastTermPaid: 0 });
        provider.ExecuteSQL.mockImplementationOnce(async (statement: string) => {
            sql.push(statement);
            return [janeRow()];
        }).mockImplementationOnce(async (statement: string) => {
            sql.push(statement);
            return [term2];
        });
        const result = await ensure({});
        expect(result.Outcomes[0]).toMatchObject({ Code: 'TermUnpaid', Message: expect.stringMatching(/ORD-002901, Confirmed, 599\.00 owing/) });
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
        expect(mocks.alert).not.toHaveBeenCalled();
        // The same query (so the same "paid" rule), scoped to the one subscription.
        expect(sql[1]).toContain(`s.ID = '${SUB_ID}'`);
        expect(sql[1]).toContain(`toh.Status NOT IN ('Draft','Quoted','Voided') AND toh.Balance <= 0 THEN 1 ELSE 0 END AS LastTermPaid`);
        expect(result).toMatchObject({ Linked: 0, Alerts: 0 });
    });

    it('L1: an unchanged re-read goes ahead; one no longer renewing creates nothing', async () => {
        await ensure();
        expect(provider.ExecuteSQL).toHaveBeenCalledTimes(2);
        expect(driver.CreateProviderSubscription).toHaveBeenCalledTimes(1);

        provider.ExecuteSQL.mockImplementationOnce(async () => [janeRow()]).mockImplementationOnce(async () => []);
        driver.CreateProviderSubscription.mockClear();
        expect((await ensure()).Outcomes[0].Code).toBe('NoLongerRenewing');
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
    });

    it("L5: a failure in Orders' own reads before anything was sent is FailedBeforeCreate, not a gateway fault of unknown state", async () => {
        mocks.runView.mockResolvedValue({ Success: false, ErrorMessage: 'connection reset' });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'FailedBeforeCreate', Message: expect.stringMatching(/nothing was created there.*connection reset/) });
        expect(alertCodes()).toEqual(['FailedBeforeCreate']);
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
    });

    it('L5: the term rule failing to load is FailedBeforeCreate; a throw from the create itself is still GatewayFault', async () => {
        mocks.subscriptionType.mockImplementation(() => {
            throw new Error('engine not loaded');
        });
        expect((await ensure()).Outcomes[0].Code).toBe('FailedBeforeCreate');
        mocks.subscriptionType.mockReset().mockReturnValue(ANNUAL);
        driver.CreateProviderSubscription.mockRejectedValue(new Error('Stripe was unreachable calling POST /subscriptions'));
        expect((await ensure()).Outcomes[0]).toMatchObject({ Code: 'GatewayFault', Message: expect.stringMatching(/whether it holds a subscription is unknown/) });
    });

    it('L5: a re-read that throws after the gateway created it is NotRecorded naming the id, never GatewayFault', async () => {
        provider.GetEntityObject.mockRejectedValueOnce(new Error('deadlock victim'));
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'NotRecorded', ProviderSubscriptionID: 'sub_new' });
        expect((mocks.alert.mock.calls[0][0] as { Reason: string }).Reason).toMatch(/sub_new.*deadlock victim/);
    });

    it("Nit: the checkout's call on a non-billing account reads the switch on the shared provider and makes no provider of its own", async () => {
        mocks.loadConfig.mockResolvedValue(providerConfig({ BillsSubscriptions: false }));
        const shared = { CreateIndependentInstance: vi.fn(), ExecuteSQL: vi.fn(), GetEntityObject: vi.fn() };
        const result = await EnsureProviderSubscriptionsOnOwnProvider({ OrderHeaderID: ORDER_ID, CheckoutPaymentProviderID: PROVIDER_ID, Now: NOW }, shared as never, user);
        expect(result).toMatchObject({ Success: true, Outcomes: [] });
        expect(shared.CreateIndependentInstance).not.toHaveBeenCalled();
        expect(mocks.loadConfig).toHaveBeenCalledWith(PROVIDER_ID, shared, user);
        expect(shared.ExecuteSQL).not.toHaveBeenCalled();
    });
});

// ─── E2b: closing every door through which an Orders subscription could drift from its gateway one ───

const EVENTS_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const eventReads = () => mocks.runView.mock.calls.filter((c) => (c[0] as { EntityName: string }).EntityName === EVENTS_ENTITY);
const live = (id: string) => ({ ProviderSubscriptionID: id, Status: 'active', IsLive: true, Metadata: {} });
const ended = (id: string) => ({ ProviderSubscriptionID: id, Status: 'canceled', IsLive: false, Metadata: {} });
/** The `Canceled` event Orders writes when its cancel also stopped the gateway subscription. */
const canceledEvent = (gatewayID: string) => ({ ID: 'e-cancel', EventData: JSON.stringify({ Gateway: { ProviderSubscriptionID: gatewayID, Outcome: 'EndsAtPeriodEnd' } }) });
/** The `Activated` event a fresh start writes, naming the gateway id it retired. */
const activatedEvent = (gatewayID: string) => ({ ID: 'e-activate', EventData: JSON.stringify({ RetiredProviderSubscriptionID: gatewayID }) });

describe('RetiredGatewayIDsFromEvents', () => {
    it("picks the cancelled gateway id from a Canceled event and the retired one from an Activated event", () => {
        // Kills: dropping either `ids.add` line.
        const ids = RetiredGatewayIDsFromEvents([canceledEvent('sub_old'), activatedEvent('sub_older')]);
        expect([...ids].sort()).toEqual(['sub_old', 'sub_older']);
    });

    it('ignores events with no data, malformed JSON, a null Gateway, empty or non-string ids', () => {
        // Kills: removing the try/catch (malformed JSON throws), or the `typeof === 'string' && id` guards.
        const ids = RetiredGatewayIDsFromEvents([
            { EventData: null },
            { EventData: '' },
            { EventData: '{not json' },
            { EventData: '{"Gateway":null}' },
            { EventData: 'null' },
            { EventData: JSON.stringify({ Gateway: { ProviderSubscriptionID: '' } }) },
            { EventData: JSON.stringify({ Gateway: { ProviderSubscriptionID: 42 } }) },
            { EventData: JSON.stringify({ RetiredProviderSubscriptionID: '' }) },
            { EventData: JSON.stringify({ RetiredProviderSubscriptionID: { id: 'sub_x' } }) },
            { EventData: JSON.stringify({ Reason: 'Customer request' }) },
            canceledEvent('sub_old'),
        ]);
        expect([...ids]).toEqual(['sub_old']);
        expect(RetiredGatewayIDsFromEvents([]).size).toBe(0);
    });
});

describe('EnsureProviderSubscriptions (E2b): a cancelled-then-bought-again subscription gets a NEW gateway subscription', () => {
    it("Jane's SUB-000110 was cancelled (sub_old runs to period end) and bought again: sub_old is not Found; sub_new is created and recorded", async () => {
        // Kills: dropping the `!retired.has(...)` filter in the hand-over (sub_old would be recorded as Found).
        events = [canceledEvent('sub_old')];
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [live('sub_old')] }).mockResolvedValueOnce({
            Success: true,
            Subscriptions: [live('sub_old'), live('sub_new')],
        });
        const result = await ensure();
        expect(result.Outcomes).toEqual([expect.objectContaining({ Code: 'Created', ProviderSubscriptionID: 'sub_new', Recorded: true })]);
        expect(driver.CreateProviderSubscription).toHaveBeenCalledTimes(1);
        expect(entity.ProviderSubscriptionID).toBe('sub_new');
        expect(entity.Save).toHaveBeenCalledTimes(1);
        // The second search still sees sub_old live, but it is retired: no AmbiguousAtGateway.
        expect(mocks.alert).not.toHaveBeenCalled();
        // The events read is this subscription's Canceled/Activated events, uncached.
        expect(eventReads()[0][0]).toMatchObject({
            ExtraFilter: `SubscriptionID = '${SUB_ID}' AND EventType IN ('Canceled', 'Activated')`,
            BypassCache: true,
        });
    });

    it('the same when sub_old has already ended (retired by a fresh start): no EndedAtGateway alert, sub_new is created', async () => {
        // Kills: the same filter; without it the ended sub_old makes the run stop with EndedAtGateway.
        events = [activatedEvent('sub_old')];
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [ended('sub_old')] });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Created', ProviderSubscriptionID: 'sub_new' });
        expect(alertCodes()).not.toContain('EndedAtGateway');
        expect(driver.CreateProviderSubscription).toHaveBeenCalledTimes(1);
    });

    it('control: with no event naming sub_old, a live sub_old IS recorded as Found and nothing is created (unchanged)', async () => {
        // Kills: treating every found id as retired (an over-filter would create a second live one).
        events = [{ ID: 'e-other', EventData: JSON.stringify({ Gateway: { ProviderSubscriptionID: 'sub_unrelated' } }) }];
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [live('sub_old')] });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Found', ProviderSubscriptionID: 'sub_old' });
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(entity.ProviderSubscriptionID).toBe('sub_old');
        expect(eventReads()).toHaveLength(1);
    });

    it('the hand-over reads events only when the search found something; a recorded create reads them once, as the replay backstop', async () => {
        // Kills: making the hand-over's retired read unconditional (an extra read before every create).
        // A refused create stops before the record step, so any events read here would be the hand-over's.
        driver.CreateProviderSubscription.mockResolvedValue({ Success: false, Reason: 'card_declined' });
        const refused = await ensure();
        expect(refused.Outcomes[0].Code).toBe('GatewayRefused');
        expect(eventReads()).toHaveLength(0);

        // A successful create reads the events exactly ONCE, deliberately: the record step checks the
        // created id is not one this subscription already retired (a replayed request, E2b). That is one
        // read per gateway subscription created, after the create; the hand-over still read none before
        // it (the search was empty), and confirmOnlyOne reads none (only sub_new is live).
        mocks.runView.mockClear();
        driver.CreateProviderSubscription.mockResolvedValue({ Success: true, ProviderSubscriptionID: 'sub_new', Status: 'active', ChargedAtCreation: false });
        const created = await ensure();
        expect(created.Outcomes[0].Code).toBe('Created');
        expect(eventReads()).toHaveLength(1);
        const readOrder = mocks.runView.mock.invocationCallOrder[mocks.runView.mock.calls.indexOf(eventReads()[0])];
        expect(readOrder).toBeGreaterThan(driver.CreateProviderSubscription.mock.invocationCallOrder.at(-1)!);
    });

    it('an events read that fails never throws out of the run', async () => {
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [live('sub_old')] });
        mocks.runView.mockImplementation(async (params: { EntityName: string }) =>
            params.EntityName === EVENTS_ENTITY ? { Success: false, ErrorMessage: 'timeout', Results: [] } : { Success: true, Results: params.EntityName === 'MJ_BizApps_Orders: Payment Provider Prices' ? prices : switchedOn },
        );
        const result = await ensure();
        expect(result.Success).toBe(true);
        // Nothing created on an unreadable history: the old one might be the one to keep.
        expect(driver.CreateProviderSubscription).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
    });
});

describe('EnsureProviderSubscriptions (E2b): an Orders subscription cancelled while its gateway one was being created', () => {
    for (const [what, change] of [
        ['cancelled (Status Canceled)', () => (entity.Status = 'Canceled')],
        ['switched off (AutoRenew false)', () => (entity.AutoRenew = false)],
    ] as const) {
        it(`${what} at the record step: sub_new is cancelled now at the gateway, not recorded, NoLongerRenewing, no alert`, async () => {
            // Kills: removing the stopUnwanted branch in recordOnce (sub_new would be recorded and bill a cancelled customer).
            change();
            const result = await ensure();
            expect(result.Success).toBe(true);
            expect(result.Outcomes).toEqual([expect.objectContaining({ Code: 'NoLongerRenewing', ProviderSubscriptionID: 'sub_new' })]);
            expect(driver.CancelProviderSubscription).toHaveBeenCalledTimes(1);
            expect(driver.CancelProviderSubscription).toHaveBeenCalledWith({
                ProviderSubscriptionID: 'sub_new',
                BillingEndsAt: null,
                IdempotencyKey: `provider-subscription-unwanted:${SUB_ID.toLowerCase()}:sub_new`,
            });
            expect(entity.Save).not.toHaveBeenCalled();
            expect(entity.ProviderSubscriptionID).toBeNull();
            expect(mocks.alert).not.toHaveBeenCalled();
        });
    }

    it('control: an Active, auto-renewing subscription is recorded and nothing is cancelled', async () => {
        // Kills: inverting the condition (every hand-over would cancel its own new gateway subscription).
        const result = await ensure();
        expect(result.Outcomes[0].Code).toBe('Created');
        expect(driver.CancelProviderSubscription).not.toHaveBeenCalled();
    });

    it('when that cancel is refused: an urgent UnwantedAtGateway alert naming sub_new, nothing recorded', async () => {
        // Kills: returning NoLongerRenewing regardless of `stopped.Success` (a customer would be charged silently).
        entity.Status = 'Canceled';
        driver.CancelProviderSubscription.mockResolvedValue({ Success: false, Reason: 'resource_missing' });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'UnwantedAtGateway', ProviderSubscriptionID: 'sub_new' });
        expect(mocks.alert).toHaveBeenCalledTimes(1);
        expect(mocks.alert.mock.calls[0][0]).toMatchObject({
            Code: 'UnwantedAtGateway',
            Urgent: true,
            Reason: expect.stringMatching(/sub_new.*resource_missing/s),
        });
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('when that cancel throws: the same urgent alert, and the run never throws', async () => {
        // Kills: removing the try/catch around the cancel (the throw becomes NotRecorded, not UnwantedAtGateway).
        entity.AutoRenew = false;
        driver.CancelProviderSubscription.mockRejectedValue(new Error('ECONNRESET'));
        const result = await ensure();
        expect(result.Success).toBe(true);
        expect(result.Outcomes[0].Code).toBe('UnwantedAtGateway');
        expect(mocks.alert.mock.calls[0][0]).toMatchObject({ Code: 'UnwantedAtGateway', Urgent: true, Reason: expect.stringMatching(/sub_new.*ECONNRESET/s) });
    });
});

describe('EnsureProviderSubscriptions (E2b): after a create, the gateway is searched again (confirmOnlyOne)', () => {
    it('two runs straddling midnight both created: sub_new and sub_other live raise an urgent, linked AmbiguousAtGateway naming both', async () => {
        // Kills: dropping the confirmOnlyOne call, or `live.length <= 1` → `<= 2`, or Linked: true → false.
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [] }).mockResolvedValueOnce({
            Success: true,
            Subscriptions: [live('sub_new'), live('sub_other')],
        });
        const result = await ensure();
        expect(driver.FindProviderSubscriptions).toHaveBeenCalledTimes(2);
        expect(driver.FindProviderSubscriptions).toHaveBeenNthCalledWith(2, { ProviderCustomerRef: 'cus_jane', MetadataKey: 'OrdersSubscriptionID', MetadataValue: SUB_ID });
        expect(result.Outcomes[0]).toMatchObject({ Code: 'AmbiguousAtGateway', ProviderSubscriptionID: 'sub_new', NewAlert: true });
        expect(mocks.alert).toHaveBeenCalledTimes(1);
        expect(mocks.alert.mock.calls[0][0]).toMatchObject({
            Code: 'AmbiguousAtGateway',
            Urgent: true,
            Linked: true,
            Reason: expect.stringMatching(/sub_new, sub_other/),
        });
        // The one this run created is still recorded; the alert says which to cancel.
        expect(entity.ProviderSubscriptionID).toBe('sub_new');
    });

    it('only sub_new live after the create (or an ended extra): Created, no alert', async () => {
        // Kills: counting non-live subscriptions (`IsLive` filter dropped) as a second one.
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [] }).mockResolvedValueOnce({
            Success: true,
            Subscriptions: [live('sub_new'), ended('sub_gone')],
        });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Created', ProviderSubscriptionID: 'sub_new' });
        expect(driver.FindProviderSubscriptions).toHaveBeenCalledTimes(2);
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it("a retired sub_old still live at the gateway is not counted: Created, no alert", async () => {
        // Kills: dropping `!retired.has(...)` in confirmOnlyOne.
        events = [canceledEvent('sub_old')];
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [] }).mockResolvedValueOnce({
            Success: true,
            Subscriptions: [live('sub_new'), live('sub_old')],
        });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Created', ProviderSubscriptionID: 'sub_new' });
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it('the search after the create failing (refused or thrown) keeps Created, raises nothing, and is logged', async () => {
        // Kills: raising (or returning a failure code) on a failed confirm search; the create itself succeeded.
        vi.mocked(LogError).mockClear();
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [] }).mockResolvedValueOnce({ Success: false, Reason: 'rate limited' });
        const refused = await ensure();
        expect(refused.Outcomes[0]).toMatchObject({ Code: 'Created', ProviderSubscriptionID: 'sub_new' });
        expect(vi.mocked(LogError).mock.calls.some((c) => /could not search the gateway again after creating sub_new: rate limited/.test(String(c[0])))).toBe(true);

        entity.ProviderSubscriptionID = null;
        entity.PaymentProviderID = null;
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [] }).mockRejectedValueOnce(new Error('socket hang up'));
        const thrown = await ensure();
        expect(thrown.Success).toBe(true);
        expect(thrown.Outcomes[0].Code).toBe('Created');
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it('a Found path does not search again (only a create can make a second one)', async () => {
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [live('sub_from_yesterday')] });
        await ensure();
        expect(driver.FindProviderSubscriptions).toHaveBeenCalledTimes(1);
    });
});

// ─── E2b: Jane's SUB-000110 bought, cancelled (sub_old) and bought again ─────────────────────────────

describe("EnsureProviderSubscriptions (E2b): the re-buy's checkout finds the subscription through its new term", () => {
    it("an OrderHeaderID run selects by the subscription's creating line OR its latest term's line, as one parenthesised conjunct", async () => {
        // Jane's re-buy order sells only term 2; SUB-000110 keeps its ORIGINAL OrderLineID (from ORD-002465), so
        // the new order is reachable only through `tol`, the latest live term's order line.
        // Kills: dropping `OR tol.OrderHeaderID` (the re-buy's checkout would select nothing and hand nothing over),
        // or dropping the parentheses (the OR would let a cancelled or non-renewing row through).
        const REBUY_ORDER = 'BBBBBBBB-0000-4000-8000-000000002999';
        await ensure({ OrderHeaderID: REBUY_ORDER });
        expect(sql[0]).toContain(`(ol.OrderHeaderID = '${REBUY_ORDER}' OR tol.OrderHeaderID = '${REBUY_ORDER}')`);
        // Every OR in the WHERE sits inside parentheses, so AutoRenew/Status still bind every row.
        const code = codeOnly(sql[0]);
        const where = code.indexOf('WHERE s.AutoRenew = 1');
        const end = code.indexOf('ORDER BY s.SubscriptionNumber', where);
        const ors = [...code.slice(where, end).matchAll(/\bOR\b/g)];
        expect(ors).toHaveLength(1);
        for (const m of ors) expect(depthAt(code, where + m.index!)).toBeGreaterThan(depthAt(code, where));
        // The other scopes are unchanged: a targeted run and the sweep never mention `tol.OrderHeaderID`.
        sql = [];
        await ensure({ SubscriptionIDs: [SUB_ID] });
        await ensure({});
        for (const statement of sql) expect(codeOnly(statement)).not.toMatch(/tol\.OrderHeaderID\s*=/);
    });
});

describe('ProviderSubscriptionIdempotencyKey (E2b): the generation of a re-bought subscription', () => {
    const base = {
        SubscriptionID: SUB_ID,
        ProviderPriceID: 'price_pro_599',
        ProviderInstrumentRef: 'pm_jane',
        Quantity: 1,
        FirstChargeAt: new Date('2027-10-30T05:00:00Z'),
        AttemptDay: '2026-10-31' as const,
    };
    const FIRST = `provider-subscription:${SUB_ID.toLowerCase()}:price_pro_599:pm_jane:1:1824872400:2026-10-31`;

    it('generation 0 or absent is the key exactly as before (a first create is unchanged); 2 appends :g2', () => {
        expect(ProviderSubscriptionIdempotencyKey(base)).toBe(FIRST);
        expect(ProviderSubscriptionIdempotencyKey({ ...base, Generation: undefined })).toBe(FIRST);
        expect(ProviderSubscriptionIdempotencyKey({ ...base, Generation: 0 })).toBe(FIRST);
        expect(ProviderSubscriptionIdempotencyKey({ ...base, Generation: 1 })).toBe(`${FIRST}:g1`);
        expect(ProviderSubscriptionIdempotencyKey({ ...base, Generation: 2 })).toBe(`${FIRST}:g2`);
    });

    it('Jane re-bought the same day (search finds sub_old, which her cancel retired): the create sends the key ending :g1', async () => {
        // Kills: dropping the generation (the gateway would answer with the cancelled sub_old it saved for FIRST).
        events = [canceledEvent('sub_old')];
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [live('sub_old')] });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Created', ProviderSubscriptionID: 'sub_new', Recorded: true });
        expect(driver.CreateProviderSubscription).toHaveBeenCalledTimes(1);
        expect(driver.CreateProviderSubscription.mock.calls[0][0].IdempotencyKey).toBe(`${FIRST}:g1`);
    });

    it('control: a first-time buyer (empty search) creates with the key without any :g', async () => {
        await ensure();
        expect(driver.CreateProviderSubscription.mock.calls[0][0].IdempotencyKey).toBe(FIRST);
        expect(driver.CreateProviderSubscription.mock.calls[0][0].IdempotencyKey).not.toMatch(/:g\d+$/);
    });
});

describe('EnsureProviderSubscriptions (E2b): a create the gateway answers with a retired subscription is a replay', () => {
    for (const [lane, found] of [
        ['the search found sub_old (so the key carried :g1)', [live('sub_old')]],
        ['the search did not return sub_old (so the key could repeat the first one)', []],
    ] as const) {
        it(`${lane}: the create answers sub_old, retired by Jane's cancel: NotRecorded as a replay, nothing saved or sanctioned`, async () => {
            // Kills: dropping the retired backstop in recordOnce (sub_old, already cancelled, would be recorded:
            // the gateway bills nothing and Orders stops renewing Jane).
            events = [canceledEvent('sub_old')];
            driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [...found] });
            driver.CreateProviderSubscription.mockResolvedValue({ Success: true, ProviderSubscriptionID: 'sub_old', Status: 'canceled', ChargedAtCreation: false });
            const result = await ensure();
            expect(result.Success).toBe(true);
            expect(result.Outcomes[0]).toMatchObject({ Code: 'NotRecorded', ProviderSubscriptionID: 'sub_old', NewAlert: true });
            expect(result.Outcomes[0].Recorded).not.toBe(true);
            expect(result.Outcomes[0].Message).toMatch(/answered the create with sub_old, which this subscription already cancelled or retired \(a replayed request\)/);
            expect(alertCodes()).toEqual(['NotRecorded']);
            expect(entity.Save).not.toHaveBeenCalled();
            expect(entity.ProviderSubscriptionID).toBeNull();
            expect(entity.PaymentProviderID).toBeNull();
            expect(mocks.sanction).not.toHaveBeenCalled();
            expect(result.Linked).toBe(0);
        });
    }

    it('control: the same history, but the create answers sub_new: recorded and sanctioned', async () => {
        events = [canceledEvent('sub_old')];
        driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [live('sub_old')] });
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Created', ProviderSubscriptionID: 'sub_new', Recorded: true });
        expect(entity.ProviderSubscriptionID).toBe('sub_new');
        expect(entity.Save).toHaveBeenCalledTimes(1);
        expect(mocks.sanction).toHaveBeenCalledTimes(1);
        expect(mocks.alert).not.toHaveBeenCalled();
    });
});

describe('EnsureProviderSubscriptions (E2b): the record step sanctions the link it writes', () => {
    it('sanctions the reloaded subscription BEFORE it is saved, for a created and for a found one', async () => {
        // Kills: dropping the sanction call (the shared entity rule would refuse the save on the real class).
        for (const lane of ['created', 'found'] as const) {
            mocks.sanction.mockClear();
            entity.Save.mockClear();
            entity.ProviderSubscriptionID = null;
            entity.PaymentProviderID = null;
            if (lane === 'found') driver.FindProviderSubscriptions.mockResolvedValueOnce({ Success: true, Subscriptions: [live('sub_from_yesterday')] });
            const result = await ensure();
            expect(result.Outcomes[0], lane).toMatchObject({ Code: lane === 'created' ? 'Created' : 'Found', Recorded: true });
            expect(mocks.sanction).toHaveBeenCalledTimes(1);
            expect(mocks.sanction.mock.calls[0][0]).toBe(entity);
            expect(entity.Save).toHaveBeenCalledTimes(1);
            expect(mocks.sanction.mock.invocationCallOrder[0]).toBeLessThan(entity.Save.mock.invocationCallOrder[0]);
        }
    });

    it('a subscription not loaded through the server subclass cannot be sanctioned: NotRecorded naming sub_new, nothing written', async () => {
        // The real sanction, against the plain object these tests reload.
        mocks.sanction.mockImplementation((s: unknown) => mocks.realSanction!(s));
        const result = await ensure();
        expect(result.Success).toBe(true);
        expect(result.Outcomes[0]).toMatchObject({ Code: 'NotRecorded', ProviderSubscriptionID: 'sub_new', NewAlert: true });
        expect((mocks.alert.mock.calls[0][0] as { Reason: string }).Reason).toMatch(/sub_new.*recording that failed.*server's entity subclass/s);
        expect(entity.Save).not.toHaveBeenCalled();
        expect(entity.ProviderSubscriptionID).toBeNull();
        expect(entity.PaymentProviderID).toBeNull();
        expect(result.Linked).toBe(0);
    });

    it('control: the real sanction accepts a SubscriptionEntityServer, and the link is recorded', async () => {
        // An object whose class IS the server subclass, with its columns as own data properties (the real
        // ones are accessors over a loaded field map this test has no database for).
        const server = Object.create(SubscriptionEntityServer.prototype) as SubscriptionEntityServer;
        const fields = { ...entity };
        for (const [k, v] of Object.entries(fields)) Object.defineProperty(server, k, { value: v, writable: true, enumerable: true });
        entity = server as unknown as typeof entity;
        mocks.sanction.mockImplementation((s: unknown) => mocks.realSanction!(s));
        const result = await ensure();
        expect(result.Outcomes[0]).toMatchObject({ Code: 'Created', ProviderSubscriptionID: 'sub_new', Recorded: true });
        expect(entity.ProviderSubscriptionID).toBe('sub_new');
        expect(entity.Save).toHaveBeenCalledTimes(1);
    });
});
