/**
 * E2b: carrying an Orders cancel to the gateway that bills the subscription.
 *
 * The running example: Jane's term 1 ends 30 Oct 2027; Sess cancels at end of term on 3 Mar 2027 in
 * America/Chicago. Coverage runs through 30 Oct, so the gateway must charge nothing after 00:00 Central
 * on 31 Oct 2027 = 05:00 UTC (CDT, UTC-5: US DST ends 7 Nov 2027). A winter cancel lands on CST (UTC-6).
 *
 * The gateway driver and the alert reader are faked; the date rules use the real business-day helpers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CHECKOUT_CAPTURE_TASK_ENTITY, ProviderSubscriptionAlertName } from '../checkoutCaptureAlert.js';

const mocks = vi.hoisted(() => ({
    loadConfig: vi.fn(),
    buildDriver: vi.fn(),
    readAlerts: vi.fn(),
    /** The real `ReadOpenProviderSubscriptionAlerts`, so a test can drive it through a fake Tasks read. */
    actualReadAlerts: undefined as undefined | ((...args: unknown[]) => Promise<unknown>),
}));

vi.mock('../PaymentProviderResolver.js', () => ({
    LoadPaymentProviderConfig: (...args: unknown[]) => mocks.loadConfig(...args),
    BuildPaymentProvider: (...args: unknown[]) => mocks.buildDriver(...args),
}));
vi.mock('../checkoutCaptureAlert.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../checkoutCaptureAlert.js')>();
    mocks.actualReadAlerts = actual.ReadOpenProviderSubscriptionAlerts as unknown as (...args: unknown[]) => Promise<unknown>;
    return {
        ...actual,
        ReadOpenProviderSubscriptionAlerts: (...args: unknown[]) => mocks.readAlerts(...args),
    };
});

import {
    BusinessToday,
    CANCEL_BLOCKING_ALERT_CODES,
    CancelAtGateway,
    CancelBlockingAlerts,
    GateGatewayCancel,
    GatewayCancelIdempotencyKey,
    GatewayCancelPreview,
    PlanGatewayCancel,
    ReadGatewaySubscription,
    type GatewayCancelPlan,
} from '../ProviderSubscriptionCancel.js';

const ZONE = 'America/Chicago';
const user = { ID: 'user-sess', Email: 'sess@example.com' } as unknown as UserInfo;
const md = { tag: 'provider' } as unknown as IMetadataProvider;
/** A date value: UTC midnight of the day, as a `date` column round-trips. */
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

/** 00:00 CDT 31 Oct 2027. */
const JANE_ENDS = new Date('2027-10-31T05:00:00.000Z');
/** 00:00 CDT 30 Oct 2027: Stripe's period end for Jane. */
const PERIOD_END = new Date('2027-10-30T05:00:00.000Z');
const SUB_ID = 'A1B2C3D4-0000-4000-8000-000000000110';
const NOW_PLAN: GatewayCancelPlan = { When: 'Now' };
const EOC_PLAN: GatewayCancelPlan = { When: 'EndOfCoverage', BillingEndsAt: JANE_ENDS };

describe('PlanGatewayCancel', () => {
    it('effective today (3 Mar 2027) or earlier (1 Mar 2027) → Now', () => {
        expect(PlanGatewayCancel(day('2027-03-03'), '2027-03-03', ZONE)).toEqual({ When: 'Now' });
        expect(PlanGatewayCancel(day('2027-03-01'), '2027-03-03', ZONE)).toEqual({ When: 'Now' });
    });

    it('effective tomorrow (4 Mar 2027) → EndOfCoverage at 00:00 CST 5 Mar 2027 = 06:00 UTC', () => {
        expect(PlanGatewayCancel(day('2027-03-04'), '2027-03-03', ZONE)).toEqual({ When: 'EndOfCoverage', BillingEndsAt: new Date('2027-03-05T06:00:00.000Z') });
    });

    it("Jane's term ends 30 Oct 2027 → nothing after 00:00 Central on 31 Oct = 2027-10-31T05:00:00.000Z (CDT)", () => {
        const plan = PlanGatewayCancel(day('2027-10-30'), '2027-03-03', ZONE);
        expect(plan).toEqual({ When: 'EndOfCoverage', BillingEndsAt: JANE_ENDS });
        expect(plan.When === 'EndOfCoverage' && plan.BillingEndsAt.toISOString()).toBe('2027-10-31T05:00:00.000Z');
    });

    it('winter: effective 15 Jan 2028 → 00:00 CST 16 Jan 2028 = 2028-01-16T06:00:00.000Z', () => {
        expect(PlanGatewayCancel(day('2028-01-15'), '2027-03-03', ZONE)).toEqual({ When: 'EndOfCoverage', BillingEndsAt: new Date('2028-01-16T06:00:00.000Z') });
    });

    it('DST-end day: effective 6 Nov 2027 → 00:00 on 7 Nov is still CDT (the change is at 02:00) = 05:00 UTC', () => {
        expect(PlanGatewayCancel(day('2027-11-06'), '2027-03-03', ZONE)).toEqual({ When: 'EndOfCoverage', BillingEndsAt: new Date('2027-11-07T05:00:00.000Z') });
    });

    it('an invalid date throws RangeError', () => {
        expect(() => PlanGatewayCancel(new Date('not a date'), '2027-03-03', ZONE)).toThrow(RangeError);
    });
});

describe('BusinessToday', () => {
    it('20:30 Central on 31 Oct 2026 (already 1 Nov in UTC) is 31 Oct in Chicago and 1 Nov in UTC', () => {
        const now = new Date('2026-11-01T01:30:00Z');
        expect(BusinessToday(ZONE, now)).toBe('2026-10-31');
        expect(BusinessToday('UTC', now)).toBe('2026-11-01');
    });
});

describe('GatewayCancelIdempotencyKey and GatewayCancelPreview', () => {
    it('the key is stable for the same request, lowercases the Orders id, and differs between Now and EndOfCoverage', () => {
        const eoc = GatewayCancelIdempotencyKey(SUB_ID, 'sub_x', EOC_PLAN);
        expect(eoc).toBe('provider-subscription-cancel:a1b2c3d4-0000-4000-8000-000000000110:sub_x:1824958800');
        expect(GatewayCancelIdempotencyKey(SUB_ID, 'sub_x', { When: 'EndOfCoverage', BillingEndsAt: new Date(JANE_ENDS.getTime()) })).toBe(eoc);
        expect(GatewayCancelIdempotencyKey(SUB_ID.toLowerCase(), 'sub_x', EOC_PLAN)).toBe(eoc);
        const now = GatewayCancelIdempotencyKey(SUB_ID, 'sub_x', NOW_PLAN);
        expect(now).toBe('provider-subscription-cancel:a1b2c3d4-0000-4000-8000-000000000110:sub_x:now');
        expect(now).not.toBe(eoc);
        // A different end instant (16 Jun 2027) is a different request.
        expect(GatewayCancelIdempotencyKey(SUB_ID, 'sub_x', { When: 'EndOfCoverage', BillingEndsAt: new Date('2027-06-16T05:00:00Z') })).not.toBe(eoc);
        // A different gateway subscription is a different request.
        expect(GatewayCancelIdempotencyKey(SUB_ID, 'sub_y', EOC_PLAN)).not.toBe(eoc);
    });

    it('the preview carries the plan, with the instant as ISO only for EndOfCoverage, and no Outcome', () => {
        expect(GatewayCancelPreview('sub_x', NOW_PLAN)).toEqual({ ProviderSubscriptionID: 'sub_x', When: 'Now', BillingEndsAt: undefined });
        expect(GatewayCancelPreview('sub_x', EOC_PLAN)).toEqual({ ProviderSubscriptionID: 'sub_x', When: 'EndOfCoverage', BillingEndsAt: '2027-10-31T05:00:00.000Z' });
        expect(GatewayCancelPreview('sub_x', EOC_PLAN)).not.toHaveProperty('Outcome');
    });
});

describe('CancelAtGateway', () => {
    const cancel = vi.fn();
    const subscription = { ID: SUB_ID, PaymentProviderID: 'provider-stripe', ProviderSubscriptionID: 'sub_x' };
    const config = { ID: 'provider-stripe', Name: 'Stripe' };

    beforeEach(() => {
        vi.clearAllMocks();
        cancel.mockReset();
        mocks.loadConfig.mockResolvedValue(config);
        mocks.buildDriver.mockResolvedValue({ CancelProviderSubscription: cancel });
    });

    it('Now: asks the driver with BillingEndsAt null and the :now key, and reports the gateway\'s outcome', async () => {
        cancel.mockResolvedValue({ Success: true, Outcome: 'CanceledNow', BillingEndsAt: new Date('2027-03-03T15:00:00Z'), Status: 'canceled' });
        const result = await CancelAtGateway(subscription, NOW_PLAN, md, user);
        expect(mocks.loadConfig).toHaveBeenCalledWith('provider-stripe', md, user);
        expect(mocks.buildDriver).toHaveBeenCalledWith(config, md, user);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledWith({
            ProviderSubscriptionID: 'sub_x',
            BillingEndsAt: null,
            IdempotencyKey: 'provider-subscription-cancel:a1b2c3d4-0000-4000-8000-000000000110:sub_x:now',
        });
        expect(result).toEqual({
            Success: true,
            Summary: { ProviderSubscriptionID: 'sub_x', When: 'Now', BillingEndsAt: '2027-03-03T15:00:00.000Z', Outcome: 'CanceledNow' },
        });
    });

    it("Jane at end of term: asks for nothing after 31 Oct 05:00 UTC; the gateway's own end (30 Oct period end) wins in the summary", async () => {
        cancel.mockResolvedValue({ Success: true, Outcome: 'EndsAtPeriodEnd', BillingEndsAt: PERIOD_END, Status: 'active' });
        const result = await CancelAtGateway(subscription, EOC_PLAN, md, user);
        expect(cancel).toHaveBeenCalledWith({
            ProviderSubscriptionID: 'sub_x',
            BillingEndsAt: JANE_ENDS,
            IdempotencyKey: 'provider-subscription-cancel:a1b2c3d4-0000-4000-8000-000000000110:sub_x:1824958800',
        });
        expect(result).toEqual({
            Success: true,
            Summary: { ProviderSubscriptionID: 'sub_x', When: 'EndOfCoverage', BillingEndsAt: '2027-10-30T05:00:00.000Z', Outcome: 'EndsAtPeriodEnd' },
        });
    });

    it('a gateway answer without an instant keeps the planned one', async () => {
        cancel.mockResolvedValue({ Success: true, Outcome: 'AlreadyEnding' });
        expect((await CancelAtGateway(subscription, EOC_PLAN, md, user)).Summary).toEqual({
            ProviderSubscriptionID: 'sub_x',
            When: 'EndOfCoverage',
            BillingEndsAt: '2027-10-31T05:00:00.000Z',
            Outcome: 'AlreadyEnding',
        });
    });

    it('no payment provider on the subscription: refuses without loading anything', async () => {
        const result = await CancelAtGateway({ ...subscription, PaymentProviderID: null }, EOC_PLAN, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('Nothing was changed in Orders');
        expect(result.Reason).toContain('sub_x');
        expect(result.Summary).toEqual(GatewayCancelPreview('sub_x', EOC_PLAN));
        expect(mocks.loadConfig).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
    });

    it('the provider config cannot be loaded (an inactive account): refuses, naming why, never throws', async () => {
        mocks.loadConfig.mockRejectedValue(new Error("Payment provider 'Stripe' is inactive"));
        const result = await CancelAtGateway(subscription, EOC_PLAN, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain("Payment provider 'Stripe' is inactive");
        expect(result.Reason).toContain('Nothing was changed in Orders');
        expect(result.Summary).toEqual(GatewayCancelPreview('sub_x', EOC_PLAN));
        expect(cancel).not.toHaveBeenCalled();
    });

    it('building the driver throws: refuses, never throws', async () => {
        mocks.buildDriver.mockRejectedValue(new Error('No Stripe API key'));
        const result = await CancelAtGateway(subscription, NOW_PLAN, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('No Stripe API key');
        expect(result.Reason).toContain('Nothing was changed in Orders');
    });

    it("the driver refuses (a stub, or Stripe said no): refuses with the driver's reason and no Outcome", async () => {
        cancel.mockResolvedValue({ Success: false, Reason: 'Stripe refused to cancel sub_x: This subscription is managed by a subscription schedule.' });
        const result = await CancelAtGateway(subscription, EOC_PLAN, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('This subscription is managed by a subscription schedule.');
        expect(result.Reason).toContain('Nothing was changed in Orders');
        expect(result.Summary).toEqual(GatewayCancelPreview('sub_x', EOC_PLAN));
        expect(result.Summary.Outcome).toBeUndefined();
    });

    it('the driver refuses with no reason: says so rather than "undefined"', async () => {
        cancel.mockResolvedValue({ Success: false });
        const result = await CancelAtGateway(subscription, EOC_PLAN, md, user);
        expect(result.Reason).toContain('no reason given');
        expect(result.Reason).not.toContain('undefined');
    });

    it('the driver throws (Stripe returned 503): refuses, never throws', async () => {
        cancel.mockRejectedValue(new Error('Stripe returned 503 calling POST /subscriptions/sub_x. The payment state is unknown.'));
        const result = await CancelAtGateway(subscription, EOC_PLAN, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('503');
        expect(result.Reason).toContain('Nothing was changed in Orders');
    });
});

describe('CancelBlockingAlerts', () => {
    beforeEach(() => {
        mocks.readAlerts.mockReset();
    });

    it("SUB-000110 has GatewayFault + ChargedAtCreation open beside NoCard and PriceMismatch: only the two blocking codes; SUB-000111's alert is ignored", async () => {
        mocks.readAlerts.mockResolvedValue({
            Ok: true,
            Open: new Map([
                ['SUB-000110', new Set(['NoCard', 'GatewayFault', 'PriceMismatch', 'ChargedAtCreation'])],
                ['SUB-000111', new Set(['NotRecorded'])],
            ]),
        });
        expect(await CancelBlockingAlerts('SUB-000110', user, md)).toEqual({ Codes: ['GatewayFault', 'ChargedAtCreation'] });
        expect(mocks.readAlerts).toHaveBeenCalledWith(user, md);
    });

    it('every blocking code is returned; only non-blocking codes, or another subscription, return none', async () => {
        mocks.readAlerts.mockResolvedValue({
            Ok: true,
            Open: new Map([
                ['SUB-000110', new Set(['NotRecorded', 'GatewayFault', 'LinkedElsewhere', 'AmbiguousAtGateway', 'ChargedAtCreation', 'RenewalNotBooked'])],
                ['SUB-000112', new Set(['NoCard', 'PriceMismatch'])],
            ]),
        });
        expect(await CancelBlockingAlerts('SUB-000110', user, md)).toEqual({
            Codes: ['NotRecorded', 'GatewayFault', 'LinkedElsewhere', 'AmbiguousAtGateway', 'ChargedAtCreation', 'RenewalNotBooked'],
        });
        expect(await CancelBlockingAlerts('SUB-000112', user, md)).toEqual({ Codes: [] });
        expect(await CancelBlockingAlerts('SUB-000999', user, md)).toEqual({ Codes: [] });
        // E4 adds RenewalNotBooked: a cancel must not end coverage the gateway was paid for before that payment is settled.
        expect([...CANCEL_BLOCKING_ALERT_CODES]).toEqual(['NotRecorded', 'GatewayFault', 'LinkedElsewhere', 'AmbiguousAtGateway', 'ChargedAtCreation', 'RenewalNotBooked']);
    });
});

describe('CancelBlockingAlerts: when the alerts cannot be read', () => {
    beforeEach(() => {
        mocks.readAlerts.mockReset();
        // The real reader, driven through a fake provider's Tasks read.
        mocks.readAlerts.mockImplementation((...args: unknown[]) => mocks.actualReadAlerts!(...args));
    });

    const tasksProvider = (read: () => Promise<unknown>, hasTasks = true) => {
        const runView = vi.fn(read);
        const entityByName = vi.fn((name: string) => (hasTasks && name === CHECKOUT_CAPTURE_TASK_ENTITY ? { Name: name } : undefined));
        return { provider: { EntityByName: entityByName, RunView: runView } as unknown as IMetadataProvider, runView, entityByName };
    };

    it('the Tasks read fails (timeout): no codes, and a ReadFailure naming why, so the cancel is refused rather than guessed', async () => {
        const { provider, runView } = tasksProvider(async () => ({ Success: false, ErrorMessage: 'Timeout expired', Results: [] }));
        const result = await CancelBlockingAlerts('SUB-000110', user, provider);
        expect(result).toEqual({ Codes: [], ReadFailure: 'could not read the open alert Tasks: Timeout expired' });
        expect(runView).toHaveBeenCalledTimes(1);
    });

    it('the read succeeds through the real reader: SUB-000110 has an open urgent ChargedAtCreation and a NoCard → only ChargedAtCreation, no ReadFailure', async () => {
        const { provider } = tasksProvider(async () => ({
            Success: true,
            Results: [
                { ID: 't1', Name: ProviderSubscriptionAlertName('SUB-000110', 'ChargedAtCreation', true) },
                { ID: 't2', Name: ProviderSubscriptionAlertName('SUB-000110', 'NoCard') },
                { ID: 't3', Name: ProviderSubscriptionAlertName('SUB-000111', 'NotRecorded') },
            ],
        }));
        const result = await CancelBlockingAlerts('SUB-000110', user, provider);
        expect(result).toEqual({ Codes: ['ChargedAtCreation'] });
        expect(result).not.toHaveProperty('ReadFailure');
    });

    it('a mocked reader failure is passed through as ReadFailure', async () => {
        mocks.readAlerts.mockResolvedValue({ Ok: false, Reason: 'could not read the open alert Tasks: login failed' });
        expect(await CancelBlockingAlerts('SUB-000110', user, md)).toEqual({ Codes: [], ReadFailure: 'could not read the open alert Tasks: login failed' });
    });

    it('a host without the tasks app (no Tasks entity): no codes and NO ReadFailure, and no read is attempted', async () => {
        const { provider, runView } = tasksProvider(async () => ({ Success: false, ErrorMessage: 'should not be called' }), false);
        const result = await CancelBlockingAlerts('SUB-000110', user, provider);
        expect(result).toEqual({ Codes: [] });
        expect(result).not.toHaveProperty('ReadFailure');
        expect(runView).not.toHaveBeenCalled();
    });
});

/**
 * Jane's term ends 31 Dec 2026 (Chicago, CST = UTC-6). E2 anchors Stripe's renewal charge at 00:00
 * Central on the term's last day: 2026-12-31T06:00:00Z. A period started at or after that instant is
 * one Orders has not booked.
 */
describe('GateGatewayCancel', () => {
    const LAST_DAY = '2026-12-31';
    const E2_CHARGE = new Date('2026-12-31T06:00:00.000Z');
    const JUST_BEFORE = new Date('2026-12-31T05:59:59.000Z');
    const CREATED = new Date('2025-12-31T06:00:00.000Z');

    it('Ended → Finished, even when its last period started on the last day (a person ended and settled it at the gateway)', () => {
        expect(GateGatewayCancel({ State: 'Ended', CurrentPeriodStart: E2_CHARGE }, LAST_DAY, ZONE)).toEqual({ Kind: 'Finished' });
        expect(GateGatewayCancel({ State: 'Ended', CurrentPeriodStart: new Date('2027-02-01T06:00:00Z') }, LAST_DAY, ZONE)).toEqual({ Kind: 'Finished' });
        expect(GateGatewayCancel({ State: 'Ended', CurrentPeriodStart: CREATED }, LAST_DAY, ZONE)).toEqual({ Kind: 'Finished' });
    });

    it('Ending with its period started before 2026-12-31T06:00Z (one second before, or at creation) → Finished', () => {
        expect(GateGatewayCancel({ State: 'Ending', CurrentPeriodStart: JUST_BEFORE }, LAST_DAY, ZONE)).toEqual({ Kind: 'Finished' });
        expect(GateGatewayCancel({ State: 'Ending', CurrentPeriodStart: CREATED }, LAST_DAY, ZONE)).toEqual({ Kind: 'Finished' });
    });

    it('Ending with its period started exactly at 2026-12-31T06:00Z → UnbookedPeriod (it would keep the renewal it charged that morning)', () => {
        expect(GateGatewayCancel({ State: 'Ending', CurrentPeriodStart: E2_CHARGE }, LAST_DAY, ZONE)).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: E2_CHARGE });
    });

    it('Renewing: started at 06:00Z → UnbookedPeriod with that PeriodStart; 05:59:59Z → Proceed', () => {
        const gate = GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: E2_CHARGE }, LAST_DAY, ZONE);
        expect(gate).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: E2_CHARGE });
        expect(gate.Kind === 'UnbookedPeriod' && gate.PeriodStart.toISOString()).toBe('2026-12-31T06:00:00.000Z');
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: JUST_BEFORE }, LAST_DAY, ZONE)).toEqual({ Kind: 'Proceed' });
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: CREATED }, LAST_DAY, ZONE)).toEqual({ Kind: 'Proceed' });
    });

    it('a later period (Stripe renewed again on 31 Dec 2027) is unbooked too', () => {
        const later = new Date('2027-12-31T06:00:00.000Z');
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: later }, LAST_DAY, ZONE)).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: later });
    });

    it('Collecting (past_due on the renewal) started at 06:00Z → UnbookedPeriod; before it → Proceed', () => {
        expect(GateGatewayCancel({ State: 'Collecting', CurrentPeriodStart: E2_CHARGE }, LAST_DAY, ZONE)).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: E2_CHARGE });
        expect(GateGatewayCancel({ State: 'Collecting', CurrentPeriodStart: JUST_BEFORE }, LAST_DAY, ZONE)).toEqual({ Kind: 'Proceed' });
    });

    it('no CurrentPeriodStart (null or absent): decided by state alone: Ending/Ended → Finished; Renewing/Collecting → Proceed', () => {
        expect(GateGatewayCancel({ State: 'Ending', CurrentPeriodStart: null }, LAST_DAY, ZONE)).toEqual({ Kind: 'Finished' });
        expect(GateGatewayCancel({ State: 'Ended', CurrentPeriodStart: null }, LAST_DAY, ZONE)).toEqual({ Kind: 'Finished' });
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: null }, LAST_DAY, ZONE)).toEqual({ Kind: 'Proceed' });
        expect(GateGatewayCancel({ State: 'Collecting', CurrentPeriodStart: null }, LAST_DAY, ZONE)).toEqual({ Kind: 'Proceed' });
        expect(GateGatewayCancel({ State: 'Renewing' }, LAST_DAY, ZONE)).toEqual({ Kind: 'Proceed' });
    });

    it('London (GMT on 31 Dec): the bound is 2026-12-31T00:00Z, so a period started then is unbooked in London but not in Chicago', () => {
        const londonMidnight = new Date('2026-12-31T00:00:00.000Z');
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: londonMidnight }, LAST_DAY, 'Europe/London')).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: londonMidnight });
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: new Date('2026-12-30T23:59:59.000Z') }, LAST_DAY, 'Europe/London')).toEqual({ Kind: 'Proceed' });
        // The same instant is 18:00 on 30 Dec in Chicago: still the booked period there.
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: londonMidnight }, LAST_DAY, ZONE)).toEqual({ Kind: 'Proceed' });
    });

    it('London in summer (BST, UTC+1): last day 30 Jun 2027 → the bound is 2027-06-29T23:00Z, not UTC midnight', () => {
        const bst = new Date('2027-06-29T23:00:00.000Z');
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: bst }, '2027-06-30', 'Europe/London')).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: bst });
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: new Date('2027-06-29T22:59:59.000Z') }, '2027-06-30', 'Europe/London')).toEqual({ Kind: 'Proceed' });
    });

    it('Auckland (NZDT, UTC+13): last day 31 Dec 2026 → the bound is 2026-12-30T11:00Z, the day before in UTC', () => {
        const nz = new Date('2026-12-30T11:00:00.000Z');
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: nz }, LAST_DAY, 'Pacific/Auckland')).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: nz });
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: new Date('2026-12-30T10:59:59.000Z') }, LAST_DAY, 'Pacific/Auckland')).toEqual({ Kind: 'Proceed' });
    });

    it('Chicago spring-forward: last day 14 Mar 2027 (00:00 is still CST) → 06:00Z; last day 15 Mar 2027 (CDT) → 05:00Z', () => {
        const dstDay = new Date('2027-03-14T06:00:00.000Z');
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: dstDay }, '2027-03-14', ZONE)).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: dstDay });
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: new Date('2027-03-14T05:59:59.000Z') }, '2027-03-14', ZONE)).toEqual({ Kind: 'Proceed' });
        const dayAfter = new Date('2027-03-15T05:00:00.000Z');
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: dayAfter }, '2027-03-15', ZONE)).toEqual({ Kind: 'UnbookedPeriod', PeriodStart: dayAfter });
        expect(GateGatewayCancel({ State: 'Renewing', CurrentPeriodStart: new Date('2027-03-15T04:59:59.000Z') }, '2027-03-15', ZONE)).toEqual({ Kind: 'Proceed' });
    });
});

describe('ReadGatewaySubscription', () => {
    const describeSub = vi.fn();
    const subscription = { PaymentProviderID: 'provider-stripe', ProviderSubscriptionID: 'sub_x' };
    const config = { ID: 'provider-stripe', Name: 'Stripe' };

    beforeEach(() => {
        vi.clearAllMocks();
        describeSub.mockReset();
        mocks.loadConfig.mockResolvedValue(config);
        mocks.buildDriver.mockResolvedValue({ DescribeProviderSubscription: describeSub });
    });

    it('passes a normal answer through, asking the account that bills it for sub_x', async () => {
        const answer = {
            Success: true,
            State: 'Renewing',
            CurrentPeriodStart: new Date('2025-12-31T06:00:00Z'),
            CurrentPeriodEnd: new Date('2026-12-31T06:00:00Z'),
            EndsAt: null,
            Status: 'active',
        };
        describeSub.mockResolvedValue(answer);
        expect(await ReadGatewaySubscription(subscription, md, user)).toEqual(answer);
        expect(mocks.loadConfig).toHaveBeenCalledWith('provider-stripe', md, user);
        expect(mocks.buildDriver).toHaveBeenCalledWith(config, md, user);
        expect(describeSub).toHaveBeenCalledWith('sub_x');
    });

    it("passes the driver's own refusal through unchanged", async () => {
        describeSub.mockResolvedValue({ Success: false, Reason: "Stripe could not read sub_x: No such subscription: 'sub_x'" });
        expect(await ReadGatewaySubscription(subscription, md, user)).toEqual({ Success: false, Reason: "Stripe could not read sub_x: No such subscription: 'sub_x'" });
    });

    it('no PaymentProviderID → Success false naming sub_x, and nothing is loaded', async () => {
        const result = await ReadGatewaySubscription({ ...subscription, PaymentProviderID: null }, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('sub_x');
        expect(result.State).toBeUndefined();
        expect(mocks.loadConfig).not.toHaveBeenCalled();
        expect(describeSub).not.toHaveBeenCalled();
    });

    it('the config cannot be loaded (inactive account) → Success false with the reason, never throws', async () => {
        mocks.loadConfig.mockRejectedValue(new Error("Payment provider 'Stripe' is inactive"));
        const result = await ReadGatewaySubscription(subscription, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain("Payment provider 'Stripe' is inactive");
        expect(result.Reason).toContain('sub_x');
        expect(describeSub).not.toHaveBeenCalled();
    });

    it('building the driver throws → Success false with the reason', async () => {
        mocks.buildDriver.mockRejectedValue(new Error('No Stripe API key'));
        const result = await ReadGatewaySubscription(subscription, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('No Stripe API key');
    });

    it('the driver throws (Stripe 503) → Success false naming sub_x and the fault, never throws', async () => {
        describeSub.mockRejectedValue(new Error('Stripe returned 503 calling GET /subscriptions/sub_x.'));
        const result = await ReadGatewaySubscription(subscription, md, user);
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('sub_x');
        expect(result.Reason).toContain('503');
        expect(result.State).toBeUndefined();
    });

    it('the driver says Success but names no State → Success false (an answer without a state cannot gate a cancel)', async () => {
        describeSub.mockResolvedValue({ Success: true, CurrentPeriodStart: new Date('2026-12-31T06:00:00Z') });
        const result = await ReadGatewaySubscription(subscription, md, user);
        expect(result).toEqual({ Success: false, Reason: "the gateway's answer for sub_x named no state" });
    });
});
