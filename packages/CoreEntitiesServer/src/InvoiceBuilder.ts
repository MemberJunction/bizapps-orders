/**
 * @fileoverview Reading an order and everything that hangs off it, so {@link BuildDocuments} can
 * turn it into something you send a customer.
 *
 * THE SPLIT IS DELIBERATE. Every decision lives in `InvoiceBehavior` where it can be exercised with
 * a literal; this file only fetches. That is why the module has no arithmetic beyond the joins it
 * needs to shape the rows, and why the discount is derived over there rather than read here.
 *
 * IT READS AND NOTHING ELSE. There is no invoice record to write, and there must not be one — see
 * the header of `InvoiceBehavior`. A caller can render the same order a hundred times and the
 * hundred documents will be identical, because the order is the only state involved.
 *
 * THE FETCH IS FLAT, NOT PER-LINE. Charges, allocations, adjustments and payments each come back in
 * ONE view call for the whole order and are indexed in memory. A twenty-line order should not cost
 * eighty round trips, and the shape that produces eighty round trips is the shape that looks
 * perfectly readable.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

import {
    BuildDocuments,
    CanRender,
    type InvoiceAdjustmentFacts,
    type InvoiceChargeFacts,
    type InvoiceDocument,
    type InvoiceLineFacts,
    type InvoiceOrderFacts,
    type InvoicePartyFacts,
    type InvoicePaymentFacts,
} from './InvoiceBehavior.js';
import { ORDER_HEADER_ENTITY } from './OrderDraftHydrator.js';
import { LoadOrdersEngine, OrdersEngine } from './OrdersEngine.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORDER_CHARGE_ENTITY = 'MJ_BizApps_Orders: Order Charges';
const ORDER_CHARGE_ALLOCATION_ENTITY = 'MJ_BizApps_Orders: Order Charge Allocations';
const ORDER_ADJUSTMENT_ENTITY = 'MJ_BizApps_Orders: Order Adjustments';
const ORDER_ADJUSTMENT_ALLOCATION_ENTITY = 'MJ_BizApps_Orders: Order Adjustment Allocations';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PAYMENT_TERMS_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Terms Types';
const ADDRESS_ENTITY = 'MJ.BizApps.Common: Addresses';
const ADDRESS_LINK_ENTITY = 'MJ.BizApps.Common: Address Links';
const COMPANY_ENTITY = 'MJ: Companies';
/**
 * The selling company's accounting identity. It IS-A Company, so the row shares the company's ID —
 * which is why the issuer block can be fetched by company ID with no join.
 */
const ACCOUNTING_COMPANY_PROFILE_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';

/** What a render attempt produced, or why it produced nothing. */
export interface InvoiceBuildResult {
    Success: boolean;
    Message?: string;
    Documents: InvoiceDocument[];
}

interface Row extends Record<string, unknown> {}

/** One view call, returning rows or an empty list — never a partial result presented as complete. */
async function view<T extends Row>(
    provider: IMetadataProvider,
    user: UserInfo,
    entityName: string,
    extraFilter: string,
    orderBy?: string,
): Promise<{ rows: T[]; error?: string }> {
    const result = await RunView.FromMetadataProvider(provider).RunView<T>(
        { EntityName: entityName, ExtraFilter: extraFilter, OrderBy: orderBy, ResultType: 'simple' },
        user,
    );
    if (!result.Success) return { rows: [], error: `${entityName}: ${result.ErrorMessage ?? 'unknown error'}` };
    return { rows: result.Results ?? [] };
}

const str = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s.length ? s : null;
};
const num = (v: unknown): number => Number(v ?? 0);

/**
 * A calendar date as `YYYY-MM-DD`, whatever the data layer handed over.
 *
 * `RunView` returns SQL `date` columns as JS **Date objects**, not strings. Slicing `String(date)`
 * takes the first ten characters of `Thu Jul 30 2026 00:00:00 GMT-0400` and yields `Thu Jul 30` —
 * which is not a date, parses as nothing, and prints on the invoice as a plausible-looking day with
 * no year on it. It is the exact failure shape this codebase keeps finding: readable, wrong, and
 * silent.
 *
 * The UTC components are read rather than the local ones, because a `date` column has no time and
 * the driver materialises it at midnight UTC — `getDate()` on a machine west of Greenwich returns
 * the day before.
 */
export const ToISODate = (v: unknown): string | null => {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return null;
        return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    }
    const text = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
};

/** An SQL `IN` list of quoted UUIDs, or null when there is nothing to look up. */
function uuidList(ids: Iterable<string | null | undefined>, context: string): string | null {
    const unique = [...new Set([...ids].filter(Boolean) as string[])];
    if (!unique.length) return null;
    return unique.map((id) => `'${RequireUUID(id, context)}'`).join(',');
}

/** Postal lines for an address, skipping the parts that are not filled in. */
function addressLines(row: Row | undefined): string[] {
    if (!row) return [];
    const cityLine = [str(row.City), [str(row.StateProvince), str(row.PostalCode)].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ');
    return [str(row.Line1), str(row.Line2), str(row.Line3), cityLine || null, str(row.Country)].filter(Boolean) as string[];
}

/**
 * Read one order and produce its documents — one per selling company.
 *
 * @param orderHeaderID The order to render.
 * @param options `AsOf` drives only the days-until-due countdown; `OnlyCompanyID` narrows a split
 *   order to a single document without changing how the others are numbered.
 */
export async function BuildInvoiceDocuments(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
    options?: { AsOf?: string | null; OnlyCompanyID?: string | null },
): Promise<InvoiceBuildResult> {
    const id = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const asOf = options?.AsOf ? String(options.AsOf).slice(0, 10) : new Date().toISOString().slice(0, 10);

    const header = await view<Row>(provider, user, ORDER_HEADER_ENTITY, `ID = '${id}'`);
    if (header.error) return { Success: false, Message: `Could not read the order — ${header.error}`, Documents: [] };
    if (!header.rows.length) return { Success: false, Message: `No order with ID ${id}.`, Documents: [] };

    const order = header.rows[0];
    const renderable = CanRender(String(order.Status));
    if (!renderable.OK) return { Success: false, Message: renderable.Reason, Documents: [] };

    const lineResult = await view<Row>(provider, user, ORDER_LINE_ENTITY, `OrderHeaderID = '${id}'`, 'LineNumber');
    if (lineResult.error) return { Success: false, Message: `Could not read the order lines — ${lineResult.error}`, Documents: [] };
    const lineRows = lineResult.rows;
    const lineIDs = uuidList(lineRows.map((l) => String(l.ID)), 'OrderLineID');

    // Everything below is fetched in parallel: none of it depends on any of the rest, and the
    // sequential version of this function was four times the latency for no benefit.
    const [chargeResult, adjustmentResult, paymentLineResult, productResult, termsResult, addressResult] = await Promise.all([
        view<Row>(provider, user, ORDER_CHARGE_ENTITY, `OrderHeaderID = '${id}'`, 'Sequence'),
        view<Row>(provider, user, ORDER_ADJUSTMENT_ENTITY, `OrderHeaderID = '${id}'`, 'Sequence'),
        view<Row>(provider, user, PAYMENT_LINE_ENTITY, `OrderHeaderID = '${id}'`),
        (async () => {
            const ids = uuidList(lineRows.map((l) => l.ProductID as string | null), 'ProductID');
            return ids ? view<Row>(provider, user, PRODUCT_ENTITY, `ID IN (${ids})`) : { rows: [] as Row[] };
        })(),
        // Terms and charge types come from the lookup cache instead of two of the round trips this
        // batch used to make — they are seeded reference data, and an invoice render read both.
        LoadOrdersEngine(provider, user).then(() => ({ rows: [] as Row[] })),
        (async () => {
            const ids = uuidList([order.BillToAddressID as string | null, order.ShipToAddressID as string | null], 'AddressID');
            return ids ? view<Row>(provider, user, ADDRESS_ENTITY, `ID IN (${ids})`) : { rows: [] as Row[] };
        })(),
    ]);

    const readError = [chargeResult, adjustmentResult, paymentLineResult, productResult, termsResult, addressResult]
        .map((r) => ('error' in r ? r.error : undefined))
        .find(Boolean);
    if (readError) return { Success: false, Message: `Could not assemble the invoice — ${readError}`, Documents: [] };

    const chargeIDs = uuidList(chargeResult.rows.map((c) => String(c.ID)), 'OrderChargeID');
    const adjustmentIDs = uuidList(adjustmentResult.rows.map((a) => String(a.ID)), 'OrderAdjustmentID');
    const paymentHeaderIDs = uuidList(paymentLineResult.rows.map((p) => p.PaymentHeaderID as string | null), 'PaymentHeaderID');
    const companyIDs = uuidList([...lineRows.map((l) => l.CompanyID as string), order.CompanyID as string], 'CompanyID');

    const [chargeAllocResult, adjustmentAllocResult, chargeTypeResult, paymentHeaderResult, companyResult, profileResult, companyAddressResult] = await Promise.all([
        chargeIDs && lineIDs
            ? view<Row>(provider, user, ORDER_CHARGE_ALLOCATION_ENTITY, `OrderChargeID IN (${chargeIDs})`)
            : Promise.resolve({ rows: [] as Row[] }),
        adjustmentIDs
            ? view<Row>(provider, user, ORDER_ADJUSTMENT_ALLOCATION_ENTITY, `OrderAdjustmentID IN (${adjustmentIDs})`)
            : Promise.resolve({ rows: [] as Row[] }),
        Promise.resolve({ rows: [] as Row[] }), // charge types come from the lookup cache
        paymentHeaderIDs
            ? view<Row>(provider, user, PAYMENT_HEADER_ENTITY, `ID IN (${paymentHeaderIDs})`)
            : Promise.resolve({ rows: [] as Row[] }),
        companyIDs ? view<Row>(provider, user, COMPANY_ENTITY, `ID IN (${companyIDs})`) : Promise.resolve({ rows: [] as Row[] }),
        // IS-A: the profile shares the company's ID, so this is a lookup and not a join. A company
        // with no accounting profile still issues an invoice — it just has no tax line to print.
        companyIDs
            ? view<Row>(provider, user, ACCOUNTING_COMPANY_PROFILE_ENTITY, `ID IN (${companyIDs})`)
            : Promise.resolve({ rows: [] as Row[] }),
        (async () => {
            const companyEntityID = provider.Entities?.find((e) => e.Name === COMPANY_ENTITY)?.ID;
            if (!companyEntityID || !companyIDs) return { rows: [] as Row[] };
            return view<Row>(
                provider,
                user,
                ADDRESS_LINK_ENTITY,
                `EntityID = '${RequireUUID(companyEntityID, 'Company entity ID')}' AND RecordID IN (${companyIDs})`,
                'IsPrimary DESC, Rank',
            );
        })(),
    ]);

    const secondError = [chargeAllocResult, adjustmentAllocResult, chargeTypeResult, paymentHeaderResult, companyResult, profileResult, companyAddressResult]
        .map((r) => ('error' in r ? r.error : undefined))
        .find(Boolean);
    if (secondError) return { Success: false, Message: `Could not assemble the invoice — ${secondError}`, Documents: [] };

    // The issuer addresses need a third trip because they are only knowable once the links are read.
    // It is skipped entirely when no company has an address on file, which is the common case until
    // somebody sets one up — an invoice with no remit-to address is worse-looking than one with, and
    // is still a correct invoice.
    const issuerAddressIDs = uuidList(companyAddressResult.rows.map((l) => l.AddressID as string | null), 'AddressID');
    const issuerAddressResult = issuerAddressIDs
        ? await view<Row>(provider, user, ADDRESS_ENTITY, `ID IN (${issuerAddressIDs})`)
        : { rows: [] as Row[] };

    // ── Index everything once ────────────────────────────────────────────────────────────────────

    const productByID = new Map(productResult.rows.map((p) => [String(p.ID), p]));
    const engine = OrdersEngine.Instance;
    const paymentHeaderByID = new Map(paymentHeaderResult.rows.map((p) => [String(p.ID), p]));
    const addressByID = new Map(addressResult.rows.map((a) => [String(a.ID), a]));
    const companyNames = new Map(companyResult.rows.map((c) => [String(c.ID), String(c.Name ?? '')]));

    const issuerAddressByID = new Map(issuerAddressResult.rows.map((a) => [String(a.ID), a]));
    // First link wins — the query is ordered primary-first, so a company with several addresses
    // prints the one somebody marked as the main office rather than whichever came back first.
    const issuerAddressByCompany = new Map<string, Row>();
    for (const link of companyAddressResult.rows) {
        const companyID = String(link.RecordID ?? '');
        if (issuerAddressByCompany.has(companyID)) continue;
        const address = issuerAddressByID.get(String(link.AddressID));
        if (address) issuerAddressByCompany.set(companyID, address);
    }

    const profileByID = new Map(profileResult.rows.map((p) => [String(p.ID), p]));
    const issuers = new Map(
        companyResult.rows.map((c) => {
            const companyID = String(c.ID);
            const profile = profileByID.get(companyID);
            return [
                companyID,
                {
                    CompanyID: companyID,
                    Name: String(c.Name ?? ''),
                    AddressLines: addressLines(issuerAddressByCompany.get(companyID)),
                    Email: null,
                    Phone: null,
                    Website: str(c.Website),
                    TaxID: str(profile?.FederalTaxID),
                    CurrencyCode: str(profile?.FunctionalCurrencyCode),
                },
            ] as const;
        }),
    );

    const allocationsByCharge = new Map<string, Array<{ OrderLineID: string; Amount: number }>>();
    for (const alloc of chargeAllocResult.rows) {
        const key = String(alloc.OrderChargeID);
        const bucket = allocationsByCharge.get(key) ?? [];
        bucket.push({ OrderLineID: String(alloc.OrderLineID), Amount: num(alloc.Amount) });
        allocationsByCharge.set(key, bucket);
    }

    const allocationsByAdjustment = new Map<string, Array<{ OrderLineID: string; Amount: number }>>();
    for (const alloc of adjustmentAllocResult.rows) {
        const key = String(alloc.OrderAdjustmentID);
        const bucket = allocationsByAdjustment.get(key) ?? [];
        bucket.push({ OrderLineID: String(alloc.OrderLineID), Amount: num(alloc.Amount) });
        allocationsByAdjustment.set(key, bucket);
    }

    // ── Shape the facts ──────────────────────────────────────────────────────────────────────────

    const terms = engine.PaymentTermsTypeByID(order.PaymentTermsTypeID as string | null);

    const orderFacts: InvoiceOrderFacts = {
        ID: String(order.ID),
        OrderNumber: String(order.OrderNumber ?? ''),
        OrderType: str(order.OrderType),
        OrderDate: ToISODate(order.OrderDate) ?? asOf,
        Status: String(order.Status ?? ''),
        CompanyID: String(order.CompanyID ?? ''),
        CompanyName: str(order.Company) ?? '',
        TotalGross: num(order.TotalGross),
        AmountPaid: num(order.AmountPaid),
        Balance: num(order.Balance),
        DueDate: ToISODate(order.DueDate),
        PaymentStatus: str(order.PaymentStatus),
        ExternalDocumentNumber: str(order.ExternalDocumentNumber),
        ReversesOrderHeaderID: str(order.ReversesOrderHeaderID),
        ReversesOrderNumber: str(order.ReversesOrderHeader),
        ReversalReason: str(order.ReversalReason),
        Description: str(order.Description),
        PaymentTermsName: str(order.PaymentTermsType),
        PaymentTermsNetDays: terms?.NetDays != null ? Number(terms.NetDays) : null,
    };

    const lines: InvoiceLineFacts[] = lineRows.map((l) => {
        const product = l.ProductID ? productByID.get(String(l.ProductID)) : undefined;
        return {
            ID: String(l.ID),
            LineNumber: Number(l.LineNumber ?? 0),
            ProductID: str(l.ProductID),
            // The line's own description wins over the product name: it is what somebody typed for
            // THIS sale, and on a bill the customer's words beat the catalogue's.
            ProductName: str(l.Product) ?? str(product?.Name) ?? 'Item',
            ProductSKU: str(product?.SKU),
            Description: str(l.Description),
            CompanyID: String(l.CompanyID ?? orderFacts.CompanyID),
            CompanyName: str(l.Company) ?? '',
            Quantity: num(l.Quantity),
            UnitPrice: num(l.UnitPrice),
            DiscountAmount: num(l.DiscountAmount),
            LineTotalNet: num(l.LineTotalNet),
            ChargeAmount: num(l.ChargeAmount),
            LineTax: num(l.LineTax),
            LineTotalGross: num(l.LineTotalGross),
            ServicePeriodStart: ToISODate(l.ServicePeriodStart),
            ServicePeriodEnd: ToISODate(l.ServicePeriodEnd),
            ParentOrderLineID: str(l.ParentOrderLineID),
            IsRollupParent: l.IsRollupParent === true || l.IsRollupParent === 1,
            ReversesOrderLineID: str(l.ReversesOrderLineID),
        };
    });

    const charges: InvoiceChargeFacts[] = chargeResult.rows.map((c) => {
        const type = engine.ChargeTypeByID(c.ChargeTypeID as string | null);
        return {
            ID: String(c.ID),
            Name: str(c.ChargeType) ?? str(type?.Name) ?? 'Charge',
            Category: str(type?.Category) ?? 'Surcharge',
            Amount: num(c.Amount),
            Rate: c.Rate == null ? null : Number(c.Rate),
            Sequence: Number(c.Sequence ?? 0),
            Allocations: allocationsByCharge.get(String(c.ID)) ?? [],
        };
    });

    const adjustments: InvoiceAdjustmentFacts[] = adjustmentResult.rows.map((a) => ({
        ID: String(a.ID),
        OrderLineID: str(a.OrderLineID),
        PromotionName: str(a.Promotion),
        PromotionCode: str(a.PromotionCode),
        Reason: str(a.Reason),
        Amount: num(a.Amount),
        Allocations: allocationsByAdjustment.get(String(a.ID)) ?? [],
    }));

    // Payment lines are grouped into one entry per payment: a cheque split across six order lines is
    // ONE payment on the document, not six.
    const paymentsByHeader = new Map<string, InvoicePaymentFacts>();
    for (const pl of paymentLineResult.rows) {
        const headerID = String(pl.PaymentHeaderID);
        const paymentHeader = paymentHeaderByID.get(headerID);
        const existing = paymentsByHeader.get(headerID) ?? {
            PaymentHeaderID: headerID,
            PaymentNumber: str(paymentHeader?.PaymentNumber) ?? str(pl.PaymentHeader) ?? '—',
            PaymentDate: ToISODate(paymentHeader?.PaymentDate) ?? asOf,
            PaymentTypeName: str(paymentHeader?.PaymentType),
            Amount: 0,
            Allocations: [] as Array<{ OrderLineID: string | null; Amount: number }>,
        };
        existing.Amount = Math.round((existing.Amount + num(pl.Amount) + Number.EPSILON) * 100) / 100;
        existing.Allocations.push({ OrderLineID: str(pl.OrderLineID), Amount: num(pl.Amount) });
        paymentsByHeader.set(headerID, existing);
    }
    // A reversed payment is not money the customer still has credit for. It is excluded here rather
    // than netted, so a refunded order shows the original balance again instead of a phantom credit.
    const payments = [...paymentsByHeader.values()].filter((p) => {
        const status = str(paymentHeaderByID.get(p.PaymentHeaderID)?.Status);
        return status !== 'Reversed' && status !== 'Failed' && status !== 'Voided';
    });

    const billToAddress = order.BillToAddressID ? addressByID.get(String(order.BillToAddressID)) : undefined;
    const shipToAddress = order.ShipToAddressID ? addressByID.get(String(order.ShipToAddressID)) : undefined;

    const billTo: InvoicePartyFacts = {
        Name: str(order.BillToOrganization) ?? str(order.BillToPerson),
        AttentionOf: str(order.BillToOrganization) ? str(order.BillToPerson) : null,
        AddressLines: addressLines(billToAddress),
        Email: null,
    };

    const shipTo: InvoicePartyFacts | null =
        order.ShipToAddressID && String(order.ShipToAddressID) !== String(order.BillToAddressID ?? '')
            ? {
                  Name: str(order.ShipToOrganization) ?? str(order.ShipToPerson) ?? billTo.Name,
                  AttentionOf: null,
                  AddressLines: addressLines(shipToAddress),
                  Email: null,
              }
            : null;

    const documents = BuildDocuments({
        Order: orderFacts,
        Lines: lines,
        Charges: charges,
        Adjustments: adjustments,
        Payments: payments,
        BillTo: billTo,
        ShipTo: shipTo,
        CompanyNames: companyNames,
        Issuers: issuers,
        AsOf: asOf,
        OnlyCompanyID: options?.OnlyCompanyID ?? null,
    });

    if (options?.OnlyCompanyID && !documents.length) {
        return {
            Success: false,
            Message: `Order ${orderFacts.OrderNumber} has no lines sold by company ${options.OnlyCompanyID}.`,
            Documents: [],
        };
    }

    return { Success: true, Documents: documents };
}
