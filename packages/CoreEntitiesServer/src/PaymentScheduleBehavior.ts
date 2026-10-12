/**
 * @fileoverview The instalment schedule's decisions, with no database near them (plan §4, D85–D88).
 *
 * AUTHORING IS GENERATED, NOT TYPED. Hand-typing four amounts is how a schedule ends up a cent short
 * and a confirm gets refused for reasons nobody can see. {@link BuildPaymentSchedule} takes a count,
 * a cadence and a first due date and emits rows that tie by construction, through the same
 * largest-remainder split the invoice already uses for its per-company money.
 *
 * ONE SCHEDULE PER ORDER, FROM THE ORDER'S COMPANY (D61, golive #311). An order is billed by the
 * company that sold it, whatever company owns each product, so its rows carry the order's
 * `CompanyID` and together bill the whole order. The LEDGER stays per product company (D13): every
 * consumer that books or splits cash reads the schedule through {@link CompanySlices}, which divides
 * each order-level row among the companies whose lines it bills.
 *
 * Orders that already issued an instalment under the old per-company rows keep them. A row whose
 * company is not the order's covers only that company's lines; the order company's rows cover
 * everything else ({@link ScheduleCoverage}). New rows are always the order company's, so this case
 * only shrinks.
 *
 * THE SCHEDULE MUST TIE. Each covering company's live rows must sum to the gross of the lines they
 * cover. Leniency here would be a mistake: treating an unscheduled remainder as "due on the header
 * DueDate" silently under-bills, which is the failure the invoice module already names. The check is
 * one function, {@link ScheduleShortfalls}, read at confirm (OrderEntityServer) and at invoicing
 * (Orders.IssueInstalmentInvoice) so the two refuse for the same reason in the same words.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import { ToISODate, type DateCell } from '@mj-biz-apps/orders-entities';
import { SplitExactly } from './BundleBehavior.js';
import { AddDays } from './PaymentTermsBehavior.js';

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

/**
 * A spawned renewal's schedule (orders #305): one instalment, from the order's company, for the
 * order's whole gross, due on `dueDate` ({@link RenewalDueDate}). Under D92 confirm then issues it at
 * once, so the receivable is dated the day the invoice goes out rather than the first day of the new
 * term.
 *
 * An order whose lines come to nothing gets no row: there is nothing to bill, and no rows is the
 * implicit single instalment.
 */
export function RenewalScheduleRows(
    lines: ScheduleLineFacts[],
    dueDate: string,
    orderCompanyID: string,
): Array<ScheduleRowDraft & { CompanyID: string }> {
    const total = Money(lines.reduce((sum, l) => sum + Number(l.LineTotalGross ?? 0), 0));
    if (total <= 0) return [];
    const [row] = BuildPaymentSchedule({ Total: total, Count: 1, Cadence: 'Annual', FirstDueDate: dueDate });
    return [{ ...row, CompanyID: orderCompanyID }];
}

/**
 * When a spawned renewal's instalment is due (orders #305 review): the invoice day plus the
 * customer's payment terms, never later than the order date (the new term's start).
 *
 * The terms are the ones `resolveDueDate` already settled for the order, read back as the gap
 * between its `OrderDate` and `DueDate`, so there is one terms lookup, not two. Capping at the order
 * date keeps the row due on or before it, which is what makes confirm issue it (D92).
 */
export function RenewalDueDate(invoiceDay: string, orderDate: DateCell, orderDueDate: DateCell): string {
    const orderDay = ToISODate(orderDate);
    const termsDue = ToISODate(orderDueDate);
    if (!orderDay || !termsDue) {
        throw new Error(`A renewal needs its order date and resolved due date to date its instalment (got ${orderDay}, ${termsDue}).`);
    }
    const netDays = Math.round((Date.parse(termsDue) - Date.parse(orderDay)) / 86_400_000);
    const due = AddDays(invoiceDay, netDays);
    if (!due) throw new Error(`The renewal invoice day '${invoiceDay}' is not a date.`);
    return due < orderDay ? due : orderDay;
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

/** One covering company whose schedule does not match the lines it covers. */
export interface ScheduleShortfall {
    /** The company on the rows: the order's company, or a product company on a pre-golive-#311 order. */
    CompanyID: string;
    Scheduled: number;
    Lines: number;
    /** `Lines − Scheduled`: positive when money is unscheduled, negative when over-scheduled. */
    Difference: number;
}

/** Statuses whose amount still counts toward the tie. A cancelled row has left the schedule. */
const LIVE_STATUSES = new Set(['Scheduled', 'Invoiced', 'Paid', 'WrittenOff']);

const lower = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

/**
 * Which company's rows bill each line company, lower-cased: line company → row company.
 *
 * A product company with live rows of its own (a schedule written before golive #311 that had
 * already issued an instalment, so the migration left it) is billed by those rows. Every other line
 * company, the order's own included, is billed by the order company's rows. A company that appears
 * only on rows is not in the map; {@link ScheduleShortfalls} reports it, since it has no lines.
 */
export function ScheduleCoverage(rows: ScheduleRowFacts[], lineCompanyIDs: string[], orderCompanyID: string): Map<string, string> {
    const order = lower(orderCompanyID);
    const own = new Set(rows.filter((r) => LIVE_STATUSES.has(r.Status)).map((r) => lower(r.CompanyID)));
    const out = new Map<string, string>();
    for (const id of lineCompanyIDs) {
        const company = lower(id);
        out.set(company, company !== order && own.has(company) ? company : order);
    }
    return out;
}

/**
 * Where the schedule fails to tie, per covering company. Empty means it ties — including the case of
 * no rows at all, which is the implicit single instalment and needs nothing.
 *
 * Every covering company with lines OR rows is checked, so rows that bill nothing are reported, and
 * so are lines no row covers.
 */
export function ScheduleShortfalls(rows: ScheduleRowFacts[], lines: ScheduleLineFacts[], orderCompanyID: string): ScheduleShortfall[] {
    const live = rows.filter((r) => LIVE_STATUSES.has(r.Status));
    if (!live.length) return [];

    const coverage = ScheduleCoverage(live, lines.map((l) => l.CompanyID), orderCompanyID);
    const scheduled = new Map<string, number>();
    for (const r of live) scheduled.set(lower(r.CompanyID), Money((scheduled.get(lower(r.CompanyID)) ?? 0) + Number(r.Amount)));
    const lineGross = new Map<string, number>();
    for (const l of lines) {
        const owner = coverage.get(lower(l.CompanyID)) as string;
        lineGross.set(owner, Money((lineGross.get(owner) ?? 0) + Number(l.LineTotalGross ?? 0)));
    }

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

/** A schedule row as {@link CompanySlices} divides it. Fields it does not read pass through. */
export interface SliceableScheduleRow extends ScheduleRowFacts {
    ID: string;
    InstallmentNumber?: number;
    AmountPaid?: number;
}

/**
 * The schedule as the LEDGER sees it: every row divided among the product companies whose lines it
 * bills (golive #311, D13).
 *
 * An order-company row on a multi-company order bills every company's lines, but each company books
 * its own receivable, deposits and revenue. So each live row becomes one copy per covered company,
 * with that company's `CompanyID`, its piece of `Amount` and its piece of `AmountPaid`, and the same
 * `ID`, number, dates, status and document number. Everything that already reads rows per company —
 * the booking switch, the cash split, the deposit release — then works on these copies unchanged.
 *
 * THE PIECES TIE BOTH WAYS when the schedule does: one row's pieces sum to the row, and each
 * company's pieces across all rows sum to that company's gross. Each row in instalment order splits
 * across what each company still has unscheduled, and the last takes the remainder — the same rule
 * the billing entry uses for lines (`TiedSlice`). When the schedule does not tie (a draft being
 * edited, an order whose lines changed), each row is split by gross instead, so the pieces still sum
 * to the row and a payment can still be booked.
 *
 * Where the rows cover one company, which is nearly every order, the copies are the rows with that
 * company stamped and the amounts unchanged. Cancelled rows and a product company's own rows pass
 * through as they are. `AmountPaid` is divided in proportion to the row's pieces.
 */
export function CompanySlices<T extends SliceableScheduleRow>(rows: T[], lines: ScheduleLineFacts[], orderCompanyID: string): T[] {
    const live = rows.filter((r) => LIVE_STATUSES.has(r.Status));
    const coverage = ScheduleCoverage(live, lines.map((l) => l.CompanyID), orderCompanyID);

    // Gross per covered company, per covering company, in id order so the split is stable. The
    // pieces carry each company's id as the lines spell it, since GL lookups key on it.
    const spelling = new Map<string, string>();
    const grossByOwner = new Map<string, Map<string, number>>();
    for (const l of lines) {
        const company = lower(l.CompanyID);
        if (!spelling.has(company)) spelling.set(company, String(l.CompanyID));
        const owner = coverage.get(company) as string;
        const bucket = grossByOwner.get(owner) ?? new Map<string, number>();
        bucket.set(company, Money((bucket.get(company) ?? 0) + Number(l.LineTotalGross ?? 0)));
        grossByOwner.set(owner, bucket);
    }

    const sliced = new Map<string, Array<{ CompanyID: string; Amount: number }>>();
    for (const [owner, gross] of grossByOwner) {
        const companies = [...gross.keys()].sort();
        const ownerRows = live
            .filter((r) => lower(r.CompanyID) === owner)
            .sort((a, b) => Number(a.InstallmentNumber ?? 0) - Number(b.InstallmentNumber ?? 0) || lower(a.ID).localeCompare(lower(b.ID)));
        if (!ownerRows.length) continue;
        const totals = companies.map((c) => gross.get(c) as number);
        const amounts = ownerRows.map((r) => Money(Number(r.Amount)));
        const pieces = companies.length === 1 ? amounts.map((a) => [a]) : splitRows(totals, amounts);
        ownerRows.forEach((r, i) =>
            sliced.set(lower(r.ID), companies.map((c, j) => ({ CompanyID: spelling.get(c) as string, Amount: pieces[i][j] }))),
        );
    }

    const out: T[] = [];
    for (const row of rows) {
        const parts = LIVE_STATUSES.has(row.Status) ? sliced.get(lower(row.ID)) : undefined;
        if (!parts) {
            out.push(row);
            continue;
        }
        if (parts.length === 1) {
            out.push({ ...row, CompanyID: parts[0].CompanyID });
            continue;
        }
        const paid = row.AmountPaid == null ? null : SplitExactly(Number(row.AmountPaid), parts.map((p) => Math.max(0, p.Amount)));
        parts.forEach((p, j) => out.push({ ...row, CompanyID: p.CompanyID, Amount: p.Amount, ...(paid ? { AmountPaid: paid[j] } : {}) }));
    }
    return out;
}

/**
 * Split each row across companies so the pieces tie both ways, or by gross when the rows do not sum
 * to the totals. `pieces[i][j]` is row `i`'s share for company `j`.
 */
function splitRows(totals: number[], rows: number[]): number[][] {
    const cents = (n: number): number => Math.round(Number(n) * 100);
    const weights = totals.map((t) => Math.max(0, t));
    const ties =
        totals.every((t) => t >= 0) && rows.reduce((s, r) => s + cents(r), 0) === totals.reduce((s, t) => s + cents(t), 0);
    if (!ties) return rows.map((r) => SplitExactly(r, weights));

    let remaining = totals.map(cents);
    return rows.map((row, i) => {
        const mine =
            i === rows.length - 1
                ? remaining
                : SplitExactly(row, remaining.map((r) => r / 100)).map(cents);
        remaining = remaining.map((r, j) => r - mine[j]);
        return mine.map((c) => c / 100);
    });
}

/**
 * A schedule row as the booking-scope test reads it.
 *
 * DELIBERATELY NOT `Pick`ed from the generated entity, unlike {@link InstalmentSibling}. These rows
 * arrive from `RunView` with `ResultType: 'simple'`, which hands back the driver's raw values — so
 * `DueDate` is a STRING at runtime, while the entity declares it `Date`. Picking would assert a
 * type the data does not honour, make the `ToISODate` call that handles both look redundant, and
 * hide the string path behind a green compile. A hand-written shape that tells the truth beats a
 * generated one that does not.
 */
export interface ScheduleTimingFacts extends ScheduleRowFacts {
    /** `YYYY-MM-DD`, or anything `Date` parses. Carried for callers; the scope test ignores it. */
    DueDate: string | Date;
    /** The row itself, so confirm can issue the instalments already due (D92). */
    ID?: string;
    InstallmentNumber?: number;
}

/**
 * The line companies on this order that are BILLED BY INSTALMENT, lower-cased (D92).
 *
 * This is the whole scope trigger for the new booking model. A company whose lines are covered by
 * at least one live schedule row raises no BILLING entry at confirm — its receivable reaches the
 * ledger one instalment at a time, as each is invoiced. An order with no rows is untouched.
 *
 * Coverage is {@link ScheduleCoverage}: under golive #311 the order company's rows bill every
 * product company's lines, so every line company is scheduled once the order company has a live
 * row, though the rows carry only the order's `CompanyID`.
 *
 * `Canceled` rows have left the schedule, so a company whose only rows were cancelled is NOT
 * scheduled and books normally. That is the same liveness rule {@link ScheduleShortfalls} uses, by
 * the same constant, so the tie check and the ledger cannot disagree about which rows count.
 *
 * DELIBERATELY NOT A DATE TEST, and under D92 that is worth stating precisely, because the dates do
 * now matter — just not here. This answers one question only: is this company billed by instalment
 * at all? WHICH of its instalments are due on the confirmation date is a separate decision, made by
 * `OrderEntityServer.issueDueInstalments` against each row's own `DueDate` after booking. Folding a
 * date test into this one would couple "does the new model apply" to "what is due today", and a
 * company whose instalments all fall next year would then book as if it had no schedule.
 */
export function ScheduledCompanyIDs(rows: ScheduleTimingFacts[], orderCompanyID: string, lineCompanyIDs: string[]): Set<string> {
    const live = rows.filter((r) => LIVE_STATUSES.has(r.Status));
    const owners = new Set(live.map((r) => lower(r.CompanyID)));
    const out = new Set<string>();
    for (const [company, owner] of ScheduleCoverage(live, lineCompanyIDs, orderCompanyID)) {
        if (owners.has(owner)) out.add(company);
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

/* ── Cash against a scheduled order (D91) ───────────────────────────────────────────────────── */

/**
 * What the payment side needs to know about one instalment. Read by the entity server that owns the
 * transaction and passed in, the way booking passes schedule rows to `OrderJournalEntryFactory` —
 * nothing here queries.
 */
export interface InstalmentCashFacts {
    ID: string;
    CompanyID: string;
    Status: string;
    Amount: number;
    /** As of BEFORE the payment being booked. The rollup has already moved it by the time the
     *  allocation books, so the caller must read these rows before it saves the payment line. */
    AmountPaid: number;
    /** Frozen at invoicing and never cleared, so it — not `Status` — is the record of being billed. */
    DocumentNumber: string | null;
}

/** How one company's share of a payment divides between settling a receivable and sitting as cash held. */
export interface CashSplit {
    /** Cr Accounts Receivable: the part that settles instalments the customer has actually been billed for. */
    Receivable: number;
    /** Cr Customer Deposits: cash for instalments not yet billed, up to what they can still hold.
     *  Money in hand for something not yet billed is a customer deposit; unnamed cash beyond the
     *  whole schedule is not, and stays in `Receivable` as a customer credit. */
    Deposit: number;
}

const LIVE_FOR_CASH = (r: InstalmentCashFacts): boolean => r.Status !== 'Canceled';

/** What a row can still absorb against an invoice the customer holds. Zero for a row never billed. */
function billedUnpaid(row: InstalmentCashFacts): number {
    if (!row.DocumentNumber) return 0;
    return Math.max(0, Money(Number(row.Amount) - Number(row.AmountPaid)));
}

/** What an unbilled row can still hold as a deposit: its unpaid amount. Zero for a billed row. */
function unbilledRoom(row: InstalmentCashFacts): number {
    if (row.DocumentNumber) return 0;
    return Math.max(0, Money(Number(row.Amount) - Number(row.AmountPaid)));
}

/**
 * Divide one company's share of a payment into the receivable it settles and the deposit it leaves.
 *
 * Under D91 a scheduled company books nothing at confirm, so until an instalment is invoiced there
 * is no receivable for cash to clear. Crediting AR anyway would drive it negative and misstate both
 * sides: the customer would appear to be owed money and the obligation to deliver would disappear.
 * Cash ahead of billing is a liability — a deposit — so it credits the Customer Deposits role, and
 * issuing the instalment later clears it against the receivable the invoice raises (#234 review).
 *
 * THE UNSCHEDULED CASE IS NOT A BRANCH. A company with no live rows has unlimited receivable
 * capacity, so the whole share is `Receivable` and `Deposit` is zero — byte-identical to the entry
 * every order books today.
 *
 * @param amount     This company's share of the payment line, always positive.
 * @param companyID  Whose books this entry is.
 * @param rows       Every schedule row on the order, any company; filtered here.
 * @param namedRowID `PaymentLine.OrderHeaderPaymentScheduleID` when the payer named an instalment.
 *                   Then that row alone bounds the receivable: naming a Scheduled instalment is a
 *                   deposit however much the customer owes elsewhere, because they said what the
 *                   money was for.
 */
export function SplitCashForCompany(
    amount: number,
    companyID: string,
    rows: InstalmentCashFacts[],
    namedRowID?: string | null,
): CashSplit {
    const share = Money(amount);
    const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
    const mine = rows.filter((r) => LIVE_FOR_CASH(r) && key(r.CompanyID) === key(companyID));
    if (!mine.length) return { Receivable: share, Deposit: 0 };

    const named = namedRowID ? mine.find((r) => key(r.ID) === key(namedRowID)) : undefined;
    const capacity = named ? billedUnpaid(named) : Money(mine.reduce((sum, r) => sum + billedUnpaid(r), 0));

    const settles = Money(Math.min(share, capacity));

    // UNNAMED CASH BEYOND THE WHOLE SCHEDULE IS A CUSTOMER CREDIT IN AR, NOT A DEPOSIT (Jeremy,
    // 2026-09-25 on #234). Customer Deposits holds only cash against a specific scheduled instalment
    // not yet invoiced; the cascade places unnamed cash on no row once every row is full, so that
    // excess belongs to no instalment and credits AR exactly as on an unscheduled order. The refund
    // then mirrors it with no change: it releases only what the rows held, and the rest debits AR.
    // Named cash is untouched: the cascade puts all of it on the named row, which holds it.
    const room = named ? Infinity : Money(mine.reduce((sum, r) => sum + unbilledRoom(r), 0));
    const deposit = Money(Math.min(share - settles, room));
    return { Receivable: Money(share - deposit), Deposit: deposit };
}

/* ── Consuming, holding and releasing deposits (#234 review) ────────────────────────────────── */

/**
 * Charge a receivable amount against the facts, so the next line of the same payment sees what the
 * previous one used.
 *
 * A payment can carry several allocations against one order, and they book in a loop before any of
 * them is in the database. Without this, two lines would each see the same unpaid invoice and each
 * credit AR for it.
 *
 * A NAMED ROW IS CONSUMED BY NAME. `SplitCashForCompany` bounds a named line's receivable by that
 * row alone, so the consumption has to come off that row too. Charging it billed-rows-first instead
 * would drain a different invoice, and the next line naming THAT invoice would then find no room
 * and turn a real receivable into a deposit. Unnamed cash is charged billed-rows-first in the order
 * the rows came back, which is the database cascade's own order.
 */
export function ConsumeReceivable(
    facts: InstalmentCashFacts[],
    companyID: string,
    amount: number,
    namedRowID?: string | null,
): InstalmentCashFacts[] {
    const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
    const named = namedRowID
        ? facts.find((r) => key(r.ID) === key(namedRowID) && key(r.CompanyID) === key(companyID))
        : undefined;
    let left = Money(amount);
    return facts.map((row) => {
        if (left <= 0 || !row.DocumentNumber || key(row.CompanyID) !== key(companyID)) return row;
        if (named && row !== named) return row;
        const used = Math.min(left, billedUnpaid(row));
        left = Money(left - used);
        return used > 0 ? { ...row, AmountPaid: Money(row.AmountPaid + used) } : row;
    });
}

/**
 * Charge a deposit against the facts, so the next line of the same payment sees the room it used.
 *
 * Without this, two unnamed lines of one payment would each see the same unbilled room and each
 * book a deposit for it, and the excess beyond the schedule would go to Customer Deposits after
 * all. A named row takes the whole deposit (the cascade puts named cash there regardless of room);
 * unnamed cash fills unbilled rows in the order they came back, as the cascade does.
 */
export function ConsumeDeposit(
    facts: InstalmentCashFacts[],
    companyID: string,
    amount: number,
    namedRowID?: string | null,
): InstalmentCashFacts[] {
    const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
    const named = namedRowID
        ? facts.find((r) => key(r.ID) === key(namedRowID) && key(r.CompanyID) === key(companyID))
        : undefined;
    let left = Money(amount);
    return facts.map((row) => {
        if (left <= 0 || key(row.CompanyID) !== key(companyID) || !LIVE_FOR_CASH(row)) return row;
        if (named && row !== named) return row;
        const used = named ? left : Math.min(left, unbilledRoom(row));
        left = Money(left - used);
        return used > 0 ? { ...row, AmountPaid: Money(row.AmountPaid + used) } : row;
    });
}

/**
 * The customer deposits a company's rows hold: cash on a row beyond what that row has billed.
 *
 * An unbilled row's whole `AmountPaid` is a deposit, since nothing was invoiced for it; a billed row
 * holds a deposit only where it has been overpaid. This is the schedule's side of the Customer
 * Deposits balance, and every entry that moves that balance is sized from how this figure moved.
 */
export function HeldDeposit(rows: InstalmentCashFacts[], companyID: string): number {
    const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
    return Money(
        rows
            .filter((r) => LIVE_FOR_CASH(r) && key(r.CompanyID) === key(companyID))
            .reduce((sum, r) => sum + Math.max(0, Number(r.AmountPaid) - (r.DocumentNumber ? Number(r.Amount) : 0)), 0),
    );
}

/**
 * How much deposit an event released for each company: held before it, less held after it.
 *
 * Used for the two events that take cash OUT of deposits — a refund, and issuing an instalment the
 * customer had prepaid. Both are sized from what the database cascade actually did to the rows
 * rather than from a rule re-derived here, so the ledger and the schedule cannot tell different
 * stories: a refund that the cascade takes out of instalment 2's prepayment debits Customer
 * Deposits, one that it takes out of instalment 1's settled invoice debits AR.
 *
 * Unnamed cash beyond every row's room is placed on no row, and the capture credits it to AR rather
 * than Customer Deposits (`SplitCashForCompany`), so a refund that sees only what the rows held
 * debits AR for that excess: the mirror of what the capture booked.
 */
export function DepositReleasedByCompany(before: InstalmentCashFacts[], after: InstalmentCashFacts[]): Map<string, number> {
    const companies = new Set([...before, ...after].map((r) => r.CompanyID.toLowerCase()));
    const out = new Map<string, number>();
    for (const company of companies) {
        out.set(company, Math.max(0, Money(HeldDeposit(before, company) - HeldDeposit(after, company))));
    }
    return out;
}

/** One company's share of a payment line, as the allocation factory divides it. */
export interface ShareAmount {
    CompanyID: string;
    Amount: number;
}

/** What is left to hand out while a payment's lines are planned one after another. */
export interface DepositWorking {
    /** Capture: the schedule as the lines planned so far have left it. */
    Facts: InstalmentCashFacts[];
    /** Reversal: deposit the refund released and no earlier line has claimed, per company. */
    Released: Map<string, number>;
}

/**
 * The deposit part of each company's share of ONE payment line, keyed by lower-cased company id.
 *
 * Capture: whatever `SplitCashForCompany` leaves beyond billed-unpaid, then the receivable is
 * consumed so the next line sees it. Reversal: the share draws on what the refund released,
 * deposit first, and only the rest un-clears AR. A company with no schedule rows gets no entry in
 * the map, which the factory reads as zero deposit — the entry every unscheduled order books.
 */
export function PlanLineDeposits(
    shares: ShareAmount[],
    isReversal: boolean,
    namedRowID: string | null,
    working: DepositWorking,
): { Deposits: Map<string, number>; Working: DepositWorking } {
    const deposits = new Map<string, number>();
    let facts = working.Facts;
    const released = new Map(working.Released);
    for (const share of shares) {
        const company = share.CompanyID.toLowerCase();
        const amount = Money(Math.abs(share.Amount));
        if (isReversal) {
            const deposit = Math.min(amount, released.get(company) ?? 0);
            released.set(company, Money((released.get(company) ?? 0) - deposit));
            if (deposit > 0) deposits.set(company, Money(deposit));
            continue;
        }
        const split = SplitCashForCompany(amount, share.CompanyID, facts, namedRowID);
        facts = ConsumeReceivable(facts, share.CompanyID, split.Receivable, namedRowID);
        facts = ConsumeDeposit(facts, share.CompanyID, split.Deposit, namedRowID);
        if (split.Deposit > 0) deposits.set(company, split.Deposit);
    }
    return { Deposits: deposits, Working: { Facts: facts, Released: released } };
}
