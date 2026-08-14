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
 * Plan D31 — DIMENSIONS. Each line's `OrderLineDimension` tags ride onto every JE line the line
 * produces, so departmental/segment reporting survives into the ledger and through batch
 * summarization. Where a resolved GL account link REQUIRES a dimension the line hasn't tagged, we
 * fail loudly rather than book an entry that can't be reported on.
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
import type { mjBizAppsOrdersOrderHeaderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { GL_ROLE, GLAccountResolver, GLAccountResolutionError } from './GLAccountResolver.js';
import { RevenueRecognitionDriver, type RevRecEntry } from './RevenueRecognition.js';
import { GIFT_CARD_PRODUCT_TYPE_CODE } from './GiftCardBehavior.js';

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

        const drafts: OrderLineDraft[] = [];
        for (const line of lines) {
            drafts.push(
                ...(await this.buildLineDrafts(
                    order, line, products, revRecTypes, dimensions, effectiveDate, asOf, giftCardTypeIDs,
                    termsByLine?.get(line.ID), recognitionMonthsByLine?.get(line.ID),
                )),
            );
        }
        return drafts;
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
        term?: { ID: string; StartDate: Date; EndDate: Date; Amount: number },
        recognitionMonths?: number,
    ): Promise<OrderLineDraft[]> {
        const product = products.get(line.ProductID);
        if (!product) {
            throw new Error(`Order line ${line.ID} references product ${line.ProductID}, which was not found.`);
        }

        const revRec = revRecTypes.get(product.RevenueRecognitionTypeID);
        if (!revRec) {
            throw new Error(
                `Product '${product.Name}' has no valid revenue recognition type — cannot determine ` +
                    `whether its revenue is earned at booking or over time.`,
            );
        }

        // The line's company is the denormalized stamp of the product's company (plan D6).
        const companyID = line.CompanyID ?? product.CompanyID;
        const lineDims = dimensions.get(line.ID) ?? [];

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
        const grossFromRate = money(Math.abs(line.Quantity) * line.UnitPrice);
        // BOTH discount fields, and in the same order OrderLineEntityServer applies them (D70).
        // The journal entry must mirror the line's arithmetic exactly — if the two disagree, the
        // entry still BALANCES (AR simply differs from the line total) and nothing downstream
        // reports it, which is the failure mode this whole area keeps producing.
        const pctDiscount = money(grossFromRate * (line.DiscountPct ?? 0));
        const amountDiscount = money(Math.min(Math.max(0, grossFromRate - pctDiscount), line.DiscountAmount ?? 0));
        const discount = money(pctDiscount + amountDiscount);
        const net = money(Math.abs(Number(line.LineTotalNet ?? 0)));
        const gross = money(net + discount);
        const tax = money(Math.abs(line.LineTax ?? 0));
        const charges = money(Math.abs(line.ChargeAmount ?? 0));

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

        // ── the booking entry (D10/D11) ──
        const bookingLines: JELineDraft[] = [
            {
                GLAccountID: arAccount,
                DebitAmount: money(net + tax + charges),
                Description: `AR — ${product.Name}`,
                Dimensions: lineDims,
            },
            {
                GLAccountID: bookingCreditAccount,
                CreditAmount: discountAccount ? gross : net,
                Description: `${creditLabel} — ${product.Name}`,
                Dimensions: lineDims,
            },
        ];
        if (discountAccount) {
            bookingLines.push({
                GLAccountID: discountAccount,
                DebitAmount: discount,
                Description: `Discount — ${product.Name}`,
                Dimensions: lineDims,
            });
        }
        // ── CHARGE AND TAX CREDITS (D71) ──
        // AR is debited for net + tax + charges, so every one of those needs a matching credit or
        // the entry does not balance. Tax has been in the AR debit since booking was written and had
        // no credit at all — it simply had never been non-zero, which is the kind of latent break
        // that only surfaces the day the feature is used.
        //
        // Each charge credits an account resolved from its CHARGE TYPE, so shipping revenue and a
        // tax liability go to different places without this factory knowing what either means. The
        // role name is a lookup key, not a claim about the account's nature — a tax charge links to
        // a liability account through the same mechanism.
        const chargeCredits = await this.chargeCreditsFor(line, companyID, asOf);
        for (const c of chargeCredits) {
            bookingLines.push({
                GLAccountID: c.GLAccountID,
                CreditAmount: c.Amount,
                Description: `${c.Label} — ${product.Name}`,
                Dimensions: lineDims,
            });
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
        const inList = [...new Set(productIDs)].map((id) => `'${id}'`).join(',');
        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const result = await rv.RunView<ProductRow>(
            {
                EntityName: 'MJ_BizApps_Orders: Products',
                ExtraFilter: `ID IN (${inList})`,
                Fields: ['ID', 'CompanyID', 'ProductCategoryID', 'ProductTypeID', 'RevenueRecognitionTypeID', 'Name'],
                ResultType: 'simple',
            },
            this._contextUser,
        );
        return new Map((result?.Results ?? []).map((p) => [p.ID, p]));
    }

    /**
     * ProductType IDs whose Code marks them a gift card.
     *
     * Resolved by CODE rather than by a hardcoded ID because product types are per-deployment data,
     * not seeded metadata with stable keys. One query for the whole draft build, not one per line.
     */
    private async loadGiftCardTypeIDs(): Promise<Set<string>> {
        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Product Types',
                ExtraFilter: `Code = '${GIFT_CARD_PRODUCT_TYPE_CODE}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            this._contextUser,
        );
        return new Set((result?.Results ?? []).map((r) => r.ID));
    }

    private async loadRevRecTypes(): Promise<Map<string, RevRecTypeRow>> {
        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const result = await rv.RunView<RevRecTypeRow>(
            {
                EntityName: 'MJ_BizApps_Orders: Revenue Recognition Types',
                Fields: ['ID', 'Code', 'DriverClass', 'IsDeferred'],
                ResultType: 'simple',
            },
            this._contextUser,
        );
        return new Map((result?.Results ?? []).map((t) => [t.ID, t]));
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
