/**
 * OrderJournalEntryFactory — turns an order's lines into balanced journal-entry drafts.
 *
 * Plan D10: ONE JE PER ORDER LINE, always — even multiple lines of the same company. The
 * "order-level journal entry" is a UI aggregation of the line JEs, never a row.
 *
 * Plan D11 — the shape of each line's entry:
 *
 *     Dr  Accounts Receivable      net (+ tax when the tax build lands)
 *     Dr  Sales Discounts          discount            (contra; omitted when 0)
 *         Cr  Sales                gross               (Immediate products)
 *         Cr  Deferred Revenue     gross               (Deferred products — recognition per D14)
 *
 * where gross = Quantity × UnitPrice, discount = gross × DiscountPct, net = gross − discount.
 * The entry balances by construction: net + discount = gross.
 *
 * If the line's company has no Sales Discounts account linked, the discount is netted into the
 * revenue credit instead (plan D11: "absent a linked discounts account, net into the sales
 * credit") — the entry still balances, you just lose the contra-account breakout.
 *
 * NEGATIVE QUANTITIES are the reversal mechanism (plan D16). They flow through the same
 * arithmetic and produce a mirrored entry (Cr AR / Dr Revenue), so returns and credit memos need
 * no special path here.
 *
 * The drafts are submitted as ONE SET via `Accounting.CreateJournalEntries`, which writes every
 * header + line + dimension inside a single provider transaction — all entries or none.
 *
 * CONNECTS TO:
 *   RESOLVER: GLAccountResolver (./GLAccountResolver.ts) — role → account, with the company guard
 *   CONTRACT: JournalEntryDraft (@mj-biz-apps/accounting-engine-base)
 *   CALLER:   OrderEntityServer.Save (./OrderEntityServer.ts)
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersOrderHeaderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { GL_ROLE, GLAccountResolver } from './GLAccountResolver.js';

/**
 * Local mirror of accounting's `JournalEntryDraft` contract. Declared structurally rather than
 * imported so this package builds even when the (optional) accounting peer isn't linked; the
 * shapes are checked against the real contract where the op is invoked.
 */
export interface JELineDraft {
    GLAccountID: string;
    DebitAmount?: number;
    CreditAmount?: number;
    Description?: string;
}

export interface JEDraft {
    EffectiveDate: string;
    EntryType: string;
    Description?: string;
    LinkedEntityID?: string;
    LinkedRecordID?: string;
    Lines: JELineDraft[];
}

/** A draft plus the line it came from, so results can be stamped back after the write. */
export interface OrderLineDraft {
    OrderLineID: string;
    Draft: JEDraft;
}

interface ProductRow {
    ID: string;
    CompanyID: string;
    ProductCategoryID: string | null;
    RevenueRecognitionType: string;
    Name: string;
}

/** Money is rounded to cents at the edge — never accumulate un-rounded floats into a JE. */
function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class OrderJournalEntryFactory {
    constructor(
        private readonly _resolver: GLAccountResolver,
        private readonly _orderLineEntityID: string,
        private readonly _provider: IMetadataProvider,
        private readonly _contextUser: UserInfo,
    ) {}

    /**
     * Build one draft per line. Throws on the first line that cannot be resolved — booking is
     * all-or-none, so there is no value in collecting partial results.
     */
    public async BuildDrafts(
        order: mjBizAppsOrdersOrderHeaderEntity,
        lines: mjBizAppsOrdersOrderLineEntity[],
    ): Promise<OrderLineDraft[]> {
        if (lines.length === 0) {
            throw new Error(`Order ${order.OrderNumber} has no lines to book.`);
        }

        const products = await this.loadProducts(lines.map((l) => l.ProductID));
        const effectiveDate = this.effectiveDateOf(order);
        const asOf = new Date(effectiveDate);

        const drafts: OrderLineDraft[] = [];
        for (const line of lines) {
            drafts.push({
                OrderLineID: line.ID,
                Draft: await this.buildLineDraft(order, line, products, effectiveDate, asOf),
            });
        }
        return drafts;
    }

    private async buildLineDraft(
        order: mjBizAppsOrdersOrderHeaderEntity,
        line: mjBizAppsOrdersOrderLineEntity,
        products: Map<string, ProductRow>,
        effectiveDate: string,
        asOf: Date,
    ): Promise<JEDraft> {
        const product = products.get(line.ProductID);
        if (!product) {
            throw new Error(`Order line ${line.ID} references product ${line.ProductID}, which was not found.`);
        }

        // The line's company is the denormalized stamp of the product's company (plan D6). Fall
        // back to the product only if the stamp is somehow absent — they must agree.
        const companyID = line.CompanyID ?? product.CompanyID;

        const gross = money(line.Quantity * line.UnitPrice);
        const discount = money(gross * (line.DiscountPct ?? 0));
        const net = money(gross - discount);
        const tax = money(line.LineTax ?? 0);

        const isDeferred = product.RevenueRecognitionType === 'Deferred';
        const revenueRole = isDeferred ? GL_ROLE.DeferredRevenue : GL_ROLE.Sales;

        const arAccount = await this._resolver.Resolve(
            GL_ROLE.AccountsReceivable,
            product.ID,
            product.ProductCategoryID,
            companyID,
            asOf,
        );
        const revenueAccount = await this._resolver.Resolve(
            revenueRole,
            product.ID,
            product.ProductCategoryID,
            companyID,
            asOf,
        );

        // Discounts are a contra account when one is linked; otherwise they net into revenue.
        let discountAccount: string | null = null;
        if (discount !== 0) {
            try {
                discountAccount = await this._resolver.Resolve(
                    GL_ROLE.SalesDiscounts,
                    product.ID,
                    product.ProductCategoryID,
                    companyID,
                    asOf,
                );
            } catch {
                discountAccount = null; // plan D11 — net into the sales credit instead
            }
        }

        const revenueCredit = discountAccount ? gross : net;
        const jeLines: JELineDraft[] = [
            {
                GLAccountID: arAccount,
                DebitAmount: money(net + tax),
                Description: `AR — ${product.Name}`,
            },
            {
                GLAccountID: revenueAccount,
                CreditAmount: revenueCredit,
                Description: `${isDeferred ? 'Deferred revenue' : 'Sales'} — ${product.Name}`,
            },
        ];

        if (discountAccount) {
            jeLines.push({
                GLAccountID: discountAccount,
                DebitAmount: discount,
                Description: `Discount — ${product.Name}`,
            });
        }

        this.assertBalanced(jeLines, order, line);

        return {
            EffectiveDate: effectiveDate,
            EntryType: 'OrderBooking',
            Description: `Order ${order.OrderNumber} line ${line.LineNumber} — ${product.Name}`,
            // Plan D25 origin pair: the causal record is the ORDER LINE, not the order.
            LinkedEntityID: this._orderLineEntityID,
            LinkedRecordID: line.ID,
            Lines: jeLines,
        };
    }

    /**
     * Balance is guaranteed by the arithmetic, but rounding at three independent places can drift
     * a cent. Catch it here with a clear message rather than at the DB trigger, which cannot say
     * which order line was responsible.
     */
    private assertBalanced(
        lines: JELineDraft[],
        order: mjBizAppsOrdersOrderHeaderEntity,
        line: mjBizAppsOrdersOrderLineEntity,
    ): void {
        const debits = money(lines.reduce((sum, l) => sum + (l.DebitAmount ?? 0), 0));
        const credits = money(lines.reduce((sum, l) => sum + (l.CreditAmount ?? 0), 0));
        if (debits !== credits) {
            throw new Error(
                `Journal entry for order ${order.OrderNumber} line ${line.LineNumber} does not balance: ` +
                    `debits ${debits} vs credits ${credits}. This is a rounding or pricing defect — ` +
                    `no entries were booked.`,
            );
        }
    }

    /** `OrderDate` is the accounting date (plan: backdating is allowed and unguarded, D25). */
    private effectiveDateOf(order: mjBizAppsOrdersOrderHeaderEntity): string {
        const d = order.OrderDate ? new Date(order.OrderDate) : new Date();
        return d.toISOString().slice(0, 10);
    }

    private async loadProducts(productIDs: string[]): Promise<Map<string, ProductRow>> {
        const unique = [...new Set(productIDs)];
        const inList = unique.map((id) => `'${id}'`).join(',');

        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const result = await rv.RunView<ProductRow>(
            {
                EntityName: 'MJ_BizApps_Orders: Products',
                ExtraFilter: `ID IN (${inList})`,
                Fields: ['ID', 'CompanyID', 'ProductCategoryID', 'RevenueRecognitionType', 'Name'],
                ResultType: 'simple',
            },
            this._contextUser,
        );

        return new Map((result?.Results ?? []).map((p) => [p.ID, p]));
    }
}
