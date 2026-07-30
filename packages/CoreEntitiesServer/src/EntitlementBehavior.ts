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
 *   DOC:    plans/bizapps-orders-master.md D27, D76
 */

/** When access begins. */
export type GrantTiming = 'OnConfirm' | 'OnPaidInFull' | 'OnActivation';

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
 * Should the grant be ACTIVE yet, given when access is supposed to begin?
 *
 * The grant row is written at confirm either way — downstream apps poll grants (D27), and a grant
 * that does not exist until payment clears cannot be seen coming. What timing changes is the STATUS:
 *
 *   OnConfirm     Active immediately. A confirmed order is a claim on the seller.
 *   OnPaidInFull  Suspended until the order's balance reaches zero. Access follows cash.
 *   OnActivation  Suspended until something explicitly activates it. Note that nothing does yet —
 *                 this exists because it was asked for, and a deployment choosing it is choosing to
 *                 grant nothing until it builds the caller.
 *
 * `Suspended` rather than a missing row, and rather than `Revoked`: revoked means somebody took it
 * away, which is a different fact that an access dispute turns on.
 */
export function InitialGrantStatus(
    timing: GrantTiming,
    order: { Balance: number | null; TotalGross: number | null },
): 'Active' | 'Suspended' {
    if (timing === 'OnConfirm') return 'Active';
    if (timing === 'OnActivation') return 'Suspended';

    // OnPaidInFull. A zero-value order is paid by definition — a free line should not leave the
    // customer waiting for a payment that will never arrive.
    const gross = Number(order.TotalGross ?? 0);
    if (gross <= 0) return 'Active';
    return Number(order.Balance ?? gross) <= 0 ? 'Active' : 'Suspended';
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
