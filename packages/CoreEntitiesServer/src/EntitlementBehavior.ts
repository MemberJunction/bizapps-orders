/**
 * What a purchase grants, and for how long — the arithmetic, with no database in sight.
 *
 * A `ProductEntitlement` is a TEMPLATE: this product confers this feature, access level, or resource
 * quantity. An `EntitlementGrant` is the INSTANCE created when somebody buys it, carrying a
 * beneficiary and a validity window. This module decides what that instance should look like.
 *
 * THREE SETTINGS, ONE WALK (D76). Timing, quantity and validity are all configurable per deployment,
 * and all three resolve down the SAME chain taxability uses:
 *
 *     product → its category → that category's ancestors → the product type
 *
 * Nullable at product and category so "ask my parent" is sayable; NOT NULL at the type so the walk
 * always terminates with a real answer. Sharing the chain is deliberate rather than tidy: anyone who
 * understands how taxability resolves already understands this, and the two cannot drift into
 * disagreeing about what "the product's category tree" means.
 *
 * WHY VALIDITY IS DIFFERENT FROM THE OTHER TWO. It is read from the `ProductEntitlement` FIRST and
 * from the walk only when the template is silent, because one product can grant two entitlements with
 * different windows. A course might give perpetual access to the downloadable materials and ninety
 * days in the discussion forum. A policy resolved purely from the product could not say that.
 *
 * THE NON-SUBSCRIPTION CASES ARE THE INTERESTING ONES. It is tempting to assume access follows a
 * subscription term, because that is the case with the most moving parts. But the commonest grants
 * have nothing to do with subscriptions at all: a digital download is good forever, and a ticket to
 * an online event is good for the length of the event and not a minute longer.
 *
 * CONNECTS TO:
 *   SERVER: ./EntitlementEngine.ts (the lookups and the writes)
 *   CALLER: OrderEntityServer (grants are created inside the booking transaction)
 *   MIRROR: ./TaxResolver.ts — the same walk, for the same reason
 *   DOC:    plans/archive/bizapps-orders-master.md D27, D76
 */

/** When access begins. See {@link DecideGrantStatus} for what each one means. */
export type GrantTiming = 'OnConfirm' | 'OnPaidInFull' | 'OnFirstPayment' | 'OnActivation';

/** Why a grant is suspended. The first two are payment facts, and lift themselves when cash arrives. */
export type SuspensionReason = 'AwaitingPayment' | 'PastDue' | 'AwaitingActivation';

/** How the template quantity relates to the line quantity. */
export type QuantityMode = 'PerUnit' | 'Flat';

/** How long access lasts. */
export type ValidityMode = 'Perpetual' | 'EventWindow' | 'FixedDuration' | 'SubscriptionTerm';

/** Where in the chain an answer came from. Recorded because "nobody said" differs from "it said no". */
export type PolicyLevel = 'ProductEntitlement' | 'Product' | 'ProductCategory' | 'ProductType';

export interface EntitlementPolicySource {
    EntitlementGrantTiming: GrantTiming | null;
    EntitlementQuantityMode: QuantityMode | null;
    EntitlementValidityMode: ValidityMode | null;
}

/** One level of the category tree. Callers build these NEAREST FIRST. */
export interface PolicyCategoryLevel extends EntitlementPolicySource {
    ID: string;
}

/** The type's answers are NOT NULL — this is what makes the walk terminate. */
export interface PolicyTypeDefaults {
    DefaultEntitlementGrantTiming: GrantTiming;
    DefaultEntitlementQuantityMode: QuantityMode;
    DefaultEntitlementValidityMode: ValidityMode;
}

export interface ResolvedEntitlementPolicy {
    GrantTiming: GrantTiming;
    QuantityMode: QuantityMode;
    ValidityMode: ValidityMode;
    /** Which level decided each one, for the support question "why did this happen?". */
    DecidedAt: { GrantTiming: PolicyLevel; QuantityMode: PolicyLevel; ValidityMode: PolicyLevel };
}

/**
 * Walk the chain for all three settings at once.
 *
 * ONE walk rather than three, because they resolve identically and a caller that walked separately
 * would do the same lookups three times and could be given three different category chains.
 *
 * `entitlement` is consulted for VALIDITY ONLY — see the module header. Timing and quantity are
 * properties of the purchase, not of the individual thing granted: it would make no sense for one
 * entitlement on a line to appear at confirm and another to wait for payment.
 */
export function ResolveEntitlementPolicy(
    product: EntitlementPolicySource,
    /** NEAREST FIRST: the product's own category, then its parent, up to the root. */
    categoryChain: PolicyCategoryLevel[],
    type: PolicyTypeDefaults,
    entitlement?: { ValidityMode: ValidityMode | null } | null,
): ResolvedEntitlementPolicy {
    const walk = <K extends keyof EntitlementPolicySource, V>(
        key: K,
        typeValue: V,
    ): { value: V; level: PolicyLevel } => {
        const own = product[key] as unknown as V | null;
        if (own != null) return { value: own, level: 'Product' };
        for (const level of categoryChain) {
            const v = level[key] as unknown as V | null;
            if (v != null) return { value: v, level: 'ProductCategory' };
        }
        return { value: typeValue, level: 'ProductType' };
    };

    const timing = walk('EntitlementGrantTiming', type.DefaultEntitlementGrantTiming);
    const quantity = walk('EntitlementQuantityMode', type.DefaultEntitlementQuantityMode);

    // The template wins on validity, and only on validity.
    const fromTemplate = entitlement?.ValidityMode ?? null;
    const validity = fromTemplate != null
        ? { value: fromTemplate, level: 'ProductEntitlement' as PolicyLevel }
        : walk('EntitlementValidityMode', type.DefaultEntitlementValidityMode);

    return {
        GrantTiming: timing.value,
        QuantityMode: quantity.value,
        ValidityMode: validity.value,
        DecidedAt: {
            GrantTiming: timing.level,
            QuantityMode: quantity.level,
            ValidityMode: validity.level,
        },
    };
}

/**
 * How much of the entitlement this line grants.
 *
 * `PerUnit` multiplies, so three 5-seat packs give fifteen seats — which is what somebody buying
 * three packs expects. `Flat` ignores the line quantity entirely, for entitlements that are not
 * countable: "access to the member portal" does not become three portals.
 *
 * ROUNDED UP, and only ever up. A prorated subscription line carries a fractional quantity (0.5833
 * for a short first period), and 0.5833 × 5 seats is 2.9165. Rounding down hands the customer two
 * seats for a five-seat product and generates a support ticket; rounding up hands them three and
 * generates nothing. Under-granting is the expensive direction, exactly as under-collecting is with
 * tax, and for the same reason: the customer notices.
 *
 * A null template quantity means the entitlement is not a countable thing (a Feature or AccessLevel
 * rather than a ResourceQuantity), and stays null rather than becoming zero — zero would read as
 * "granted none of it".
 */
export function ResolveGrantQuantity(
    templateQuantity: number | null,
    lineQuantity: number,
    mode: QuantityMode,
): number | null {
    if (templateQuantity == null) return null;
    if (mode === 'Flat') return templateQuantity;
    const scaled = templateQuantity * Math.abs(lineQuantity);
    return Math.ceil(Math.round(scaled * 1e6) / 1e6);
}

/** Everything a validity window might need to know, so the pure function needs no lookups. */
export interface ValidityContext {
    /** When the grant takes effect — normally the order date. */
    GrantedOn: Date;
    /** FixedDuration only. */
    DurationDays?: number | null;
    /** EventWindow only: the event's own dates, and how far either side access opens. */
    EventStartsAt?: Date | null;
    EventEndsAt?: Date | null;
    AccessLeadHours?: number | null;
    AccessLagHours?: number | null;
    /** SubscriptionTerm only. */
    TermStartDate?: Date | null;
    TermEndDate?: Date | null;
}

export interface ResolvedValidity {
    ValidFrom: Date;
    /** NULL means perpetual. A grant with no end is a real thing, not a missing value. */
    ValidTo: Date | null;
    ModeApplied: ValidityMode;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Turn a validity mode plus its context into an actual window.
 *
 * FALLS BACK RATHER THAN THROWING when a mode's own inputs are missing, and records what it actually
 * applied. A ticket whose product has no event dates should not fail the customer's order — but the
 * grant must not silently claim to be an event window either, so `ModeApplied` says `Perpetual` and
 * an auditor can see the mode was requested and could not be honoured.
 *
 * The one thing it will not do is produce a window that ends before it starts. An event whose end
 * date precedes its start, or a lag that somehow lands behind the lead, yields a window ending at its
 * own start — an instantaneous grant, which reads as "nothing was granted" and is at least honest,
 * rather than a negative window the database CHECK would reject at insert time with an error naming
 * neither the product nor the event.
 */
export function ResolveValidityWindow(mode: ValidityMode, ctx: ValidityContext): ResolvedValidity {
    const clamp = (from: Date, to: Date | null): ResolvedValidity => ({
        ValidFrom: from,
        ValidTo: to != null && to.getTime() < from.getTime() ? new Date(from.getTime()) : to,
        ModeApplied: mode,
    });

    switch (mode) {
        case 'Perpetual':
            // A digital download. Good forever, and that is a fact rather than an omission.
            return { ValidFrom: ctx.GrantedOn, ValidTo: null, ModeApplied: 'Perpetual' };

        case 'FixedDuration': {
            const days = ctx.DurationDays ?? 0;
            if (days <= 0) {
                return { ValidFrom: ctx.GrantedOn, ValidTo: null, ModeApplied: 'Perpetual' };
            }
            return clamp(ctx.GrantedOn, new Date(ctx.GrantedOn.getTime() + days * DAY));
        }

        case 'EventWindow': {
            if (!ctx.EventStartsAt || !ctx.EventEndsAt) {
                return { ValidFrom: ctx.GrantedOn, ValidTo: null, ModeApplied: 'Perpetual' };
            }
            // Lead and lag are separate decisions, which is why they are separate columns: opening
            // the stream an hour early is a courtesy, and leaving the recording up for a day
            // afterwards is a different courtesy with different cost.
            const lead = (ctx.AccessLeadHours ?? 0) * HOUR;
            const lag = (ctx.AccessLagHours ?? 0) * HOUR;
            return clamp(
                new Date(ctx.EventStartsAt.getTime() - lead),
                new Date(ctx.EventEndsAt.getTime() + lag),
            );
        }

        case 'SubscriptionTerm': {
            if (!ctx.TermStartDate || !ctx.TermEndDate) {
                // Asked to follow a term that does not exist — a non-subscription product configured
                // as though it were one. Perpetual is the safe read: the customer bought something.
                return { ValidFrom: ctx.GrantedOn, ValidTo: null, ModeApplied: 'Perpetual' };
            }
            return clamp(ctx.TermStartDate, ctx.TermEndDate);
        }
    }
}

/**
 * The order's payment position, as far as access cares. Every figure comes from the order row the
 * rollup triggers maintain, so card, ACH and check resolve to the same answer: an ACH debit counts
 * once it settles, because it is `Pending` until then and `AmountPaid` only sums settled payments.
 */
export interface OrderPaymentFacts {
    TotalGross: number | null;
    AmountPaid: number | null;
    Balance: number | null;
    /**
     * Cash the seller chose to give back on this order (`ReversalSource = 'Refund'`), as a positive
     * amount. `AmountPaid` and `Balance` already net it out; the access rule adds it back, because a
     * refund is the seller's decision and does not take access away. A return revokes its own lines'
     * grants; a refund with no return is a concession. Only a bank reversal counts against access.
     * Absent means none.
     */
    RefundedBySeller?: number;
    /** What has to be paid before a new purchase is live — see {@link FirstPaymentAmount}. */
    FirstPaymentAmount: number;
    /** Whole days the order is past due as of the business day; 0 when it is not overdue. */
    DaysPastDue: number;
}

/** A payment schedule row, reduced to what the first-payment rule reads. */
export interface FirstPaymentScheduleRow {
    CompanyID: string;
    InstallmentNumber: number;
    Amount: number;
    Status: string;
}

/**
 * How much has to be paid before a new purchase counts as paid for its first payment.
 *
 * An order with no schedule is due in one amount, so its first payment is the whole order. An order
 * with a schedule carries one schedule per selling company (D86), so its first payment is the first
 * live instalment of EACH company's schedule, summed — the customer's first bill, however many
 * companies it bills for. A cancelled instalment was never due and does not count.
 */
export function FirstPaymentAmount(totalGross: number | null, schedule: FirstPaymentScheduleRow[]): number {
    const firstByCompany = new Map<string, FirstPaymentScheduleRow>();
    for (const row of schedule) {
        if (row.Status === 'Canceled') continue;
        const company = row.CompanyID.toLowerCase();
        const current = firstByCompany.get(company);
        if (!current || row.InstallmentNumber < current.InstallmentNumber) firstByCompany.set(company, row);
    }
    if (!firstByCompany.size) return Number(totalGross ?? 0);
    const sum = [...firstByCompany.values()].reduce((s, r) => s + Number(r.Amount ?? 0), 0);
    return Math.round(sum * 100) / 100;
}

/** The status a grant should hold, and why, when it is not Active. */
export interface GrantStatusDecision {
    Status: 'Active' | 'Suspended';
    Reason: SuspensionReason | null;
}

const ACTIVE: GrantStatusDecision = { Status: 'Active', Reason: null };
const suspended = (Reason: SuspensionReason): GrantStatusDecision => ({ Status: 'Suspended', Reason });

/**
 * Should the grant be ACTIVE, given when access is supposed to begin and where the order's cash is?
 *
 * The grant row is written at confirm either way — downstream apps poll grants (D27), and a grant
 * that does not exist until payment clears cannot be seen coming. What timing changes is the STATUS:
 *
 *   OnConfirm       Active immediately. A confirmed order is a claim on the seller.
 *   OnPaidInFull    Suspended until the order's balance reaches zero. Access follows cash.
 *   OnFirstPayment  The payment-and-access rule (bc-aidp-next-golive#223), in two halves:
 *                   · a NEW purchase is Suspended until its first payment has been received — the
 *                     first instalment, or the whole order when there is no schedule;
 *                   · a RENEWAL is Active, because the customer already has the service, and is
 *                     suspended once the renewal order is `cutoffDaysPastDue` days past due.
 *   OnActivation    Suspended until something explicitly activates it. Note that nothing does yet —
 *                   this exists because it was asked for, and a deployment choosing it is choosing
 *                   to grant nothing until it builds the caller.
 *
 * ONE function for confirm and for every later re-decision, so the status a grant is born with and
 * the status it is moved to when cash arrives cannot follow different rules.
 *
 * A zero-value order is paid by definition — a free line should not leave the customer waiting for
 * a payment that will never arrive.
 *
 * WHAT COUNTS AS PAID. A bank reversal (a returned debit) takes the cash back and access with it. A
 * refund does not: the seller chose to give the money back, so it is added back before deciding. A
 * paid order whose customer returns one line and is refunded for it keeps access on the other lines,
 * and a goodwill refund on a paid order leaves every grant standing.
 *
 * `Suspended` rather than a missing row, and rather than `Revoked`: revoked means somebody took it
 * away, which is a different fact that an access dispute turns on.
 *
 * @param cutoffDaysPastDue - Days past due at which a renewal loses access; `null` never cuts off.
 */
export function DecideGrantStatus(
    timing: GrantTiming,
    isRenewal: boolean,
    order: OrderPaymentFacts,
    cutoffDaysPastDue: number | null,
): GrantStatusDecision {
    if (timing === 'OnConfirm') return ACTIVE;
    if (timing === 'OnActivation') return suspended('AwaitingActivation');

    const gross = Number(order.TotalGross ?? 0);
    if (gross <= 0) return ACTIVE;
    const refunded = Number(order.RefundedBySeller ?? 0);

    if (timing === 'OnPaidInFull') {
        return Math.round((Number(order.Balance ?? gross) - refunded) * 100) <= 0 ? ACTIVE : suspended('AwaitingPayment');
    }

    // OnFirstPayment. `DaysPastDue` is the caller's, measured on the balance net of seller refunds.
    if (isRenewal) {
        const cutOff = cutoffDaysPastDue != null && order.DaysPastDue > 0 && order.DaysPastDue >= cutoffDaysPastDue;
        return cutOff ? suspended('PastDue') : ACTIVE;
    }
    // Compared in cents, so a first payment recorded as 333.33 against a 333.33 instalment is paid.
    const paidCents = Math.round((Number(order.AmountPaid ?? 0) + refunded) * 100);
    const dueCents = Math.round(Number(order.FirstPaymentAmount ?? gross) * 100);
    return paidCents >= dueCents ? ACTIVE : suspended('AwaitingPayment');
}

/**
 * The status a new purchase's grant starts in, from the balance alone.
 *
 * @deprecated Use {@link DecideGrantStatus}, which also knows about schedules, renewals and the
 * past-due cutoff. Kept for existing callers, and delegates so the two cannot disagree.
 */
export function InitialGrantStatus(
    timing: GrantTiming,
    order: { Balance: number | null; TotalGross: number | null },
): 'Active' | 'Suspended' {
    const gross = Number(order.TotalGross ?? 0);
    const balance = Number(order.Balance ?? gross);
    return DecideGrantStatus(
        timing,
        false,
        { TotalGross: gross, Balance: balance, AmountPaid: gross - balance, FirstPaymentAmount: gross, DaysPastDue: 0 },
        null,
    ).Status;
}

/** The timings whose status follows the order's cash, and so are re-decided when it moves. */
export const PAYMENT_GATED_TIMINGS: readonly GrantTiming[] = ['OnPaidInFull', 'OnFirstPayment'];

/** Suspensions this module imposed, and may therefore lift. Anything else belongs to a person. */
const PAYMENT_SUSPENSIONS: ReadonlySet<string> = new Set<SuspensionReason>(['AwaitingPayment', 'PastDue']);

/**
 * True when a grant is suspended for a payment reason — held for its first payment, or cut off
 * past due. Only a payment may lift one of these; anything else that activates grants (a claim, a
 * person) must leave it alone, or access is handed out ahead of the cash the rule is waiting for.
 */
export function IsPaymentSuspension(grant: GrantStatusFacts): boolean {
    return grant.Status === 'Suspended' && grant.SuspensionReason != null && PAYMENT_SUSPENSIONS.has(grant.SuspensionReason);
}

/** A grant as it stands, for {@link ReconcileGrantStatus}. */
export interface GrantStatusFacts {
    Status: string;
    SuspensionReason: string | null;
}

/**
 * Whether a standing grant should be moved to `decided`, or left alone.
 *
 * Only two kinds of grant are this rule's to move: an Active one, and one suspended FOR A PAYMENT
 * REASON. A revoked or expired grant is history. A grant suspended for any other reason — awaiting
 * activation, or by a person, or before suspensions carried a reason — was not suspended by cash,
 * so cash arriving must not lift it.
 *
 * @returns The decision to apply, or `null` when the grant should not change.
 */
export function ReconcileGrantStatus(current: GrantStatusFacts, decided: GrantStatusDecision): GrantStatusDecision | null {
    if (current.Status !== 'Active' && !IsPaymentSuspension(current)) return null;
    if (current.Status === decided.Status && (current.SuspensionReason ?? null) === decided.Reason) return null;
    return decided;
}

/**
 * How much of a grant survives a partial return.
 *
 * A customer who bought five seats and sent two back keeps three. Returning everything revokes the
 * grant outright rather than leaving a zero-quantity row, because zero is indistinguishable from a
 * Feature grant that never had a quantity.
 */
export function ReduceGrantForReturn(
    grantQuantity: number | null,
    originalLineQuantity: number,
    returnedQuantity: number,
): { Quantity: number | null; Revoke: boolean } {
    const returned = Math.abs(returnedQuantity);
    const original = Math.abs(originalLineQuantity);

    if (original <= 0 || returned >= original) return { Quantity: grantQuantity, Revoke: true };
    if (grantQuantity == null) {
        // A Feature or AccessLevel: not countable, so a partial return cannot partially remove it.
        // The customer still holds some of the thing that conferred it, so the grant stands.
        return { Quantity: null, Revoke: false };
    }

    const remaining = grantQuantity * ((original - returned) / original);
    // Rounded UP, for the same reason ResolveGrantQuantity rounds up: taking away a seat the customer
    // still paid for is worse than leaving one they did not.
    return { Quantity: Math.ceil(Math.round(remaining * 1e6) / 1e6), Revoke: false };
}

// ─── Read contract (the one place “is this in force?” is answered) ─────────────
//
// EntitlementGrant.Status records what was DECIDED, never what is currently true:
// cancelling a subscription does not touch its grants, and nothing sweeps Status to
// Expired when ValidTo elapses. Downstream apps must not poll the flag. They ask,
// and this function answers. See plans/entitlement-read-contract.md.

/** Why a check granted or refused. Collapsing these to a boolean loses the support conversation. */
export type EntitlementDecision =
    | 'Granted'
    | 'NoGrant'
    | 'NotYetValid'
    | 'Expired'
    | 'Revoked'
    | 'Suspended'
    | 'SubscriptionInactive';

/** The facts a grant row carries that the evaluator needs — no database. */
export interface GrantAccessFacts {
    Status: string;
    ValidFrom: Date | null;
    ValidTo: Date | null;
    /** True when `EntitlementGrant.SubscriptionID` is set. Missing subscription row → fail closed. */
    LinkedToSubscription?: boolean;
    /** True when `EntitlementGrant.SubscriptionTermID` is set. Missing term row → fail closed. */
    LinkedToTerm?: boolean;
}

/** Subscription facts that can cut access short or extend it through grace. */
export interface SubscriptionAccessFacts {
    Status: string;
    /**
     * When the subscription is `Canceled`, this is access-through (`EndDate` stamped from
     * `CancellationDecision.AccessThroughDate`). Ignored while the sub is Active/Trialing.
     */
    EndDate: Date | null;
}

export interface TermAccessFacts {
    Status: string;
    StartDate: Date;
    EndDate: Date;
}

export interface GrantAccessEvaluation {
    HasAccess: boolean;
    Decision: EntitlementDecision;
    ValidFrom: Date | null;
    ValidTo: Date | null;
}

/** Subscription statuses that still confer access. Anything else is inactive. */
const ACCESSING_SUB_STATUS = new Set(['Active', 'Trialing']);

/**
 * Is this grant in force at `asOf`?
 *
 * ONE function, because a second “is this in force” will drift from the first — that failure
 * has already bitten this codebase twice. Bounds are inclusive: access holds at the exact
 * `ValidFrom` / `ValidTo` / cancel `EndDate` instant.
 *
 * Cancelled subscriptions are the interesting case. The grant's `ValidTo` is the original term
 * end, which is a LIE after an immediate cancel: access-through is `subscription.EndDate`
 * (grace included). Grace can also EXTEND past `ValidTo`. Either way, `EndDate` is the bound
 * once the sub is `Canceled`. Paused/Migrated refuse immediately — they have no grace story.
 */
export function EvaluateGrantAccess(
    grant: GrantAccessFacts,
    asOf: Date,
    subscription?: SubscriptionAccessFacts | null,
    term?: TermAccessFacts | null,
): GrantAccessEvaluation {
    const denied = (Decision: EntitlementDecision): GrantAccessEvaluation => ({
        HasAccess: false,
        Decision,
        ValidFrom: grant.ValidFrom,
        ValidTo: grant.ValidTo,
    });
    const granted = (): GrantAccessEvaluation => ({
        HasAccess: true,
        Decision: 'Granted',
        ValidFrom: grant.ValidFrom,
        ValidTo: grant.ValidTo,
    });

    if (grant.Status === 'Revoked') return denied('Revoked');
    if (grant.Status === 'Suspended') return denied('Suspended');
    if (grant.Status === 'Expired') return denied('Expired');
    if (grant.Status !== 'Active') return denied('NoGrant');

    if (grant.ValidFrom && asOf.getTime() < grant.ValidFrom.getTime()) {
        return denied('NotYetValid');
    }

    // Linked rows we could not load: fail closed rather than grant on a guess.
    if (grant.LinkedToSubscription && !subscription) return denied('SubscriptionInactive');
    if (grant.LinkedToTerm && !term) return denied('SubscriptionInactive');

    if (subscription && !ACCESSING_SUB_STATUS.has(subscription.Status)) {
        if (subscription.Status === 'Canceled') {
            if (!subscription.EndDate || asOf.getTime() > subscription.EndDate.getTime()) {
                return {
                    HasAccess: false,
                    Decision: 'SubscriptionInactive',
                    ValidFrom: grant.ValidFrom,
                    ValidTo: subscription.EndDate,
                };
            }
            // Inside access-through: EndDate is the operative bound — it can cut the original
            // ValidTo short or extend it (grace). Report that, so CacheUntil and "access
            // through {ValidTo}" both tell the truth.
            return {
                HasAccess: true,
                Decision: 'Granted',
                ValidFrom: grant.ValidFrom,
                ValidTo: subscription.EndDate,
            };
        }
        return denied('SubscriptionInactive');
    }

    if (grant.ValidTo && asOf.getTime() > grant.ValidTo.getTime()) {
        return denied('Expired');
    }

    if (term) {
        if (asOf.getTime() < term.StartDate.getTime()) return denied('NotYetValid');
        if (asOf.getTime() > term.EndDate.getTime()) return denied('SubscriptionInactive');
    }

    return granted();
}

/** Lower rank wins among denials — “not yet” is a more useful screen than “an old grant was revoked”. */
const DENIAL_RANK: Record<EntitlementDecision, number> = {
    Granted: 0,
    NotYetValid: 1,
    Suspended: 2,
    SubscriptionInactive: 3,
    Expired: 4,
    Revoked: 5,
    NoGrant: 6,
};

export interface RankableAccess {
    HasAccess: boolean;
    Decision: EntitlementDecision;
    ValidTo: Date | null;
}

/**
 * One answer from many grants for the same Code. A Granted perpetual beats a Granted with an
 * end; among denials the most useful reason wins, not the most recent row.
 */
export function PickWinningAccess<T extends RankableAccess>(results: T[]): T | null {
    if (!results.length) return null;
    const granted = results.filter((r) => r.HasAccess);
    if (granted.length) {
        return granted.reduce((best, r) => {
            if (best.ValidTo == null) return best;
            if (r.ValidTo == null) return r;
            return r.ValidTo.getTime() > best.ValidTo.getTime() ? r : best;
        });
    }
    return results.reduce((best, r) =>
        DENIAL_RANK[r.Decision] < DENIAL_RANK[best.Decision] ? r : best,
    );
}

/** Default CacheUntil cap for a check answer. Short so a revoke is felt quickly. */
export const ENTITLEMENT_CHECK_TTL_MS = 60_000;

/**
 * When the caller may reuse this answer. Never past `ValidTo` on a grant that is in force —
 * caching a Granted past its own end is how paid content stays open after the window closed.
 */
export function CacheUntilFor(
    evaluatedAt: Date,
    validTo: Date | null | undefined,
    hasAccess: boolean,
): Date {
    const cap = new Date(evaluatedAt.getTime() + ENTITLEMENT_CHECK_TTL_MS);
    if (hasAccess && validTo != null && validTo.getTime() < cap.getTime()) {
        return new Date(validTo.getTime());
    }
    return cap;
}

/**
 * After `Orders.CancelSubscription`, stored grant Status is a lie unless we revoke when
 * access has already ended. Grace (`AccessThroughDate` in the future) leaves the rows
 * standing — the evaluator honours `subscription.EndDate`.
 */
export function ShouldRevokeGrantsOnCancel(accessThroughDate: Date, now: Date): boolean {
    return now.getTime() > accessThroughDate.getTime();
}
