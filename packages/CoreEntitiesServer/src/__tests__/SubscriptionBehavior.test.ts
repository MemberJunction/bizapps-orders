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
import { SubscriptionBehavior, ResolveSubscriptionTypeID, ResolveRevenueRecognitionTypeID, SubscriptionTypeRulesFrom, type SubscriptionTypeRules } from '../SubscriptionBehavior.js';

/** Baseline rules; each test overrides only what it is about. */
function rules(overrides: Partial<SubscriptionTypeRules> = {}): SubscriptionTypeRules {
    return {
        ID: 'st-1',
        Code: 'Test',
        SubscriberScope: 'Either',
        BenefitModel: 'Holder',
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

const ORG = 'org-1';
const PERSON = 'person-1';

const decide = (r: SubscriptionTypeRules, purchase: Date, amount = 1200, extra = {}) =>
    new SubscriptionBehavior().Decide({
        Rules: r,
        PurchaseDate: purchase,
        Amount: amount,
        // Both sides present by default; individual tests narrow it.
        Subscriber: { OrganizationID: ORG, PersonID: PERSON },
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
    it('rejects an organization-only type when no organization was resolved', () => {
        const decision = decide(rules({ SubscriberScope: 'Organization' }), new Date('2026-07-01T00:00:00Z'), 1200, {
            Subscriber: { PersonID: PERSON },
        });
        expect(decision.Action).toBe('Reject');
        expect(decision.RejectReason).toMatch(/organization-only/i);
    });

    it('rejects an individual-only type when no person was resolved', () => {
        const decision = decide(rules({ SubscriberScope: 'Person' }), new Date('2026-07-01T00:00:00Z'), 1200, {
            Subscriber: { OrganizationID: ORG },
        });
        expect(decision.Action).toBe('Reject');
        expect(decision.RejectReason).toMatch(/individual-only/i);
    });

    it('rejects when neither side resolved at all', () => {
        const decision = decide(rules(), new Date('2026-07-01T00:00:00Z'), 1200, { Subscriber: {} });
        expect(decision.Action).toBe('Reject');
        expect(decision.RejectReason).toMatch(/needs a subscriber/i);
    });
});

describe('benefit model (D62)', () => {
    const behavior = new SubscriptionBehavior();

    it('an Organization-benefit type must be held by an organization', () => {
        const decision = decide(
            rules({ BenefitModel: 'Organization', SubscriberScope: 'Organization' }),
            new Date('2026-07-01T00:00:00Z'),
            1200,
            { Subscriber: { PersonID: PERSON } },
        );
        expect(decision.Action).toBe('Reject');
    });

    it('a seat needs BOTH an organization and a named person', () => {
        const seat = rules({ BenefitModel: 'Individual', SubscriberScope: 'Organization' });
        const missingPerson = decide(seat, new Date('2026-07-01T00:00:00Z'), 300, {
            Subscriber: { OrganizationID: ORG },
        });
        expect(missingPerson.Action).toBe('Reject');
        expect(missingPerson.RejectReason).toMatch(/benefits a named person/i);

        const complete = decide(seat, new Date('2026-07-01T00:00:00Z'), 300);
        expect(complete.Action).toBe('CreateNew');
    });

    describe('dedupe identity — what counts as the same subscription', () => {
        const subscriber = { OrganizationID: ORG, PersonID: PERSON };

        it('Organization keys on the ORG, ignoring the person', () => {
            // A trade association: the company holds one membership however many employees benefit,
            // so naming a person must not create a second.
            expect(behavior.DedupeIdentity(rules({ BenefitModel: 'Organization' }), subscriber))
                .toEqual({ OrganizationID: ORG, PersonID: null });
        });

        it('Individual keys on the PAIR, so seats never collide', () => {
            // This is what makes ten seats for ten staff ten subscriptions rather than ten
            // collisions under RejectDuplicate.
            expect(behavior.DedupeIdentity(rules({ BenefitModel: 'Individual' }), subscriber))
                .toEqual({ OrganizationID: ORG, PersonID: PERSON });
        });

        it('Holder keys on whichever side actually holds it', () => {
            // A person with no org holds it themselves; anything with an org is org-held. This is
            // the value that lets a SubscriberScope='Either' type work at all — collapsing it into
            // `Individual` would make it demand a named person and break org purchases (22 checks
            // failed proving exactly that).
            expect(behavior.DedupeIdentity(rules(), { PersonID: PERSON }))
                .toEqual({ OrganizationID: null, PersonID: PERSON });
            expect(behavior.DedupeIdentity(rules(), { OrganizationID: ORG }))
                .toEqual({ OrganizationID: ORG, PersonID: null });
        });
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

describe('cancellation policy', () => {
    /** A term running the full 2026 calendar year at 1200 — Amith's example case. */
    const term = {
        StartDate: new Date('2026-01-01T00:00:00Z'),
        EndDate: new Date('2026-12-31T00:00:00Z'),
        Amount: 1200,
        TermNumber: 1,
    };

    const cancelWith = (r: Partial<SubscriptionTypeRules>, request: string) =>
        new SubscriptionBehavior().DecideCancellation({
            Rules: rules(r),
            RequestDate: new Date(`${request}T00:00:00Z`),
            Term: term,
        });

    describe('when coverage ends (CancellationMode)', () => {
        it('Immediate ends coverage on the request date', () => {
            const d = cancelWith({ CancellationMode: 'Immediate' }, '2026-07-01');
            expect(iso(d.EffectiveDate)).toBe('2026-07-01');
        });

        it('EndOfTerm rides the term out', () => {
            const d = cancelWith({ CancellationMode: 'EndOfTerm' }, '2026-07-01');
            expect(iso(d.EffectiveDate)).toBe('2026-12-31');
            // The customer received everything they paid for — that is not a cancelled term.
            expect(d.TermStatus).toBe('Completed');
        });

        it('EndOfBillingPeriod ends at the close of the cycle the request falls in', () => {
            // Monthly cycles counted from the term start: cancelling Mar 20 runs to Mar 31.
            const d = cancelWith(
                { CancellationMode: 'EndOfBillingPeriod', BillingCadence: 'Monthly' },
                '2026-03-20',
            );
            expect(iso(d.EffectiveDate)).toBe('2026-03-31');
        });

        it('never ends coverage outside the term, however odd the request', () => {
            const early = cancelWith({ CancellationMode: 'Immediate' }, '2025-06-01');
            expect(iso(early.EffectiveDate)).toBe('2026-01-01');
            const late = cancelWith({ CancellationMode: 'Immediate' }, '2028-06-01');
            expect(iso(late.EffectiveDate)).toBe('2026-12-31');
        });
    });

    describe('what comes back (CancellationRefundMode)', () => {
        it('NoRefund reverses nothing, whenever it is asked', () => {
            const d = cancelWith({ CancellationMode: 'Immediate', CancellationRefundMode: 'NoRefund' }, '2026-02-01');
            expect(d.RefundAmount).toBe(0);
            expect(d.ReversalFraction).toBe(0);
            expect(d.Explanation).toMatch(/does not refund/i);
        });

        it('ProrateUnused refunds the unused remainder — the half-year case', () => {
            // Amith's example: 1/1–12/31 cancelled on 7/1 should come out near a half.
            const d = cancelWith(
                { CancellationMode: 'Immediate', CancellationRefundMode: 'ProrateUnused' },
                '2026-07-01',
            );
            expect(d.ReversalFraction).toBeCloseTo(0.5, 2);
            expect(d.RefundAmount).toBeCloseTo(1200 * d.ReversalFraction, 2);
            expect(d.TermStatus).toBe('Canceled');
        });

        it('rounds the reversal to the order line’s own 4dp scale', () => {
            const d = cancelWith(
                { CancellationMode: 'Immediate', CancellationRefundMode: 'ProrateUnused' },
                '2026-08-13',
            );
            // More precision than DECIMAL(18,4) would be truncated on insert, and the line total
            // recomputed from the truncated value would no longer match the stored one.
            expect(d.ReversalFraction).toBe(Math.round(d.ReversalFraction * 1e4) / 1e4);
            expect(d.RefundAmount).toBeCloseTo(1200 * d.ReversalFraction, 2);
        });

        it('FullRefundWithinWindow refunds everything inside the window and nothing outside it', () => {
            const r = {
                CancellationMode: 'Immediate' as const,
                CancellationRefundMode: 'FullRefundWithinWindow' as const,
                CancellationWindowDays: 14,
            };
            const inside = cancelWith(r, '2026-01-10');
            expect(inside.RefundAmount).toBe(1200);
            expect(inside.ReversalFraction).toBe(1);
            expect(inside.Explanation).toMatch(/within the 14-day refund window/i);

            const outside = cancelWith(r, '2026-02-10');
            expect(outside.RefundAmount).toBe(0);
            expect(outside.Explanation).toMatch(/past the 14-day refund window/i);
        });

        it('never refunds more than the term cost', () => {
            for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
                const d = cancelWith(
                    { CancellationMode: 'Immediate', CancellationRefundMode: 'ProrateUnused' },
                    day,
                );
                expect(d.RefundAmount, day).toBeLessThanOrEqual(1200);
                expect(d.RefundAmount, day).toBeGreaterThanOrEqual(0);
            }
        });

        it('yields no refund when EndOfTerm leaves nothing unused — a contradictory pairing', () => {
            // Worth pinning: `EndOfTerm` + `ProrateUnused` is configuration that cannot pay out,
            // because coverage running to the term end leaves no unused period to prorate.
            const d = cancelWith(
                { CancellationMode: 'EndOfTerm', CancellationRefundMode: 'ProrateUnused' },
                '2026-07-01',
            );
            expect(d.RefundAmount).toBe(0);
            expect(d.Explanation).toMatch(/no unused period/i);
        });
    });

    describe('grace', () => {
        it('extends ACCESS past the revenue cut-off, not the term', () => {
            const d = cancelWith({ CancellationMode: 'Immediate', GracePeriodDays: 30 }, '2026-07-01');
            expect(iso(d.EffectiveDate)).toBe('2026-07-01');
            expect(iso(d.AccessThroughDate)).toBe('2026-07-31');
        });

        it('collapses to the effective date when there is no grace', () => {
            const d = cancelWith({ CancellationMode: 'Immediate', GracePeriodDays: 0 }, '2026-07-01');
            expect(iso(d.AccessThroughDate)).toBe(iso(d.EffectiveDate));
        });
    });
});

describe('ResolveSubscriptionTypeID', () => {
    it('uses the product override when set', () => {
        expect(ResolveSubscriptionTypeID('prod-st', 'type-default')).toBe('prod-st');
    });

    it('inherits the product type default when the product left it blank', () => {
        expect(ResolveSubscriptionTypeID(null, 'type-default')).toBe('type-default');
        expect(ResolveSubscriptionTypeID('', 'type-default')).toBe('type-default');
        expect(ResolveSubscriptionTypeID('  ', 'C5E1A870-9B24-4D63-8E17-5A6B7C8D9E01')).toBe(
            'C5E1A870-9B24-4D63-8E17-5A6B7C8D9E01',
        );
    });

    it('is not a subscription when neither the product nor the type names one', () => {
        expect(ResolveSubscriptionTypeID(null, null)).toBeNull();
        expect(ResolveSubscriptionTypeID(undefined, '')).toBeNull();
    });
});

describe('ResolveRevenueRecognitionTypeID', () => {
    it('prefers the product override', () => {
        expect(ResolveRevenueRecognitionTypeID('prod-rr', 'type-default')).toBe('prod-rr');
    });
    it('falls back to the product-type default', () => {
        expect(ResolveRevenueRecognitionTypeID(null, 'type-default')).toBe('type-default');
        expect(ResolveRevenueRecognitionTypeID('', 'EvenOverTime-id')).toBe('EvenOverTime-id');
    });
    it('is null when neither is set', () => {
        expect(ResolveRevenueRecognitionTypeID(null, null)).toBeNull();
        expect(ResolveRevenueRecognitionTypeID(undefined, '')).toBeNull();
    });
});

describe('SubscriptionTypeRulesFrom', () => {
    it('fills numeric defaults so a cache row is safe to Decide()', () => {
        const mapped = SubscriptionTypeRulesFrom({
            ID: 'st-1',
            Code: 'AnnualRolling',
            SubscriberScope: 'Either',
            BenefitModel: 'Holder',
            StartMode: 'Immediate',
            BillingCadence: 'Annual',
            RecognitionCadence: 'Monthly',
            ConcurrencyMode: 'ExtendExisting',
            ReactivationMode: 'AlwaysCreateNew',
            CancellationMode: 'EndOfTerm',
            CancellationRefundMode: 'NoRefund',
            TrialDays: null as unknown as number,
            AutoRenewDefault: true,
            RenewalLeadDays: 90,
            GracePeriodDays: null as unknown as number,
        });
        expect(mapped.TrialDays).toBe(0);
        expect(mapped.GracePeriodDays).toBe(0);
        expect(mapped.DefaultTermMonths).toBeNull();
    });
});
