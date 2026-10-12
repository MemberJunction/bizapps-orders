/**
 * What a concession is worth, and whether a rep may grant it — pure, with no database.
 *
 * A CONCESSION IS VALUE GIVEN AWAY, WHATEVER FORM IT TAKES. The sales guardrails used to value one
 * only as a percentage off price, so a concession delivered any other way computed to zero and
 * cleared every check. Three months added to an annual term at no charge leave the price, the
 * invoice and the discount percentage untouched, while the same value taken off the price would
 * escalate. So every form resolves here to one currency figure, at the arrangement's own rate, and
 * authority is judged on that figure:
 *
 *   Price     charged below the reference price     (reference − charged) × quantity
 *   Scope     a product added at no charge          reference price × quantity
 *   Duration  a term extended at no charge          term amount × added days ÷ term days
 *   Seats     quantity added at no charge           unit price × added quantity
 *
 * TERMS ARE THE EXCEPTION. A change to a booked order's payment terms moves when the cash arrives, not
 * how much, so it has no currency figure: its value is the change in days to payment, and it carries no
 * SalesAuthority limit. It always goes to approval (`ConcessionAlwaysEscalates`), whichever way the days
 * move, and the requester cannot decide it.
 *
 * AUTHORITY. A percentage cap still applies to the forms that are price reductions, as it always
 * has. The two non-percentage limits apply to every form, and for the forms a percentage cannot
 * express at all — Duration and Seats — an unset limit is NO authority rather than an unlimited
 * one. Absence is not permission; it is the same rule `AuthorizeManualDiscount` applies to a user
 * with no `SalesAuthority` row.
 *
 * TERM DATES. `MaxTermExtensionDays` limits any change to a term's dates, not only days added.
 * Shortening a term or shifting it moves when its revenue is recognised as much as extending it, so a
 * change is measured as the larger of how far its start and its end move (`TermDateChangeDays`).
 *
 * SHARE OF THE ORDER. A currency limit treats a small order and a large one alike, so the same
 * concession can be trivial on one and most of the other. `MaxConcessionPctOfContract` limits every
 * concession on the order that is not Rejected, together, as a share of the order's net total. It
 * is cumulative so that splitting one concession into several cannot keep each under the limit.
 * An order with nothing to measure against (a net total of zero) breaches a limit that is set.
 *
 * CONNECTS TO:
 *   CALLER: ./PromotionEngine.ts (AuthorizeManualDiscount — the absolute-value trigger)
 *   CALLER: OrderConcessionEntityServer, OrderEntityServer (confirm gate) in CoreEntitiesServer
 */
import { Money } from './PricingBehavior.js';

/** How the value was given. Mirrors `CK_OrderConcession_DeliveryForm`. */
export type ConcessionDeliveryForm = 'Price' | 'Duration' | 'Scope' | 'Seats' | 'Terms';

/** Why it was given. Mirrors `CK_OrderConcession_ReasonCategory`. */
export type ConcessionReasonCategory = 'Retention' | 'Referral' | 'Other';

/** A line charged below its reference price, or (Scope) at nothing. */
export interface PriceConcessionFacts {
    Form: 'Price' | 'Scope';
    /** What the price engine would have charged per unit. */
    ReferenceUnitPrice: number;
    /** What the line actually charges per unit. */
    ChargedUnitPrice: number;
    Quantity: number;
}

/** A term extended at no charge. */
export interface DurationConcessionFacts {
    Form: 'Duration';
    /** What the term was sold for. Its amount over its length is the arrangement's own rate. */
    TermAmount: number;
    /** The term's length in days, inclusive of both ends. */
    TermDays: number;
    AddedDays: number;
}

/** Quantity added at no charge. */
export interface SeatsConcessionFacts {
    Form: 'Seats';
    /** What the line charges per unit — the rate the added seats would have been sold at. */
    UnitPrice: number;
    AddedQuantity: number;
}

export type ConcessionFacts = PriceConcessionFacts | DurationConcessionFacts | SeatsConcessionFacts;

export interface ConcessionValuation {
    /** What was given away, in currency. Never negative. */
    Value: number;
    /**
     * The value as a fraction of what it reduces, for the forms that reduce a price. Null for
     * Duration and Seats, where nothing was reduced and a percentage has no meaning.
     */
    Percent: number | null;
}

/** The limits a rep holds. Mirrors the relevant `SalesAuthority` columns. */
export interface ConcessionAuthority {
    ID: string;
    MaxDiscountPct: number | null;
    MaxConcessionValue: number | null;
    MaxTermExtensionDays: number | null;
    MaxConcessionPctOfContract: number | null;
}

export interface ConcessionAssessment {
    WithinAuthority: boolean;
    /** Each limit the concession exceeds, or lacks, written for the person who has to act on it. */
    Breaches: string[];
}

/** Days from `start` to `end`, counting both — how a term's length is measured. */
export function InclusiveDays(start: Date, end: Date): number {
    return Math.round((utcDay(end) - utcDay(start)) / DAY_MS) + 1;
}

/** Days an end date moves later by. Zero or negative when it does not move later. */
export function DaysAdded(previousEnd: Date, newEnd: Date): number {
    return Math.round((utcDay(newEnd) - utcDay(previousEnd)) / DAY_MS);
}

/** A term's start and end. */
export interface TermDates {
    StartDate: Date;
    EndDate: Date;
}

/**
 * How far a change moves a term's dates: the larger of how far its start and its end move, in whole
 * days, in either direction. An extension, a shortening and a shift of N days each measure N.
 */
export function TermDateChangeDays(previous: TermDates, next: TermDates): number {
    const start = Math.abs(utcDay(next.StartDate) - utcDay(previous.StartDate));
    const end = Math.abs(utcDay(next.EndDate) - utcDay(previous.EndDate));
    return Math.round(Math.max(start, end) / DAY_MS);
}

/**
 * Concessions as a fraction of the order they are given on. Null when the order's net total is not
 * positive, since there is then nothing to measure a share against.
 */
export function ConcessionShare(totalConcessionValue: number, orderNetTotal: number): number | null {
    const net = Number(orderNetTotal);
    if (!(net > 0)) return null;
    return Math.max(0, Number(totalConcessionValue)) / net;
}

/**
 * Days to payment a change of terms moves by: positive when the customer pays later, negative when sooner.
 * Terms with no `NetDays`, or no terms at all, are due on receipt.
 */
export function PaymentTermsDaysChange(priorNetDays: number | null, newNetDays: number | null): number {
    return Math.round(Number(newNetDays ?? 0)) - Math.round(Number(priorNetDays ?? 0));
}

/**
 * Forms that go to approval whatever the requester's authority, and that the requester cannot decide
 * even when they hold the approving role.
 */
export function ConcessionAlwaysEscalates(form: ConcessionDeliveryForm): boolean {
    return form === 'Terms';
}

/** One figure for a concession, whatever form it was delivered in. */
export function ConcessionValue(facts: ConcessionFacts): ConcessionValuation {
    switch (facts.Form) {
        case 'Price':
        case 'Scope': {
            const quantity = Math.abs(Number(facts.Quantity));
            const reference = Math.max(0, Number(facts.ReferenceUnitPrice));
            const charged = Math.max(0, Number(facts.ChargedUnitPrice));
            const value = Money(Math.max(0, reference - charged) * quantity);
            const base = reference * quantity;
            return { Value: value, Percent: base > 0 ? value / base : null };
        }
        case 'Duration': {
            const termDays = Number(facts.TermDays);
            const added = Math.max(0, Number(facts.AddedDays));
            if (!(termDays > 0)) return { Value: 0, Percent: null };
            return { Value: Money((Math.max(0, Number(facts.TermAmount)) * added) / termDays), Percent: null };
        }
        case 'Seats':
            return {
                Value: Money(Math.max(0, Number(facts.UnitPrice)) * Math.max(0, Number(facts.AddedQuantity))),
                Percent: null,
            };
    }
}

/**
 * Whether a rep's authority covers a concession. Every limit is checked and every breach reported,
 * so the person asking for approval sees all of what the approver will be deciding.
 *
 * `termDateChangeDays` is the concession's `TermDateChangeDays`. It is checked against
 * `MaxTermExtensionDays` for a Duration concession, and for any other form that changes a term's dates.
 *
 * @param cumulativeShare  the order's concessions, this one included, from {@link ConcessionShare}.
 *   Omit it where no order is measured (a manual discount); null means the order has no net total.
 */
export function AssessConcession(
    form: ConcessionDeliveryForm,
    valuation: ConcessionValuation,
    authority: ConcessionAuthority | null,
    termDateChangeDays?: number | null,
    cumulativeShare?: number | null,
): ConcessionAssessment {
    if (!authority) {
        return { WithinAuthority: false, Breaches: ['the requester has no active SalesAuthority'] };
    }

    const breaches: string[] = [];
    const reducesPrice = form === 'Price' || form === 'Scope';

    if (reducesPrice && authority.MaxDiscountPct != null && valuation.Percent != null) {
        const cap = Number(authority.MaxDiscountPct);
        if (valuation.Percent > cap + 1e-9) {
            breaches.push(`${pct(valuation.Percent)} off is above the ${pct(cap)} cap`);
        }
    }

    if (authority.MaxConcessionValue != null) {
        const cap = Number(authority.MaxConcessionValue);
        if (valuation.Value > cap + 0.005) {
            breaches.push(`a value of ${valuation.Value.toFixed(2)} exceeds the ${cap.toFixed(2)} concession limit`);
        }
    } else if (!reducesPrice) {
        breaches.push('the SalesAuthority sets no MaxConcessionValue, so it grants no authority for this concession');
    }

    const days = Math.abs(Number(termDateChangeDays ?? 0));
    if (form === 'Duration' || days > 0) {
        if (authority.MaxTermExtensionDays == null) {
            breaches.push("the SalesAuthority sets no MaxTermExtensionDays, so it grants no authority to change a term's dates");
        } else if (days >= Number(authority.MaxTermExtensionDays)) {
            // At or above: the limit is the length that needs approval, so it reads as the policy does.
            breaches.push(`a ${days}-day change to the term's dates is at or above the ${authority.MaxTermExtensionDays}-day limit`);
        }
    }

    const shareBreach = ShareBreach(cumulativeShare, authority.MaxConcessionPctOfContract);
    if (shareBreach) breaches.push(shareBreach);

    return { WithinAuthority: breaches.length === 0, Breaches: breaches };
}

/**
 * The breach, if any, of a limit on the order's concessions as a share of its net total. At or
 * above the limit breaches, as the policy reads. Null when no limit is set or the share is under it.
 *
 * @param share  undefined when nothing was measured, which no limit can breach.
 */
export function ShareBreach(share: number | null | undefined, limit: number | null | undefined): string | null {
    if (share === undefined || limit == null) return null;
    const cap = Number(limit);
    if (share === null) {
        return `the order has no net total to measure its concessions against the ${pct(cap)} share limit`;
    }
    if (share >= cap - 1e-9) {
        return `concessions on the order come to ${pct(share)} of its net total, at or above the ${pct(cap)} limit`;
    }
    return null;
}

const DAY_MS = 86_400_000;

function utcDay(d: Date): number {
    const date = new Date(d);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function pct(fraction: number): string {
    return `${(fraction * 100).toFixed(1)}%`;
}
