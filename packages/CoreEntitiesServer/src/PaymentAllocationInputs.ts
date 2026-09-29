/**
 * The order-side facts a payment allocation is computed from.
 *
 * `PaymentHeaderEntityServer` (booking every unbooked line at capture) and `PaymentLineEntityServer`
 * (booking one allocation as it is saved) both need the same thing: the order's lines, each with its
 * owning company, the amount to pro-rate by, and the dimensions booking tagged it with.
 *
 * They had a copy of that loader each, and the copies were identical — which is how issue #238 came
 * to need the same fix in two files. The intercompany closure beside them had drifted into the same
 * shape for the same reason; both now live in one place, and a third booking path gets them for free
 * rather than by being remembered.
 *
 * CONNECTS TO:
 *   CONSUMER: PaymentAllocationFactory (./PaymentAllocationFactory.ts)
 *   SIBLING:  BuildIntercompanyLookup (./AccountingBridge.ts)
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import { LoadOrdersEngine, OrdersEngine } from '@mj-biz-apps/orders-entities';
import type { GiftCardSaleLine, OrderLineShare } from './PaymentAllocationFactory.js';
import type { PaymentJELineDimension } from './PaymentJournalEntryFactory.js';
import type { InstalmentCashFacts } from './PaymentScheduleBehavior.js';
import { ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_DIMENSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
const STORED_VALUE_ACCOUNT_ENTITY = 'MJ_BizApps_Orders: Stored Value Accounts';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

interface OrderLineRow {
    ID: string;
    CompanyID: string;
    ProductID: string;
    LineTotalGross: number;
}

interface OrderLineDimensionRow {
    OrderLineID: string;
    DimensionID: string;
    DimensionValueID: string;
}

/**
 * Every line of an order, with its owning company, its allocation weight and its dimension tags.
 *
 * LineTotalGross (= net + tax) is the weight on purpose: it is exactly what booking DEBITED to AR
 * for the line, and what the order's TotalGross rolls up from. Allocating on any other basis would
 * clear a different amount than was ever receivable.
 *
 * The tags are read from the same `OrderLineDimension` rows `OrderJournalEntryFactory` stamps onto
 * the booking entry (D31), so the credit that clears a receivable carries what the debit that
 * raised it carried. An order with no tags simply comes back with none.
 */
export async function LoadOrderLineShares(
    provider: IRunViewProvider,
    user: UserInfo,
    orderHeaderID: string,
): Promise<OrderLineShare[]> {
    const rv = new RunView(provider);
    const res = await rv.RunView<OrderLineRow>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID='${orderHeaderID}'`,
            Fields: ['ID', 'CompanyID', 'ProductID', 'LineTotalGross'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) {
        throw new Error(
            `Could not read the order's lines to allocate the payment: ${res?.ErrorMessage ?? 'unknown error'}`,
        );
    }

    const rows = res.Results ?? [];
    const tags = await loadLineDimensions(
        provider,
        user,
        rows.map((l) => l.ID),
    );

    // The product's place in the role walk, so a deposit resolves Customer Deposits the way the
    // invoice entry resolves every role: product, category tree, product type, then company.
    await LoadOrdersEngine(provider as unknown as IMetadataProvider, user);

    return rows.map((l) => {
        const dims = tags.get(String(l.ID).toLowerCase());
        const product = OrdersEngine.Instance.ProductByID(l.ProductID);
        if (!product) {
            throw new Error(`Order line ${l.ID} references product ${l.ProductID}, which was not found.`);
        }
        return {
            OrderLineID: l.ID,
            CompanyID: l.CompanyID,
            Amount: Number(l.LineTotalGross ?? 0),
            Product: {
                ProductID: product.ID,
                ProductCategoryID: product.ProductCategoryID ?? null,
                ProductTypeID: product.ProductTypeID,
            },
            ...(dims?.length ? { Dimensions: dims } : {}),
        };
    });
}

/** The dimension tags of the given order lines, keyed by lower-cased line id. */
async function loadLineDimensions(
    provider: IRunViewProvider,
    user: UserInfo,
    lineIDs: string[],
): Promise<Map<string, PaymentJELineDimension[]>> {
    const map = new Map<string, PaymentJELineDimension[]>();
    if (lineIDs.length === 0) return map;

    const rv = new RunView(provider);
    const res = await rv.RunView<OrderLineDimensionRow>(
        {
            EntityName: ORDER_LINE_DIMENSION_ENTITY,
            ExtraFilter: `OrderLineID IN (${lineIDs.map((id) => `'${id}'`).join(',')})`,
            Fields: ['OrderLineID', 'DimensionID', 'DimensionValueID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) {
        // HARD FAILURE, deliberately. Booking tagged the receivable; clearing it untagged because a
        // read failed would leave that dimension permanently out of balance, and the entry would
        // post looking perfectly healthy. Better to refuse the allocation and be retried.
        throw new Error(
            `Could not read the order lines' dimension tags to allocate the payment: ` +
                `${res?.ErrorMessage ?? 'unknown error'}`,
        );
    }

    for (const row of res.Results ?? []) {
        const k = String(row.OrderLineID).toLowerCase();
        const list = map.get(k) ?? [];
        list.push({ DimensionID: row.DimensionID, DimensionValueID: row.DimensionValueID });
        map.set(k, list);
    }
    return map;
}

/**
 * Every live instalment on an order, for deciding how much of a payment settles a receivable (D91).
 *
 * READ THIS BEFORE THE PAYMENT LINE IS SAVED. `AmountPaid` on these rows is maintained by
 * `spRecalcOrderHeaderPaymentSchedule`, which `spRecalcOrderHeaderTotals` calls from the PaymentLine
 * trigger — so the moment the allocation row lands, these numbers already include it, and a split
 * computed from them would credit AR for money it had itself just counted as paid. Both booking
 * paths therefore read here first and carry the facts into the factory.
 *
 * Canceled rows are dropped: they bill nothing and absorb nothing.
 */
export async function LoadInstalmentCashFacts(
    provider: IRunViewProvider,
    user: UserInfo,
    orderHeaderID: string,
): Promise<InstalmentCashFacts[]> {
    const rv = new RunView(provider);
    const res = await rv.RunView<InstalmentCashFacts>(
        {
            EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
            ExtraFilter: `OrderHeaderID='${RequireUUID(orderHeaderID, 'OrderHeaderID')}' AND Status <> 'Canceled'`,
            Fields: ['ID', 'CompanyID', 'Status', 'Amount', 'AmountPaid', 'DocumentNumber'],
            OrderBy: 'DueDate, InstallmentNumber',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return (res?.Results ?? []).map((r) => ({
        ID: String(r.ID),
        CompanyID: String(r.CompanyID),
        Status: String(r.Status),
        Amount: Number(r.Amount ?? 0),
        AmountPaid: Number(r.AmountPaid ?? 0),
        DocumentNumber: r.DocumentNumber ? String(r.DocumentNumber) : null,
    }));
}

/**
 * The gift card a payment was tendered with, or null when the payment's instrument is not a gift
 * card. A gift card is a `PaymentDetail` carrying `StoredValueAccountID` — the same split
 * `StoredValuePaymentProvider` makes. Account credit (`SourceOrderHeaderID`) and every other tender
 * come back null.
 */
export async function LoadGiftCardAccountID(
    provider: IRunViewProvider,
    user: UserInfo,
    paymentDetailID: string | null | undefined,
): Promise<string | null> {
    if (!paymentDetailID) return null;
    const detail = await readRow<{ StoredValueAccountID: string | null }>(
        provider, user, PAYMENT_DETAIL_ENTITY, paymentDetailID, ['StoredValueAccountID'], "the payment's instrument",
    );
    return detail.StoredValueAccountID || null;
}

/**
 * The product and company of the order line that sold the gift card a payment was tendered with,
 * or null when the instrument is not a gift card (issue #300). The redemption resolves its debit
 * from these exactly as the sale resolved its credit.
 *
 * A card with no selling line (issued outside an order) walks from its issuing company alone.
 * Throws if any read fails, so a failed read can't quietly fall back to Cash.
 */
export async function LoadGiftCardSale(
    provider: IRunViewProvider,
    user: UserInfo,
    paymentDetailID: string | null | undefined,
): Promise<GiftCardSaleLine | null> {
    const cardID = await LoadGiftCardAccountID(provider, user, paymentDetailID);
    if (!cardID) return null;

    const card = await readRow<{ IssuingCompanyID: string; IssuedFromOrderLineID: string | null }>(
        provider, user, STORED_VALUE_ACCOUNT_ENTITY, cardID, ['IssuingCompanyID', 'IssuedFromOrderLineID'], `gift card ${cardID}`,
    );
    if (!card.IssuedFromOrderLineID) {
        return { CompanyID: card.IssuingCompanyID, ProductID: null, ProductCategoryID: null, ProductTypeID: null };
    }

    const line = await readRow<{ ProductID: string; CompanyID: string | null }>(
        provider, user, ORDER_LINE_ENTITY, card.IssuedFromOrderLineID, ['ProductID', 'CompanyID'], `the line that sold gift card ${cardID}`,
    );
    const product = await readRow<{ CompanyID: string; ProductCategoryID: string | null; ProductTypeID: string }>(
        provider, user, PRODUCT_ENTITY, line.ProductID, ['CompanyID', 'ProductCategoryID', 'ProductTypeID'], `the product of gift card ${cardID}`,
    );
    return {
        // The sale's company rule (`OrderJournalEntryFactory`): the line's stamp, else the product's.
        CompanyID: line.CompanyID ?? product.CompanyID,
        ProductID: line.ProductID,
        ProductCategoryID: product.ProductCategoryID ?? null,
        ProductTypeID: product.ProductTypeID,
    };
}

/** One row by ID, or throw naming `what` — booking a gift card as cash on a failed read is the #300 bug. */
async function readRow<T>(
    provider: IRunViewProvider,
    user: UserInfo,
    entityName: string,
    id: string,
    fields: string[],
    what: string,
): Promise<T> {
    const res = await new RunView(provider).RunView<T>(
        { EntityName: entityName, ExtraFilter: `ID='${id}'`, Fields: fields, ResultType: 'simple', BypassCache: true },
        user,
    );
    const row = res?.Success ? res.Results?.[0] : undefined;
    if (!row) {
        throw new Error(`Could not read ${what} to book a gift card redemption: ${res?.ErrorMessage || 'no such record'}`);
    }
    return row;
}
