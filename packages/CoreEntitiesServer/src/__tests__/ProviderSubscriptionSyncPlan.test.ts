/**
 * PlanProviderSubscriptionSync (E3 + E4 + E6): what Orders does to agree with a gateway subscription. Pure:
 * every census row (design E3E4.md §2.1) is driven here in both directions, with Jane's SUB-000110 as the
 * running example (Chicago; term 1 ends 30 Oct 2027; Stripe charges at 00:00 Central = 05:00 UTC that day).
 */
import { describe, expect, it } from 'vitest';
import type { GatewaySubscriptionInvoice } from '../BasePaymentProvider.js';
import {
    CoverageEndsAt,
    PlanProviderSubscriptionSync,
    RETRY_ACCESS_CAP_DAYS,
    type SyncGatewayFacts,
    type SyncOrdersFacts,
    type SyncStep,
} from '../ProviderSubscriptionSyncPlan.js';

const ZONE = 'America/Chicago';
const NOW = new Date('2027-10-30T12:00:00.000Z');
/** 00:00 Central on the term's last day, when Stripe charges Jane's renewal. */
const CHARGE_AT = new Date('2027-10-30T05:00:00.000Z');
/** The end of the coverage Orders sold: 00:00 Central the day after the last day (CDT ends 7 Nov). */
const COVERAGE_ENDS = new Date('2027-10-31T05:00:00.000Z');

function orders(over: Partial<SyncOrdersFacts> = {}): SyncOrdersFacts {
    return {
        SubscriptionNumber: 'SUB-000110',
        Status: 'Active',
        AutoRenew: true,
        LatestTermEnd: '2027-10-30',
        Zone: ZONE,
        CurrencyCode: 'USD',
        CapturedIntentIDs: new Set(),
        UncapturedIntentIDs: new Set(),
        BookedZeroInvoiceIDs: new Set(),
        RecordedFailures: new Set(),
        LastGatewayPriceID: null,
        LastGatewayQuantity: null,
        LastUnitPrice: 599,
        GrantsValidTo: COVERAGE_ENDS,
        ...over,
    };
}

function invoice(over: Partial<GatewaySubscriptionInvoice> = {}): GatewaySubscriptionInvoice {
    return {
        ProviderInvoiceID: 'in_renew',
        Status: 'paid',
        BillingReason: 'subscription_cycle',
        AmountPaid: 599,
        AmountDue: 599,
        Tax: 0,
        CurrencyCode: 'USD',
        ProviderIntentID: 'pi_renew',
        ProviderChargeID: 'ch_renew',
        CreatedAt: CHARGE_AT,
        PaidAt: CHARGE_AT,
        PaidOutOfBand: false,
        Discounted: false,
        AttemptCount: 1,
        NextAttemptAt: null,
        ProviderPriceID: 'price_pro',
        Quantity: 1,
        ...over,
    };
}

function gateway(sub: Partial<SyncGatewayFacts['Subscription']> = {}, invoices: GatewaySubscriptionInvoice[] = []): SyncGatewayFacts {
    return {
        Subscription: {
            State: 'Renewing',
            Status: 'active',
            CurrentPeriodStart: CHARGE_AT,
            CurrentPeriodEnd: new Date('2028-10-30T05:00:00.000Z'),
            EndsAt: null,
            EndedAt: null,
            ProviderPriceID: 'price_pro',
            Quantity: 1,
            ...sub,
        },
        Invoices: invoices,
    };
}

const kinds = (steps: SyncStep[]) => steps.map((s) => (s.Kind === 'Notice' ? `Notice:${s.Code}` : s.Kind));
const plan = (o: SyncOrdersFacts, g: SyncGatewayFacts) => PlanProviderSubscriptionSync(o, g, NOW);

describe('CoverageEndsAt', () => {
    it('is 00:00 business time the day after the last day (Jane: 31 Oct 2027 05:00 UTC, CDT)', () => {
        expect(CoverageEndsAt('2027-10-30', ZONE)).toEqual(COVERAGE_ENDS);
    });
    it('follows the zone across DST: after 7 Nov, Chicago midnight is 06:00 UTC', () => {
        expect(CoverageEndsAt('2027-12-30', ZONE)).toEqual(new Date('2027-12-31T06:00:00.000Z'));
    });
    it('is null with no term', () => {
        expect(CoverageEndsAt(null, ZONE)).toBeNull();
    });
});

describe('S1/S4 a renewal the gateway was paid for', () => {
    it('books it once: BookRenewal for an unbooked paid subscription_cycle invoice', () => {
        const p = plan(orders(), gateway({}, [invoice()]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal']);
        expect(p.Differences.join(' ')).toMatch(/paid \$599\.00 for a renewal Orders has not booked/);
    });
    it('control: the same invoice already captured plans nothing (a duplicate or late event changes nothing)', () => {
        const p = plan(orders({ CapturedIntentIDs: new Set(['pi_renew']) }), gateway({}, [invoice()]));
        expect(p.Steps).toEqual([]);
        expect(p.Differences).toEqual([]);
    });
    it('recorded but not captured (a capture that failed earlier): FinishCapture, not a second booking', () => {
        const p = plan(orders({ UncapturedIntentIDs: new Set(['pi_renew']) }), gateway({}, [invoice()]));
        expect(kinds(p.Steps)).toEqual(['FinishCapture']);
    });
    it('two missed renewals are booked oldest first', () => {
        const older = invoice({ ProviderInvoiceID: 'in_1', ProviderIntentID: 'pi_1', ProviderChargeID: 'ch_1' });
        const newer = invoice({ ProviderInvoiceID: 'in_2', ProviderIntentID: 'pi_2', ProviderChargeID: 'ch_2' });
        const p = plan(orders(), gateway({}, [older, newer]));
        expect(p.Steps.map((s) => (s.Kind === 'BookRenewal' ? s.Invoice.ProviderInvoiceID : s.Kind))).toEqual(['in_1', 'in_2']);
    });
    it('an open (unpaid) renewal invoice is never booked', () => {
        const p = plan(orders(), gateway({ State: 'Collecting', Status: 'past_due' }, [invoice({ Status: 'open', AmountPaid: 0, AttemptCount: 0 })]));
        expect(kinds(p.Steps)).not.toContain('BookRenewal');
    });
    it('a void or uncollectible renewal invoice is never booked', () => {
        for (const status of ['void', 'uncollectible', 'draft']) {
            expect(kinds(plan(orders(), gateway({}, [invoice({ Status: status })])).Steps)).not.toContain('BookRenewal');
        }
    });
});

describe('S18 a $0 renewal (a 100% coupon)', () => {
    it('is booked (it has no intent; the invoice id identifies it)', () => {
        const p = plan(orders(), gateway({}, [invoice({ AmountPaid: 0, ProviderIntentID: null, ProviderChargeID: null, Discounted: true })]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal']);
    });
    it('control: once booked (its event names the invoice), nothing', () => {
        const p = plan(
            orders({ BookedZeroInvoiceIDs: new Set(['in_renew']) }),
            gateway({}, [invoice({ AmountPaid: 0, ProviderIntentID: null, ProviderChargeID: null, Discounted: true })]),
        );
        expect(p.Steps).toEqual([]);
    });
});

describe('park, never discard: a paid renewal Orders cannot book without a person', () => {
    it('S17 paid out of band → urgent RenewalNotBooked, nothing booked', () => {
        const p = plan(orders(), gateway({}, [invoice({ PaidOutOfBand: true })]));
        expect(kinds(p.Steps)).toEqual(['Notice:RenewalNotBooked']);
        expect(p.Steps[0]).toMatchObject({ Urgent: true });
        expect((p.Steps[0] as { Reason: string }).Reason).toMatch(/marked paid outside the gateway/);
    });
    it('another currency → RenewalNotBooked', () => {
        const p = plan(orders(), gateway({}, [invoice({ CurrencyCode: 'AUD' })]));
        expect(kinds(p.Steps)).toEqual(['Notice:RenewalNotBooked']);
        expect((p.Steps[0] as { Reason: string }).Reason).toMatch(/in AUD, not the company's USD/);
    });
    it('a paid invoice with no intent → RenewalNotBooked', () => {
        const p = plan(orders(), gateway({}, [invoice({ ProviderIntentID: null })]));
        expect(kinds(p.Steps)).toEqual(['Notice:RenewalNotBooked']);
    });
    it('control: the currency compares case-insensitively ("usd" is USD)', () => {
        expect(kinds(plan(orders(), gateway({}, [invoice({ CurrencyCode: 'usd' })])).Steps)).toEqual(['BookRenewal']);
    });
});

describe('S22 / S12 paid invoices that are not renewals', () => {
    it("S22 E2's first invoice (subscription_create) is never a renewal: no step, reported only", () => {
        const p = plan(orders(), gateway({}, [invoice({ BillingReason: 'subscription_create', AmountPaid: 599 })]));
        expect(p.Steps).toEqual([]);
        expect(p.Differences[0]).toMatch(/at creation/);
    });
    it("S22 control: a $0 subscription_create (E2's normal case) reports nothing", () => {
        const p = plan(orders(), gateway({}, [invoice({ BillingReason: 'subscription_create', AmountPaid: 0, ProviderIntentID: null })]));
        expect(p).toEqual({ Steps: [], Differences: [] });
    });
    it('S12 a proration (subscription_update) → GatewayPlanChanged, never booked as a renewal', () => {
        const p = plan(orders(), gateway({}, [invoice({ BillingReason: 'subscription_update', AmountPaid: 120 })]));
        expect(kinds(p.Steps)).toEqual(['Notice:GatewayPlanChanged']);
    });
    it('a one-off (manual) invoice → GatewayChargeNotBooked', () => {
        const p = plan(orders(), gateway({}, [invoice({ BillingReason: 'manual', AmountPaid: 50 })]));
        expect(kinds(p.Steps)).toEqual(['Notice:GatewayChargeNotBooked']);
    });
});

describe('Q3 notices on a booked renewal: booked as charged, a person told when unusual', () => {
    it('below the last term with no coupon → RenewalAmountUnusual (and still booked)', () => {
        const p = plan(orders({ LastUnitPrice: 599 }), gateway({}, [invoice({ AmountPaid: 399 })]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal', 'Notice:RenewalAmountUnusual']);
    });
    it("control: Sam's $399 forever coupon (Discounted) is booked with no notice", () => {
        const p = plan(orders({ LastUnitPrice: 399 }), gateway({}, [invoice({ AmountPaid: 399, Discounted: true })]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal']);
    });
    it('control: the same price as last term raises nothing', () => {
        expect(kinds(plan(orders({ LastUnitPrice: 599 }), gateway({}, [invoice()])).Steps)).toEqual(['BookRenewal']);
    });
    it('tax on the invoice → booked net, with a notice', () => {
        const p = plan(orders(), gateway({}, [invoice({ AmountPaid: 647.92, Tax: 48.92 })]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal', 'Notice:RenewalAmountUnusual']);
        expect((p.Steps[1] as { Reason: string }).Reason).toMatch(/\$48\.92 of tax/);
    });
    it('S12 the gateway now bills another price than the last booked renewal → GatewayPlanChanged (product kept)', () => {
        const p = plan(orders({ LastGatewayPriceID: 'price_pro' }), gateway({ ProviderPriceID: 'price_exec' }, [invoice({ ProviderPriceID: 'price_exec' })]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal', 'Notice:GatewayPlanChanged']);
        expect((p.Steps[1] as { Reason: string }).Reason).toMatch(/kept the subscription's product/);
    });
    it('S12 another quantity → GatewayPlanChanged', () => {
        const p = plan(orders({ LastGatewayPriceID: 'price_pro', LastGatewayQuantity: 1 }), gateway({}, [invoice({ Quantity: 3, AmountPaid: 1797 })]));
        expect(kinds(p.Steps)).toContain('Notice:GatewayPlanChanged');
    });
    it("control: the first gateway renewal (no earlier price on record) raises no plan change: the import's prices differ by design", () => {
        const p = plan(orders({ LastGatewayPriceID: null }), gateway({ ProviderPriceID: 'price_foundation_399' }, [invoice({ ProviderPriceID: 'price_foundation_399', AmountPaid: 399, Discounted: true })]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal']);
    });
});

describe('S2/S3/S16 failed attempts, and Q4: access kept while the gateway retries', () => {
    const open = (over: Partial<GatewaySubscriptionInvoice> = {}) =>
        invoice({ Status: 'open', AmountPaid: 0, AttemptCount: 2, NextAttemptAt: new Date('2027-11-03T05:00:00.000Z'), ...over });
    it('records each attempt not yet recorded, once', () => {
        const p = plan(orders(), gateway({ State: 'Collecting', Status: 'past_due' }, [open()]));
        expect(p.Steps.filter((s) => s.Kind === 'RecordFailure').map((s) => (s as { Attempt: number }).Attempt)).toEqual([1, 2]);
    });
    it('control: attempts already recorded are not recorded again', () => {
        const p = plan(orders({ RecordedFailures: new Set(['in_renew#1', 'in_renew#2']) }), gateway({ State: 'Collecting', Status: 'past_due' }, [open()]));
        expect(kinds(p.Steps)).not.toContain('RecordFailure');
    });
    it('Q4 keeps access to the end of the business day of the next attempt (3 Nov → 4 Nov 05:00 UTC, CDT)', () => {
        const p = plan(orders(), gateway({ State: 'Collecting', Status: 'past_due' }, [open()]));
        const extend = p.Steps.find((s) => s.Kind === 'ExtendAccess') as { Until: Date };
        expect(extend.Until).toEqual(new Date('2027-11-04T05:00:00.000Z'));
    });
    it('Q4 control: never shortens: grants already reaching past it plan no extension', () => {
        const p = plan(orders({ GrantsValidTo: new Date('2027-11-10T06:00:00.000Z') }), gateway({ State: 'Collecting', Status: 'past_due' }, [open()]));
        expect(kinds(p.Steps)).not.toContain('ExtendAccess');
    });
    it(`Q4 is capped at ${RETRY_ACCESS_CAP_DAYS} days past the coverage Orders sold`, () => {
        const p = plan(orders(), gateway({ State: 'Collecting', Status: 'past_due' }, [open({ NextAttemptAt: new Date('2028-06-01T05:00:00.000Z') })]));
        const extend = p.Steps.find((s) => s.Kind === 'ExtendAccess') as { Until: Date };
        // 30 Oct 2027 + 1 + 45 days = 15 Dec 2027, 00:00 Central = 06:00 UTC (CST).
        expect(extend.Until).toEqual(new Date('2027-12-15T06:00:00.000Z'));
    });
    it('Q4 control: no next attempt (the gateway stopped trying) keeps nothing', () => {
        const p = plan(orders(), gateway({ State: 'Collecting', Status: 'past_due' }, [open({ NextAttemptAt: null })]));
        expect(kinds(p.Steps)).not.toContain('ExtendAccess');
    });
    it('Q4 control: only while the gateway is collecting (a renewing subscription with an old open invoice keeps nothing)', () => {
        const p = plan(orders(), gateway({ State: 'Renewing' }, [open()]));
        expect(kinds(p.Steps)).not.toContain('ExtendAccess');
    });
    it('S4 the retry succeeds: the paid invoice books, and no failure is re-recorded', () => {
        const p = plan(
            orders({ RecordedFailures: new Set(['in_renew#1']) }),
            gateway({}, [invoice({ AttemptCount: 2, PaidAt: new Date('2027-11-03T05:00:00.000Z') })]),
        );
        expect(kinds(p.Steps)).toEqual(['BookRenewal']);
    });
    it('a failed proration or one-off invoice is not a renewal failure', () => {
        const p = plan(orders(), gateway({ State: 'Collecting' }, [open({ BillingReason: 'manual' })]));
        expect(kinds(p.Steps)).toEqual([]);
    });
});

describe('S6/S7/S8 cancel at period end, set or withdrawn at the gateway', () => {
    const ending = { State: 'Ending' as const, EndsAt: new Date('2028-10-30T05:00:00.000Z') };
    it('S6 Ending while Orders renews → AutoRenew off with the end', () => {
        const p = plan(orders(), gateway(ending));
        expect(p.Steps).toEqual([{ Kind: 'SetAutoRenew', On: false, EndsAt: ending.EndsAt }]);
    });
    it('S6 control: already off (or Orders cancelled it itself) → nothing', () => {
        expect(plan(orders({ AutoRenew: false }), gateway(ending)).Steps).toEqual([]);
        expect(plan(orders({ Status: 'Canceled', AutoRenew: false }), gateway(ending)).Steps).toEqual([]);
    });
    it('S7 withdrawn: renewing again while Orders shows AutoRenew off → back on', () => {
        expect(plan(orders({ AutoRenew: false }), gateway()).Steps).toEqual([{ Kind: 'SetAutoRenew', On: true, EndsAt: null }]);
    });
    it('S7 withdrawn after Orders cancelled it (Q-N1): no write, RenewingAtGateway for support', () => {
        const p = plan(orders({ Status: 'Canceled', AutoRenew: false }), gateway());
        expect(kinds(p.Steps)).toEqual(['Notice:RenewingAtGateway']);
    });
    it('S8 the gateway ends before the coverage Orders sold → GatewayEndsBeforeCoverage (and AutoRenew off)', () => {
        const p = plan(orders(), gateway({ State: 'Ending', EndsAt: new Date('2027-09-01T05:00:00.000Z') }));
        expect(kinds(p.Steps)).toEqual(['SetAutoRenew', 'Notice:GatewayEndsBeforeCoverage']);
    });
    it('S8 control: ending exactly at the coverage end (E2 anchor, end of term) raises nothing extra', () => {
        const p = plan(orders(), gateway({ State: 'Ending', EndsAt: COVERAGE_ENDS }));
        expect(kinds(p.Steps)).toEqual(['SetAutoRenew']);
    });
    it("S8 control: a routine portal cancel ends at the anchor (00:00 on the last day, inside the covered day): no notice", () => {
        // Jane's E2 subscription set to end at period end ends at its anchor, CHARGE_AT. That is inside the
        // last covered day, so it is not 'before coverage' (found writing this test: the first rule compared
        // with the END of the coverage and raised a false notice on every portal cancel).
        const p = plan(orders(), gateway({ State: 'Ending', EndsAt: CHARGE_AT }));
        expect(kinds(p.Steps)).toEqual(['SetAutoRenew']);
    });
    it('S8 a second before the last day starts is before coverage', () => {
        const p = plan(orders(), gateway({ State: 'Ending', EndsAt: new Date(CHARGE_AT.getTime() - 2000) }));
        expect(kinds(p.Steps)).toEqual(['SetAutoRenew', 'Notice:GatewayEndsBeforeCoverage']);
    });
});

describe('S5/S9/S10 the gateway ended it', () => {
    it('S9 ended mid-term (cancelled now in the dashboard) → FinishCancel Immediate on the business day it ended', () => {
        const p = plan(orders(), gateway({ State: 'Ended', Status: 'canceled', EndedAt: new Date('2027-03-03T18:00:00.000Z') }));
        expect(p.Steps).toEqual([{ Kind: 'FinishCancel', Timing: 'Immediate', RequestDay: '2027-03-03' }]);
    });
    it('S10/S5 ended after the coverage (at period end, or after retries) → FinishCancel EndOfTerm', () => {
        const p = plan(orders(), gateway({ State: 'Ended', Status: 'canceled', EndedAt: new Date('2027-11-20T06:00:00.000Z') }));
        expect(p.Steps).toEqual([{ Kind: 'FinishCancel', Timing: 'EndOfTerm', RequestDay: '2027-11-20' }]);
    });
    it('S10 ended at its period end, the anchor (00:00 Central on the last day) → EndOfTerm, not Immediate', () => {
        const p = plan(orders(), gateway({ State: 'Ended', Status: 'canceled', EndedAt: CHARGE_AT }));
        expect(p.Steps).toEqual([{ Kind: 'FinishCancel', Timing: 'EndOfTerm', RequestDay: '2027-10-30' }]);
    });
    it('the business day, not the UTC day: ended 02:00 UTC on 4 Mar is still 3 Mar in Chicago', () => {
        const p = plan(orders(), gateway({ State: 'Ended', Status: 'canceled', EndedAt: new Date('2027-03-04T02:00:00.000Z') }));
        expect(p.Steps[0]).toMatchObject({ RequestDay: '2027-03-03' });
    });
    it('control: Orders already shows it cancelled (or expired) → nothing', () => {
        expect(plan(orders({ Status: 'Canceled' }), gateway({ State: 'Ended', Status: 'canceled', EndedAt: CHARGE_AT })).Steps).toEqual([]);
        expect(plan(orders({ Status: 'Expired' }), gateway({ State: 'Ended', Status: 'canceled', EndedAt: CHARGE_AT })).Steps).toEqual([]);
    });
    it('S9 a renewal charged that morning, then the subscription cancelled: book first, then the cancel', () => {
        const p = plan(orders(), gateway({ State: 'Ended', Status: 'canceled', EndedAt: new Date('2027-10-30T15:00:00.000Z') }, [invoice()]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal', 'FinishCancel']);
    });
    it('no EndedAt from the gateway: the run time is used', () => {
        const p = plan(orders(), gateway({ State: 'Ended', Status: 'canceled', EndedAt: null }));
        expect(p.Steps[0]).toMatchObject({ Kind: 'FinishCancel', RequestDay: '2027-10-30' });
    });
});

describe('S11 / Q5 the gateway renews a subscription Orders cancelled', () => {
    it('books it (reactivating the same subscription) and tells support', () => {
        const p = plan(orders({ Status: 'Canceled', AutoRenew: false }), gateway({}, [invoice()]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal', 'Notice:ReactivatedByGateway']);
    });
    it('no RenewingAtGateway on top: the booking already brings it back', () => {
        const p = plan(orders({ Status: 'Canceled', AutoRenew: false }), gateway({}, [invoice()]));
        expect(kinds(p.Steps)).not.toContain('Notice:RenewingAtGateway');
    });
    it('charged and then ended the same day: booked, then cancelled again', () => {
        const p = plan(orders({ Status: 'Canceled', AutoRenew: false }), gateway({ State: 'Ended', Status: 'canceled', EndedAt: new Date('2027-10-30T15:00:00.000Z') }, [invoice()]));
        expect(kinds(p.Steps)).toEqual(['BookRenewal', 'Notice:ReactivatedByGateway', 'FinishCancel']);
    });
});

describe('E6 nothing silent; in line means in line', () => {
    it('Orders and the gateway agree → no steps and no differences', () => {
        expect(plan(orders(), gateway())).toEqual({ Steps: [], Differences: [] });
    });
    it('every step comes with a difference in words', () => {
        const p = plan(orders({ AutoRenew: false }), gateway({}, [invoice()]));
        expect(p.Differences.length).toBeGreaterThanOrEqual(2);
    });
    it('a paused Orders subscription is left to a person (no automatic writes for an Ending gateway subscription)', () => {
        expect(plan(orders({ Status: 'Paused' }), gateway({ State: 'Ending', EndsAt: COVERAGE_ENDS })).Steps).toEqual([]);
    });
});
