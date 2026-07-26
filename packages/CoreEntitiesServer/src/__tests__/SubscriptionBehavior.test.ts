/**
 * SubscriptionBehavior — term arithmetic.
 *
 * The engine is pure, so the interesting cases are cheap to pin here rather than through a live
 * confirm. The first block is a REGRESSION GUARD: these cases produced an EndDate BEFORE the
 * StartDate until the date math moved to UTC, and the only symptom was a CHECK constraint violation
 * deep inside a booking transaction. They fail on any machine west of Greenwich if the arithmetic
 * ever drifts back to local-time construction.
 */
import { describe, expect, it } from 'vitest';
import { SubscriptionBehavior, type SubscriptionTypeRules } from '../SubscriptionBehavior.js';

/** Baseline rules; each test overrides only what it is about. */
function rules(overrides: Partial<SubscriptionTypeRules> = {}): SubscriptionTypeRules {
    return {
        ID: 'st-1',
        Code: 'Test',
        SubscriberScope: 'Either',
        StartMode: 'Immediate',
        DefaultTermMonths: 12,
        BillingCadence: 'Annual',
        RecognitionCadence: 'Monthly',
        TrialDays: 0,
        ConcurrencyMode: 'ExtendExisting',
        ReactivationMode: 'AlwaysCreateNew',
        AutoRenewDefault: true,
        RenewalLeadDays: 30,
        CancellationMode: 'EndOfTerm',
        CancellationRefundMode: 'NoRefund',
        GracePeriodDays: 0,
        ...overrides,
    };
}

const decide = (r: SubscriptionTypeRules, purchase: Date, amount = 1200, extra = {}) =>
    new SubscriptionBehavior().Decide({
        Rules: r,
        PurchaseDate: purchase,
        Amount: amount,
        SubscriberIsOrganization: true,
        ...extra,
    });

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('term dates are timezone-independent', () => {
    // `OrderDate` round-trips through SQL Server as UTC midnight. Building the anchor with
    // `new Date(y, m, d)` yields LOCAL midnight, which in any negative-offset zone is EARLIER —
    // enough for "next anchor" to resolve to the same day as the purchase and for
    // `EndDate = anchor - 1 day` to land before the start.
    const anchored = rules({
        StartMode: 'CalendarAnchored',
        AnchorMonth: 7,
        AnchorDay: 1,
        PartialPeriodMode: 'ChargeFull',
    });

    it('buying ON the anchor date yields a full forward term, not a negative-length one', () => {
        const term = decide(anchored, new Date('2026-07-01T00:00:00Z')).Term!;
        expect(iso(term.StartDate)).toBe('2026-07-01');
        expect(iso(term.EndDate)).toBe('2027-06-30');
        expect(term.EndDate.getTime()).toBeGreaterThan(term.StartDate.getTime());
    });

    it('produces the same term whatever time of day the purchase carries', () => {
        const atMidnight = decide(anchored, new Date('2026-09-15T00:00:00Z')).Term!;
        const lateEvening = decide(anchored, new Date('2026-09-15T23:30:00Z')).Term!;
        expect(iso(lateEvening.StartDate)).toBe(iso(atMidnight.StartDate));
        expect(iso(lateEvening.EndDate)).toBe(iso(atMidnight.EndDate));
    });

    it('never produces a term that ends before it starts, at any anchor offset', () => {
        for (let dayOffset = 0; dayOffset < 366; dayOffset += 7) {
            const purchase = new Date(Date.UTC(2026, 0, 1 + dayOffset));
            const term = decide(anchored, purchase).Term!;
            expect(term.EndDate.getTime(), `purchase ${iso(purchase)}`).toBeGreaterThanOrEqual(
                term.StartDate.getTime(),
            );
        }
    });
});

describe('start and end dates follow the type', () => {
    it('Immediate runs from the purchase date for DefaultTermMonths, inclusive', () => {
        const term = decide(rules(), new Date('2026-07-01T00:00:00Z')).Term!;
        expect(iso(term.StartDate)).toBe('2026-07-01');
        expect(iso(term.EndDate)).toBe('2027-06-30');
    });

    it('Deferred pushes the start out by DeferredStartDays', () => {
        const term = decide(
            rules({ StartMode: 'Deferred', DeferredStartDays: 30 }),
            new Date('2026-07-01T00:00:00Z'),
        ).Term!;
        expect(iso(term.StartDate)).toBe('2026-07-31');
    });

    it('a calendar anchor truncates the first term to the day before the anchor', () => {
        const term = decide(
            rules({ StartMode: 'CalendarAnchored', AnchorMonth: 1, AnchorDay: 1, PartialPeriodMode: 'Prorate' }),
            new Date('2026-07-01T00:00:00Z'),
        ).Term!;
        expect(iso(term.StartDate)).toBe('2026-07-01');
        expect(iso(term.EndDate)).toBe('2026-12-31');
    });

    it('ExtendToNextAnchor waits for the anchor instead of truncating', () => {
        const term = decide(
            rules({
                StartMode: 'CalendarAnchored',
                AnchorMonth: 1,
                AnchorDay: 1,
                PartialPeriodMode: 'ExtendToNextAnchor',
            }),
            new Date('2026-07-01T00:00:00Z'),
        ).Term!;
        expect(iso(term.StartDate)).toBe('2027-01-01');
        expect(iso(term.EndDate)).toBe('2027-12-31');
    });

    it('clamps a month-end start rather than overflowing into the next month', () => {
        const term = decide(rules({ DefaultTermMonths: 1 }), new Date('2026-01-31T00:00:00Z')).Term!;
        expect(iso(term.EndDate)).toBe('2026-02-27'); // Feb 28 minus one, inclusive
    });
});

describe('proration', () => {
    const prorated = rules({
        StartMode: 'CalendarAnchored',
        AnchorMonth: 1,
        AnchorDay: 1,
        PartialPeriodMode: 'Prorate',
    });

    it('reduces the amount by the fraction of the year covered', () => {
        const term = decide(prorated, new Date('2026-07-01T00:00:00Z')).Term!;
        expect(term.IsProrated).toBe(true);
        expect(term.ProrationFactor).toBeCloseTo(184 / 365, 5);
        expect(term.Amount).toBeCloseTo(1200 * (184 / 365), 2);
    });

    it('ChargeFull covers the same partial window at full price', () => {
        const term = decide(
            { ...prorated, PartialPeriodMode: 'ChargeFull' },
            new Date('2026-07-01T00:00:00Z'),
        ).Term!;
        expect(term.IsProrated).toBe(false);
        expect(term.Amount).toBe(1200);
        expect(iso(term.EndDate)).toBe('2026-12-31'); // same window — only the price differs
    });

    it('does not prorate a purchase that already lands on the anchor', () => {
        const term = decide(prorated, new Date('2026-01-01T00:00:00Z')).Term!;
        expect(term.IsProrated).toBe(false);
        expect(term.Amount).toBe(1200);
    });
});

describe('concurrency and reactivation', () => {
    const active = { ID: 'sub-1', Status: 'Active', LatestTermEnd: new Date('2027-06-30T00:00:00Z'), LatestTermNumber: 1 };

    it('ExtendExisting appends a contiguous term with no gap or overlap', () => {
        const decision = decide(rules(), new Date('2026-09-01T00:00:00Z'), 1200, { Existing: active });
        expect(decision.Action).toBe('ExtendExisting');
        expect(decision.SubscriptionID).toBe('sub-1');
        expect(iso(decision.Term!.StartDate)).toBe('2027-07-01'); // the day after the current term
        expect(decision.Term!.TermNumber).toBe(2);
        expect(decision.Term!.IsProrated).toBe(false); // an extension is never partial
    });

    it('AllowMultiple creates a second subscription instead of extending', () => {
        const decision = decide(rules({ ConcurrencyMode: 'AllowMultiple' }), new Date('2026-09-01T00:00:00Z'), 1200, {
            Existing: active,
        });
        expect(decision.Action).toBe('CreateNew');
        expect(decision.SubscriptionID).toBeUndefined();
    });

    it('RejectDuplicate refuses while one is active, and says why', () => {
        const decision = decide(rules({ ConcurrencyMode: 'RejectDuplicate' }), new Date('2026-09-01T00:00:00Z'), 1200, {
            Existing: active,
        });
        expect(decision.Action).toBe('Reject');
        expect(decision.RejectReason).toMatch(/second concurrent subscription/i);
        expect(decision.Term).toBeUndefined();
    });

    it('ReactivateWithinWindow reactivates inside the window and creates new outside it', () => {
        const lapsed = { ID: 'sub-1', Status: 'Canceled', LatestTermEnd: new Date('2026-06-30T00:00:00Z'), LatestTermNumber: 3 };
        const r = rules({ ReactivationMode: 'ReactivateWithinWindow', ReactivationWindowDays: 90 });

        expect(decide(r, new Date('2026-08-01T00:00:00Z'), 1200, { Existing: lapsed }).Action).toBe('Reactivate');
        expect(decide(r, new Date('2026-12-01T00:00:00Z'), 1200, { Existing: lapsed }).Action).toBe('CreateNew');
    });
});

describe('subscriber scope', () => {
    it('rejects an individual buyer for an organization-only type', () => {
        const decision = new SubscriptionBehavior().Decide({
            Rules: rules({ SubscriberScope: 'Organization' }),
            PurchaseDate: new Date('2026-07-01T00:00:00Z'),
            Amount: 1200,
            SubscriberIsOrganization: false,
        });
        expect(decision.Action).toBe('Reject');
        expect(decision.RejectReason).toMatch(/organization-only/i);
    });

    it('rejects an organization buyer for an individual-only type', () => {
        const decision = decide(rules({ SubscriberScope: 'Person' }), new Date('2026-07-01T00:00:00Z'));
        expect(decision.Action).toBe('Reject');
        expect(decision.RejectReason).toMatch(/individual-only/i);
    });
});

describe('recognition cadence', () => {
    const months = (r: Partial<SubscriptionTypeRules>) => new SubscriptionBehavior().RecognitionMonths(rules(r));

    it('maps each cadence to its slice length', () => {
        expect(months({ RecognitionCadence: 'Monthly' })).toBe(1);
        expect(months({ RecognitionCadence: 'Quarterly' })).toBe(3);
        expect(months({ RecognitionCadence: 'Annual' })).toBe(12);
    });

    it('MatchBilling follows the billing cadence', () => {
        expect(months({ RecognitionCadence: 'MatchBilling', BillingCadence: 'Quarterly' })).toBe(3);
        expect(months({ RecognitionCadence: 'MatchBilling', BillingCadence: 'Monthly' })).toBe(1);
    });
});
