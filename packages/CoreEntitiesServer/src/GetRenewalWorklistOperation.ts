/**
 * `Orders.GetRenewalWorklist` — what the Renewals page shows.
 *
 * THE QUESTION. Accounting and the product teams both ask it, from different sides: "which
 * subscriptions end soon, which of them will renew by themselves and when, which have already
 * renewed and at what price, and which does somebody have to act on?". Today that is answered by
 * reading subscriptions one at a time. This operation answers it for a window, one row per
 * subscription, with the order that bought the expiring term and the renewal order beside it.
 *
 * WHY AN OPERATION. "Ends inside the window" moves with the calendar, the renewal price moves with
 * the catalog and the increase ladder, and "has a renewal order" is a join a view cannot express
 * without a stored flag that would go stale. So it is computed per request, like the overdue and
 * billing worklists, and read-only like them.
 *
 * ONE RULE, NOT TWO. The state of each row (`State`, `AutoRenewOn`) is decided by
 * `ClassifyRenewal` in orders-entities from the facts the renewal pass selects by, and the
 * projected price comes from the same `RenewalPricer` the pass places with. A page that priced or
 * classified on its own would disagree with the job on exactly the rows people look at.
 *
 * WHICH TERM IS "THE EXPIRING ONE". A subscription that has not renewed shows its latest term. One
 * that HAS renewed shows the term before the latest, with the latest term's order as the renewal:
 * once the renewal books, the subscription's latest term is the new one and would otherwise drop
 * out of a list of what is ending — exactly when accounting wants to see that it renewed, and for
 * how much.
 *
 * Every date that crosses the boundary is `YYYY-MM-DD`. A `date` column comes back from the driver
 * as a `Date` at UTC midnight; it is read with `ToISODate`, never stringified.
 */
import { BaseRemotableOperation, LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import {
    OrdersGetRenewalWorklistOperation as OrdersGetRenewalWorklistOperationBase,
    AddDays,
    ClassifyRenewal,
    DaysBetweenDays,
    ToISODate,
    type OrdersGetRenewalWorklistInput,
    type OrdersGetRenewalWorklistOutput,
    type RenewalWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { RequireDate, RequireUUIDs } from './sql-guards.js';
import { EffectiveLeadDays, RenewalPricer, type RenewalSourceLineRow, type RenewalSubjectRow } from './RenewalPricing.js';
import { LoadRenewalPass } from './RenewalPassMode.js';

const money = (v: number | null | undefined): number | null => (v == null ? null : Math.round((Number(v) + Number.EPSILON) * 100) / 100);

/** A subscription and its two most recent terms, as the selection reads them. */
interface SubjectRow {
    SubscriptionID: string;
    SubscriptionNumber: string;
    SubscriptionStatus: string;
    SubscriptionTypeID: string;
    CompanyID: string;
    ProductID: string;
    HolderOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
    AutoRenew: boolean;
    ProviderSubscriptionID: string | null;
    SubscriptionRenewalLeadDays: number | null;
    TypeRenewalLeadDays: number | null;
    SubscriptionStartDate: string;
    SubscriptionIncreasePercent: number | null;
    CarryDiscountOnRenewal: boolean;
    DefaultCustomerPaymentMethodID: string | null;
    CompanyName: string | null;
    ProductName: string | null;
    SubscriptionTypeName: string | null;
    AccountName: string | null;
    ContactName: string | null;
    LatestTermID: string;
    LatestTermNumber: number;
    LatestTermStart: string;
    LatestTermEnd: string;
    LatestTermStatus: string;
    LatestOrderLineID: string;
    LatestQuantity: number;
    PriorTermID: string | null;
    PriorTermNumber: number | null;
    PriorTermStart: string | null;
    PriorTermEnd: string | null;
    PriorTermStatus: string | null;
    PriorOrderLineID: string | null;
    PriorQuantity: number | null;
}

/** An order line with its header, as both the current and the renewal columns read it. */
interface LineRow extends RenewalSourceLineRow {
    LineTotalNet: number | null;
    RenewsSubscriptionID: string | null;
    OrderNumber: string;
    OrderDate: string;
    OrderStatus: string;
    OrderBalance: number | null;
}

const LINE_COLUMNS = `
            ol.ID, ol.OrderHeaderID, ol.ProductID, ol.Quantity, ol.UnitPrice, ol.DiscountPct, ol.LineTotalNet,
            ol.PriceOverridden, ol.ProductPriceID, ol.ServicePeriodStart, ol.ServicePeriodEnd, ol.RenewsSubscriptionID,
            oh.OrderNumber, oh.OrderDate, oh.Status AS OrderStatus, oh.Balance AS OrderBalance`;

@RegisterClass(BaseRemotableOperation, 'Orders.GetRenewalWorklist')
export class GetRenewalWorklistOperation extends OrdersGetRenewalWorklistOperationBase {
    protected async InternalExecute(
        input: OrdersGetRenewalWorklistInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersGetRenewalWorklistOutput> {
        // The BUSINESS day, not the UTC one (#209): the same correction the other worklists take, so
        // this list and the renewal pass agree about which day it is.
        await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
        const asOf = RequireDate(input?.AsOfDate ?? BusinessTimeZoneEngine.Instance.Today(), 'AsOfDate');
        const windowDays = Math.max(0, Math.floor(Number(input?.WindowDays ?? 90)));
        const lookbackDays = Math.max(0, Math.floor(Number(input?.LookbackDays ?? 30)));
        const windowStart = AddDays(asOf, -lookbackDays);
        const windowEnd = AddDays(asOf, windowDays);
        const maxCount = Math.max(1, Math.floor(Number(input?.MaxCount ?? 500)));
        const companyIDs = input?.CompanyIDs?.length ? RequireUUIDs(input.CompanyIDs, 'CompanyIDs') : [];
        const project = input?.Project !== false;

        let subjects: SubjectRow[];
        try {
            subjects = await this.findSubjects(provider, asOf, windowStart, windowEnd, companyIDs, maxCount + 1);
        } catch (err) {
            return this.empty(`Could not read the subscriptions ending in the window: ${err instanceof Error ? err.message : String(err)}`, asOf, windowStart, windowEnd);
        }
        const truncated = subjects.length > maxCount;
        if (truncated) subjects = subjects.slice(0, maxCount);
        const pass = await LoadRenewalPass(provider, user);
        if (!subjects.length) return { Success: true, Rows: [], RowCount: 0, Truncated: false, AsOfDate: asOf, WindowStart: windowStart, WindowEnd: windowEnd, PassMode: pass.Mode, PassNextRunAt: pass.NextRunAt };

        // Which term is expiring: the latest, unless the latest is the renewal of one ending in the window.
        const picked = subjects.map((s) => {
            const latestEnd = ToISODate(s.LatestTermEnd) ?? '';
            const priorEnd = ToISODate(s.PriorTermEnd);
            const latestInWindow = latestEnd >= windowStart && latestEnd <= windowEnd;
            const renewed = !latestInWindow && !!priorEnd && priorEnd >= windowStart && priorEnd <= windowEnd;
            return { subject: s, renewed };
        });

        const lineIDs = new Set<string>();
        for (const { subject, renewed } of picked) {
            lineIDs.add(String(subject.LatestOrderLineID).toLowerCase());
            if (renewed && subject.PriorOrderLineID) lineIDs.add(String(subject.PriorOrderLineID).toLowerCase());
        }
        const unrenewed = picked.filter((p) => !p.renewed).map((p) => String(p.subject.SubscriptionID).toLowerCase());

        let lines: Map<string, LineRow>;
        let pending: Map<string, LineRow>;
        try {
            [lines, pending] = await Promise.all([this.loadLines(provider, [...lineIDs]), this.loadPendingRenewals(provider, unrenewed)]);
        } catch (err) {
            return this.empty(`Could not read the orders behind the subscriptions: ${err instanceof Error ? err.message : String(err)}`, asOf, windowStart, windowEnd);
        }

        const pricer = project ? new RenewalPricer(provider, user) : null;
        const rows: RenewalWorklistRow[] = [];
        for (const { subject, renewed } of picked) {
            const expiring = renewed
                ? {
                      TermID: String(subject.PriorTermID),
                      TermNumber: Number(subject.PriorTermNumber),
                      Start: ToISODate(subject.PriorTermStart) ?? '',
                      End: ToISODate(subject.PriorTermEnd) ?? '',
                      Status: String(subject.PriorTermStatus),
                      OrderLineID: String(subject.PriorOrderLineID),
                      Quantity: Number(subject.PriorQuantity ?? 1),
                  }
                : {
                      TermID: String(subject.LatestTermID),
                      TermNumber: Number(subject.LatestTermNumber),
                      Start: ToISODate(subject.LatestTermStart) ?? '',
                      End: ToISODate(subject.LatestTermEnd) ?? '',
                      Status: String(subject.LatestTermStatus),
                      OrderLineID: String(subject.LatestOrderLineID),
                      Quantity: Number(subject.LatestQuantity ?? 1),
                  };
            const current = lines.get(expiring.OrderLineID.toLowerCase()) ?? null;
            const renewal = renewed
                ? (lines.get(String(subject.LatestOrderLineID).toLowerCase()) ?? null)
                : (pending.get(String(subject.SubscriptionID).toLowerCase()) ?? null);
            const providerBilled = subject.ProviderSubscriptionID != null;
            const leadDays = EffectiveLeadDays(subject);
            const classified = ClassifyRenewal({
                Status: subject.SubscriptionStatus,
                AutoRenew: !!subject.AutoRenew,
                ProviderBilled: providerBilled,
                RenewalBooked: renewed,
                RenewalPending: !renewed && !!renewal,
                TermEndDate: expiring.End,
                LeadDays: leadDays,
                AsOf: asOf,
            });

            const row: RenewalWorklistRow = {
                SubscriptionID: subject.SubscriptionID,
                SubscriptionNumber: subject.SubscriptionNumber,
                Status: subject.SubscriptionStatus,
                AutoRenew: !!subject.AutoRenew,
                ProviderBilled: providerBilled,
                ContactID: subject.BeneficiaryPersonID,
                ContactName: subject.ContactName,
                AccountID: subject.HolderOrganizationID,
                AccountName: subject.AccountName,
                CompanyID: subject.CompanyID,
                CompanyName: subject.CompanyName ?? '',
                ProductID: subject.ProductID,
                ProductName: subject.ProductName ?? '',
                SubscriptionTypeName: subject.SubscriptionTypeName ?? '',
                StartDate: ToISODate(subject.SubscriptionStartDate) ?? '',
                TermNumber: expiring.TermNumber,
                TermStartDate: expiring.Start,
                TermEndDate: expiring.End,
                DaysUntilEnd: expiring.End ? DaysBetweenDays(asOf, expiring.End) : 0,
                LeadDays: leadDays,
                State: classified.State,
                AutoRenewOn: classified.AutoRenewOn,
                CurrentOrderID: current?.OrderHeaderID ?? null,
                CurrentOrderNumber: current?.OrderNumber ?? null,
                CurrentOrderDate: current ? ToISODate(current.OrderDate) : null,
                CurrentOrderStatus: current?.OrderStatus ?? null,
                CurrentUnitPrice: money(current?.UnitPrice),
                CurrentQuantity: current ? Number(current.Quantity) : null,
                CurrentLineTotal: money(current?.LineTotalNet),
                CurrentOrderBalance: money(current?.OrderBalance),
                RenewalOrderID: renewal?.OrderHeaderID ?? null,
                RenewalOrderNumber: renewal?.OrderNumber ?? null,
                RenewalOrderDate: renewal ? ToISODate(renewal.OrderDate) : null,
                RenewalOrderStatus: renewal?.OrderStatus ?? null,
                RenewalUnitPrice: money(renewal?.UnitPrice),
                RenewalQuantity: renewal ? Number(renewal.Quantity) : null,
                RenewalLineTotal: money(renewal?.LineTotalNet),
                RenewalTermStart: renewed ? ToISODate(subject.LatestTermStart) : null,
                RenewalTermEnd: renewed ? ToISODate(subject.LatestTermEnd) : null,
                RenewalBooked: renewed,
                SubscriptionIncreasePercent: subject.SubscriptionIncreasePercent == null ? null : Number(subject.SubscriptionIncreasePercent),
            };

            // The projection: only where a renewal would still be placed, and only where the pass's
            // own rules would let it be. The figure is the pass's, so a person can check it early.
            const projectable = pricer && !renewal && !providerBilled && ['DueNow', 'Scheduled', 'WillEnd', 'Lapsed'].includes(classified.State);
            if (projectable) {
                const subjectForPricer: RenewalSubjectRow = {
                    SubscriptionID: subject.SubscriptionID,
                    SubscriptionNumber: subject.SubscriptionNumber,
                    SubscriptionStatus: subject.SubscriptionStatus,
                    SubscriptionTypeID: subject.SubscriptionTypeID,
                    CompanyID: subject.CompanyID,
                    ProductID: subject.ProductID,
                    HolderOrganizationID: subject.HolderOrganizationID,
                    BeneficiaryPersonID: subject.BeneficiaryPersonID,
                    SubscriptionRenewalLeadDays: subject.SubscriptionRenewalLeadDays,
                    TypeRenewalLeadDays: subject.TypeRenewalLeadDays,
                    TermID: expiring.TermID,
                    TermNumber: expiring.TermNumber,
                    TermStartDate: expiring.Start,
                    TermEndDate: expiring.End,
                    TermQuantity: expiring.Quantity,
                    OrderLineID: expiring.OrderLineID,
                    SubscriptionStartDate: ToISODate(subject.SubscriptionStartDate) ?? expiring.Start,
                    SubscriptionIncreasePercent: subject.SubscriptionIncreasePercent == null ? null : Number(subject.SubscriptionIncreasePercent),
                    CarryDiscountOnRenewal: !!subject.CarryDiscountOnRenewal,
                    DefaultCustomerPaymentMethodID: subject.DefaultCustomerPaymentMethodID,
                    AutoRenew: !!subject.AutoRenew,
                };
                try {
                    const priced = await pricer.Price(subjectForPricer, { SourceLine: current, IncludePromotions: false });
                    const unit = priced.Price.UnitPrice;
                    row.ProjectedUnitPrice = money(unit);
                    row.ProjectedQuantity = priced.Quantity;
                    row.ProjectedLineTotal = money(unit * priced.Quantity * (1 - Number(priced.Price.DiscountPct ?? 0)));
                    row.ProjectedBasePrice = money(priced.Price.BasePrice);
                    row.ProjectedBasePriceSource = priced.Price.BaseSource;
                    row.ProjectedIncreasePercent = priced.Price.IncreasePercent;
                    row.ProjectedIncreaseSource = priced.Price.IncreaseSource;
                    row.ProjectedIncreaseSetPercent = priced.Price.IncreaseSetPercent;
                    row.ProjectedIncreaseSetSource = priced.Price.IncreaseSetSource;
                    row.ProjectedIncreaseApplied = priced.Price.IncreaseApplied;
                    row.ProjectedProductID = priced.ProductID;
                    row.ProjectedProductName = priced.ProductName;
                    row.ProjectedTermStart = priced.Term?.Start ?? null;
                    row.ProjectedTermEnd = priced.Term?.End ?? null;
                } catch (err) {
                    // Reported on the row, never fatal: the list is still the list, and the reason is
                    // the thing a person needs to fix before the pass meets the same wall.
                    const message = err instanceof Error ? err.message : String(err);
                    LogError(`Orders.GetRenewalWorklist: ${subject.SubscriptionNumber} could not be projected: ${message}`);
                    row.ProjectionProblem = message;
                }
            }
            rows.push(row);
        }

        return { Success: true, Rows: rows, RowCount: rows.length, Truncated: truncated, AsOfDate: asOf, WindowStart: windowStart, WindowEnd: windowEnd, PassMode: pass.Mode, PassNextRunAt: pass.NextRunAt };
    }

    /**
     * Subscriptions whose latest term, or whose previous term when the latest continues it, ends inside
     * the window. Raw SQL, like the renewal pass's own selection, because "the two most recent terms per
     * subscription" is a window function and awkward as round trips. The display names come from
     * `vwSubscriptions`, the same view the subscription list reads.
     */
    private async findSubjects(provider: IMetadataProvider, asOf: string,
        windowStart: string, windowEnd: string, companyIDs: string[], top: number): Promise<SubjectRow[]> {
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const companies = companyIDs.length ? `AND s.CompanyID IN (${companyIDs.map((id) => `'${id}'`).join(',')})` : '';
        const rows = (await db.ExecuteSQL(`
            WITH ranked AS (
                SELECT st.ID, st.SubscriptionID, st.TermNumber, st.StartDate, st.EndDate, st.Status, st.OrderLineID, st.Quantity,
                       ROW_NUMBER() OVER (PARTITION BY st.SubscriptionID ORDER BY st.TermNumber DESC) AS rn
                FROM __mj_BizAppsOrders.SubscriptionTerm st
            )
            SELECT TOP ${top}
                s.ID                     AS SubscriptionID,
                s.SubscriptionNumber,
                s.Status                 AS SubscriptionStatus,
                s.SubscriptionTypeID,
                s.CompanyID,
                s.ProductID,
                s.HolderOrganizationID,
                s.BeneficiaryPersonID,
                s.AutoRenew,
                s.ProviderSubscriptionID,
                s.RenewalLeadDays        AS SubscriptionRenewalLeadDays,
                t.RenewalLeadDays        AS TypeRenewalLeadDays,
                s.StartDate              AS SubscriptionStartDate,
                s.RenewalIncreasePercent AS SubscriptionIncreasePercent,
                s.CarryDiscountOnRenewal,
                s.DefaultCustomerPaymentMethodID,
                vs.Company               AS CompanyName,
                vs.Product               AS ProductName,
                vs.SubscriptionType      AS SubscriptionTypeName,
                vs.HolderOrganization    AS AccountName,
                vs.BeneficiaryPerson     AS ContactName,
                l.ID                     AS LatestTermID,
                l.TermNumber             AS LatestTermNumber,
                l.StartDate              AS LatestTermStart,
                l.EndDate                AS LatestTermEnd,
                l.Status                 AS LatestTermStatus,
                l.OrderLineID            AS LatestOrderLineID,
                l.Quantity               AS LatestQuantity,
                p.ID                     AS PriorTermID,
                p.TermNumber             AS PriorTermNumber,
                p.StartDate              AS PriorTermStart,
                p.EndDate                AS PriorTermEnd,
                p.Status                 AS PriorTermStatus,
                p.OrderLineID            AS PriorOrderLineID,
                p.Quantity               AS PriorQuantity
            FROM __mj_BizAppsOrders.Subscription s
            JOIN __mj_BizAppsOrders.vwSubscriptions vs ON vs.ID = s.ID
            JOIN __mj_BizAppsOrders.SubscriptionType t ON t.ID = s.SubscriptionTypeID
            JOIN ranked l ON l.SubscriptionID = s.ID AND l.rn = 1
            LEFT JOIN ranked p ON p.SubscriptionID = s.ID AND p.rn = 2
            WHERE (
                    l.EndDate BETWEEN '${windowStart}' AND '${windowEnd}'
                    -- Renewed: the previous term ends in the window and the latest one continues it. Only
                    -- while that previous term is still running: once it has ended the renewal is simply the
                    -- current term, and it comes back into the list when ITS end nears. The lookback is for
                    -- terms that ended without renewing.
                    OR (p.EndDate BETWEEN '${asOf}' AND '${windowEnd}' AND l.StartDate >= p.EndDate)
                  )
              ${companies}
            ORDER BY CASE WHEN l.EndDate BETWEEN '${windowStart}' AND '${windowEnd}' THEN l.EndDate ELSE p.EndDate END, s.SubscriptionNumber
        `)) as SubjectRow[];
        return Array.isArray(rows) ? rows : [];
    }

    /** Order lines and their headers by line ID (lower-cased), in chunks the driver is happy with. */
    private async loadLines(provider: IMetadataProvider, lineIDs: string[]): Promise<Map<string, LineRow>> {
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const out = new Map<string, LineRow>();
        const ids = RequireUUIDs(lineIDs, 'OrderLineID');
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const rows = (await db.ExecuteSQL(`
                SELECT${LINE_COLUMNS}
                FROM __mj_BizAppsOrders.OrderLine ol
                JOIN __mj_BizAppsOrders.vwOrderHeaders oh ON oh.ID = ol.OrderHeaderID
                WHERE ol.ID IN (${chunk.map((id) => `'${id}'`).join(',')})
            `)) as LineRow[];
            for (const row of Array.isArray(rows) ? rows : []) out.set(String(row.ID).toLowerCase(), row);
        }
        return out;
    }

    /**
     * A live renewal order that has not produced a term, per subscription (lower-cased ID): the renewal
     * pass's own second guard, read the same way. Newest first, so a subscription with two drafts
     * shows the latest.
     */
    private async loadPendingRenewals(provider: IMetadataProvider, subscriptionIDs: string[]): Promise<Map<string, LineRow>> {
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const out = new Map<string, LineRow>();
        const ids = RequireUUIDs(subscriptionIDs, 'SubscriptionID');
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const rows = (await db.ExecuteSQL(`
                SELECT${LINE_COLUMNS}
                FROM __mj_BizAppsOrders.OrderLine ol
                JOIN __mj_BizAppsOrders.vwOrderHeaders oh ON oh.ID = ol.OrderHeaderID
                WHERE ol.RenewsSubscriptionID IN (${chunk.map((id) => `'${id}'`).join(',')})
                  AND oh.Status <> 'Voided'
                  AND NOT EXISTS (SELECT 1 FROM __mj_BizAppsOrders.SubscriptionTerm st WHERE st.OrderLineID = ol.ID)
                ORDER BY oh.OrderDate DESC, oh.OrderNumber DESC
            `)) as LineRow[];
            for (const row of Array.isArray(rows) ? rows : []) {
                const key = String(row.RenewsSubscriptionID).toLowerCase();
                if (!out.has(key)) out.set(key, row);
            }
        }
        return out;
    }

    private empty(message: string, asOf: string, windowStart: string, windowEnd: string): OrdersGetRenewalWorklistOutput {
        return { Success: false, Message: message, Rows: [], RowCount: 0, Truncated: false, AsOfDate: asOf, WindowStart: windowStart, WindowEnd: windowEnd, PassMode: 'Unknown' };
    }
}

/** Registers {@link GetRenewalWorklistOperation}. Called from the server bootstrap. */
export function LoadGetRenewalWorklistOperation(): void {
    void GetRenewalWorklistOperation;
}
