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
}

export interface SubscriptionPurchaseContext {
    Rules: SubscriptionTypeRules;
    /** Order date — when the purchase happened. */
    PurchaseDate: Date;
    /** The line's net amount before proration. */
    Amount: number;
    /** The active/most-recent subscription for (product, subscriber), if one exists. */
    Existing?: ExistingSubscription | null;
    /** True when the buyer is an organization (for SubscriberScope validation). */
    SubscriberIsOrganization: boolean;
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

        // An extension starts where the existing coverage ends — never overlapping it.
        const extending = action === 'ExtendExisting';
        const start = extending && ctx.Existing?.LatestTermEnd
            ? addDays(ctx.Existing.LatestTermEnd, 1)
            : utcDay(this.ComputeStartDate(ctx));

        const end = this.ComputeEndDate(ctx, start, extending);
        const { isProrated, factor } = this.ComputeProration(ctx, start, end, extending);

        return {
            Action: action,
            SubscriptionID: action === 'CreateNew' ? undefined : ctx.Existing?.ID,
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
        const { SubscriberScope } = ctx.Rules;
        if (SubscriberScope === 'Organization' && !ctx.SubscriberIsOrganization) {
            return `Subscription type ${ctx.Rules.Code} is organization-only, but this order has no customer organization.`;
        }
        if (SubscriberScope === 'Person' && ctx.SubscriberIsOrganization) {
            return `Subscription type ${ctx.Rules.Code} is individual-only, but this order is for an organization.`;
        }
        return null;
    }

    protected ChooseAction(ctx: SubscriptionPurchaseContext): SubscriptionDecision['Action'] {
        const existing = ctx.Existing;
        if (!existing) return 'CreateNew';

        const isActive = existing.Status === 'Active' || existing.Status === 'Trialing';
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

    /** Immediate / Deferred / snap-forward to the calendar anchor. */
    protected ComputeStartDate(ctx: SubscriptionPurchaseContext): Date {
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
}

/** Tree-shaking anchor — the base behaviour must be registered before booking runs. */
export function LoadSubscriptionBehavior(): void {
    // intentionally empty
}
