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
import { IMetadataProvider, IRunViewProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { LoadOrdersEngine, OrdersEngine } from '@mj-biz-apps/orders-entities';
import { LoadAccountingEngine } from './AccountingBridge.js';
import { CalendarDayOrToday } from './calendar-day.js';
import { DimensionDefaultResolver } from './DimensionDefaultResolver.js';
import type { ResolverEntityIDs } from './GLAccountResolver.js';
import { MergeDerivedTags, MergeLineDimensions } from './LineDimensionMerge.js';
import type { GiftCardSaleLine, OrderLineShare } from './PaymentAllocationFactory.js';
import type { PaymentJELineDimension } from './PaymentJournalEntryFactory.js';
import { CompanySlices, type InstalmentCashFacts } from './PaymentScheduleBehavior.js';
import {
    ORDER_HEADER_ENTITY,
    ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
    ORDER_LINE_DIMENSION_ENTITY,
    ORDER_LINE_ENTITY,
} from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
const STORED_VALUE_ACCOUNT_ENTITY = 'MJ_BizApps_Orders: Stored Value Accounts';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const COMPANY_ENTITY = 'MJ: Companies';

interface OrderLineRow {
    ID: string;
    CompanyID: string;
    ProductID: string;
    LineTotalGross: number;
    DimensionID?: string | null;
    DimensionValueID?: string | null;
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
 * the booking entry (D31), merged with the line's own `DimensionID`/`DimensionValueID` columns and
 * any product/category/type/company `DimensionDefault` mappings for axes not yet stamped on the
 * line (#383), so the credit that clears a receivable carries what the debit that raised it carried.
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
            Fields: ['ID', 'CompanyID', 'ProductID', 'LineTotalGross', 'DimensionID', 'DimensionValueID'],
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
    const defaultsByLine = await resolveDefaultLineDimensions(
        provider as unknown as IMetadataProvider,
        user,
        rows,
        orderHeaderID,
    );

    return rows.map((l) => {
        const key = String(l.ID).toLowerCase();
        const storedDims = tags.get(key) ?? [];
        const defaultDims = defaultsByLine.get(key) ?? [];
        const dims = MergeLineDimensions(
            { DimensionID: l.DimensionID, DimensionValueID: l.DimensionValueID },
            MergeDerivedTags(defaultDims, storedDims),
        );
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
            ...(dims.length ? { Dimensions: dims } : {}),
        };
    });
}

async function resolveDefaultLineDimensions(
    provider: IMetadataProvider,
    user: UserInfo,
    rows: OrderLineRow[],
    orderHeaderID: string,
): Promise<Map<string, PaymentJELineDimension[]>> {
    const out = new Map<string, PaymentJELineDimension[]>();
    if (rows.length === 0) return out;

    const engine = await LoadAccountingEngine(provider, user);
    if (!engine?.Dimensions?.length) return out;

    const entityIDs = tryResolveEntityIDs(provider);
    if (!entityIDs) return out;

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const headerRes = await rv.RunView<{ OrderDate: Date | string | null }>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID='${orderHeaderID}'`,
            Fields: ['OrderDate'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const rawOrderDate = headerRes?.Results?.[0]?.OrderDate;
    const orderDate = rawOrderDate ? new Date(rawOrderDate) : null;
    const asOf = await CalendarDayOrToday(orderDate, provider, user);
    const resolver = new DimensionDefaultResolver(entityIDs, provider, user);

    for (const row of rows) {
        const product = OrdersEngine.Instance.ProductByID(row.ProductID);
        const resolved = await resolver.Resolve(
            row.ProductID,
            product?.ProductCategoryID ?? null,
            product?.ProductTypeID ?? null,
            row.CompanyID ?? product?.CompanyID ?? '',
            asOf,
        );
        if (resolved.length > 0) {
            out.set(
                String(row.ID).toLowerCase(),
                resolved.map(({ DimensionID, DimensionValueID }) => ({ DimensionID, DimensionValueID })),
            );
        }
    }
    return out;
}

function tryResolveEntityIDs(provider: IMetadataProvider): ResolverEntityIDs | null {
    const entityByName = (name: string): string | undefined => {
        const fromProvider = (provider as { EntityByName?: (n: string) => { ID: string } | undefined }).EntityByName?.(name)?.ID;
        if (fromProvider) return fromProvider;
        try {
            return new Metadata().EntityByName(name)?.ID;
        } catch {
            return undefined;
        }
    };
    const Product = entityByName(PRODUCT_ENTITY);
    const ProductCategory = entityByName(PRODUCT_CATEGORY_ENTITY);
    const ProductType = entityByName(PRODUCT_TYPE_ENTITY);
    const Company = entityByName(COMPANY_ENTITY);
    if (!Product || !ProductCategory || !ProductType || !Company) return null;
    return { Product, ProductCategory, ProductType, Company };
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
 * Every live instalment on an order, for deciding how much of a payment settles a receivable (D91),
 * divided among the product companies whose lines it bills ({@link CompanySlices}, golive #311).
 *
 * The rows carry the order's company, but cash is split per product company (`AllocateByCompany`)
 * and each company books its own receivable and deposits, so each row comes back as one copy per
 * company it covers: same `ID`, that company's piece of `Amount` and `AmountPaid`. A row that covers
 * one company comes back unchanged apart from its `CompanyID`.
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
    const orderID = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const rv = new RunView(provider);
    const res = await rv.RunView<InstalmentCashFacts & { InstallmentNumber: number }>(
        {
            EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
            ExtraFilter: `OrderHeaderID='${orderID}' AND Status <> 'Canceled'`,
            Fields: ['ID', 'CompanyID', 'Status', 'Amount', 'AmountPaid', 'AmountCredited', 'DocumentNumber', 'InstallmentNumber'],
            OrderBy: 'DueDate, InstallmentNumber',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const rows = (res?.Results ?? []).map((r) => ({
        ID: String(r.ID),
        CompanyID: String(r.CompanyID),
        Status: String(r.Status),
        Amount: Number(r.Amount ?? 0),
        AmountPaid: Number(r.AmountPaid ?? 0),
        AmountCredited: Number(r.AmountCredited ?? 0),
        DocumentNumber: r.DocumentNumber ? String(r.DocumentNumber) : null,
        InstallmentNumber: Number(r.InstallmentNumber ?? 0),
    }));
    if (!rows.length) return [];

    const [header, lines] = await Promise.all([
        rv.RunView<{ CompanyID: string }>(
            { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID='${orderID}'`, Fields: ['CompanyID'], ResultType: 'simple', BypassCache: true },
            user,
        ),
        rv.RunView<{ CompanyID: string; LineTotalGross: number }>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID='${orderID}'`, Fields: ['CompanyID', 'LineTotalGross'], ResultType: 'simple', BypassCache: true },
            user,
        ),
    ]);
    const orderCompanyID = header?.Results?.[0]?.CompanyID;
    if (!header?.Success || !lines?.Success || !orderCompanyID) {
        throw new Error(
            `Could not read order ${orderID} to divide its payment schedule among its companies: ` +
                `${header?.ErrorMessage ?? lines?.ErrorMessage ?? 'order not found'}`,
        );
    }
    return CompanySlices(
        rows,
        (lines.Results ?? []).map((l) => ({ CompanyID: String(l.CompanyID), LineTotalGross: Number(l.LineTotalGross ?? 0) })),
        orderCompanyID,
    ).map(({ InstallmentNumber: _number, ...fact }) => fact);
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
