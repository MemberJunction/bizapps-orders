/**
 * A subscription sold for a length other than its type's term (golive #338).
 *
 * Confirm honors a stated service period, so a line can sell 6, 13, 18 or 24 months of a product whose
 * subscription type renews yearly. The length is a commercial decision, and it usually arrives with
 * the type's one-term price unchanged: a year's price for 13 months gives a month away, and a year's
 * price for 6 months charges for six months the customer does not get. Neither is refused and neither
 * is repriced: the dates and the price are what was sold. Each such line is raised for finance review
 * as `SUBSCRIPTION_TERM_LENGTH`, with what the length and the price come to at the list rate.
 *
 * NOTHING HERE BLOCKS POSTING, like the below-engine price exception: the raise joins the booking
 * transaction, a failure to raise fails the booking, and nothing is raised while accounting has no
 * active type of this code.
 *
 * An approved program that sells a longer first term (a referral program's thirteenth month) is not
 * exempted yet: no record links a new line to such a program.
 *
 * CONNECTS TO:
 *   CALLER: OrderEntityServer (booking save, inside its transaction)
 *   READS:  @mj-biz-apps/orders-entities ResolveLinePriceStanding
 *   OPS:    'Accounting.GetFinanceExceptionTypes', 'Accounting.RaiseFinanceExceptions' (via AccountingBridge)
 */
import { LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ResolveLinePriceStanding, type PricedLineFacts } from '@mj-biz-apps/orders-entities';
import { GetActiveFinanceExceptionType, RaiseFinanceExceptions, type FinanceExceptionToRaise } from './AccountingBridge.js';
import { ORDER_LINE_ENTITY } from './entity-names.js';

export const TERM_LENGTH_TYPE_CODE = 'SUBSCRIPTION_TERM_LENGTH';

/** A booked subscription line whose stated period sets its length. */
export interface StatedLengthLine extends PricedLineFacts {
    ID: string;
    LineNumber: number | null;
    ProductName: string;
    CompanyID: string;
    /** The line after discounts, before tax and charges, as booked. */
    LineTotalNet: number;
    /** False for a line whose price the engine filled, which is the list price by definition. */
    PriceStated: boolean;
    CoverageStart: Date;
    CoverageEnd: Date;
    /** The coverage's length in months, and the subscription type's term length. */
    Months: number;
    TypeMonths: number;
}

/** What a line's length and price come to, for the exception. */
export interface TermLengthReview {
    /** The line is charged the list price for one type term. */
    PriceUnchanged: boolean;
    /** What the stated length costs at the list rate, less what the line charges; null without a list price. */
    Difference: number | null;
    Summary: string;
}

const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const amount = (v: number) => v.toFixed(2);
const months = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} month${n === 1 ? '' : 's'}`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Judge one line: is its price the type term's list price, and what does the stated length come to at
 * that rate. Pure.
 *
 * @param listPrice  the line's list price for one type term (unit price × quantity), or null when
 *                   nothing resolves one
 * @param isListPrice the line's price is a list price: the engine's own or a named list pick. A price
 *                   equal to `listPrice` counts as unchanged too.
 */
export function ReviewTermLength(line: StatedLengthLine, orderNumber: string, listPrice: number | null, isListPrice: boolean): TermLengthReview {
    const which = `Line ${line.LineNumber ?? '?'} of order ${orderNumber} (${line.ProductName})`;
    const length =
        `covers ${months(line.Months)}, ${day(line.CoverageStart)} to ${day(line.CoverageEnd)}; ` +
        `its subscription type's term is ${months(line.TypeMonths)}.`;
    const charged = money(line.LineTotalNet);
    if (listPrice == null) {
        return {
            PriceUnchanged: false,
            Difference: null,
            Summary: `${which} ${length} It is priced at ${amount(charged)}; no list price resolves to compare it with.`,
        };
    }

    // Unchanged when it is the engine's price, a named list pick, or simply equal to the list price.
    // A named list pick is the list price this customer gets, so the length is measured against it.
    const unchanged = isListPrice || money(listPrice) === charged;
    const basis = unchanged ? charged : money(listPrice);
    const atListRate = money((basis * line.Months) / line.TypeMonths);
    const difference = money(atListRate - charged);
    let price: string;
    if (unchanged) {
        const gap = Math.abs(line.Months - line.TypeMonths);
        price =
            line.Months > line.TypeMonths
                ? `It is priced at ${amount(charged)}, the list price for ${months(line.TypeMonths)}, so ${months(gap)} ` +
                  `${gap === 1 ? 'is' : 'are'} not charged for (${amount(Math.abs(difference))} at the list rate).`
                : `It is priced at ${amount(charged)}, the list price for ${months(line.TypeMonths)}, so it charges for ` +
                  `${months(gap)} it does not cover (${amount(Math.abs(difference))} at the list rate).`;
    } else {
        price =
            `It is priced at ${amount(charged)} against a list price of ${amount(basis)} for ` +
            `${months(line.TypeMonths)}; ${months(line.Months)} at that rate is ${amount(atListRate)}.`;
    }
    return { PriceUnchanged: unchanged, Difference: difference, Summary: `${which} ${length} ${price}` };
}

export interface TermLengthBooking {
    OrderHeaderID: string;
    OrderNumber: string | null;
    Lines: readonly StatedLengthLine[];
    /** The business day of the confirm, `YYYY-MM-DD`. Asked only when there is a line to raise. */
    BusinessDay: () => Promise<string>;
}

export interface TermLengthOutcome {
    /** Lines whose length differs from their type's term. */
    Lines: number;
    /** Exceptions accounting created; an existing one for the same line is not counted. */
    Created: number;
    /** Set when nothing was raised because the type is missing or inactive. */
    SkippedReason?: string;
}

/**
 * Raise `SUBSCRIPTION_TERM_LENGTH` for every line of a booking whose stated length differs from its
 * subscription type's term.
 *
 * @param user  the booking's context user; null when the save had none, which records the exception
 *              with no creator and `CreatorUnresolved` set.
 * @throws when accounting cannot be read or refuses the raise — the booking must roll back
 */
export async function RaiseTermLengthExceptions(
    booking: TermLengthBooking,
    provider: IMetadataProvider,
    user: UserInfo | null,
): Promise<TermLengthOutcome> {
    const differing = booking.Lines.filter((l) => Math.abs(l.Months - l.TypeMonths) > 0.005);
    if (differing.length === 0) return { Lines: 0, Created: 0 };

    const actingUser = user as UserInfo;
    const orderNumber = booking.OrderNumber ?? booking.OrderHeaderID;
    const type = await GetActiveFinanceExceptionType(TERM_LENGTH_TYPE_CODE, provider, actingUser);
    if (!type) {
        LogStatus(`${differing.length} line(s) of order ${orderNumber} sold for a length other than their subscription type's term were not raised.`);
        return { Lines: differing.length, Created: 0, SkippedReason: 'the type is missing or inactive' };
    }

    const day = await booking.BusinessDay();
    const drafts: FinanceExceptionToRaise[] = [];
    for (const line of differing) {
        const standing = line.PriceStated ? await ResolveLinePriceStanding(line, provider, actingUser) : null;
        const unitList = line.PriceStated ? (standing?.EngineUnitPrice ?? null) : Number(line.UnitPrice ?? 0);
        const listPrice = unitList == null ? null : unitList * Math.abs(Number(line.Quantity ?? 0));
        const isListPrice = !line.PriceStated || !!standing?.IsEnginePrice || !!standing?.IsNamedListPick;
        const review = ReviewTermLength(line, orderNumber, listPrice, isListPrice);
        drafts.push({
            TypeCode: TERM_LENGTH_TYPE_CODE,
            SourceEntityName: ORDER_LINE_ENTITY,
            SourceRecordID: line.ID,
            CompanyID: line.CompanyID,
            Amount: review.Difference == null ? null : Math.abs(review.Difference),
            ExceptionDate: day,
            Summary: review.Summary,
            DedupeKey: line.ID,
            SourceCreatedByUserID: user?.ID ?? null,
            CreatorUnresolved: !user,
        });
    }

    const outcome = await RaiseFinanceExceptions(drafts, `the term length exceptions for the booking of order ${orderNumber}`, provider, actingUser);
    return { Lines: differing.length, Created: outcome.Results.filter((r) => r.Created).length };
}
