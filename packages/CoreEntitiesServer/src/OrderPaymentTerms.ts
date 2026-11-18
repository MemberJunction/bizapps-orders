/**
 * The payment terms an order gets at confirm, read from the database (D83).
 *
 * `PaymentTermsBehavior.ResolveDueDate` walks the rungs over facts it is handed: terms stated on the order,
 * then the customer's negotiated terms, then the selling company's default, then due on receipt. This module
 * gathers those facts. The confirm save uses it to stamp the order's due date and terms, and the payment
 * timing check uses it to judge the terms the order WILL carry, so an order that states no terms is judged
 * on the customer's or company's Net terms it inherits at confirm rather than as due on receipt.
 *
 * CONNECTS TO:
 *   CALLER: ./OrderEntityServer.ts (resolveDueDate, the concession gate) · ./PaymentTiming.ts (LoadPaymentTimingFacts)
 *   READS:  Customer Payment Terms · Order Company Policies · Payment Terms Types (through OrdersEngine)
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { LoadOrdersEngine, OrdersEngine, ToISODate } from '@mj-biz-apps/orders-entities';
import { ResolveDueDate, type CustomerTermsFacts, type TermsFacts, type TermsResolution } from './PaymentTermsBehavior.js';
import { RequireUUID } from './sql-guards.js';

const CUSTOMER_PAYMENT_TERMS_ENTITY = 'MJ_BizApps_Orders: Customer Payment Terms';
const ORDER_COMPANY_POLICY_ENTITY = 'MJ_BizApps_Orders: Order Company Policies';

/** The order fields the terms walk reads. */
export interface OrderTermsFacts {
    OrderDate: Date | string | null;
    CompanyID: string | null;
    BillToOrganizationID: string | null;
    BillToPersonID: string | null;
    DueDate: Date | string | null;
    PaymentTermsTypeID: string | null;
}

/**
 * Walk the terms rungs for an order. Returns null when the order has no order date, the one case the
 * walk cannot answer. Throws when a lookup fails; the caller decides what a failure means.
 */
export async function ResolveOrderPaymentTerms(
    order: OrderTermsFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<TermsResolution | null> {
    const orderDate = ToISODate(order.OrderDate);
    if (!orderDate) return null;

    await LoadOrdersEngine(provider, user);
    const terms = new Map(
        OrdersEngine.Instance.PaymentTermsTypes.map((t) => [
            String(t.ID).toLowerCase(),
            { PaymentTermsTypeID: String(t.ID), NetDays: t.NetDays ?? null },
        ]),
    );

    const [customerTerms, companyDefault] = await Promise.all([
        customerPaymentTerms(order, provider, user),
        companyDefaultTerms(order.CompanyID, provider, user, terms),
    ]);

    return ResolveDueDate({
        StatedDueDate: ToISODate(order.DueDate),
        StatedPaymentTermsTypeID: order.PaymentTermsTypeID ?? null,
        OrderDate: orderDate,
        CompanyID: order.CompanyID ?? null,
        CustomerTerms: customerTerms,
        CompanyDefault: companyDefault,
        TermsByID: terms,
    });
}

/** This buyer's negotiated terms, joined to their net days. */
async function customerPaymentTerms(order: OrderTermsFacts, provider: IMetadataProvider, user: UserInfo): Promise<CustomerTermsFacts[]> {
    const orgID = order.BillToOrganizationID;
    const personID = order.BillToPersonID;
    if (!orgID && !personID) return [];

    const clause = orgID
        ? `OrganizationID = '${RequireUUID(orgID, 'BillToOrganizationID')}'`
        : `PersonID = '${RequireUUID(personID as string, 'BillToPersonID')}'`;

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<{
        PaymentTermsTypeID: string;
        CompanyID: string | null;
        StartedAt: string | null;
        EndedAt: string | null;
        Status: string;
    }>(
        {
            EntityName: CUSTOMER_PAYMENT_TERMS_ENTITY,
            ExtraFilter: `${clause} AND Status = 'Active'`,
            // ORDER IS PART OF THE CONTRACT, not a convenience. `BestCustomerTerms` picks the
            // most recently started row, and without an ORDER BY the rows arrive in whatever
            // order the engine chooses — so a bug that simply kept the FIRST row would give the
            // right answer or the wrong one depending on the plan, and a test could pass twice
            // and fail on the third run. Oldest first makes "keep the first" always wrong, which
            // is what makes the guard against it meaningful.
            OrderBy: 'StartedAt',
            ResultType: 'simple',
        },
        user,
    );
    if (!result?.Success) return [];

    const byID = new Map(OrdersEngine.Instance.PaymentTermsTypes.map((t) => [String(t.ID).toLowerCase(), t]));
    return (result.Results ?? []).map((row) => ({
        PaymentTermsTypeID: row.PaymentTermsTypeID,
        NetDays: byID.get(String(row.PaymentTermsTypeID).toLowerCase())?.NetDays ?? null,
        CompanyID: row.CompanyID ?? null,
        StartedAt: row.StartedAt ? new Date(row.StartedAt).toISOString() : null,
        EndedAt: row.EndedAt ? new Date(row.EndedAt).toISOString() : null,
        Status: row.Status,
    }));
}

/**
 * The selling company's default terms — the last step of the due-date walk before "due on
 * receipt" (D83).
 *
 * Reads `OrderCompanyPolicy`, NOT accounting's `AccountingCompanyProfile`.
 *
 * It used to read the latter, and accounting removed that column (their issue #22) on grounds
 * this codebase agrees with: accounting records what was owed and when, but deciding WHEN AN
 * ORDER IS DUE is a selling decision, so the default belongs to the app that makes it. Orders
 * kept reading the removed column, so every order whose customer had no negotiated terms failed
 * the walk with `Invalid column name 'DefaultPaymentTermsTypeID'` — six integration checks, and
 * in production the entire company-default step.
 *
 * `OrderCompanyPolicy` is the right home and needed no new table: it is already the per-company
 * orders policy row, IS-A `__mj.Company` so its ID *is* the company ID, and a company with no
 * row simply takes the defaults — which here means falling through to due on receipt.
 */
async function companyDefaultTerms(
    companyID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
    terms: Map<string, TermsFacts>,
): Promise<TermsFacts | null> {
    if (!companyID) return null;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<{ DefaultPaymentTermsTypeID: string | null }>(
        {
            EntityName: ORDER_COMPANY_POLICY_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(companyID, 'CompanyID')}'`,
            ResultType: 'simple',
        },
        user,
    );
    const id = result?.Results?.[0]?.DefaultPaymentTermsTypeID;
    return id ? (terms.get(String(id).toLowerCase()) ?? null) : null;
}
