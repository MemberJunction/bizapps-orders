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
 * AUTHORITY. A percentage cap still applies to the forms that are price reductions, as it always
 * has. The two non-percentage limits apply to every form, and for the forms a percentage cannot
 * express at all — Duration and Seats — an unset limit is NO authority rather than an unlimited
 * one. Absence is not permission; it is the same rule `AuthorizeManualDiscount` applies to a user
 * with no `SalesAuthority` row.
 *
 * CONNECTS TO:
 *   CALLER: ./PromotionEngine.ts (AuthorizeManualDiscount — the absolute-value trigger)
 *   CALLER: OrderConcessionEntityServer, OrderEntityServer (confirm gate) in CoreEntitiesServer
 */
import { Money } from './PricingBehavior.js';

/** How the value was given. Mirrors `CK_OrderConcession_DeliveryForm`. */
export type ConcessionDeliveryForm = 'Price' | 'Duration' | 'Scope' | 'Seats';

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
 */
export function AssessConcession(
    form: ConcessionDeliveryForm,
    valuation: ConcessionValuation,
    authority: ConcessionAuthority | null,
    addedDays?: number | null,
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

    if (form === 'Duration') {
        const days = Math.max(0, Number(addedDays ?? 0));
        if (authority.MaxTermExtensionDays == null) {
            breaches.push('the SalesAuthority sets no MaxTermExtensionDays, so it grants no authority to extend a term');
        } else if (days > Number(authority.MaxTermExtensionDays)) {
            breaches.push(`a ${days}-day extension exceeds the ${authority.MaxTermExtensionDays}-day limit`);
        }
    }

    return { WithinAuthority: breaches.length === 0, Breaches: breaches };
}

const DAY_MS = 86_400_000;

function utcDay(d: Date): number {
    const date = new Date(d);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function pct(fraction: number): string {
    return `${(fraction * 100).toFixed(1)}%`;
}
