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

const mocks = vi.hoisted(() => ({
    loadConfig: vi.fn(),
    buildDriver: vi.fn(),
    openAlerts: vi.fn(),
}));

vi.mock('../PaymentProviderResolver.js', () => ({
    LoadPaymentProviderConfig: (...args: unknown[]) => mocks.loadConfig(...args),
    BuildPaymentProvider: (...args: unknown[]) => mocks.buildDriver(...args),
}));
vi.mock('../checkoutCaptureAlert.js', () => ({
    OpenProviderSubscriptionAlerts: (...args: unknown[]) => mocks.openAlerts(...args),
}));

import {
    BusinessToday,
    CANCEL_BLOCKING_ALERT_CODES,
    CancelAtGateway,
    CancelBlockingAlerts,
    GatewayCancelIdempotencyKey,
    GatewayCancelPreview,
    PlanGatewayCancel,
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
        mocks.openAlerts.mockReset();
    });

    it("SUB-000110 has GatewayFault + ChargedAtCreation open beside NoCard and PriceMismatch: only the two blocking codes; SUB-000111's alert is ignored", async () => {
        mocks.openAlerts.mockResolvedValue(
            new Map([
                ['SUB-000110', new Set(['NoCard', 'GatewayFault', 'PriceMismatch', 'ChargedAtCreation'])],
                ['SUB-000111', new Set(['NotRecorded'])],
            ]),
        );
        expect(await CancelBlockingAlerts('SUB-000110', user, md)).toEqual(['GatewayFault', 'ChargedAtCreation']);
        expect(mocks.openAlerts).toHaveBeenCalledWith(user, md);
    });

    it('every blocking code is returned; only non-blocking codes, or another subscription, return none', async () => {
        mocks.openAlerts.mockResolvedValue(
            new Map([
                ['SUB-000110', new Set(['NotRecorded', 'GatewayFault', 'LinkedElsewhere', 'AmbiguousAtGateway', 'ChargedAtCreation'])],
                ['SUB-000112', new Set(['NoCard', 'PriceMismatch'])],
            ]),
        );
        expect(await CancelBlockingAlerts('SUB-000110', user, md)).toEqual(['NotRecorded', 'GatewayFault', 'LinkedElsewhere', 'AmbiguousAtGateway', 'ChargedAtCreation']);
        expect(await CancelBlockingAlerts('SUB-000112', user, md)).toEqual([]);
        expect(await CancelBlockingAlerts('SUB-000999', user, md)).toEqual([]);
        expect([...CANCEL_BLOCKING_ALERT_CODES]).toEqual(['NotRecorded', 'GatewayFault', 'LinkedElsewhere', 'AmbiguousAtGateway', 'ChargedAtCreation']);
    });
});
