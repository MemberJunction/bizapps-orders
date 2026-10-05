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
import {
    SubscriptionBehavior,
    ResolveSubscriptionTypeID,
    ResolveRevenueRecognitionTypeID,
    SubscriptionTypeRulesFrom,
    OverlappingCoverage,
    type CoverageOverlap,
    type SubscriptionTypeRules,
} from '../SubscriptionBehavior.js';

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
const OTHER_PERSON = 'person-2';

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

/**
 * A TERM START STATED ON THE LINE (D-TERMSTART).
 *
 * The booking date and the start of coverage are different facts. An order booked 8/27 can sell a
 * membership that everyone agreed runs 8/1–7/31, and until the line could state that, the term was
 * forced onto the order date and recognition began in the wrong month.
 *
 * These cases are the engine half of that rule. What they collectively pin is that the stated date
 * passes through UNCHANGED — no `StartMode` shifts it, no time-of-day drifts it, and no later
 * change to the order date moves it — while the END stays the type's to compute.
 */
describe('a stated term start (D-TERMSTART)', () => {
    const BOOKED = new Date('2026-08-27T00:00:00Z');

    it('starts the term on the stated date, with the term length measured from there', () => {
        const term = decide(rules(), BOOKED, 1200, {
            RequestedStartDate: new Date('2026-08-01T00:00:00Z'),
        }).Term!;
        expect(iso(term.StartDate)).toBe('2026-08-01');
        expect(iso(term.EndDate)).toBe('2027-07-31');
    });

    it('honors a start in the FUTURE just as readily as one in the past', () => {
        // Both directions matter and only one is obvious. Deferring coverage to next month is the
        // ordinary case for an agreement signed late in August.
        const term = decide(rules(), BOOKED, 1200, {
            RequestedStartDate: new Date('2026-09-01T00:00:00Z'),
        }).Term!;
        expect(iso(term.StartDate)).toBe('2026-09-01');
        expect(iso(term.EndDate)).toBe('2027-08-31');
    });

    it('derives the start from the purchase date when the line states none', () => {
        // The regression pin for every order that never touches the field: absent a stated start,
        // nothing about the old behaviour may change.
        const term = decide(rules(), BOOKED).Term!;
        expect(iso(term.StartDate)).toBe('2026-08-27');
        expect(iso(term.EndDate)).toBe('2027-08-26');
    });

    it('yields the same term whatever the purchase date, once a start is stated', () => {
        // The engine-level half of "an explicit term start stops following the order date". The
        // other half is that nothing re-derives the column on save, so the two together are what
        // make the date stick.
        const requested = { RequestedStartDate: new Date('2026-08-01T00:00:00Z') };
        const booked = decide(rules(), BOOKED, 1200, requested).Term!;
        const rebooked = decide(rules(), new Date('2026-11-15T00:00:00Z'), 1200, requested).Term!;
        expect(iso(rebooked.StartDate)).toBe(iso(booked.StartDate));
        expect(iso(rebooked.EndDate)).toBe(iso(booked.EndDate));
    });

    it('takes the stated date as given rather than re-applying DeferredStartDays', () => {
        // `DeferredStartDays` answers "how long after the sale does coverage begin", which has
        // nothing left to say once someone names the date. Adding 30 days to a stated 8/1 would
        // produce a term start nobody asked for and no screen explains.
        const term = decide(rules({ StartMode: 'Deferred', DeferredStartDays: 30 }), BOOKED, 1200, {
            RequestedStartDate: new Date('2026-08-01T00:00:00Z'),
        }).Term!;
        expect(iso(term.StartDate)).toBe('2026-08-01');
    });

    it('normalizes a stated start carrying a time of day, so it cannot drift a day', () => {
        // Same hazard `utcDay` exists for: a stated start is a calendar date, and leaving it
        // un-snapped lets a local-vs-UTC midnight put the term on the wrong day.
        const term = decide(rules(), BOOKED, 1200, {
            RequestedStartDate: new Date('2026-08-01T23:30:00Z'),
        }).Term!;
        expect(iso(term.StartDate)).toBe('2026-08-01');
    });

    it('lets the anchor govern the end while honoring the stated start', () => {
        // CalendarAnchored keeps its whole purpose — everyone renews together — because the anchor
        // still decides where the first term ends. The stated start only decides where it begins,
        // so a 9/1 start on a 1/1 anchor is a partial first period and prorates like any other
        // mid-cycle join.
        const decision = decide(
            rules({ StartMode: 'CalendarAnchored', AnchorMonth: 1, AnchorDay: 1, PartialPeriodMode: 'Prorate' }),
            BOOKED,
            1200,
            { RequestedStartDate: new Date('2026-09-01T00:00:00Z') },
        );
        const term = decision.Term!;
        expect(iso(term.StartDate)).toBe('2026-09-01');
        expect(iso(term.EndDate)).toBe('2026-12-31');
        expect(term.IsProrated).toBe(true);
        expect(term.ProrationFactor).toBe(0.334247); // 122 of 365 days
        expect(term.Amount).toBe(401.1);
    });

    it('reports rather than honors a stated start on an extension', () => {
        // Coverage may neither overlap nor gap, so an extension has to begin the day after the
        // current term ends. Refusing the order would block a legitimate renewal over a field the
        // customer never sees; the flag is how the dropped date stays traceable.
        const active = { ID: 'sub-1', Status: 'Active', LatestTermEnd: new Date('2027-06-30T00:00:00Z'), LatestTermNumber: 1 };
        const decision = decide(rules(), BOOKED, 1200, {
            Existing: active,
            RequestedStartDate: new Date('2026-08-01T00:00:00Z'),
        });
        expect(decision.Action).toBe('ExtendExisting');
        expect(iso(decision.Term!.StartDate)).toBe('2027-07-01');
        expect(decision.StartOverrideIgnored).toBe(true);
    });

    it('reports nothing when the stated start already IS the continuation date', () => {
        // The likeliest thing a diligent order taker types on a renewal is the right date. The
        // rule and the request agree, so there is no discrepancy — reporting one would read "the
        // term start 2027-07-01 was not used ... the term begins 2027-07-01", and a warning that
        // fires on the normal case is a warning everyone learns to skim past.
        const active = { ID: 'sub-1', Status: 'Active', LatestTermEnd: new Date('2027-06-30T00:00:00Z'), LatestTermNumber: 1 };
        const decision = decide(rules(), BOOKED, 1200, {
            Existing: active,
            RequestedStartDate: new Date('2027-07-01T00:00:00Z'),
        });
        expect(decision.Action).toBe('ExtendExisting');
        expect(iso(decision.Term!.StartDate)).toBe('2027-07-01');
        expect(decision.StartOverrideIgnored).toBe(false);
    });

    it('reports nothing when an extension had no stated start to drop', () => {
        const active = { ID: 'sub-1', Status: 'Active', LatestTermEnd: new Date('2027-06-30T00:00:00Z'), LatestTermNumber: 1 };
        const decision = decide(rules(), BOOKED, 1200, { Existing: active });
        expect(decision.Action).toBe('ExtendExisting');
        expect(decision.StartOverrideIgnored).toBe(false);
    });

    it('honors a stated start on a fresh subscription for a lapsed subscriber', () => {
        // Reactivation has no coverage to continue from, so there is nothing to displace the
        // stated date — this is the case that would regress if the override were keyed on the
        // ACTION rather than on whether prior coverage actually supplied the start.
        const lapsed = { ID: 'sub-1', Status: 'Canceled', LatestTermEnd: new Date('2026-06-30T00:00:00Z'), LatestTermNumber: 3 };
        const decision = decide(rules({ ReactivationMode: 'ReactivateExisting' }), BOOKED, 1200, {
            Existing: lapsed,
            RequestedStartDate: new Date('2026-09-01T00:00:00Z'),
        });
        expect(decision.Action).toBe('Reactivate');
        expect(iso(decision.Term!.StartDate)).toBe('2026-09-01');
        expect(decision.StartOverrideIgnored).toBe(false);
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

        it('Holder keeps a resolved person, so two people at one org are two subscriptions', () => {
            // The org is usually inferred from the buyer's employer. Keyed on the org alone, a
            // coworker's purchase would extend this person's subscription.
            expect(behavior.DedupeIdentity(rules(), subscriber)).toEqual({ OrganizationID: ORG, PersonID: PERSON });
            expect(behavior.DedupeIdentity(rules(), { OrganizationID: ORG, PersonID: OTHER_PERSON }))
                .not.toEqual(behavior.DedupeIdentity(rules(), subscriber));
        });
    });

    describe('dedupe match — how a stored subscription is found (#317)', () => {
        const subscriber = { OrganizationID: ORG, PersonID: PERSON };

        it('Organization matches the org whatever person the stored subscription carries', () => {
            // A subscription stores the contact the order named. Requiring it to be empty missed
            // every org-held subscription bought with one, so a re-order booked a second.
            expect(behavior.DedupeMatch(rules({ BenefitModel: 'Organization' }), subscriber))
                .toEqual({ OrganizationID: ORG, PersonID: 'Any' });
        });

        it('Holder held by an org with no person resolved matches the org whatever person is stored', () => {
            expect(behavior.DedupeMatch(rules(), { OrganizationID: ORG })).toEqual({ OrganizationID: ORG, PersonID: 'Any' });
        });

        it('Holder with a resolved person matches only that person at that org', () => {
            // A coworker at the same org must not find, and extend, this person's subscription.
            expect(behavior.DedupeMatch(rules(), subscriber)).toEqual({ OrganizationID: ORG, PersonID: PERSON });
        });

        it('Holder held by a person matches only a personal subscription, never an org-held one', () => {
            expect(behavior.DedupeMatch(rules(), { PersonID: PERSON })).toEqual({ OrganizationID: null, PersonID: PERSON });
        });

        it('Individual matches the exact pair, so seats for different people stay distinct', () => {
            expect(behavior.DedupeMatch(rules({ BenefitModel: 'Individual' }), subscriber))
                .toEqual({ OrganizationID: ORG, PersonID: PERSON });
            expect(behavior.DedupeMatch(rules({ BenefitModel: 'Individual' }), { PersonID: PERSON }))
                .toEqual({ OrganizationID: null, PersonID: PERSON });
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

    describe('a later term that never started (#406)', () => {
        const renewal = {
            StartDate: new Date('2027-01-01T00:00:00Z'),
            EndDate: new Date('2027-12-31T00:00:00Z'),
            Amount: 1300,
            TermNumber: 2,
        };
        const laterWith = (r: Partial<SubscriptionTypeRules>) =>
            new SubscriptionBehavior().DecideLaterTermCancellation({
                Rules: rules(r),
                Term: renewal,
                CoverageEndsDate: new Date('2026-12-31T00:00:00Z'),
            });

        it.each([
            ['NoRefund', { CancellationRefundMode: 'NoRefund' as const }],
            ['ProrateUnused', { CancellationRefundMode: 'ProrateUnused' as const }],
            ['an expired refund window', { CancellationRefundMode: 'FullRefundWithinWindow' as const, CancellationWindowDays: 0 }],
        ])('is canceled and reversed in full under %s', (_name, r) => {
            const d = laterWith(r);
            expect(d.RefundAmount).toBe(1300);
            expect(d.ReversalFraction).toBe(1);
            expect(d.TermStatus).toBe('Canceled');
            expect(iso(d.EffectiveDate)).toBe('2027-01-01');
            expect(d.Explanation).toMatch(/Term 2 starts 2027-01-01, after coverage ends 2026-12-31/);
        });

        it('reverses nothing when the term charged nothing', () => {
            const d = new SubscriptionBehavior().DecideLaterTermCancellation({
                Rules: rules(),
                Term: { ...renewal, Amount: 0 },
                CoverageEndsDate: new Date('2026-12-31T00:00:00Z'),
            });
            expect(d.ReversalFraction).toBe(0);
            expect(d.TermStatus).toBe('Canceled');
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

describe('coverage overlap with another band of the family (golive #276)', () => {
    const day = (s: string) => new Date(`${s}T00:00:00Z`);
    const existing: CoverageOverlap = {
        SubscriptionID: 'sub-1',
        SubscriptionNumber: 'SUB-000001',
        ProductName: 'Tier Two',
        CoverageStart: day('2026-09-26'),
        CoverageEnd: day('2027-09-25'),
        CoveredThrough: day('2028-09-25'),
        ConcurrencyMode: 'AllowMultiple',
        SubscriptionTypeCode: 'OTHER',
    };
    const overlapFor = (mode: SubscriptionTypeRules['ConcurrencyMode'], acknowledged: boolean, overlaps = [existing]) =>
        new SubscriptionBehavior().DecideCoverageOverlap({
            Rules: rules({ ConcurrencyMode: mode }),
            Family: 'Tiered (TIERED)',
            ProductName: 'Tier One',
            Overlaps: overlaps,
            Acknowledged: acknowledged,
        });

    it('does nothing when nothing overlaps, whatever the mode', () => {
        for (const mode of ['AllowMultiple', 'ExtendExisting', 'RejectDuplicate'] as const) {
            expect(overlapFor(mode, false, [])).toEqual({ Outcome: 'None', Message: null });
        }
    });

    it('refuses an unacknowledged overlap under ExtendExisting, naming the coverage and the way out', () => {
        const d = overlapFor('ExtendExisting', false);
        expect(d.Outcome).toBe('NeedsAck');
        expect(d.Message).toContain('SUB-000001 (Tier Two, 2026-09-26 to 2027-09-25)');
        expect(d.Message).toContain('family Tiered (TIERED)');
        expect(d.Message).toContain('Start this band after 2028-09-25, or mark the line to run alongside it.');
        expect(d.Message).not.toContain('Cancel');
    });

    it('tells a refused line to start after the latest coverage end', () => {
        const later = { ...existing, SubscriptionID: 'sub-2', SubscriptionNumber: 'SUB-000002', CoveredThrough: day('2029-01-31') };
        const d = overlapFor('RejectDuplicate', false, [existing, later]);
        expect(d.Message).toContain('Start this band after 2029-01-31.');
        expect(d.Message).not.toContain('Cancel');
    });

    describe('the stricter of the two bands\' types applies', () => {
        const withMode = (mode: SubscriptionTypeRules['ConcurrencyMode']) => ({ ...existing, ConcurrencyMode: mode, SubscriptionTypeCode: `T-${mode}` });

        it('refuses when the held band is RejectDuplicate and the ordered band allows it', () => {
            const d = overlapFor('AllowMultiple', true, [withMode('RejectDuplicate')]);
            expect(d.Outcome).toBe('Refused');
            expect(d.Message).toContain('Subscription type T-RejectDuplicate does not allow');
        });

        it('needs an acknowledgment when the held band is ExtendExisting and the ordered band allows it', () => {
            expect(overlapFor('AllowMultiple', false, [withMode('ExtendExisting')]).Outcome).toBe('NeedsAck');
            expect(overlapFor('AllowMultiple', true, [withMode('ExtendExisting')]).Outcome).toBe('Acknowledged');
        });

        it('gives the same answer whichever band is ordered', () => {
            const aThenB = overlapFor('ExtendExisting', false, [withMode('AllowMultiple')]).Outcome;
            const bThenA = overlapFor('AllowMultiple', false, [withMode('ExtendExisting')]).Outcome;
            expect(aThenB).toBe('NeedsAck');
            expect(bThenA).toBe(aThenB);
        });

        it('names the line\'s own type when both are equally strict', () => {
            const d = overlapFor('RejectDuplicate', false, [withMode('RejectDuplicate')]);
            expect(d.Message).toContain('Subscription type Test does not allow');
        });

        it('allows it only when every band allows it', () => {
            expect(overlapFor('AllowMultiple', false, [withMode('AllowMultiple')]).Outcome).toBe('Allowed');
        });
    });

    it('lets an acknowledged overlap through under ExtendExisting', () => {
        expect(overlapFor('ExtendExisting', true).Outcome).toBe('Acknowledged');
    });

    it('refuses under RejectDuplicate even when the line acknowledges it', () => {
        expect(overlapFor('RejectDuplicate', true).Outcome).toBe('Refused');
        expect(overlapFor('RejectDuplicate', false).Outcome).toBe('Refused');
    });

    it('allows it under AllowMultiple and says both will be billed', () => {
        const d = overlapFor('AllowMultiple', false);
        expect(d.Outcome).toBe('Allowed');
        expect(d.Message).toContain('both will be billed');
    });

    it('names a sibling line of the same order when there is no subscription yet', () => {
        const d = overlapFor('ExtendExisting', false, [{ ...existing, SubscriptionID: null, SubscriptionNumber: null }]);
        expect(d.Message).toContain('another line of this order (Tier Two');
    });

    describe('OverlappingCoverage', () => {
        const term = (id: string | null, start: string, end: string) => ({
            SubscriptionID: id,
            SubscriptionNumber: id ? `N-${id}` : null,
            ProductName: 'Tier Two',
            StartDate: day(start),
            EndDate: day(end),
            ConcurrencyMode: 'ExtendExisting' as const,
            SubscriptionTypeCode: 'STD',
        });

        it('clips each overlap to the new term', () => {
            const out = OverlappingCoverage([term('a', '2026-01-01', '2026-12-31')], day('2026-07-01'), day('2027-06-30'));
            expect(out).toHaveLength(1);
            expect(iso(out[0].CoverageStart)).toBe('2026-07-01');
            expect(iso(out[0].CoverageEnd)).toBe('2026-12-31');
            expect(out[0].ConcurrencyMode).toBe('ExtendExisting');
        });

        it('reports coverage through the last term, including terms after the new one', () => {
            const out = OverlappingCoverage(
                [term('a', '2026-09-26', '2027-09-25'), term('a', '2027-09-26', '2028-09-25')],
                day('2026-10-01'),
                day('2027-03-31'),
            );
            expect(out).toHaveLength(1);
            expect(iso(out[0].CoverageEnd)).toBe('2027-03-31');
            expect(iso(out[0].CoveredThrough)).toBe('2028-09-25');
        });

        it('does not report a subscription whose only terms fall after the new one', () => {
            expect(OverlappingCoverage([term('a', '2028-01-01', '2028-12-31')], day('2026-07-01'), day('2027-06-30'))).toEqual([]);
        });

        it('treats a term ending the day before as contiguous, not overlapping', () => {
            expect(OverlappingCoverage([term('a', '2025-07-01', '2026-06-30')], day('2026-07-01'), day('2027-06-30'))).toEqual([]);
        });

        it('counts a single shared day as an overlap', () => {
            expect(OverlappingCoverage([term('a', '2025-07-01', '2026-07-01')], day('2026-07-01'), day('2027-06-30'))).toHaveLength(1);
        });

        it('merges several terms of one subscription into one window', () => {
            const out = OverlappingCoverage(
                [term('a', '2026-09-26', '2027-09-25'), term('a', '2027-09-26', '2028-09-25')],
                day('2026-09-26'),
                day('2029-09-25'),
            );
            expect(out).toHaveLength(1);
            expect(iso(out[0].CoverageStart)).toBe('2026-09-26');
            expect(iso(out[0].CoverageEnd)).toBe('2028-09-25');
        });

        it('keeps separate subscriptions and separate sibling lines apart', () => {
            const out = OverlappingCoverage(
                [term('a', '2026-01-01', '2026-12-31'), term('b', '2026-01-01', '2026-12-31'), term(null, '2026-01-01', '2026-12-31'), term(null, '2026-01-01', '2026-12-31')],
                day('2026-06-01'),
                day('2026-06-30'),
            );
            expect(out).toHaveLength(4);
        });
    });
});

describe("the line's own choice when the subscriber already holds the product (golive #299)", () => {
    // The reported case: the customer holds the product through 9/30/2027 and orders it again with
    // a 10/1/2026 start. Under ExtendExisting that became term 2, starting 10/1/2027.
    const PURCHASE = new Date('2026-09-29T00:00:00Z');
    const STATED = new Date('2026-10-01T00:00:00Z');
    const active = { ID: 'sub-1', Status: 'Active', LatestTermEnd: new Date('2027-09-30T00:00:00Z'), LatestTermNumber: 1 };

    it('starts a separate subscription on the stated dates when the line asks for one', () => {
        const decision = decide(rules(), PURCHASE, 1200, {
            Existing: active,
            RequestedStartDate: STATED,
            RequestedAction: 'CreateNew',
        });
        expect(decision.Action).toBe('CreateNew');
        expect(decision.SubscriptionID).toBeUndefined();
        expect(iso(decision.Term!.StartDate)).toBe('2026-10-01');
        expect(iso(decision.Term!.EndDate)).toBe('2027-09-30');
        // Term 1 of the NEW subscription, not term 2 of the one the subscriber already holds.
        expect(decision.Term!.TermNumber).toBe(1);
        expect(decision.StartOverrideIgnored).toBe(false);
    });

    it('still extends when the line asks to extend, and reports the displaced start', () => {
        const decision = decide(rules(), PURCHASE, 1200, {
            Existing: active,
            RequestedStartDate: STATED,
            RequestedAction: 'ExtendExisting',
        });
        expect(decision.Action).toBe('ExtendExisting');
        expect(decision.SubscriptionID).toBe('sub-1');
        expect(iso(decision.Term!.StartDate)).toBe('2027-10-01');
        expect(decision.StartOverrideIgnored).toBe(true);
    });

    it('extends under AllowMultiple when the line asks to', () => {
        const decision = decide(rules({ ConcurrencyMode: 'AllowMultiple' }), PURCHASE, 1200, {
            Existing: active,
            RequestedAction: 'ExtendExisting',
        });
        expect(decision.Action).toBe('ExtendExisting');
        expect(iso(decision.Term!.StartDate)).toBe('2027-10-01');
    });

    it('follows ConcurrencyMode when the line states no choice', () => {
        expect(decide(rules(), PURCHASE, 1200, { Existing: active, RequestedAction: null }).Action).toBe('ExtendExisting');
        expect(decide(rules({ ConcurrencyMode: 'AllowMultiple' }), PURCHASE, 1200, { Existing: active }).Action).toBe(
            'CreateNew',
        );
    });

    it('cannot override a type that rejects a second subscription, and says so', () => {
        const decision = decide(rules({ ConcurrencyMode: 'RejectDuplicate' }), PURCHASE, 1200, {
            Existing: active,
            RequestedAction: 'CreateNew',
        });
        expect(decision.Action).toBe('Reject');
        expect(decision.RejectReason).toMatch(/asks for a new subscription/);
    });

    it('extending is not a duplicate, so a RejectDuplicate type allows it', () => {
        const decision = decide(rules({ ConcurrencyMode: 'RejectDuplicate' }), PURCHASE, 1200, {
            Existing: active,
            RequestedAction: 'ExtendExisting',
        });
        expect(decision.Action).toBe('ExtendExisting');
    });

    it('ignores the choice on a renewal, which continues the subscription it names', () => {
        const decision = decide(rules(), PURCHASE, 1200, {
            Existing: active,
            IsRenewal: true,
            RequestedAction: 'CreateNew',
        });
        expect(decision.Action).toBe('ExtendExisting');
    });

    it('starts a new subscription for a lapsed holder when the line asks, whatever the reactivation policy', () => {
        const lapsed = { ...active, Status: 'Canceled' };
        const decision = decide(rules({ ReactivationMode: 'ReactivateExisting' }), PURCHASE, 1200, {
            Existing: lapsed,
            RequestedStartDate: STATED,
            RequestedAction: 'CreateNew',
        });
        expect(decision.Action).toBe('CreateNew');
        expect(iso(decision.Term!.StartDate)).toBe('2026-10-01');
    });

    it('leaves a lapsed holder to the reactivation policy when the line asks to extend', () => {
        const lapsed = { ...active, Status: 'Canceled' };
        const decision = decide(rules({ ReactivationMode: 'ReactivateExisting' }), PURCHASE, 1200, {
            Existing: lapsed,
            RequestedAction: 'ExtendExisting',
        });
        expect(decision.Action).toBe('Reactivate');
    });
});
