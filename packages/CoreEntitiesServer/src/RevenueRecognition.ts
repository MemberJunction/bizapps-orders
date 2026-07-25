/**
 * Revenue-recognition drivers — the pluggable "how is this earned over time?" layer (plan D43).
 *
 * DESIGN: there is no "standard vs custom" split. EVERY `RevenueRecognitionType` row — including
 * the three we ship — names a `DriverClass` resolved through MJ's ClassFactory. The shipped
 * drivers are ordinary implementations with overridable `protected` methods, so an adopter can
 * subclass one and re-register under the SAME key to swap their behaviour in wholesale. That is
 * strictly more powerful than a hardcoded switch plus an escape hatch, and it means our own types
 * are exercised by the same path every extension uses.
 *
 * SEPARATION OF CONCERNS: a driver computes a SCHEDULE — dates and amounts — and nothing else.
 * It never touches the database, never creates journal entries, and never opens a transaction.
 * `OrderEntityServer` turns the schedule into forward-dated JEs (D14) inside the single booking
 * transaction, which keeps transaction management in exactly one place and makes drivers trivially
 * unit-testable.
 *
 * ROUNDING: the remainder is front-loaded into the FIRST period (plan §4.6). A 12 × $100.00
 * schedule off $1,200.01 recognizes $100.01 then 11 × $100.00 — never a trailing fractional cent,
 * and the periods always sum exactly to the line amount.
 *
 * CONNECTS TO:
 *   TABLE:  __mj_BizAppsOrders.RevenueRecognitionType (Code, DriverClass, IsDeferred, ...)
 *   CALLER: OrderJournalEntryFactory (./OrderJournalEntryFactory.ts)
 */
import { RegisterClass } from '@memberjunction/global';

/** What a driver is given. Deliberately plain data — no entities, no provider, no I/O. */
export interface RevRecContext {
    /** The line's net amount to be recognized (after discount, before tax). */
    Amount: number;
    /** The order's accounting date — when the sale was booked. */
    BookingDate: Date;
    /** Coverage window, when the line has one (subscriptions, services). */
    ServicePeriodStart?: Date | null;
    ServicePeriodEnd?: Date | null;
    /** For informative descriptions only. */
    ProductName?: string;
}

export interface RevRecEntry {
    /** The date this slice is earned — becomes the JE's EffectiveDate. */
    RecognitionDate: Date;
    Amount: number;
    /** Period bounds, carried through to RevRecScheduleLine for MRR/ARR reporting. */
    PeriodStart: Date;
    PeriodEnd: Date;
}

export interface RevRecSchedule {
    Entries: RevRecEntry[];
}

function money(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

function addMonths(d: Date, n: number): Date {
    const r = new Date(d.getTime());
    const day = r.getDate();
    r.setMonth(r.getMonth() + n);
    if (r.getDate() < day) r.setDate(0); // clamp: Jan 31 + 1mo -> Feb 28/29
    return r;
}

/**
 * Base driver. Subclass, override `BuildSchedule` (or just the protected helpers), and register
 * under an existing key to replace a shipped type:
 *
 *     @RegisterClass(RevenueRecognitionDriver, 'EvenOverTime')
 *     export class OurEvenOverTime extends EvenOverTimeDriver { ... }
 */
export abstract class RevenueRecognitionDriver {
    /** Compute when and how much is earned. Pure: no I/O, no side effects. */
    public abstract BuildSchedule(context: RevRecContext): RevRecSchedule;

    /**
     * Split `amount` across `periods`, front-loading the rounding remainder into the first period
     * so the slices always sum EXACTLY to the amount.
     */
    protected AllocateEvenly(amount: number, periods: number): number[] {
        if (periods <= 0) return [];
        const base = money(amount / periods);
        const out = new Array(periods).fill(base);
        out[0] = money(amount - base * (periods - 1));
        return out;
    }

    /** Whole months between two dates, minimum 1. */
    protected MonthSpan(start: Date, end: Date): number {
        const months =
            (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        return Math.max(1, months + (end.getDate() >= start.getDate() ? 1 : 0));
    }

    protected RequireServicePeriod(context: RevRecContext, driver: string): { start: Date; end: Date } {
        if (!context.ServicePeriodStart || !context.ServicePeriodEnd) {
            throw new Error(
                `${driver} needs a service period, but this order line has no ` +
                    `ServicePeriodStart/ServicePeriodEnd. Set them on the line, or use a revenue ` +
                    `recognition type that does not require a coverage window.`,
            );
        }
        return { start: new Date(context.ServicePeriodStart), end: new Date(context.ServicePeriodEnd) };
    }
}

/**
 * UpFront — 100% earned when the sale is booked. One-time goods and services.
 * The booking entry credits Sales directly; there is no deferral round-trip.
 */
@RegisterClass(RevenueRecognitionDriver, 'UpFront')
export class UpFrontDriver extends RevenueRecognitionDriver {
    public BuildSchedule(context: RevRecContext): RevRecSchedule {
        const d = new Date(context.BookingDate);
        return { Entries: [{ RecognitionDate: d, Amount: money(context.Amount), PeriodStart: d, PeriodEnd: d }] };
    }
}

/**
 * EvenOverTime — straight-line across the line's service period. Most subscriptions.
 * A 12-month $1,200 subscription produces 12 monthly $100 entries dated on the anniversaries.
 */
@RegisterClass(RevenueRecognitionDriver, 'EvenOverTime')
export class EvenOverTimeDriver extends RevenueRecognitionDriver {
    public BuildSchedule(context: RevRecContext): RevRecSchedule {
        const { start, end } = this.RequireServicePeriod(context, 'EvenOverTime');
        const periods = this.MonthSpan(start, end);
        const amounts = this.AllocateEvenly(context.Amount, periods);

        return {
            Entries: amounts.map((amount, i) => {
                const periodStart = addMonths(start, i);
                const periodEnd = i === periods - 1 ? end : addMonths(start, i + 1);
                return { RecognitionDate: periodStart, Amount: amount, PeriodStart: periodStart, PeriodEnd: periodEnd };
            }),
        };
    }
}

/**
 * AllBackEnd — 100% earned on the END date. Events and milestone deliverables, where nothing is
 * earned until the thing actually happens: cash is collected up front and sits in Deferred Revenue
 * until the event date.
 */
@RegisterClass(RevenueRecognitionDriver, 'AllBackEnd')
export class AllBackEndDriver extends RevenueRecognitionDriver {
    public BuildSchedule(context: RevRecContext): RevRecSchedule {
        const { start, end } = this.RequireServicePeriod(context, 'AllBackEnd');
        return { Entries: [{ RecognitionDate: end, Amount: money(context.Amount), PeriodStart: start, PeriodEnd: end }] };
    }
}

/** Tree-shaking anchor — the shipped drivers must be registered before booking runs. */
export function LoadRevenueRecognitionDrivers(): void {
    // intentionally empty
}
