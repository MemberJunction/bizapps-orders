/**
 * Subscription behaviour — the rules engine over `SubscriptionType` (plan D45).
 *
 * PATTERN — deliberately DIFFERENT from RevenueRecognitionDriver (D43):
 *
 *   RevRec is BEHAVIOUR-first. The type row names a driver, and the driver computes everything,
 *   because "how is revenue earned over time" is genuinely an algorithm.
 *
 *   Subscriptions are DATA-first. Anchor dates, cadences, concurrency, grace windows are
 *   CONFIGURATION. So the `SubscriptionType` COLUMNS are the rules, this base class reads them and
 *   implements the standard flows, and `SubscriptionType.DriverClass` is NULLABLE. Supply a driver
 *   only when a customer needs something the columns cannot express — and it SUBCLASSES this class,
 *   inheriting every rule it does not override:
 *
 *       @RegisterClass(SubscriptionBehavior, 'AcmeCalendarYear')
 *       export class AcmeCalendarYear extends SubscriptionBehavior {
 *           protected override ComputeProration(...) { ... }   // everything else inherited
 *       }
 *
 * A driver-only model would have forced a class per permutation of anchor × cadence × concurrency.
 *
 * This class is PURE: it computes dates, amounts, and decisions. It never touches the database and
 * never opens a transaction — `OrderEntityServer` persists the results inside the booking
 * transaction, which keeps transaction management in one place (same discipline as the rev-rec
 * drivers).
 *
 * CONNECTS TO:
 *   TABLE:  __mj_BizAppsOrders.SubscriptionType
 *   CALLER: OrderEntityServer (term creation at confirm)
 */
import { RegisterClass } from '@memberjunction/global';

/** The rules row, as plain data. */
export interface SubscriptionTypeRules {
    ID: string;
    Code: string;
    DriverClass?: string | null;
    SubscriberScope: 'Organization' | 'Person' | 'Either';
    /**
     * WHO derives the benefit — a different question from who HOLDS it, which `SubscriberScope`
     * answers.
     *
     * `Holder` is NOT redundant with `Individual`, though it looks it: it means the benefit follows
     * whoever holds the subscription, which is what a `SubscriberScope='Either'` type needs. Forcing
     * those to `Individual` makes them demand a named person and breaks org purchases outright.
     */
    BenefitModel: 'Holder' | 'Individual' | 'Organization';
    StartMode: 'Immediate' | 'Deferred' | 'CalendarAnchored';
    DeferredStartDays?: number | null;
    AnchorMonth?: number | null;
    AnchorDay?: number | null;
    PartialPeriodMode?: 'Prorate' | 'ChargeFull' | 'ExtendToNextAnchor' | null;
    DefaultTermMonths?: number | null;
    BillingCadence: 'Monthly' | 'Quarterly' | 'Annual' | 'Custom';
    RecognitionCadence: 'Monthly' | 'Quarterly' | 'Annual' | 'MatchBilling';
    CustomCycleDays?: number | null;
    TrialDays: number;
    ConcurrencyMode: 'AllowMultiple' | 'ExtendExisting' | 'RejectDuplicate';
    ReactivationMode: 'ReactivateExisting' | 'AlwaysCreateNew' | 'ReactivateWithinWindow';
    ReactivationWindowDays?: number | null;
    AutoRenewDefault: boolean;
    RenewalLeadDays: number;
    CancellationMode: 'Immediate' | 'EndOfTerm' | 'EndOfBillingPeriod';
    CancellationRefundMode: 'NoRefund' | 'ProrateUnused' | 'FullRefundWithinWindow';
    CancellationWindowDays?: number | null;
    GracePeriodDays: number;
}

/** An existing subscription this purchase might attach to. */
export interface ExistingSubscription {
    ID: string;
    Status: string;
    /** Who holds it — an explicit renewal adopts these rather than re-resolving from the line. */
    HolderOrganizationID?: string | null;
    BeneficiaryPersonID?: string | null;
    /** End of the latest term, if any. */
    LatestTermEnd?: Date | null;
    LatestTermNumber?: number | null;
}

/** What the caller must do with this purchase. */
export interface SubscriptionDecision {
    Action: 'CreateNew' | 'ExtendExisting' | 'Reactivate' | 'Reject';
    SubscriptionID?: string;
    /** Term to create; absent only when Action = 'Reject'. */
    Term?: {
        StartDate: Date;
        EndDate: Date;
        TermNumber: number;
        IsProrated: boolean;
        ProrationFactor: number | null;
        /** Line amount × proration — what this term actually costs. */
        Amount: number;
    };
    /** Populated when Action = 'Reject'. */
    RejectReason?: string;
    /**
     * True when a `RequestedStartDate` was supplied and the term could not honor it, because an
     * extension continues existing coverage and must start the day after it ends.
     *
     * Reported rather than rejected: a renewal line carrying a stated start is a legitimate order
     * — often the same date the original term started — and refusing it would block the renewal
     * over a field the customer never sees. The caller surfaces this so the discrepancy is
     * visible instead of the date silently disappearing.
     */
    StartOverrideIgnored?: boolean;
}

/** The term being canceled, as plain data. */
export interface CancellableTerm {
    StartDate: Date;
    EndDate: Date;
    /** What was charged for this term — the ceiling on any refund. */
    Amount: number;
    TermNumber: number;
}

export interface CancellationContext {
    Rules: SubscriptionTypeRules;
    /** When the customer asked to cancel. */
    RequestDate: Date;
    /** The term whose window covers the request (or the latest one). */
    Term: CancellableTerm;
}

/**
 * What cancelling actually does. Like {@link SubscriptionDecision} this is COMPUTED ONLY — the
 * caller performs the reversal, updates the rows, and logs the event.
 */
export interface CancellationDecision {
    /** When coverage ends for revenue purposes. Never before the request, never after the term. */
    EffectiveDate: Date;
    /** When ACCESS ends. Equals EffectiveDate plus GracePeriodDays — grace extends access, not revenue. */
    AccessThroughDate: Date;
    /** What to give back. 0 under NoRefund, and never more than the term charged. */
    RefundAmount: number;
    /**
     * Fraction of the term to reverse — the reversal order line's quantity is the NEGATIVE of this
     * (plan D16). Derived from RefundAmount so the reversed revenue and the refunded cash always
     * agree; a term cancelled with no refund reverses nothing.
     */
    ReversalFraction: number;
    /**
     * `Canceled` when coverage is cut short, `Completed` when the customer simply declines renewal
     * and rides the term out — the difference matters for "why did this lapse" reporting.
     */
    TermStatus: 'Canceled' | 'Completed';
    /** Which rules produced this, in a sentence. Surfaced to the user, so it names the policy. */
    Explanation: string;
}

/**
 * The two roles a subscription has, which `SubscriberScope` alone could not express.
 *
 * A trade-association company membership has an organization and no person — every employee
 * benefits by virtue of the company holding it. An individual membership has a person. A corporate
 * seat has both: the org holds and pays, the person benefits.
 */
export interface SubscriberIdentity {
    OrganizationID?: string | null;
    PersonID?: string | null;
}

export interface SubscriptionPurchaseContext {
    Rules: SubscriptionTypeRules;
    /** Order date — when the purchase happened. */
    PurchaseDate: Date;
    /** The line's net amount before proration. */
    Amount: number;
    /** The active/most-recent subscription for (product, subscriber), if one exists. */
    Existing?: ExistingSubscription | null;
    /**
     * WHO this purchase is for, already resolved from the line's ship-to falling back to the
     * order header. Both sides may be present: a corporate seat is held by the org and benefits a
     * named person.
     */
    Subscriber: SubscriberIdentity;
    /**
     * True when this purchase is a RENEWAL of `Existing` rather than a fresh buy (D55).
     *
     * Renewals bypass `ConcurrencyMode` deliberately. That rule answers "may this subscriber hold a
     * SECOND concurrent subscription?" — and a renewal is not a second one, it is the same one
     * continuing. Without this, a `RejectDuplicate` type would refuse to renew itself: the engine
     * would find an active subscription, apply the concurrency rule, and reject its own renewal
     * order every cycle.
     */
    IsRenewal?: boolean;
    /**
     * A term start stated on the order line, which WINS over `StartMode` (D-TERMSTART).
     *
     * `PurchaseDate` answers "when was this sold" and must stay the order date — the booking
     * journal entry is dated from it. This answers the separate question "when does coverage
     * begin", which an agreement settles independently: an order booked 8/27 can sell a
     * membership running 8/1, 9/1 or 1/1. Deriving both from `OrderDate` conflated the two and
     * left the term start unsettable, so a mid-month sale of a term that everyone agreed starts
     * the 1st recognized revenue from the wrong month.
     *
     * Absent (the common case) the start is derived from `PurchaseDate` through the type's rules,
     * exactly as before. Present, it is taken AS GIVEN — including for `Deferred`, whose
     * `DeferredStartDays` answers "how long after the sale does coverage begin" and has nothing
     * left to say once someone names the date. `CalendarAnchored` also honors it; the anchor still
     * governs the END, so a stated start inside a partial period is prorated the same way any
     * other mid-cycle join is.
     *
     * An EXTENSION ignores it — see `Decide`.
     */
    RequestedStartDate?: Date | null;
}

function money(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Snap to UTC midnight — the ONLY safe basis for this arithmetic.
 *
 * Every date here is a calendar date, not an instant: `SubscriptionTerm.StartDate`/`EndDate` are
 * SQL `DATE` columns, and a term "starts July 1" regardless of who is looking. But `OrderDate`
 * round-trips through the database as UTC midnight while `new Date(y, m, d)` builds LOCAL midnight,
 * so mixing the two puts them hours apart. West of Greenwich that is enough to make a term END
 * BEFORE IT STARTS — a purchase on the anchor date resolves its "next anchor" to the SAME day it was
 * bought, and `EndDate = anchor − 1 day` lands before the start, violating CK_SubscriptionTerm_Dates.
 *
 * So: normalize at the boundary, and do all shifting in UTC.
 */
function utcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addMonths(d: Date, n: number): Date {
    const day = d.getUTCDate();
    const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, day));
    // Clamp: Jan 31 + 1 month is Feb 28/29, not Mar 2/3.
    if (shifted.getUTCDate() < day) shifted.setUTCDate(0);
    return shifted;
}

function addDays(d: Date, n: number): Date {
    return new Date(d.getTime() + n * 86400000);
}

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Calendar date for user-facing explanations. */
function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

@RegisterClass(SubscriptionBehavior, 'Default')
export class SubscriptionBehavior {
    /**
     * The one entry point: given the rules and what already exists, decide what to do and compute
     * the term. Override individual `protected` members below to customize a single aspect.
     */
    public Decide(rawContext: SubscriptionPurchaseContext): SubscriptionDecision {
        // Normalize once, here, so every protected method below is guaranteed a calendar date.
        const ctx: SubscriptionPurchaseContext = {
            ...rawContext,
            PurchaseDate: utcDay(rawContext.PurchaseDate),
            // Normalized on the SAME footing as PurchaseDate. A stated start arrives from a SQL
            // `DATE` column and is a calendar date, so leaving it un-snapped reintroduces exactly
            // the local-vs-UTC midnight drift the comment on `utcDay` describes — here it would
            // land a term start hours before the day it names and, on an anchored type, an end
            // before the start.
            RequestedStartDate: rawContext.RequestedStartDate ? utcDay(rawContext.RequestedStartDate) : null,
            Existing: rawContext.Existing
                ? { ...rawContext.Existing, LatestTermEnd: rawContext.Existing.LatestTermEnd ? utcDay(rawContext.Existing.LatestTermEnd) : null }
                : rawContext.Existing,
        };

        const scopeError = this.ValidateSubscriberScope(ctx);
        if (scopeError) {
            return { Action: 'Reject', RejectReason: scopeError };
        }

        const action = this.ChooseAction(ctx);
        if (action === 'Reject') {
            return {
                Action: 'Reject',
                RejectReason:
                    `This subscription type (${ctx.Rules.Code}) does not allow a second concurrent ` +
                    `subscription for the same subscriber, and an active one already exists.`,
            };
        }

        // An extension starts where the existing coverage ends — never overlapping it. That rule
        // outranks a stated start: honoring one here would either overlap the term still running
        // or leave a gap in coverage the customer has already been sold.
        const extending = action === 'ExtendExisting';
        const existingCoverageEnd = extending ? (ctx.Existing?.LatestTermEnd ?? null) : null;
        const start = existingCoverageEnd
            ? addDays(existingCoverageEnd, 1)
            : utcDay(this.ComputeStartDate(ctx));

        const end = this.ComputeEndDate(ctx, start, extending);
        const { isProrated, factor } = this.ComputeProration(ctx, start, end, extending);

        return {
            Action: action,
            SubscriptionID: action === 'CreateNew' ? undefined : ctx.Existing?.ID,
            // Only when a start was actually stated AND existing coverage displaced it. An
            // extension with no prior term end still runs the ordinary start rules, so it honors
            // the stated date and has nothing to report.
            StartOverrideIgnored: !!ctx.RequestedStartDate && existingCoverageEnd !== null,
            Term: {
                StartDate: start,
                EndDate: end,
                TermNumber: (ctx.Existing?.LatestTermNumber ?? 0) + 1,
                IsProrated: isProrated,
                ProrationFactor: isProrated ? factor : null,
                Amount: money(ctx.Amount * (isProrated ? factor : 1)),
            },
        };
    }

    // ─── Overridable pieces ────────────────────────────────────────────────────

    protected ValidateSubscriberScope(ctx: SubscriptionPurchaseContext): string | null {
        const { SubscriberScope, BenefitModel, Code } = ctx.Rules;
        const org = ctx.Subscriber.OrganizationID;
        const person = ctx.Subscriber.PersonID;

        if (!org && !person) {
            return (
                `Subscription type ${Code} needs a subscriber, but neither a ship-to organization nor ` +
                `a ship-to person is set on the order line, and the order header names no customer.`
            );
        }

        if (SubscriberScope === 'Organization' && !org) {
            return `Subscription type ${Code} is organization-only, but no organization was resolved for this line.`;
        }
        if (SubscriberScope === 'Person' && !person) {
            return `Subscription type ${Code} is individual-only, but no person was resolved for this line.`;
        }

        // The benefit model is the stricter of the two rules, so it is checked second.
        if (BenefitModel === 'Organization' && !org) {
            return (
                `Subscription type ${Code} benefits an organization's members, so it must be held by ` +
                `an organization — none was resolved for this line, the order's ship-to, or its customer.`
            );
        }
        // `Holder` needs no extra check: SubscriberScope already guaranteed a holder exists, and
        // the benefit simply follows them.
        if (BenefitModel === 'Individual' && !person) {
            // Note WHERE this can be satisfied from. The person is NOT required on the line: it
            // falls back to the order's ship-to and then its customer, so a bulk order for one
            // recipient states them once on the header. The failure only fires when no person is
            // resolvable ANYWHERE, which genuinely leaves nobody to benefit.
            return (
                `Subscription type ${Code} benefits a named person, but none was resolved from the ` +
                `line's ship-to, the order's ship-to, or the order's customer.`
            );
        }

        return null;
    }

    /**
     * The identity a duplicate is judged against — the heart of the concurrency rule.
     *
     * `Organization` keys on the ORG alone: a company holds ONE membership however many
     * employees benefit, so a second purchase extends it. `Individual` keys on the PAIR, so
     * ten seats bought for ten staff on one order are ten distinct subscriptions rather than ten
     * collisions with each other. Getting this wrong is what made a bulk seat purchase impossible.
     */
    public DedupeIdentity(rules: SubscriptionTypeRules, subscriber: SubscriberIdentity): SubscriberIdentity {
        switch (rules.BenefitModel) {
            case 'Holder':
                // Key on whichever side holds it, so a personal membership dedupes by person and an
                // org-held one by org — without either leaking into the other's identity.
                return subscriber.PersonID && !subscriber.OrganizationID
                    ? { OrganizationID: null, PersonID: subscriber.PersonID }
                    : { OrganizationID: subscriber.OrganizationID ?? null, PersonID: null };
            case 'Organization':
                // The org holds ONE, however many of its people benefit — so a second purchase
                // extends rather than duplicating.
                return { OrganizationID: subscriber.OrganizationID, PersonID: null };
            case 'Individual':
                // Both sides as resolved. For a seat that is (org, person), so ten staff are ten
                // subscriptions. For a personal membership the org is simply absent, leaving the
                // person as the key.
                return { OrganizationID: subscriber.OrganizationID ?? null, PersonID: subscriber.PersonID };
        }
    }

    protected ChooseAction(ctx: SubscriptionPurchaseContext): SubscriptionDecision['Action'] {
        const existing = ctx.Existing;
        if (!existing) return 'CreateNew';

        // A renewal continues THIS subscription, whatever the concurrency rule says (see IsRenewal).
        // Reactivation still applies below when the subscription has lapsed — a renewal arriving
        // after a lapse should revive it rather than silently extend a dead one.
        const isActive = existing.Status === 'Active' || existing.Status === 'Trialing';
        if (ctx.IsRenewal && isActive) return 'ExtendExisting';
        if (isActive) {
            switch (ctx.Rules.ConcurrencyMode) {
                case 'AllowMultiple': return 'CreateNew';
                case 'ExtendExisting': return 'ExtendExisting';
                case 'RejectDuplicate': return 'Reject';
            }
        }

        // Lapsed or canceled — reactivation policy decides.
        switch (ctx.Rules.ReactivationMode) {
            case 'AlwaysCreateNew':
                return 'CreateNew';
            case 'ReactivateExisting':
                return 'Reactivate';
            case 'ReactivateWithinWindow': {
                const window = ctx.Rules.ReactivationWindowDays ?? 0;
                const end = existing.LatestTermEnd ? new Date(existing.LatestTermEnd) : null;
                const withinWindow = end != null && daysBetween(end, ctx.PurchaseDate) <= window;
                return withinWindow ? 'Reactivate' : 'CreateNew';
            }
        }
    }

    /**
     * A stated start, or else Immediate / Deferred / snap-forward to the calendar anchor.
     *
     * The override lives HERE rather than in `Decide` so that a driver subclass overriding this
     * method decides for itself what a stated start means for its own rules — putting it in
     * `Decide` would apply it before any subclass could see it, silently disabling the one hook
     * that exists for exactly this kind of variation.
     */
    protected ComputeStartDate(ctx: SubscriptionPurchaseContext): Date {
        // Stated on the line and taken as given — the whole point of the field (D-TERMSTART). Note
        // what this does NOT do: it never reads `StartMode`, so no rule quietly shifts a date
        // somebody typed deliberately.
        if (ctx.RequestedStartDate) return ctx.RequestedStartDate;

        const purchase = ctx.PurchaseDate;
        switch (ctx.Rules.StartMode) {
            case 'Immediate':
                return purchase;
            case 'Deferred':
                return addDays(purchase, ctx.Rules.DeferredStartDays ?? 0);
            case 'CalendarAnchored':
                // ExtendToNextAnchor waits for the anchor; Prorate/ChargeFull start NOW and run to
                // the anchor, which is what makes the first term partial.
                return ctx.Rules.PartialPeriodMode === 'ExtendToNextAnchor'
                    ? this.NextAnchor(ctx, purchase)
                    : purchase;
        }
    }

    protected ComputeEndDate(ctx: SubscriptionPurchaseContext, start: Date, extending: boolean): Date {
        const months = ctx.Rules.DefaultTermMonths ?? this.MonthsForCadence(ctx.Rules.BillingCadence, ctx.Rules.CustomCycleDays);

        if (ctx.Rules.StartMode === 'CalendarAnchored' && !extending) {
            // A partial first term runs from the purchase to the day before the next anchor.
            const anchor = this.NextAnchor(ctx, start);
            if (ctx.Rules.PartialPeriodMode !== 'ExtendToNextAnchor' && anchor.getTime() > start.getTime()) {
                return addDays(anchor, -1);
            }
        }
        return addDays(addMonths(start, months), -1);
    }

    /**
     * Only `Prorate` actually reduces the amount. `ChargeFull` deliberately charges a whole term for
     * a partial window — the customer pays full freight to join mid-cycle — and
     * `ExtendToNextAnchor` has no partial window at all.
     */
    protected ComputeProration(
        ctx: SubscriptionPurchaseContext,
        start: Date,
        end: Date,
        extending: boolean,
    ): { isProrated: boolean; factor: number } {
        if (extending) return { isProrated: false, factor: 1 };
        if (ctx.Rules.StartMode !== 'CalendarAnchored') return { isProrated: false, factor: 1 };
        if (ctx.Rules.PartialPeriodMode !== 'Prorate') return { isProrated: false, factor: 1 };

        const fullMonths = ctx.Rules.DefaultTermMonths ?? 12;
        const fullDays = daysBetween(start, addMonths(start, fullMonths));
        const actualDays = daysBetween(start, end) + 1;
        if (fullDays <= 0 || actualDays >= fullDays) return { isProrated: false, factor: 1 };

        return { isProrated: true, factor: Math.round((actualDays / fullDays) * 1e6) / 1e6 };
    }

    /** The next occurrence of AnchorMonth/AnchorDay strictly after `from`. */
    protected NextAnchor(ctx: SubscriptionPurchaseContext, from: Date): Date {
        const month = (ctx.Rules.AnchorMonth ?? 1) - 1;
        const day = ctx.Rules.AnchorDay ?? 1;
        const base = utcDay(from);
        let anchor = new Date(Date.UTC(base.getUTCFullYear(), month, day));
        // Strictly after: buying ON the anchor date starts a FULL term at that anchor rather than
        // a zero-length stub ending the day before itself.
        if (anchor.getTime() <= base.getTime()) {
            anchor = new Date(Date.UTC(base.getUTCFullYear() + 1, month, day));
        }
        return anchor;
    }

    protected MonthsForCadence(cadence: SubscriptionTypeRules['BillingCadence'], customDays?: number | null): number {
        switch (cadence) {
            case 'Monthly': return 1;
            case 'Quarterly': return 3;
            case 'Annual': return 12;
            case 'Custom': return Math.max(1, Math.round((customDays ?? 30) / 30));
        }
    }

    /** Months per recognition slice — `MatchBilling` follows the billing cadence. */
    public RecognitionMonths(rules: SubscriptionTypeRules): number {
        const cadence = rules.RecognitionCadence === 'MatchBilling' ? rules.BillingCadence : rules.RecognitionCadence;
        return this.MonthsForCadence(cadence as SubscriptionTypeRules['BillingCadence'], rules.CustomCycleDays);
    }

    // ─── Cancellation (design §5) ──────────────────────────────────────────────
    //
    // The mechanics of a cancellation already work: a reversal order line with a negative quantity
    // produces mirrored journal entries through the ordinary booking path (D16). What was missing is
    // the POLICY — and the raw mechanic is terrible data entry. Amith's case: a subscription running
    // 1/1-12/31, cancelled on 7/1, needs a line of quantity -0.5. The user should pick a DATE; the
    // engine derives the fraction. That is what this computes.

    /**
     * Apply the type's cancellation rules to a request. Pure — computes dates and amounts, touches
     * nothing. Override any protected piece below to change one aspect.
     */
    public DecideCancellation(rawContext: CancellationContext): CancellationDecision {
        const ctx: CancellationContext = {
            ...rawContext,
            RequestDate: utcDay(rawContext.RequestDate),
            Term: {
                ...rawContext.Term,
                StartDate: utcDay(rawContext.Term.StartDate),
                EndDate: utcDay(rawContext.Term.EndDate),
            },
        };

        const effective = this.ClampToTerm(ctx, this.ComputeCancellationDate(ctx));
        const { amount, explanation } = this.ComputeRefund(ctx, effective);
        const uncapped = money(Math.min(Math.max(amount, 0), ctx.Term.Amount));

        // Round the FRACTION to the reversal line's own precision, then derive the refund back from
        // it — not the other way round. `OrderLine.Quantity` is DECIMAL(18,4), so a fraction with
        // more precision than that is silently truncated on insert, and the line total recomputed
        // from the truncated quantity no longer matches the one stored at insert. The immutability
        // trigger sees a "changed" financial column and rejects the very next write to that line.
        // Deriving both numbers from one rounded fraction keeps the reversed revenue and the
        // refunded cash exactly equal, which is the invariant that actually matters.
        const rawFraction = ctx.Term.Amount > 0 ? uncapped / ctx.Term.Amount : 0;
        const fraction = Math.round(rawFraction * 1e4) / 1e4;
        const refund = money(ctx.Term.Amount * fraction);

        return {
            EffectiveDate: effective,
            AccessThroughDate: addDays(effective, ctx.Rules.GracePeriodDays ?? 0),
            RefundAmount: refund,
            ReversalFraction: fraction,
            // Riding the term out is not a cancellation of coverage — the customer got everything
            // they paid for. Only a cut-short term is `Canceled`.
            TermStatus: effective.getTime() >= ctx.Term.EndDate.getTime() ? 'Completed' : 'Canceled',
            Explanation: explanation,
        };
    }

    /** When coverage ends, per `CancellationMode`. */
    protected ComputeCancellationDate(ctx: CancellationContext): Date {
        switch (ctx.Rules.CancellationMode) {
            case 'Immediate':
                return ctx.RequestDate;
            case 'EndOfTerm':
                return ctx.Term.EndDate;
            case 'EndOfBillingPeriod':
                return this.EndOfBillingPeriod(ctx);
        }
    }

    /**
     * The last day of the billing cycle the request falls in. Cycles are counted forward from the
     * TERM START, not from the request — a monthly subscription started on the 12th bills on the
     * 12th, and cancelling on the 20th runs to the 11th of the next month.
     */
    protected EndOfBillingPeriod(ctx: CancellationContext): Date {
        const step = this.MonthsForCadence(ctx.Rules.BillingCadence, ctx.Rules.CustomCycleDays);
        let boundary = addMonths(ctx.Term.StartDate, step);
        // Bounded by the term itself, so a mis-configured cadence cannot spin.
        while (boundary.getTime() <= ctx.RequestDate.getTime() && boundary.getTime() < ctx.Term.EndDate.getTime()) {
            boundary = addMonths(boundary, step);
        }
        return addDays(boundary, -1);
    }

    /** Cancellation never resurrects a finished term, and never ends coverage before it began. */
    protected ClampToTerm(ctx: CancellationContext, date: Date): Date {
        if (date.getTime() < ctx.Term.StartDate.getTime()) return ctx.Term.StartDate;
        if (date.getTime() > ctx.Term.EndDate.getTime()) return ctx.Term.EndDate;
        return date;
    }

    /** What to give back, per `CancellationRefundMode`. */
    protected ComputeRefund(
        ctx: CancellationContext,
        effective: Date,
    ): { amount: number; explanation: string } {
        const { Rules: rules, Term: term } = ctx;

        switch (rules.CancellationRefundMode) {
            case 'NoRefund':
                return {
                    amount: 0,
                    explanation:
                        `Coverage ends ${isoDay(effective)} (${rules.CancellationMode}). This subscription ` +
                        `type does not refund, so nothing is reversed.`,
                };

            case 'FullRefundWithinWindow': {
                const window = rules.CancellationWindowDays ?? 0;
                const elapsed = daysBetween(term.StartDate, ctx.RequestDate);
                if (elapsed <= window) {
                    return {
                        amount: term.Amount,
                        explanation:
                            `Cancelled ${elapsed} day(s) into the term, within the ${window}-day refund ` +
                            `window — the full ${term.Amount} is refunded and reversed.`,
                    };
                }
                return {
                    amount: 0,
                    explanation:
                        `Cancelled ${elapsed} day(s) into the term, past the ${window}-day refund window. ` +
                        `Coverage ends ${isoDay(effective)} with no refund.`,
                };
            }

            case 'ProrateUnused': {
                // Inclusive day counts on both sides, so a cancellation on the term's first day
                // refunds the whole term rather than all-but-one-day.
                const totalDays = daysBetween(term.StartDate, term.EndDate) + 1;
                const unusedDays = daysBetween(effective, term.EndDate);
                if (totalDays <= 0 || unusedDays <= 0) {
                    return {
                        amount: 0,
                        explanation: `Coverage ends ${isoDay(effective)} with no unused period remaining.`,
                    };
                }
                const fraction = unusedDays / totalDays;
                return {
                    amount: term.Amount * fraction,
                    explanation:
                        `Coverage ends ${isoDay(effective)}; ${unusedDays} of ${totalDays} day(s) go ` +
                        `unused, so ${Math.round(fraction * 1000) / 10}% of the term is refunded.`,
                };
            }
        }
    }
}

/** Tree-shaking anchor — the base behaviour must be registered before booking runs. */
export function LoadSubscriptionBehavior(): void {
    // intentionally empty
}
