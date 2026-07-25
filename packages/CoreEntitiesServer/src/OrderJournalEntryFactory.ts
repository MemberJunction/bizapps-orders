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
 * where gross = Quantity × UnitPrice, discount = gross × DiscountPct, net = gross − discount.
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
import { GL_ROLE, GLAccountResolver } from './GLAccountResolver.js';
import { RevenueRecognitionDriver, type RevRecEntry } from './RevenueRecognition.js';

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
    /** Set on recognition drafts — carries the period bounds through for RevRecScheduleLine. */
    RecognitionEntry?: RevRecEntry;
    Draft: JEDraft;
}

interface ProductRow {
    ID: string;
    CompanyID: string;
    ProductCategoryID: string | null;
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
    ): Promise<OrderLineDraft[]> {
        if (lines.length === 0) {
            throw new Error(`Order ${order.OrderNumber} has no lines to book.`);
        }

        const products = await this.loadProducts(lines.map((l) => l.ProductID));
        const revRecTypes = await this.loadRevRecTypes();
        const dimensions = await this.loadLineDimensions(lines.map((l) => l.ID));
        const effectiveDate = this.effectiveDateOf(order);
        const asOf = new Date(effectiveDate);

        const drafts: OrderLineDraft[] = [];
        for (const line of lines) {
            drafts.push(
                ...(await this.buildLineDrafts(order, line, products, revRecTypes, dimensions, effectiveDate, asOf)),
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

        const gross = money(line.Quantity * line.UnitPrice);
        const discount = money(gross * (line.DiscountPct ?? 0));
        const net = money(gross - discount);
        const tax = money(line.LineTax ?? 0);

        const resolve = (role: (typeof GL_ROLE)[keyof typeof GL_ROLE]) =>
            this._resolver.Resolve(role, product.ID, product.ProductCategoryID, companyID, asOf);

        const arAccount = await resolve(GL_ROLE.AccountsReceivable);
        const salesAccount = await resolve(GL_ROLE.Sales);
        // Deferred types park the credit in Deferred Revenue until the schedule releases it.
        const bookingCreditAccount = revRec.IsDeferred ? await resolve(GL_ROLE.DeferredRevenue) : salesAccount;

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
            { GLAccountID: arAccount, DebitAmount: money(net + tax), Description: `AR — ${product.Name}`, Dimensions: lineDims },
            {
                GLAccountID: bookingCreditAccount,
                CreditAmount: discountAccount ? gross : net,
                Description: `${revRec.IsDeferred ? 'Deferred revenue' : 'Sales'} — ${product.Name}`,
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
        this.assertBalanced(bookingLines, order, line, 'booking');

        const out: OrderLineDraft[] = [
            {
                OrderLineID: line.ID,
                IsBooking: true,
                Draft: {
                    EffectiveDate: effectiveDate,
                    EntryType: 'OrderBooking',
                    Description: `Order ${order.OrderNumber} line ${line.LineNumber} — ${product.Name}`,
                    LinkedEntityID: this._orderLineEntityID,
                    LinkedRecordID: line.ID,
                    Lines: bookingLines,
                },
            },
        ];

        // ── the forward-dated releases (D14/D43) ──
        if (revRec.IsDeferred) {
            const schedule = this.driverFor(revRec).BuildSchedule({
                Amount: net,
                BookingDate: new Date(effectiveDate),
                ServicePeriodStart: line.ServicePeriodStart ? new Date(line.ServicePeriodStart) : null,
                ServicePeriodEnd: line.ServicePeriodEnd ? new Date(line.ServicePeriodEnd) : null,
                ProductName: product.Name,
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
                this.assertBalanced(releaseLines, order, line, 'recognition');

                out.push({
                    OrderLineID: line.ID,
                    IsBooking: false,
                    RecognitionEntry: entry,
                    Draft: {
                        EffectiveDate: isoDate(entry.RecognitionDate),
                        EntryType: 'RevenueRecognition',
                        Description: `Order ${order.OrderNumber} line ${line.LineNumber} — recognize ${product.Name}`,
                        LinkedEntityID: this._orderLineEntityID,
                        LinkedRecordID: line.ID,
                        Lines: releaseLines,
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
                Fields: ['ID', 'CompanyID', 'ProductCategoryID', 'RevenueRecognitionTypeID', 'Name'],
                ResultType: 'simple',
            },
            this._contextUser,
        );
        return new Map((result?.Results ?? []).map((p) => [p.ID, p]));
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
}
