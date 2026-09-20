/**
 * OrderJournalEntryFactory — turns an order's lines into balanced journal-entry drafts.
 *
 * Plan D10: ONE BOOKING JE PER ORDER LINE, always — even multiple lines of the same company. The
 * "order-level journal entry" is a UI aggregation of the line JEs, never a row.
 *
 * Plan D11 — the booking entry per line:
 *
 *     Dr  Accounts Receivable      net (+ tax when the tax build lands)
 *     Dr  Sales Discounts          discount            (contra; omitted when 0)
 *         Cr  Sales                gross               (recognized at booking)
 *         Cr  Deferred Revenue     gross               (deferred — released per the schedule)
 *
 * where net is the LINE'S OWN stored LineTotalNet — the authority, not a recomputation —
 * discount = (rate-gross × DiscountPct) + DiscountAmount, and gross = net + discount.
 * Both discount fields are applied because the line applies both.
 * The entry balances by construction: net + discount = gross.
 *
 * Plan D91 — A COMPANY BILLED BY INSTALMENT BOOKS NO VALUE HERE. The order and its schedule are
 * the subledger; the ledger records what happened — billed, collected, earned. So when a company
 * on the order carries live payment-schedule rows, confirm raises NO value entry for its lines:
 * the same entry is raised once per instalment, at invoicing, for that instalment's slice, by
 * `EmitInstalmentInvoiceEntry` (./InstalmentInvoiceEntry.ts). Both moments build their lines with
 * {@link BuildValueEntryLines}, so they cannot drift into booking different shapes.
 *
 * An UP-FRONT line on such a company still earns at booking, so it emits `Dr Deferred Revenue /
 * Cr Sales` — today's credit side with the AR debit replaced by Deferred. Deferred then runs to a
 * debit balance until the instalments are invoiced, and THAT debit balance is the contract asset;
 * it is presented as Unbilled Receivable by a period-end reclass, not by a second running account
 * in this file. (This supersedes D89, which split the booking debit between AR and Unbilled and
 * put the whole contract value on the balance sheet at signature.)
 *
 * An order with NO schedule — every order that exists today — is untouched, byte for byte.
 *
 * Plan D14/D43 — RECOGNITION. The product's `RevenueRecognitionType` names a pluggable driver
 * (see ./RevenueRecognition.ts) that returns a schedule of dates and amounts. For a DEFERRED type
 * we emit one REAL FORWARD-DATED entry per schedule slice:
 *
 *     Dr  Deferred Revenue         slice
 *         Cr  Sales                slice        (EffectiveDate = the recognition date)
 *
 * No materializer, no wake-up job — the ledger holds the future. A 12-month subscription books one
 * AR/Deferred entry plus twelve dated release entries, all inside the same booking transaction.
 * An UpFront line skips the deferral round-trip entirely and credits Sales directly.
 *
 * Plan D31 — DIMENSIONS. Each line's tags ride onto every JE line the line produces, so
 * departmental/segment reporting survives into the ledger and through batch summarization. Two
 * sources feed them: the `OrderLineDimension` child rows, and the single tag stated on the line
 * itself (`OrderLine.DimensionID` / `.DimensionValueID`, golive #236) — see `MergeLineDimensions`
 * for which wins where they name the same axis.
 *
 * NEGATIVE QUANTITIES are the reversal mechanism (plan D16) — they flow through the same
 * arithmetic and mirror every entry, so returns and credit memos need no special path.
 *
 * CONNECTS TO:
 *   RESOLVER: GLAccountResolver (./GLAccountResolver.ts) — role → account, with the company guard
 *   DRIVERS:  RevenueRecognitionDriver (./RevenueRecognition.ts) — the schedule
 *   CALLER:   OrderEntityServer.Save (./OrderEntityServer.ts) — owns the transaction
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    LoadOrdersEngine,
    OrdersEngine,
    type mjBizAppsOrdersOrderHeaderEntity,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { ResolveRevenueRecognitionTypeID } from './SubscriptionBehavior.js';
import { ScheduledCompanyIDs, type ScheduleTimingFacts } from './PaymentScheduleBehavior.js';
import { GL_ROLE, GLAccountResolver, GLAccountResolutionError } from './GLAccountResolver.js';
import { RevenueRecognitionDriver, type RevRecEntry } from './RevenueRecognition.js';
import { GIFT_CARD_PRODUCT_TYPE_CODE } from './GiftCardBehavior.js';
import { MergeLineDimensions } from './LineDimensionMerge.js';
import type { InstalmentLineFacts } from './InstalmentInvoiceEntry.js';

/** Mirrors accounting's `JournalEntryLineDraft`. */
export interface JELineDraft {
    GLAccountID: string;
    DebitAmount?: number;
    CreditAmount?: number;
    Description?: string;
    Dimensions?: Array<{ DimensionID: string; DimensionValueID: string }>;
}

export interface JEDraft {
    EffectiveDate: string;
    EntryType: string;
    Description?: string;
    LinkedEntityID?: string;
    LinkedRecordID?: string;
    Lines: JELineDraft[];
}

/**
 * One draft plus what it belongs to. `IsBooking` marks the entry whose ID gets stamped onto
 * `OrderLine.JournalEntryID`; recognition entries are dated releases that hang off the schedule.
 */
export interface OrderLineDraft {
    OrderLineID: string;
    IsBooking: boolean;
    /** The term a recognition draft belongs to, when the line created one (D46). */
    SubscriptionTermID?: string;
    /** Set on recognition drafts — the period this release covers, carried onto the entry itself. */
    RecognitionEntry?: RevRecEntry;
    Draft: JEDraft;
}

interface ProductRow {
    ID: string;
    CompanyID: string;
    ProductCategoryID: string | null;
    ProductTypeID: string;
    RevenueRecognitionTypeID: string;
    Name: string;
}

interface RevRecTypeRow {
    ID: string;
    Code: string;
    DriverClass: string;
    IsDeferred: boolean;
}

interface LineDimensionRow {
    OrderLineID: string;
    DimensionID: string;
    DimensionValueID: string;
}

/**
 * Swap every line's debit and credit side. This is what "reversing" means in double-entry: the
 * original `Dr AR / Cr Deferred Revenue` becomes `Dr Deferred Revenue / Cr AR`, at the same
 * positive amount. Returns the input untouched when `reverse` is false, so callers can apply it
 * unconditionally.
 */
function mirrorIf(reverse: boolean, lines: JELineDraft[]): JELineDraft[] {
    if (!reverse) return lines;
    return lines.map((l) => ({
        ...l,
        DebitAmount: l.CreditAmount,
        CreditAmount: l.DebitAmount,
    }));
}

function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isoDate(d: Date): string {
    return new Date(d).toISOString().slice(0, 10);
}

/**
 * What one order line is worth, decomposed the way the ledger books it.
 *
 * THE LINE IS THE AUTHORITY ON ITS OWN MONEY. `net` is the stored `LineTotalNet`, never a
 * recomputation: re-deriving it as quantity x UnitPrice is only correct for PerUnit pricing, and on
 * a Flat rule the unit price is a DERIVED rate that cannot always represent the total — a flat 100
 * at quantity 3 booked 99.99. The entry still BALANCED, which is exactly the failure this file's
 * header warns about. Anchoring net to the stored total and deriving gross as net + discount keeps
 * `net + discount = gross` true by construction.
 *
 * BOTH discount fields, in the same order `OrderLineEntityServer` applies them (D70) — the rate is
 * used only for the discount split, which is the one part the line does not store separately.
 *
 * Amounts are ABSOLUTE. A negative quantity is a reversal, which is mirrored at the end (D16)
 * rather than fed through as a negative debit.
 *
 * Shared with the instalment billing entry, which slices these same amounts — so a scheduled and a
 * non-scheduled order cannot disagree about what a line is worth.
 */
export function LineAmounts(line: mjBizAppsOrdersOrderLineEntity): ValueEntryAmounts {
    const grossFromRate = money(Math.abs(line.Quantity) * line.UnitPrice);
    const pctDiscount = money(grossFromRate * (line.DiscountPct ?? 0));
    const amountDiscount = money(Math.min(Math.max(0, grossFromRate - pctDiscount), line.DiscountAmount ?? 0));
    const discount = money(pctDiscount + amountDiscount);
    const net = money(Math.abs(Number(line.LineTotalNet ?? 0)));
    return {
        Net: net,
        Tax: money(Math.abs(line.LineTax ?? 0)),
        Charges: money(Math.abs(line.ChargeAmount ?? 0)),
        Discount: discount,
        Gross: money(net + discount),
    };
}

/**
 * The money a value entry is raised for: one line's own amounts, or one instalment's slice of them.
 *
 * Passed in rather than derived from a fraction so that a slice is EXACT. The caller owns the
 * split — `SplitExactly` across the instalments — and hands the pieces here already reconciled;
 * deriving them from a percentage inside this function would round each amount independently and
 * the slices would stop summing to the line.
 */
export interface ValueEntryAmounts {
    Net: number;
    Tax: number;
    Charges: number;
    Discount: number;
    /** `Net + Discount`. Carried rather than recomputed so a slice stays exact. */
    Gross: number;
}

/** Where each leg of a value entry posts. Charge amounts are already sliced by the caller. */
export interface ValueEntryAccounts {
    AR: string;
    Credit: string;
    CreditLabel: string;
    /** Null nets the discount into the revenue credit instead (plan D11). */
    Discount: string | null;
    ChargeCredits: Array<{ GLAccountID: string; Amount: number; Label: string }>;
}

/**
 * The VALUE ENTRY — what the customer owes and what it is owed for (D10/D11):
 *
 *     Dr  Accounts Receivable      net + tax + charges
 *     Dr  Sales Discounts          discount            (contra; omitted with no account)
 *         Cr  Sales / Deferred     gross (or net when the discount nets in)
 *         Cr  each charge and tax  its own amount
 *
 * ONE CONSTRUCTION, TWO MOMENTS (D91). An order with no payment schedule raises this at confirm,
 * exactly as it always has. A company billed by instalment raises the same entry once per
 * instalment, at invoicing, for that instalment's slice — so the two paths cannot drift into
 * booking different shapes, which is the failure this extraction exists to prevent.
 *
 * Returns UNFILTERED lines including zeros; the caller drops zeros and mirrors reversals, because
 * those rules belong to the entry, not to its arithmetic.
 */
export function BuildValueEntryLines(
    amounts: ValueEntryAmounts,
    accounts: ValueEntryAccounts,
    label: string,
    dimensions: Array<{ DimensionID: string; DimensionValueID: string }>,
): JELineDraft[] {
    const lines: JELineDraft[] = [
        {
            GLAccountID: accounts.AR,
            DebitAmount: money(amounts.Net + amounts.Tax + amounts.Charges),
            Description: `AR — ${label}`,
            Dimensions: dimensions,
        },
        {
            GLAccountID: accounts.Credit,
            CreditAmount: accounts.Discount ? amounts.Gross : amounts.Net,
            Description: `${accounts.CreditLabel} — ${label}`,
            Dimensions: dimensions,
        },
    ];
    if (accounts.Discount) {
        lines.push({
            GLAccountID: accounts.Discount,
            DebitAmount: amounts.Discount,
            Description: `Discount — ${label}`,
            Dimensions: dimensions,
        });
    }
    // CHARGE AND TAX CREDITS (D71). AR is debited for net + tax + charges, so every one of those
    // needs a matching credit or the entry does not balance. Each charge credits an account
    // resolved from its CHARGE TYPE, so shipping revenue and a tax liability go to different
    // places without this function knowing what either means.
    for (const c of accounts.ChargeCredits) {
        lines.push({
            GLAccountID: c.GLAccountID,
            CreditAmount: c.Amount,
            Description: `${c.Label} — ${label}`,
            Dimensions: dimensions,
        });
    }
    return lines;
}

export class OrderJournalEntryFactory {
    constructor(
        private readonly _resolver: GLAccountResolver,
        private readonly _orderLineEntityID: string,
        private readonly _subscriptionTermEntityID: string,
        private readonly _chargeTypeEntityID: string,
        private readonly _provider: IMetadataProvider,
        private readonly _contextUser: UserInfo,
    ) {}

    /**
     * Build every draft the order needs: one booking entry per line, plus the forward-dated
     * recognition entries for deferred lines. Throws on the first line that cannot be resolved —
     * booking is all-or-none, so partial results have no value.
     */
    public async BuildDrafts(
        order: mjBizAppsOrdersOrderHeaderEntity,
        lines: mjBizAppsOrdersOrderLineEntity[],
        /**
         * Terms created for subscription lines during this confirm, keyed by OrderLineID (D46).
         * Recognition entries anchor to the TERM — the release is caused by time passing over that
         * coverage period. The booking entry stays on the line: that is caused by the sale.
         */
        termsByLine?: Map<string, { ID: string; StartDate: Date; EndDate: Date; Amount: number }>,
        /** Months per recognition slice, per line, from the subscription type's cadence (D45). */
        recognitionMonthsByLine?: Map<string, number>,
        /**
         * The order's payment schedule rows, which decide how much of each line's debit is a
         * CONTRACT ASSET rather than a receivable (D89). Passed in rather than queried here: the
         * caller already reads them for the tie check and already owns the transaction, so the
         * side effect stays visible at the call site and this factory stays testable without a
         * live database. Absent or empty means one implicit instalment due at booking — every
         * line debits AR exactly as it did before payment schedules existed.
         */
        scheduleRows?: ScheduleTimingFacts[],
    ): Promise<OrderLineDraft[]> {
        if (lines.length === 0) {
            throw new Error(`Order ${order.OrderNumber} has no lines to book.`);
        }

        const products = await this.loadProducts(lines.map((l) => l.ProductID));
        const giftCardTypeIDs = await this.loadGiftCardTypeIDs();
        const revRecTypes = await this.loadRevRecTypes();
        const dimensions = await this.loadLineDimensions(lines.map((l) => l.ID));
        const effectiveDate = this.effectiveDateOf(order);
        const asOf = new Date(effectiveDate);
        const scheduledCompanies = ScheduledCompanyIDs(scheduleRows ?? []);

        // The tie check (OrderEntityServer.verifyScheduleTies) already refuses a confirm whose
        // schedule names a company with no lines. Assert it here anyway: if it were ever false, a
        // company's whole value would silently never reach the ledger — no confirm entry because it
        // is scheduled, and no invoice entry because it has no lines to slice.
        const lineCompanies = new Set(lines.map((l) => String(l.CompanyID ?? '').toLowerCase()));
        for (const scheduled of scheduledCompanies) {
            if (!lineCompanies.has(scheduled)) {
                throw new Error(
                    `Order ${order.OrderNumber} has payment schedule rows for company ${scheduled}, ` +
                        `which has no lines on this order. Nothing would ever book for it.`,
                );
            }
        }

        const drafts: OrderLineDraft[] = [];
        for (const line of lines) {
            drafts.push(
                ...(await this.buildLineDrafts(
                    order, line, products, revRecTypes, dimensions, effectiveDate, asOf, giftCardTypeIDs,
                    scheduledCompanies,
                    termsByLine?.get(line.ID), recognitionMonthsByLine?.get(line.ID),
                )),
            );
        }
        return drafts;
    }

    /**
     * The facts the instalment billing entry needs about one company's lines (D91).
     *
     * Lives here, not in the operation, because every one of these numbers is decided by this
     * file's arithmetic — `LineAmounts`, the product walk, the merged dimensions and the charge
     * allocations. Rebuilding them at the call site is how the confirm entry and the invoice entry
     * would drift into disagreeing about what a line is worth, which is the whole failure this
     * rework exists to prevent.
     *
     * READS THE DATABASE: products, line dimensions and charge allocations, once for the set.
     */
    public async BuildInstalmentLineFacts(
        lines: mjBizAppsOrdersOrderLineEntity[],
        companyID: string,
        asOf: Date,
    ): Promise<InstalmentLineFacts[]> {
        const mine = lines.filter((l) => String(l.CompanyID ?? '').toLowerCase() === companyID.toLowerCase());
        if (!mine.length) return [];

        const products = await this.loadProducts(mine.map((l) => l.ProductID));
        const dimensions = await this.loadLineDimensions(mine.map((l) => l.ID));

        const out: InstalmentLineFacts[] = [];
        for (const line of mine) {
            const product = products.get(line.ProductID.toLowerCase());
            if (!product) {
                throw new Error(`Order line ${line.ID} references product ${line.ProductID}, which was not found.`);
            }
            out.push({
                ID: line.ID,
                LineNumber: line.LineNumber,
                ProductName: product.Name,
                Quantity: line.Quantity,
                ...LineAmounts(line),
                ProductID: product.ID,
                ProductCategoryID: product.ProductCategoryID,
                ProductTypeID: product.ProductTypeID,
                Dimensions: MergeLineDimensions(
                    { DimensionID: line.DimensionID, DimensionValueID: line.DimensionValueID },
                    dimensions.get(line.ID) ?? [],
                ),
                ChargeCredits: await this.chargeCreditsFor(line, companyID, asOf),
            });
        }
        return out;
    }

    private async buildLineDrafts(
        order: mjBizAppsOrdersOrderHeaderEntity,
        line: mjBizAppsOrdersOrderLineEntity,
        products: Map<string, ProductRow>,
        revRecTypes: Map<string, RevRecTypeRow>,
        dimensions: Map<string, Array<{ DimensionID: string; DimensionValueID: string }>>,
        effectiveDate: string,
        asOf: Date,
        giftCardTypeIDs: Set<string>,
        scheduledCompanies: Set<string>,
        term?: { ID: string; StartDate: Date; EndDate: Date; Amount: number },
        recognitionMonths?: number,
    ): Promise<OrderLineDraft[]> {
        const product = products.get(line.ProductID.toLowerCase());
        if (!product) {
            throw new Error(`Order line ${line.ID} references product ${line.ProductID}, which was not found.`);
        }

        const typeDefault = OrdersEngine.Instance.ProductTypeByID(product.ProductTypeID)?.DefaultRevenueRecognitionTypeID;
        const revRecID = ResolveRevenueRecognitionTypeID(product.RevenueRecognitionTypeID, typeDefault);
        const revRec = revRecID ? revRecTypes.get(revRecID.toLowerCase()) : undefined;
        if (!revRec) {
            throw new Error(
                `Product '${product.Name}' has no valid revenue recognition type` +
                    (revRecID ? ` (${revRecID})` : '') +
                    ` — cannot determine whether its revenue is earned at booking or over time.`,
            );
        }

        // The line's company is the denormalized stamp of the product's company (plan D6).
        const companyID = line.CompanyID ?? product.CompanyID;
        const lineDims = MergeLineDimensions(
            { DimensionID: line.DimensionID, DimensionValueID: line.DimensionValueID },
            dimensions.get(line.ID) ?? [],
        );

        // REVERSALS ARE MIRRORED, NOT NEGATED (D16). A negative quantity means "unwind this much of
        // that purchase" — and the correct double-entry for unwinding is the SAME accounts with the
        // debit and credit sides swapped, at a positive amount. Feeding a negative amount through
        // instead produces `Dr AR -593.52`, which accounting rightly refuses: a ledger line with a
        // negative debit is not a thing. So every amount below is computed on the ABSOLUTE quantity
        // and the finished lines are flipped once, at the end, when the line reverses.
        const isReversal = line.Quantity < 0;
        // THE LINE IS THE AUTHORITY ON ITS OWN MONEY, and by booking time it has been
        // computed and stored. This used to re-derive gross as quantity × UnitPrice —
        // a fourth copy of a formula that is only correct for PerUnit pricing. On a
        // Flat rule the unit price is a DERIVED rate that cannot always represent the
        // total, so the entry mirrored the wrong figure: a flat 100 at quantity 3
        // booked 99.99, at quantity 7 booked 100.03. The entry still BALANCED, which
        // is exactly the failure this file's own header warns about — AR merely
        // differs from the line total and nothing downstream reports it.
        //
        // Anchoring net to the stored LineTotalNet and deriving gross as net + discount
        // keeps `net + discount = gross` true by construction, and makes the entry agree
        // with the line by definition rather than by two computations happening to
        // match. The rate is still used for the DISCOUNT split, which is the only part
        // the line does not store separately.
        const { Net: net, Tax: tax, Charges: charges, Discount: discount, Gross: gross } = LineAmounts(line);

        const resolve = (role: (typeof GL_ROLE)[keyof typeof GL_ROLE]) =>
            this._resolver.Resolve(
                role,
                product.ID,
                product.ProductCategoryID,
                companyID,
                asOf,
                product.ProductTypeID,
            );

        const arAccount = await resolve(GL_ROLE.AccountsReceivable);
        const salesAccount = await resolve(GL_ROLE.Sales);

        // SELLING A GIFT CARD EARNS NOTHING (D44). Money has come in and goods are owed, so the
        // credit is a LIABILITY. Recognising here and again when the card is spent is the classic
        // gift-card double-count, and it hides well: both entries balance, the order reconciles,
        // and only the revenue figure is wrong.
        //
        // It also means NO revenue-recognition schedule. A deferred type releases on dates; a gift
        // card releases when somebody spends it, which is an event on a different order entirely.
        const isGiftCard = giftCardTypeIDs.has(product.ProductTypeID);

        let bookingCreditAccount: string;
        let creditLabel: string;
        if (isGiftCard) {
            try {
                bookingCreditAccount = await resolve(GL_ROLE.GiftCardLiability);
                creditLabel = 'Gift card liability';
            } catch {
                // Same tolerance as Processing Fee: a role accounting has not seeded must not take
                // the sale down. Deferred Revenue is the same SHAPE of obligation, so the entry stays
                // correct and balanced — just coarser than a dedicated card liability. Reported
                // rather than swallowed, because the difference matters at year end.
                bookingCreditAccount = await resolve(GL_ROLE.DeferredRevenue);
                creditLabel = 'Gift card liability (in Deferred Revenue)';
                console.warn(
                    `Order line ${line.ID}: no 'Gift Card Liability' GL account is linked for company ` +
                        `${companyID}, so the card's liability was booked to Deferred Revenue instead. ` +
                        `The entry balances and no revenue is overstated, but the two obligations are ` +
                        `now indistinguishable on the balance sheet. Link a Gift Card Liability account.`,
                );
            }
        } else if (revRec.IsDeferred) {
            // Deferred types park the credit in Deferred Revenue until the schedule releases it.
            bookingCreditAccount = await resolve(GL_ROLE.DeferredRevenue);
            creditLabel = 'Deferred revenue';
        } else {
            bookingCreditAccount = salesAccount;
            creditLabel = 'Sales';
        }

        let discountAccount: string | null = null;
        if (discount !== 0) {
            try {
                discountAccount = await resolve(GL_ROLE.SalesDiscounts);
            } catch {
                discountAccount = null; // plan D11 — net into the revenue credit instead
            }
        }

        // ── the value entry (D10/D11), raised here only when this company is NOT on instalments ──
        //
        // D91: a company billed by instalment puts NO value on the ledger at confirm. Its AR, its
        // revenue credit, its discount contra and its charge/tax credits are all raised later, one
        // slice per instalment, by EmitInstalmentInvoiceEntry — which builds them through the very
        // same BuildValueEntryLines, so the two moments cannot drift into different shapes.
        //
        // Nothing about the NON-scheduled path changes: same construction, same accounts, same
        // amounts, same order of lines. That is the regression fence (order-booking.OB18).
        const chargeCredits = await this.chargeCreditsFor(line, companyID, asOf);
        const isScheduled = scheduledCompanies.has(companyID.toLowerCase());

        // A gift card sold on instalments has no defined treatment — the liability is owed in full
        // the moment the card exists, but the value entry that raises it would arrive in slices.
        // Refuse rather than guess: nobody sells gift cards on a payment schedule, and a silent
        // wrong answer here is a misstated liability.
        if (isScheduled && isGiftCard) {
            throw new Error(
                `Order ${order.OrderNumber} line ${line.LineNumber} sells a gift card for a company ` +
                    `billed by instalment. That combination has no defined accounting treatment — a ` +
                    `card's liability arises in full at issue, not in billing slices. Remove the payment ` +
                    `schedule for this company, or sell the gift card on its own order.`,
            );
        }

        const bookingLines: JELineDraft[] = isScheduled
            ? []
            : BuildValueEntryLines(
                  { Net: net, Tax: tax, Charges: charges, Discount: discount, Gross: gross },
                  {
                      AR: arAccount,
                      Credit: bookingCreditAccount,
                      CreditLabel: creditLabel,
                      Discount: discountAccount,
                      ChargeCredits: chargeCredits,
                  },
                  product.Name,
                  lineDims,
              );

        // AN UP-FRONT LINE ON A SCHEDULED COMPANY STILL EARNS AT BOOKING. Its revenue is recognised
        // when the sale happens — that is what "not deferred" means — so it needs a credit to Sales
        // now even though nothing is billable yet. The offsetting debit is Deferred Revenue, which
        // therefore runs to a DEBIT balance until the instalments are invoiced. That debit balance
        // IS the contract asset (D91); it is presented as Unbilled by a period-end reclass, not by
        // a second running account in this file.
        //
        // A deferred driver needs nothing here: its staged releases below already debit Deferred
        // and credit Sales on their own dates, and they are untouched by the schedule.
        if (isScheduled && !revRec.IsDeferred) {
            const deferredAccount = await resolve(GL_ROLE.DeferredRevenue);
            bookingLines.push(
                {
                    GLAccountID: deferredAccount,
                    DebitAmount: net,
                    Description: `Deferred revenue (earned, not yet billable) — ${product.Name}`,
                    Dimensions: lineDims,
                },
                {
                    GLAccountID: salesAccount,
                    CreditAmount: discountAccount ? gross : net,
                    Description: `Sales — ${product.Name}`,
                    Dimensions: lineDims,
                },
            );
            if (discountAccount) {
                bookingLines.push({
                    GLAccountID: discountAccount,
                    DebitAmount: discount,
                    Description: `Discount — ${product.Name}`,
                    Dimensions: lineDims,
                });
            }
        }

        // Drop zero-amount lines. A fully-discounted line — a comped ticket, a 100%-off promotion —
        // has net 0, and accounting rightly refuses a JE line for nothing (MALFORMED_DRAFT). The
        // entry itself is still real and still balances: Dr Sales Discounts / Cr Sales for the
        // discount. Without this a free item cannot be ordered at all, which is a legitimate thing
        // to sell.
        const bookingEntryLines = mirrorIf(
            isReversal,
            bookingLines.filter((l) => money(l.DebitAmount ?? 0) !== 0 || money(l.CreditAmount ?? 0) !== 0),
        );
        // NOTHING TO BOOK is a legitimate outcome, not a failure. A fully-comped line — 100% off, or
        // a free item — nets to zero, and when the discount has no contra account it nets into the
        // sales credit too, leaving an entry with no non-zero side. Double-entry needs two lines, so
        // emitting one here would refuse the whole order for a line that has no ledger impact at all.
        // The line still exists, still shows on the invoice, and still recognizes nothing.
        const hasBooking = bookingEntryLines.length >= 2;
        if (hasBooking) {
            this.assertBalanced(bookingEntryLines, order, line, 'booking');
        }

        const out: OrderLineDraft[] = hasBooking
            ? [
                  {
                      OrderLineID: line.ID,
                      IsBooking: true,
                      Draft: {
                          EffectiveDate: effectiveDate,
                          EntryType: 'OrderBooking',
                          Description:
                              `Order ${order.OrderNumber} line ${line.LineNumber} — ` +
                              `${isReversal ? 'REVERSAL of ' : ''}${product.Name}`,
                          LinkedEntityID: this._orderLineEntityID,
                          LinkedRecordID: line.ID,
                          Lines: bookingEntryLines,
                      },
                  },
              ]
            : [];

        // ── the forward-dated releases (D14/D43) ──
        if (revRec.IsDeferred && !isGiftCard) {
            // A subscription line's coverage window comes from its TERM (which applied anchoring,
            // deferral and proration); a non-subscription deferred line uses the line's own dates.
            const schedule = this.driverFor(revRec).BuildSchedule({
                Amount: term ? term.Amount : net,
                BookingDate: new Date(effectiveDate),
                ServicePeriodStart: term ? term.StartDate : (line.ServicePeriodStart ? new Date(line.ServicePeriodStart) : null),
                ServicePeriodEnd: term ? term.EndDate : (line.ServicePeriodEnd ? new Date(line.ServicePeriodEnd) : null),
                ProductName: product.Name,
                PeriodMonths: recognitionMonths,
            });

            for (const entry of schedule.Entries) {
                const releaseLines: JELineDraft[] = [
                    {
                        GLAccountID: bookingCreditAccount,
                        DebitAmount: entry.Amount,
                        Description: `Release deferred — ${product.Name}`,
                        Dimensions: lineDims,
                    },
                    {
                        GLAccountID: salesAccount,
                        CreditAmount: entry.Amount,
                        Description: `Revenue — ${product.Name}`,
                        Dimensions: lineDims,
                    },
                ];
                const releaseEntryLines = mirrorIf(isReversal, releaseLines);
                this.assertBalanced(releaseEntryLines, order, line, 'recognition');

                out.push({
                    OrderLineID: line.ID,
                    IsBooking: false,
                    SubscriptionTermID: term?.ID,
                    RecognitionEntry: entry,
                    Draft: {
                        EffectiveDate: isoDate(entry.RecognitionDate),
                        EntryType: 'RevenueRecognition',
                        Description:
                            `Order ${order.OrderNumber} line ${line.LineNumber} — ` +
                            `${isReversal ? 'unrecognize' : 'recognize'} ${product.Name}`,
                        // D46: anchor to the TERM when there is one; otherwise the line (event
                        // products are deferred but have no subscription and therefore no term).
                        LinkedEntityID: term ? this._subscriptionTermEntityID : this._orderLineEntityID,
                        LinkedRecordID: term ? term.ID : line.ID,
                        Lines: releaseEntryLines,
                    },
                });
            }
        }

        return out;
    }

    /** Resolve the driver through MJ's ClassFactory so subclasses registered on the same key win. */
    private driverFor(revRec: RevRecTypeRow): RevenueRecognitionDriver {
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<RevenueRecognitionDriver>(
            RevenueRecognitionDriver,
            revRec.DriverClass,
        );
        if (!driver) {
            throw new Error(
                `Revenue recognition type '${revRec.Code}' names driver '${revRec.DriverClass}', which is ` +
                    `not registered. Register a RevenueRecognitionDriver subclass under that key.`,
            );
        }
        return driver;
    }

    /**
     * Rounding at several independent places can drift a cent. Catch it here with a message that
     * names the order line, rather than at the DB trigger, which cannot.
     */
    private assertBalanced(
        lines: JELineDraft[],
        order: mjBizAppsOrdersOrderHeaderEntity,
        line: mjBizAppsOrdersOrderLineEntity,
        kind: string,
    ): void {
        const debits = money(lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0));
        const credits = money(lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0));
        if (debits !== credits) {
            throw new Error(
                `The ${kind} entry for order ${order.OrderNumber} line ${line.LineNumber} does not balance: ` +
                    `debits ${debits} vs credits ${credits}. No entries were booked.`,
            );
        }
    }

    /** `OrderDate` is the accounting date (backdating is allowed and unguarded — D25). */
    private effectiveDateOf(order: mjBizAppsOrdersOrderHeaderEntity): string {
        return isoDate(order.OrderDate ? new Date(order.OrderDate) : new Date());
    }

    private async loadProducts(productIDs: string[]): Promise<Map<string, ProductRow>> {
        await LoadOrdersEngine(this._provider, this._contextUser);
        const out = new Map<string, ProductRow>();
        for (const id of productIDs) {
            const p = OrdersEngine.Instance.ProductByID(id);
            if (!p) continue;
            out.set(p.ID.toLowerCase(), {
                ID: p.ID,
                CompanyID: p.CompanyID,
                ProductCategoryID: p.ProductCategoryID ?? null,
                ProductTypeID: p.ProductTypeID,
                RevenueRecognitionTypeID: p.RevenueRecognitionTypeID,
                Name: p.Name,
            });
        }
        return out;
    }

    /**
     * ProductType IDs whose Code marks them a gift card.
     *
     * Resolved by CODE rather than by a hardcoded ID because product types are per-deployment data,
     * not seeded metadata with stable keys. One query for the whole draft build, not one per line.
     */
    private async loadGiftCardTypeIDs(): Promise<Set<string>> {
        await LoadOrdersEngine(this._provider, this._contextUser);
        const type = OrdersEngine.Instance.ProductTypeByCode(GIFT_CARD_PRODUCT_TYPE_CODE);
        return new Set(type ? [type.ID] : []);
    }

    private async loadRevRecTypes(): Promise<Map<string, RevRecTypeRow>> {
        await LoadOrdersEngine(this._provider, this._contextUser);
        const cached = OrdersEngine.Instance.RevenueRecognitionTypes;
        if (cached.length > 0) {
            return new Map(
                cached.map((t) => [
                    t.ID.toLowerCase(),
                    {
                        ID: t.ID,
                        Code: t.Code,
                        DriverClass: t.DriverClass,
                        IsDeferred: !!t.IsDeferred,
                    },
                ]),
            );
        }
        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const result = await rv.RunView<RevRecTypeRow>(
            {
                EntityName: 'MJ_BizApps_Orders: Revenue Recognition Types',
                Fields: ['ID', 'Code', 'DriverClass', 'IsDeferred'],
                ResultType: 'simple',
            },
            this._contextUser,
        );
        if (!result?.Success) {
            throw new Error(
                `Could not load revenue recognition types${result?.ErrorMessage ? `: ${result.ErrorMessage}` : '.'}`,
            );
        }
        return new Map((result.Results ?? []).map((t) => [t.ID.toLowerCase(), t]));
    }

    /** Plan D31 — the line's dimension tags ride onto every JE line it produces. */
    private async loadLineDimensions(
        lineIDs: string[],
    ): Promise<Map<string, Array<{ DimensionID: string; DimensionValueID: string }>>> {
        const inList = lineIDs.map((id) => `'${id}'`).join(',');
        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const result = await rv.RunView<LineDimensionRow>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Line Dimensions',
                ExtraFilter: `OrderLineID IN (${inList})`,
                Fields: ['OrderLineID', 'DimensionID', 'DimensionValueID'],
                ResultType: 'simple',
            },
            this._contextUser,
        );

        const map = new Map<string, Array<{ DimensionID: string; DimensionValueID: string }>>();
        for (const row of result?.Results ?? []) {
            const list = map.get(row.OrderLineID) ?? [];
            list.push({ DimensionID: row.DimensionID, DimensionValueID: row.DimensionValueID });
            map.set(row.OrderLineID, list);
        }
        return map;
    }

    /**
     * The credit side of every charge allocated to this line, grouped by charge type (D71).
     *
     * Read from `OrderChargeAllocation`, which exists by the time booking runs because charges are
     * written with the lines. Each charge type resolves its own GL account, so shipping revenue and
     * a tax liability land in different places without this factory needing to know which is which.
     *
     * An unresolvable account is a HARD FAILURE, per the plan: a charge with nowhere to go must not
     * book, because the entry would balance only by omitting it and the customer would be billed for
     * something the ledger never recorded.
     */
    private async chargeCreditsFor(
        line: mjBizAppsOrdersOrderLineEntity,
        companyID: string,
        asOf: Date,
    ): Promise<Array<{ GLAccountID: string; Amount: number; Label: string }>> {
        const total = money(Math.abs(line.LineTax ?? 0)) + money(Math.abs(line.ChargeAmount ?? 0));
        if (total === 0) return [];

        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ Amount: number; OrderChargeID: string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Charge Allocations',
                ExtraFilter: `OrderLineID = '${line.ID}'`,
                ResultType: 'simple',
                BypassCache: true,
            },
            this._contextUser,
        );
        const allocations = res?.Results ?? [];
        if (!allocations.length) return [];

        // The allocation says WHICH CHARGE and HOW MUCH, but not what KIND of charge — the type
        // lives on OrderCharge. RunView does not join, so the parent rows are read separately and
        // matched in memory.
        const chargeRes = await rv.RunView<{ ID: string; ChargeTypeID: string; ChargeType: string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Charges',
                ExtraFilter: `ID IN (${[...new Set(allocations.map((a) => `'${a.OrderChargeID}'`))].join(',')})`,
                ResultType: 'simple',
                BypassCache: true,
            },
            this._contextUser,
        );
        const chargeByID = new Map(
            (chargeRes?.Results ?? []).map((c) => [String(c.ID).toLowerCase(), c]),
        );

        // One credit per charge TYPE, not per allocation row — several tax layers on one line each
        // have their own account, but two shipping charges share theirs.
        const byType = new Map<string, { Amount: number; Label: string }>();
        for (const a of allocations) {
            const parent = chargeByID.get(String(a.OrderChargeID).toLowerCase());
            if (!parent?.ChargeTypeID) continue;
            const cur = byType.get(parent.ChargeTypeID) ?? { Amount: 0, Label: parent.ChargeType ?? 'Charge' };
            cur.Amount = money(cur.Amount + Math.abs(Number(a.Amount ?? 0)));
            byType.set(parent.ChargeTypeID, cur);
        }

        const out: Array<{ GLAccountID: string; Amount: number; Label: string }> = [];
        for (const [chargeTypeID, info] of byType) {
            if (info.Amount === 0) continue;
            const account = await this._resolver.ResolveForRecord(
                GL_ROLE.Sales,
                this._chargeTypeEntityID,
                chargeTypeID,
                companyID,
                asOf,
            );
            if (!account) {
                throw new GLAccountResolutionError(
                    GL_ROLE.Sales,
                    line.ProductID,
                    `Charge '${info.Label}' has no GL account linked for company ${companyID}. Link one to the ` +
                        `charge type before booking — a charge with nowhere to go would be billed to the customer ` +
                        `and never recorded in the ledger.`,
                );
            }
            out.push({ GLAccountID: account, Amount: info.Amount, Label: info.Label });
        }
        return out;
    }

}
