/**
 * @fileoverview The instalment schedule's decisions, with no database near them (plan §4, D85–D88).
 *
 * AUTHORING IS GENERATED, NOT TYPED. Hand-typing four amounts is how a schedule ends up a cent short
 * and a confirm gets refused for reasons nobody can see. {@link BuildPaymentSchedule} takes a count,
 * a cadence and a first due date and emits rows that tie by construction, through the same
 * largest-remainder split the invoice already uses for its per-company money.
 *
 * THE SCHEDULE MUST TIE. Per (order, company), the live rows must sum to that company's gross on the
 * order. Leniency here would be a mistake: treating an unscheduled remainder as "due on the header
 * DueDate" silently under-bills, which is the failure the invoice module already names. The check is
 * one function, {@link ScheduleShortfalls}, read at confirm (OrderEntityServer) and at invoicing
 * (Orders.IssueInstalmentInvoice) so the two refuse for the same reason in the same words.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import { SplitExactly } from './BundleBehavior.js';

const Money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** How far apart the instalments fall. */
export type ScheduleCadence = 'Monthly' | 'Quarterly' | 'SemiAnnual' | 'Annual';

const MONTHS_PER_STEP: Record<ScheduleCadence, number> = { Monthly: 1, Quarterly: 3, SemiAnnual: 6, Annual: 12 };

/** One instalment as the helper proposes it, before a company is stamped or a row exists. */
export interface ScheduleRowDraft {
    InstallmentNumber: number;
    /** `YYYY-MM-DD`. */
    DueDate: string;
    Amount: number;
}

/**
 * Finance's standard shapes, from the Invoicing SOP (`.program/process/finance-order-contract-rules.md`
 * §4). PROVISIONAL — the thresholds have not been confirmed by finance, so they live here in one
 * object rather than inline anywhere. Each entry is the first row whose `MinGross` the order meets,
 * reading from the bottom; `Weights` are relative and the split makes them tie.
 */
export const SCHEDULE_DEFAULTS = {
    /** One-time fees: due at signature below 50k; 50/25/25 to 100k; 30% then thirds of the rest above. */
    OneTime: [
        { MinGross: 0, Weights: [1] },
        { MinGross: 50_000, Weights: [50, 25, 25] },
        { MinGross: 100_000, Weights: [30, 70 / 3, 70 / 3, 70 / 3] },
    ],
    /** Recurring annual fees: the full term at signature. Semi-annual only above 100k AND on request. */
    Recurring: [{ MinGross: 0, Weights: [1] }],
    RecurringSemiAnnualMinGross: 100_000,
    /** Renewals invoice this many days before the renewal date. */
    RenewalLeadDays: 90,
} as const;

/**
 * The weights finance's SOP prescribes for an order of this kind and size.
 *
 * @param semiAnnualRequested Recurring only: the customer asked for semi-annual billing. Honoured only
 *   above the threshold — the SOP says both conditions, not either.
 */
export function DefaultScheduleWeights(kind: 'OneTime' | 'Recurring', gross: number, semiAnnualRequested = false): number[] {
    if (kind === 'Recurring') {
        return semiAnnualRequested && gross >= SCHEDULE_DEFAULTS.RecurringSemiAnnualMinGross ? [1, 1] : [1];
    }
    const tiers = SCHEDULE_DEFAULTS.OneTime;
    let chosen: readonly number[] = tiers[0].Weights;
    // Thresholds are inclusive (a 50,000.00 order is the 50/25/25 shape). The SOP's wording is
    // ambiguous at exactly 100k; provisional either way.
    for (const tier of tiers) if (gross >= tier.MinGross) chosen = tier.Weights;
    return [...chosen];
}

/** `YYYY-MM-DD` plus a number of calendar months, clamped to the month's last day (Jan 31 + 1 → Feb 28). */
export function AddMonths(iso: string, months: number): string {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().slice(0, 10);
}

/**
 * Propose a schedule that ties by construction.
 *
 * `Weights` default to equal parts. The remainder is front-loaded by {@link SplitExactly}, so the
 * parts always sum to `Total` and the earliest instalment carries the odd cent.
 */
export function BuildPaymentSchedule(input: {
    Total: number;
    Count: number;
    Cadence: ScheduleCadence;
    FirstDueDate: string;
    Weights?: number[];
}): ScheduleRowDraft[] {
    const count = Math.floor(Number(input.Count));
    if (!(count >= 1)) throw new Error(`A payment schedule needs at least one instalment; got ${input.Count}.`);
    if (!(Money(input.Total) > 0)) throw new Error(`A payment schedule needs a positive total; got ${input.Total}.`);
    const weights = input.Weights ?? new Array<number>(count).fill(1);
    if (weights.length !== count) {
        throw new Error(`${weights.length} weights were given for ${count} instalments.`);
    }
    const amounts = SplitExactly(input.Total, weights);
    const step = MONTHS_PER_STEP[input.Cadence];
    return amounts.map((amount, i) => ({
        InstallmentNumber: i + 1,
        DueDate: AddMonths(input.FirstDueDate, step * i),
        Amount: amount,
    }));
}

/** A schedule row as the tie check reads it. */
export interface ScheduleRowFacts {
    CompanyID: string;
    Amount: number;
    Status: string;
}

/** An order line as the tie check reads it. */
export interface ScheduleLineFacts {
    CompanyID: string;
    LineTotalGross: number;
}

/** One company whose schedule does not match its lines. */
export interface ScheduleShortfall {
    CompanyID: string;
    Scheduled: number;
    Lines: number;
    /** `Lines − Scheduled`: positive when money is unscheduled, negative when over-scheduled. */
    Difference: number;
}

/** Statuses whose amount still counts toward the tie. A cancelled row has left the schedule. */
const LIVE_STATUSES = new Set(['Scheduled', 'Invoiced', 'Paid', 'WrittenOff']);

/**
 * Where the schedule fails to tie, per company. Empty means it ties — including the case of no rows
 * at all, which is the implicit single instalment and needs nothing.
 *
 * Every company with lines OR rows is checked, so a company that has lines and no schedule while
 * another company on the same order has rows is reported rather than silently unbilled.
 */
export function ScheduleShortfalls(rows: ScheduleRowFacts[], lines: ScheduleLineFacts[]): ScheduleShortfall[] {
    const live = rows.filter((r) => LIVE_STATUSES.has(r.Status));
    if (!live.length) return [];

    const key = (id: string): string => String(id).toLowerCase();
    const scheduled = new Map<string, number>();
    for (const r of live) scheduled.set(key(r.CompanyID), Money((scheduled.get(key(r.CompanyID)) ?? 0) + Number(r.Amount)));
    const lineGross = new Map<string, number>();
    for (const l of lines) lineGross.set(key(l.CompanyID), Money((lineGross.get(key(l.CompanyID)) ?? 0) + Number(l.LineTotalGross ?? 0)));

    const companies = [...new Set([...scheduled.keys(), ...lineGross.keys()])].sort();
    const out: ScheduleShortfall[] = [];
    for (const company of companies) {
        const s = scheduled.get(company) ?? 0;
        const g = lineGross.get(company) ?? 0;
        // Half a penny is the tolerance everywhere in this codebase: the columns are DECIMAL(18,2).
        if (Math.abs(s - g) >= 0.005) out.push({ CompanyID: company, Scheduled: s, Lines: g, Difference: Money(g - s) });
    }
    return out;
}

/** A schedule row as the booking-scope test reads it. */
export interface ScheduleTimingFacts extends ScheduleRowFacts {
    /** `YYYY-MM-DD`, or anything `Date` parses. Carried for callers; the scope test ignores it. */
    DueDate: string | Date;
}

/**
 * The companies on this order that are BILLED BY INSTALMENT, lower-cased (D91).
 *
 * This is the whole scope trigger for the new booking model. A company with at least one live
 * schedule row books no value at confirm — its value reaches the ledger when each instalment is
 * invoiced. A company with none is every order that exists today and is untouched.
 *
 * `Canceled` rows have left the schedule, so a company whose only row was cancelled is NOT
 * scheduled and books normally. That is the same liveness rule {@link ScheduleShortfalls} uses, by
 * the same constant, so the tie check and the ledger cannot disagree about which rows count.
 *
 * Deliberately not a date test. D89 split the debit by which instalments were still future; D91
 * does not split anything, so WHEN an instalment falls due no longer changes what confirm books —
 * only WHETHER the company is billed by instalment at all.
 */
export function ScheduledCompanyIDs(rows: ScheduleTimingFacts[]): Set<string> {
    const out = new Set<string>();
    for (const row of rows) {
        if (LIVE_STATUSES.has(row.Status)) out.add(String(row.CompanyID).toLowerCase());
    }
    return out;
}

/** The refusal, in words a person can act on. Names every company that is off and by how much. */
export function ExplainShortfalls(orderNumber: string, shortfalls: ScheduleShortfall[], companyName?: (id: string) => string): string {
    const name = (id: string): string => companyName?.(id) ?? id;
    const parts = shortfalls.map((s) => {
        const direction = s.Difference > 0 ? `${s.Difference.toFixed(2)} unscheduled` : `${(-s.Difference).toFixed(2)} over-scheduled`;
        return `${name(s.CompanyID)}: ${s.Scheduled.toFixed(2)} scheduled against ${s.Lines.toFixed(2)} of lines (${direction})`;
    });
    return `The payment schedule for order ${orderNumber} does not tie to its lines — ${parts.join('; ')}. Fix the schedule, or remove it to bill the order as one instalment.`;
}
