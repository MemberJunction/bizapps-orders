/**
 * @fileoverview When an order is due — the resolution walk, with no database (plan D83).
 *
 * WHY THIS EXISTS AT ALL. `OrderHeader.DueDate` was only ever what a caller passed, and nothing
 * derived it from `PaymentTermsType.NetDays` even though the schema comment promised exactly that.
 * `PaymentTermsType` had no rows, so nobody could pick terms either. The consequence was not a
 * missing feature that looked missing:
 *
 *     Orders.GetOverdueWorklist, as of 2026-12-31 → 0 rows, £0 overdue, every aging bucket zero
 *
 * against 67 orders carrying an unpaid balance. The collections surface reported a quiet afternoon
 * because its only input was null on every row. Aging, the overdue worklist and the invoice's due
 * date all read that one column.
 *
 * THE WALK, and it is the third of this shape in the app — GL account resolution (D5) and price
 * resolution (D69) are the other two, so a reader already knows how to read it:
 *
 *     1. a STATED DueDate           the caller knows the answer; never recomputed
 *     2. a STATED PaymentTermsTypeID   derive OrderDate + NetDays
 *     3. the CUSTOMER's terms       CustomerPaymentTerms, date-effective, optionally per company
 *     4. the SELLING COMPANY's default  AccountingCompanyProfile.DefaultPaymentTermsTypeID
 *     5. due on receipt             the terminal default
 *
 * WHERE CONTRACTS FIT. They do not — deliberately. A contracts app further down the graph populates
 * the order's `DueDate` or `PaymentTermsTypeID` directly, and to Orders that is simply rung 1 or 2.
 * Orders has no knowledge of contracts and should not grow any; "stated" is the whole interface.
 *
 * WHICH IS WHY STATED HAS TO BE RECORDED AS STATED. A due date that was supplied and one that was
 * derived are the same value in the same column, and the difference only shows up on the next save —
 * when a recompute silently moves a date somebody negotiated. `PricingBehavior` already draws this
 * distinction for a stated unit price; this follows it.
 *
 * UNLIKE D5, IT DOES NOT FAIL LOUDLY. An unresolvable GL account means booked money with nowhere to
 * go, so refusing is right. Missing terms have a sane answer — due on receipt — and refusing an
 * order because nobody configured a lookup would be hostile for no gain.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { ToISODate, type DateCell } from '@mj-biz-apps/orders-entities';

/** A terms record as the walk needs it. */
export interface TermsFacts {
    PaymentTermsTypeID: string;
    /** Days from the order date to the due date. 0 means due on receipt. */
    NetDays: number | null;
}

/** One rung 3 candidate: what a particular buyer negotiated. */
export interface CustomerTermsFacts extends TermsFacts {
    /** Null when the terms apply whoever is selling. */
    CompanyID: string | null;
    StartedAt: DateCell;
    EndedAt: DateCell;
    Status: string;
}

/** Everything the walk may consult, gathered by the caller. */
export interface TermsResolutionInput {
    /** What the caller stated on the order, if anything. */
    StatedDueDate: DateCell;
    StatedPaymentTermsTypeID: string | null;
    /** The date the terms run from. */
    OrderDate: string;
    /** The selling company, used to narrow customer terms and to find the company default. */
    CompanyID: string | null;
    /** Rung 3 candidates for this buyer, in any order. */
    CustomerTerms: readonly CustomerTermsFacts[];
    /** Rung 4 — the selling company's default, or null when it has no profile. */
    CompanyDefault: TermsFacts | null;
    /** `NetDays` by terms id, for resolving a stated `PaymentTermsTypeID`. */
    TermsByID: ReadonlyMap<string, TermsFacts>;
}

export type TermsSource = 'StatedDueDate' | 'StatedTerms' | 'CustomerTerms' | 'CompanyDefault' | 'DueOnReceipt';

export interface TermsResolution {
    /** `YYYY-MM-DD`, or null only when the order date itself was unusable. */
    DueDate: string | null;
    /** The terms record the date came from, when one was involved. */
    PaymentTermsTypeID: string | null;
    /** Which rung answered — recorded so a later save can tell stated from derived. */
    Source: TermsSource;
    /** True when the caller supplied the date and it must never be recomputed. */
    WasStated: boolean;
}

/**
 * ISO date arithmetic that does not drift across a DST boundary.
 *
 * Takes the cell in whatever shape it arrived. The previous form split `String(iso)` on '-', which
 * on a `Date` finds nothing to split and yields `NaN` — so every date-effective terms row silently
 * stopped applying and the order fell through to the company default. It failed safe rather than
 * wrong, but it still restated what a customer had negotiated.
 */
function dayNumber(cell: DateCell): number {
    const iso = ToISODate(cell);
    if (!iso) return Number.NaN;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return Number.NaN;
    return Date.UTC(y, m - 1, d);
}

/** `from` plus `days`, as `YYYY-MM-DD`. */
export function AddDays(from: DateCell, days: number): string | null {
    const base = dayNumber(from);
    if (Number.isNaN(base)) return null;
    return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Whether a customer-terms row applies to this order.
 *
 * DATE-EFFECTIVE ON THE ORDER DATE, not on today. Renegotiating terms must not restate what an old
 * order was due on — an order placed under Net 30 stays due when it was always due, however the
 * relationship changed afterwards.
 *
 * A row scoped to a company applies only to that company's orders; an unscoped row applies to any.
 */
export function CustomerTermsApply(row: CustomerTermsFacts, orderDate: DateCell, companyID: string | null): boolean {
    if (row.Status !== 'Active') return false;
    if (row.CompanyID && companyID && row.CompanyID.toLowerCase() !== companyID.toLowerCase()) return false;
    // A row scoped to a company cannot apply to an order with no company at all.
    if (row.CompanyID && !companyID) return false;

    const on = dayNumber(orderDate);
    if (Number.isNaN(on)) return false;
    if (row.StartedAt && on < dayNumber(row.StartedAt)) return false;
    // `EndedAt` is exclusive: terms that ended on the 1st do not cover an order placed on the 1st.
    if (row.EndedAt && on >= dayNumber(row.EndedAt)) return false;
    return true;
}

/**
 * The most specific applicable customer terms.
 *
 * COMPANY-SCOPED BEATS UNSCOPED, because a subsidiary that negotiated its own terms meant to
 * override the group's. Among equally specific rows the one that started most recently wins — a
 * later negotiation supersedes an earlier one — and a row with no start date is treated as having
 * always applied, so it loses to any dated row.
 */
export function BestCustomerTerms(
    rows: readonly CustomerTermsFacts[],
    orderDate: string,
    companyID: string | null,
): CustomerTermsFacts | null {
    const applicable = rows.filter((r) => CustomerTermsApply(r, orderDate, companyID));
    if (!applicable.length) return null;

    return applicable.reduce((best, row) => {
        const bestScoped = best.CompanyID ? 1 : 0;
        const rowScoped = row.CompanyID ? 1 : 0;
        if (rowScoped !== bestScoped) return rowScoped > bestScoped ? row : best;

        const bestStart = best.StartedAt ? dayNumber(best.StartedAt) : Number.NEGATIVE_INFINITY;
        const rowStart = row.StartedAt ? dayNumber(row.StartedAt) : Number.NEGATIVE_INFINITY;
        return rowStart > bestStart ? row : best;
    });
}

/**
 * Walk the rungs and produce the due date.
 *
 * Never throws and never returns "unknown": every order gets a date or an explicit due-on-receipt,
 * which is the order date itself.
 */
export function ResolveDueDate(input: TermsResolutionInput): TermsResolution {
    // 1. Stated wins outright. Recomputing what somebody negotiated is the failure this rung exists
    //    to prevent, and it is also how a contracts app supplies an answer Orders cannot derive.
    if (input.StatedDueDate) {
        return {
            DueDate: ToISODate(input.StatedDueDate),
            PaymentTermsTypeID: input.StatedPaymentTermsTypeID ?? null,
            Source: 'StatedDueDate',
            WasStated: true,
        };
    }

    // 2. Stated terms — the caller chose the terms and wants the date derived from them.
    if (input.StatedPaymentTermsTypeID) {
        const terms = input.TermsByID.get(input.StatedPaymentTermsTypeID.toLowerCase());
        if (terms) {
            return {
                DueDate: AddDays(input.OrderDate, terms.NetDays ?? 0),
                PaymentTermsTypeID: terms.PaymentTermsTypeID,
                Source: 'StatedTerms',
                WasStated: false,
            };
        }
        // Terms named but unresolvable: fall through rather than refuse. The id is still recorded on
        // the order, so the mistake is visible without holding up the sale.
    }

    // 3. What this buyer negotiated.
    const customer = BestCustomerTerms(input.CustomerTerms, input.OrderDate, input.CompanyID);
    if (customer) {
        return {
            DueDate: AddDays(input.OrderDate, customer.NetDays ?? 0),
            PaymentTermsTypeID: customer.PaymentTermsTypeID,
            Source: 'CustomerTerms',
            WasStated: false,
        };
    }

    // 4. What the selling company does by default.
    if (input.CompanyDefault) {
        return {
            DueDate: AddDays(input.OrderDate, input.CompanyDefault.NetDays ?? 0),
            PaymentTermsTypeID: input.CompanyDefault.PaymentTermsTypeID,
            Source: 'CompanyDefault',
            WasStated: false,
        };
    }

    // 5. Due on receipt. An explicit answer rather than a null, so the collections worklist has
    //    something to age against on every order rather than silently skipping the unconfigured ones.
    return {
        DueDate: AddDays(input.OrderDate, 0),
        PaymentTermsTypeID: null,
        Source: 'DueOnReceipt',
        WasStated: false,
    };
}
