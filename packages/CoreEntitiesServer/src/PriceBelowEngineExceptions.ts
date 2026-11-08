/**
 * Finance exception type 4 — a line booked below its engine price with no approved concession
 * (golive #279). A `DiscountPct` the gate counts is raised here too (golive #305): it gives away value
 * the same way, and the gate and this report must agree about what a concession is.
 *
 * NOTHING HERE BLOCKS POSTING. The concession gate on `OrderEntityServer` refuses a confirm whose
 * lines give away value no approved concession covers, but some bookings still get past it — the
 * gate is skipped when the save has no context user, and it runs before bundle expansion, proration
 * and pricing and against the header as it was last saved. This records those lines for finance to
 * review at month end; it does not refuse them.
 *
 * The lines are judged by the gate's own evaluation (`FindUncoveredLinePrices`), so the two cannot
 * disagree about what a concession is: bundle components, reversals, the engine's own price and a
 * named list pick raise nothing here, as they hold nothing there.
 *
 * A FAILURE TO RAISE FAILS THE BOOKING. The raise joins the booking transaction, and an exception
 * that could not be recorded must not be silently lost. Accounting is consulted only when there is
 * a line to raise, so a booking with none never depends on the finance exception operations.
 *
 * CONNECTS TO:
 *   CALLER: OrderEntityServer (booking save, inside its transaction)
 *   READS:  ConcessionGate.FindUncoveredLinePrices
 *   OPS:    'Accounting.GetFinanceExceptionTypes', 'Accounting.RaiseFinanceExceptions' (via AccountingBridge)
 */
import { LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GetActiveFinanceExceptionType, RaiseFinanceExceptions, type FinanceExceptionToRaise } from './AccountingBridge.js';
import {
    FindUncoveredLinePrices,
    LineConcessionTerms,
    type ConcessionLineFacts,
    type UncoveredLinePrice,
} from './ConcessionGate.js';
import { ORDER_LINE_ENTITY } from './entity-names.js';

export const PRICE_BELOW_ENGINE_TYPE_CODE = 'PRICE_BELOW_ENGINE_UNAPPROVED';

/** A booked line as the review reads it: the gate's facts plus the company the line books to. */
export interface BookedLineFacts extends ConcessionLineFacts {
    CompanyID: string;
}

export interface PriceBelowEngineBooking {
    OrderHeaderID: string;
    OrderNumber: string | null;
    /** The order's lines as the booking save wrote them. */
    Lines: readonly BookedLineFacts[];
    /** The business day of the confirm, `YYYY-MM-DD`. Asked only when there is a line to raise. */
    BusinessDay: () => Promise<string>;
}

/** What the review did, for the booking's log and for tests. */
export interface PriceBelowEngineOutcome {
    /** Lines below their engine price with value no approved concession covers. */
    Uncovered: number;
    /** Exceptions accounting created; an existing one for the same line is not counted. */
    Created: number;
    /** Set when nothing was raised because the type is missing or inactive. */
    SkippedReason?: string;
}

/**
 * Raise `PRICE_BELOW_ENGINE_UNAPPROVED` for every line of a booking that is priced below its engine
 * price with no Approved concession covering it.
 *
 * @param user  the booking's context user; null when the save had none, which records the exception
 *              with no creator and `CreatorUnresolved` set.
 * @throws when accounting cannot be read or refuses the raise — the booking must roll back
 */
export async function RaisePriceBelowEngineExceptions(
    booking: PriceBelowEngineBooking,
    provider: IMetadataProvider,
    user: UserInfo | null,
): Promise<PriceBelowEngineOutcome> {
    // The booking walk passes its context user on the same terms: downstream reads accept what the
    // entity was given.
    const actingUser = user as UserInfo;
    const uncovered = await FindUncoveredLinePrices(booking.OrderHeaderID, booking.Lines, provider, actingUser);
    if (uncovered.length === 0) return { Uncovered: 0, Created: 0 };

    // Null when accounting has no such type or has switched it off; the bridge logs which.
    const type = await GetActiveFinanceExceptionType(PRICE_BELOW_ENGINE_TYPE_CODE, provider, actingUser);
    if (!type) {
        LogStatus(
            `${uncovered.length} line(s) of order ${booking.OrderNumber ?? booking.OrderHeaderID} priced below the ` +
                `engine were not raised.`,
        );
        return { Uncovered: uncovered.length, Created: 0, SkippedReason: 'the type is missing or inactive' };
    }

    const day = await booking.BusinessDay();
    const companyByLine = new Map(booking.Lines.map((l) => [(l.ID ?? '').toLowerCase(), l.CompanyID]));
    const drafts = uncovered.map((u) => draftFor(u, booking, day, companyByLine, user));

    const what = `the below-engine price exceptions for the booking of order ${booking.OrderNumber ?? booking.OrderHeaderID}`;
    const outcome = await RaiseFinanceExceptions(drafts, what, provider, actingUser);
    return { Uncovered: uncovered.length, Created: outcome.Results.filter((r) => r.Created).length };
}

function draftFor(
    u: UncoveredLinePrice,
    booking: PriceBelowEngineBooking,
    day: string,
    companyByLine: Map<string, string>,
    user: UserInfo | null,
): FinanceExceptionToRaise {
    const lineID = u.Line.ID as string;
    const companyID = companyByLine.get(lineID.toLowerCase());
    if (!companyID) {
        throw new Error(`Order line ${lineID} has no company, so its finance exception has nowhere to be raised.`);
    }
    return {
        TypeCode: PRICE_BELOW_ENGINE_TYPE_CODE,
        SourceEntityName: ORDER_LINE_ENTITY,
        SourceRecordID: lineID,
        CompanyID: companyID,
        Amount: u.Shortfall,
        ExceptionDate: day,
        Summary: summaryFor(u, booking),
        DedupeKey: lineID,
        SourceCreatedByUserID: user?.ID ?? null,
        CreatorUnresolved: !user,
    };
}

function summaryFor(u: UncoveredLinePrice, booking: PriceBelowEngineBooking): string {
    const covered =
        u.ApprovedValue > 0
            ? `an approved concession covers ${u.ApprovedValue.toFixed(2)} of it`
            : 'no approved concession covers it';
    return (
        `Line ${u.Line.LineNumber ?? '?'} of order ${booking.OrderNumber ?? booking.OrderHeaderID} was booked ` +
        `${LineConcessionTerms(u.Line, u.Concession)}, a ${u.Concession.Form} concession worth ` +
        `${u.Concession.Valuation.Value.toFixed(2)}; ${covered}.`
    );
}
