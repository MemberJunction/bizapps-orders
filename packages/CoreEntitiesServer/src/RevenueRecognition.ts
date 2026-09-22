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
    /**
     * Months per recognition slice (D45 `RecognitionCadence`). Absent = monthly. This is how a
     * subscription that recognizes QUARTERLY gets 4 slices a year instead of 12 — the cadence is
     * the subscription type's rule, not the driver's assumption.
     */
    PeriodMonths?: number;
}

export interface RevRecEntry {
    /** The date this slice is earned — becomes the JE's EffectiveDate. */
    RecognitionDate: Date;
    Amount: number;
    /** Period bounds. They land on the forward-dated journal entry, which IS the schedule (D84). */
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
        const step = Math.max(1, context.PeriodMonths ?? 1);
        const periods = Math.max(1, Math.ceil(this.MonthSpan(start, end) / step));
        const amounts = this.AllocateEvenly(context.Amount, periods);

        return {
            Entries: amounts.map((amount, i) => {
                const periodStart = addMonths(start, i * step);
                const periodEnd = i === periods - 1 ? end : addMonths(start, (i + 1) * step);
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

/* ────────────────────────────────────────────────────────────────────────────
 * Percentage-of-completion — a SECOND family, not a fourth driver (plan §9.1, D90).
 *
 * The drivers above answer "given what we know at booking, when is this earned?" and run once.
 * Percentage-of-completion answers "given what we now know about progress, how much should be
 * earned TO DATE?" — which is not knowable at booking and cannot be expressed as
 * `BuildSchedule(context) → entries` without the method lying about its contract. A POC type is
 * `IsDeferred = 1` + `ScheduleBasis = 'OnMeasurement'`: it books to Deferred Revenue and stages NO
 * release entries; `Orders.RecordProgress` posts the catch-up as observations arrive.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One observation, as the driver sees it. Plain data, mirroring OrderLineProgressMeasurement. */
export interface ProgressMeasurement {
    /** Cumulative fraction earned, 0..1, when the signer states it directly. */
    PercentComplete?: number | null;
    /** Quantitative inputs, for a derived method (cost-to-cost, units delivered). */
    MeasureNumerator?: number | null;
    MeasureDenominator?: number | null;
}

/**
 * Base progress driver. Subclass and register under a `MethodCode`:
 *
 *     @RegisterClass(ProgressRecognitionDriver, 'CostToCost')
 *     export class CostToCostDriver extends ProgressRecognitionDriver { ... }
 *
 * Only `ManualAttestation` ships: nothing in this system holds cost or units today (plan §9.4).
 */
export abstract class ProgressRecognitionDriver {
    /** Cumulative fraction earned, from one observation. Pure: no I/O. Throws on an unusable input. */
    public abstract PercentComplete(m: ProgressMeasurement): number;
}

/**
 * ManualAttestation — a named person states the cumulative percent and signs it. The number may
 * have been derived anywhere; what posts is the attestation (D90).
 */
@RegisterClass(ProgressRecognitionDriver, 'ManualAttestation')
export class ManualAttestationDriver extends ProgressRecognitionDriver {
    public PercentComplete(m: ProgressMeasurement): number {
        const p = Number(m.PercentComplete);
        if (!Number.isFinite(p) || p < 0 || p > 1) {
            throw new Error(`PercentComplete must be a fraction between 0 and 1 (got ${String(m.PercentComplete)}).`);
        }
        return p;
    }
}

/** What one observation should post (plan §9.2). */
export interface CatchUp {
    /** LineTotalNet × percent, to the cent. At 100% it IS the line amount. */
    Target: number;
    /** Target − recognisedToDate. Negative on a backward slide; zero means "write nothing". */
    Delta: number;
}

/**
 * Cumulative catch-up: the entry is the difference between what the observation says should be
 * earned to date and what already is. The backward-slide case is not a feature — it is what the
 * subtraction does. Same `money()` rounding as OrderJournalEntryFactory, so the final catch-up at
 * 100% lands the remaining cent regardless of rounding history.
 */
export function ComputeCatchUp(lineNet: number, percentComplete: number, recognizedToDate: number): CatchUp {
    const target = money(lineNet * percentComplete);
    return { Target: target, Delta: money(target - recognizedToDate) };
}

/**
 * Does a recognition entry post mirrored — debit and credit swapped — for this line and this delta?
 *
 * TWO SIGNS, AND THEY ARE DIFFERENT THINGS. A line's own sign says which direction its revenue runs:
 * a reversal line (`Quantity < 0`) unwinds revenue, so its ORDINARY forward progress posts as an
 * unrecognition. The event's sign says which way this particular observation moved: a backward slide
 * takes revenue back out. Each one alone flips the entry; both together flip it twice, which is not
 * a flip at all — un-un-recognising is recognising.
 *
 * So the rule is exclusive-or, and every other combination gets one of the four cases wrong. Taking
 * the delta alone — which is what this did before — makes a reversal line's forward catch-up post as
 * a RECOGNITION of revenue on a line whose whole purpose is to remove it. It balances, and nothing
 * downstream reports it.
 *
 * A pure function rather than an expression inside the factory because it is the one piece of that
 * method with four cases and no I/O, which is exactly the part worth pinning in a test.
 */
export function RecognitionMirrors(lineQuantity: number, delta: number): boolean {
    return Number(lineQuantity) < 0 !== delta < 0;
}

/** Tree-shaking anchor — the shipped drivers must be registered before booking runs. */
export function LoadRevenueRecognitionDrivers(): void {
    void ManualAttestationDriver;
}
