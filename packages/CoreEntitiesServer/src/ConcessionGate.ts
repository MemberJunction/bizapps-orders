/**
 * ConcessionGate — the reads behind "may this order go in front of the customer yet?".
 *
 * A concession the customer has already been told about cannot be taken back in practice, whatever
 * the record says afterwards. So the approval has to come first in SEQUENCE, not only on save: an
 * order may be saved with a concession awaiting approval, but it may not be confirmed, and its
 * documents may not be sent, until every concession on it is decided. Two things hold it back:
 *
 *   1. an `OrderConcession` on the order that is still Pending; and
 *   2. on an order not yet confirmed, a line that gives value away with no Approved concession
 *      covering it: a stated price below its engine price, a `DiscountPct`, or both. A named list
 *      pick is a configured price, not a concession, and is left alone; a `DiscountPct` on it is not.
 *
 * `DiscountPct` counts because it is the same give-away written in another column. A deal's
 * Discount %, an API call or an import writes it straight onto the line, so a gate that read only
 * `UnitPrice` let any of them discount with no Sales Authority and no approval (golive #305). A
 * manual discount (`DiscountAmount`) is not counted: it is gated where it is applied, by
 * `AuthorizeManualDiscount`, and leaves its own adjustment row. Nor is the `DiscountPct` on a line
 * that renews a subscription, which carries the renewed line's discount forward; that discount was
 * settled when the subscription was sold.
 *
 * Every line with a stated price is re-priced here, not only those flagged `PriceOverridden`. The
 * flag is set by the order-lines editor; a line priced through the API, an import or an integration
 * need not carry it, and the gate must not depend on who set it.
 *
 * A bundle component — a line with a `ParentOrderLineID` — is not re-priced. Expansion writes it at
 * its share of the bundle price, which is below its own engine price whenever the bundle sells for
 * less than its parts, and nothing the rep can record or change would clear it. The bundle line
 * itself keeps the bundle's price and is checked like any other.
 *
 * Nor is a reversal — a line with a `ReversesOrderLineID` or a negative quantity. Its price is the
 * origin line's, which was settled when that line was sold, and pricing refuses a negative quantity.
 *
 *   3. on an order not yet confirmed, concessions that were approved on the requester's own
 *      authority when the order's concessions, as a share of its net total, now reach that
 *      authority's `MaxConcessionPctOfContract`. The share is measured when a concession is
 *      recorded; a draft that loses lines afterwards raises it, and the approval on authority no
 *      longer covers what the order now gives away. An approver's decision on another concession
 *      does not cover it: the share that approver saw belongs to the order as it was then. The
 *      concession is withdrawn and recorded again, which measures it against the order as it is now
 *      and routes it for approval.
 *
 *   4. on an order not yet confirmed, a line whose product always needs approval (golive #281) with no
 *      Approved Price or Scope concession decided through the ConcessionLimit rule recorded for it. Such
 *      products are priced per engagement: often nothing resolves an engine price for them, so (2) has
 *      nothing to compare against, and the requester's own authority never approves them. The flag is
 *      `RequiresSaleApproval`, inherited Product -> category -> ancestor categories -> Product Type. A
 *      renewal line is left alone, as for (2): the sale was approved when the subscription was sold.
 *
 * Confirmed orders are checked for (1) only. Their lines' prices were settled at booking, and lines
 * converted from the previous system carry overrides nobody recorded a concession for.
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-entities ConcessionBehavior (valuation, authority)
 *   CALLER: OrderEntityServer (confirm), OrderConcessionEntityServer (record), send-document action
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import {
    ConcessionShare,
    ResolveRequiresSaleApproval,
    ConcessionValue,
    Money,
    ResolveLinePriceStanding,
    ShareBreach,
    type ConcessionAuthority,
    type ConcessionValuation,
    type PricedLineFacts,
} from '@mj-biz-apps/orders-entities';
import { ORDER_CONCESSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { IsUUID, RequireUUID, RequireUUIDs } from './sql-guards.js';

const SALES_AUTHORITY_ENTITY = 'MJ_BizApps_Orders: Sales Authorities';
const SALES_RULE_ENTITY = 'MJ_BizApps_Orders: Sales Rules';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';

/** Pennies of tolerance when comparing an approved value with the value now on the line. */
const MONEY_TOLERANCE = 0.005;

/** A rep's concession limits, or null when they hold no active SalesAuthority. */
export async function LoadConcessionAuthority(
    userID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionAuthority | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ConcessionAuthority>(
        {
            EntityName: SALES_AUTHORITY_ENTITY,
            ExtraFilter: `SalesRepUserID = '${RequireUUID(userID, 'UserID')}' AND IsActive = 1`,
            Fields: ['ID', 'MaxDiscountPct', 'MaxConcessionValue', 'MaxTermExtensionDays', 'MaxConcessionPctOfContract'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res?.Results?.[0] ?? null;
}

/** The active ConcessionLimit rule — the role that decides a concession outside a rep's authority. */
export async function FindConcessionLimitRule(
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ ID: string; Name: string; ApprovalRequiredRoleID: string | null } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; Name: string; ApprovalRequiredRoleID: string | null }>(
        {
            EntityName: SALES_RULE_ENTITY,
            ExtraFilter: `RuleType = 'ConcessionLimit' AND IsActive = 1`,
            Fields: ['ID', 'Name', 'ApprovalRequiredRoleID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res?.Results?.[0] ?? null;
}

/** A line as the gate reads it. */
export interface ConcessionLineFacts extends LineConcessionFacts {
    ID: string | null;
    LineNumber: number | null;
    /** Set on a bundle component, whose price is its allocation rather than a concession. */
    ParentOrderLineID: string | null;
    /** Set on a reversal, whose price is the origin line's. */
    ReversesOrderLineID: string | null;
    /**
     * Whether `UnitPrice` holds a price rather than a blank the engine fills at confirm. A saved line
     * always does; an unsaved one does when `UnitPrice` is dirty or above zero — the same test
     * `OrderPricingService.applyResolvedPrice` uses, since 0 is a legitimate price for a free line.
     */
    PriceStated: boolean;
    /** The line after discounts, before tax and charges. The caller computes it for a line it holds. */
    LineTotalNet?: number | null;
}

/** The facts a line's concession is valued from. */
export interface LineConcessionFacts extends PricedLineFacts {
    /** A fraction (0.1 is 10%), as `OrderLine.DiscountPct` stores it. */
    DiscountPct?: number | null;
    /** Set on a line that renews a subscription, whose `DiscountPct` is the renewed line's. */
    RenewsSubscriptionID?: string | null;
    /** False for an unsaved line whose price the engine has yet to fill; it is charged the engine price. */
    PriceStated?: boolean;
}

/** What a line's price and discount give away, when they give anything away. */
export interface LinePriceConcession {
    Form: 'Price' | 'Scope';
    EngineUnitPrice: number;
    Valuation: ConcessionValuation;
    /** The part given away by a stated price below the engine's. */
    PriceValue: number;
    /** The part given away by `DiscountPct`. */
    DiscountValue: number;
    /** The `DiscountPct` counted, as a fraction; 0 when none is. */
    DiscountPct: number;
}

/**
 * The concession a line carries: a stated price below the engine's, plus what its `DiscountPct` takes
 * off the price it is charged. Null when neither gives anything away, or nothing resolves a price.
 * The engine's own price and a named list pick give nothing away by price, but a `DiscountPct` on
 * either still does. A line charged nothing is Scope — a product added at no charge — rather than Price.
 *
 * One figure for both, because one Approved Price concession covers the line: the rep records it once,
 * and the value an approver sees is everything the line gives away.
 */
export async function LinePriceConcessionFor(
    line: LineConcessionFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceConcession | null> {
    const standing = await ResolveLinePriceStanding(line, provider, user);
    if (!standing || standing.EngineUnitPrice == null) return null;
    const engine = standing.EngineUnitPrice;
    const quantity = Math.abs(Number(line.Quantity ?? 0));
    const charged = line.PriceStated === false ? engine : Number(line.UnitPrice ?? 0);

    const priceConcession = !standing.IsEnginePrice && !standing.IsNamedListPick && charged < engine;
    const form = priceConcession && charged <= 0 ? 'Scope' : 'Price';
    const priceValue = priceConcession
        ? ConcessionValue({ Form: form, ReferenceUnitPrice: engine, ChargedUnitPrice: charged, Quantity: quantity }).Value
        : 0;

    const discountPct = line.RenewsSubscriptionID ? 0 : Math.min(1, Math.max(0, Number(line.DiscountPct ?? 0)));
    const discountValue = Money(Math.max(0, charged) * quantity * discountPct);

    const value = Money(priceValue + discountValue);
    if (!(value > 0)) return null;
    // Measured against what the line would have cost before anything was given away: the engine
    // price when the stated price is the concession, the stated price when only the discount is.
    const base = (priceConcession ? engine : Math.max(0, charged)) * quantity;
    return {
        Form: form,
        EngineUnitPrice: engine,
        Valuation: { Value: value, Percent: base > 0 ? value / base : null },
        PriceValue: priceValue,
        DiscountValue: discountValue,
        DiscountPct: discountPct,
    };
}

/**
 * How the line gives value away — "priced at 60.00 against an engine price of 100.00", "discounted
 * 10%", or both — in the words the rep and the approver read it in.
 */
export function LineConcessionTerms(line: PricedLineFacts, concession: LinePriceConcession): string {
    const parts: string[] = [];
    if (concession.PriceValue > 0) {
        parts.push(
            `priced at ${Number(line.UnitPrice ?? 0).toFixed(2)} against an engine price of ` +
                `${concession.EngineUnitPrice.toFixed(2)}`,
        );
    }
    if (concession.DiscountValue > 0) {
        parts.push(`discounted ${formatPct(concession.DiscountPct)}`);
    }
    return parts.join(' and ');
}

function describeLineConcession(line: ConcessionLineFacts, concession: LinePriceConcession): string {
    return (
        `line ${line.LineNumber ?? '?'} is ${LineConcessionTerms(line, concession)}, a concession worth ` +
        concession.Valuation.Value.toFixed(2)
    );
}

function formatPct(fraction: number): string {
    return `${Math.round(fraction * 1e4) / 100}%`;
}

/**
 * Every reason the order may not yet reach the customer, written for the person who has to clear
 * it. Empty when nothing is outstanding.
 *
 * @param orderHeaderID  null for an order not yet saved — it can have no concession rows yet.
 * @param inMemoryLines  lines the caller holds, which win over their persisted copies.
 * @param includeLinePrices  check stated prices too (orders not yet confirmed).
 */
export async function FindUnapprovedConcessions(
    orderHeaderID: string | null,
    inMemoryLines: readonly ConcessionLineFacts[],
    includeLinePrices: boolean,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string[]> {
    const problems: string[] = [];
    const rows = orderHeaderID ? await loadConcessions(orderHeaderID, provider, user) : [];

    for (const row of rows.filter((r) => r.Status === 'Pending')) {
        problems.push(
            `a ${row.DeliveryForm.toLowerCase()} concession worth ${Number(row.ComputedValue).toFixed(2)} ` +
                `(${row.ReasonCategory.toLowerCase()}) is awaiting approval`,
        );
    }

    if (!includeLinePrices) return problems;

    if (orderHeaderID) {
        const shareProblem = await shareNoLongerCovered(orderHeaderID, rows, inMemoryLines, provider, user);
        if (shareProblem) problems.push(shareProblem);
    }

    const candidates = await candidateLines(orderHeaderID, inMemoryLines, provider, user);
    const reported = new Set<ConcessionLineFacts>();
    for (const standing of await assessLinePrices(candidates.filter(hasStatedPriceOrDiscount), rows, provider, user)) {
        const { Line: line, Concession: concession } = standing;
        // A concession is recorded against a saved line, so a line not yet saved cannot have one —
        // tell the rep how to get one rather than that none is recorded.
        if (!orderHeaderID || !line.ID) {
            reported.add(line);
            problems.push(
                `${describeLineConcession(line, concession)}. Save the order without confirming it first, then record ` +
                    `the ${concession.Form} concession against the line and confirm once it is approved`,
            );
            continue;
        }
        if (standing.Covered) continue;
        reported.add(line);
        problems.push(
            `${describeLineConcession(line, concession)} with no approved ${concession.Form} concession recorded for it`,
        );
    }

    problems.push(...(await saleApprovalProblems(orderHeaderID, candidates, rows, reported, provider, user)));
    return problems;
}

/**
 * Check (4) in the header: each line whose product always needs approval and that no Price or Scope
 * concession decided through the ConcessionLimit rule covers. A line already reported by (2) is not
 * reported twice; recording and approving its concession clears both.
 */
async function saleApprovalProblems(
    orderHeaderID: string | null,
    lines: readonly ConcessionLineFacts[],
    rows: readonly ConcessionRow[],
    reported: ReadonlySet<ConcessionLineFacts>,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string[]> {
    const eligible = lines.filter((l) => !l.RenewsSubscriptionID && !reported.has(l));
    if (eligible.length === 0) return [];
    const required = await ProductsRequiringSaleApproval(
        eligible.map((l) => String(l.ProductID)),
        provider,
        user,
    );
    const problems: string[] = [];
    for (const line of eligible) {
        if (!required.has(String(line.ProductID).toLowerCase())) continue;
        const label = `line ${line.LineNumber ?? '?'} is for a product that always needs approval`;
        if (!orderHeaderID || !line.ID) {
            problems.push(
                `${label}. Save the order without confirming it first, then record a Price concession against the ` +
                    `line and confirm once it is approved`,
            );
            continue;
        }
        const approved = rows.some(
            (r) =>
                r.Status === 'Approved' &&
                !!r.SalesRuleID &&
                sameID(r.OrderLineID, line.ID) &&
                (r.DeliveryForm === 'Price' || r.DeliveryForm === 'Scope'),
        );
        if (!approved) {
            problems.push(`${label}, and no Price or Scope concession approved by the ConcessionLimit approver is recorded for it`);
        }
    }
    return problems;
}

/**
 * The IDs, lowercased, of the given products that always need approval (golive #281): each product's own
 * `RequiresSaleApproval`, else its category's, else the nearest ancestor's, else its product type's.
 */
export async function ProductsRequiringSaleApproval(
    productIDs: readonly string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Set<string>> {
    // A product's ID is a UUID; anything else names no product, so it cannot require approval.
    const ids = [...new Set(productIDs.filter(IsUUID).map((id) => id.toLowerCase()))];
    if (ids.length === 0) return new Set();
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const read = async <T>(params: Parameters<RunView['RunView']>[0]): Promise<T[]> => {
        const res = await rv.RunView<T>({ ...params, ResultType: 'simple', BypassCache: true }, user);
        if (!res?.Success) throw new Error(`Reading ${params.EntityName} for sale approval failed: ${res?.ErrorMessage}`);
        return res.Results ?? [];
    };
    const products = await read<{
        ID: string;
        ProductTypeID: string | null;
        ProductCategoryID: string | null;
        RequiresSaleApproval: boolean | null;
    }>({
        EntityName: PRODUCT_ENTITY,
        ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`,
        Fields: ['ID', 'ProductTypeID', 'ProductCategoryID', 'RequiresSaleApproval'],
    });
    if (products.length === 0) return new Set();
    const categories = await read<{ ID: string; ParentProductCategoryID: string | null; RequiresSaleApproval: boolean | null }>({
        EntityName: PRODUCT_CATEGORY_ENTITY,
        Fields: ['ID', 'ParentProductCategoryID', 'RequiresSaleApproval'],
    });
    const types = await read<{ ID: string; RequiresSaleApproval: boolean | null }>({
        EntityName: PRODUCT_TYPE_ENTITY,
        Fields: ['ID', 'RequiresSaleApproval'],
    });
    const category = new Map(categories.map((c) => [c.ID.toLowerCase(), c]));
    const type = new Map(types.map((t) => [t.ID.toLowerCase(), t]));
    const required = new Set<string>();
    for (const p of products) {
        const chain: (boolean | null)[] = [];
        const seen = new Set<string>();
        let current = p.ProductCategoryID?.toLowerCase() ?? null;
        while (current && !seen.has(current)) {
            seen.add(current);
            const c = category.get(current);
            if (!c) break;
            chain.push(c.RequiresSaleApproval);
            current = c.ParentProductCategoryID?.toLowerCase() ?? null;
        }
        const facts = {
            Product: p.RequiresSaleApproval,
            Categories: chain,
            Type: p.ProductTypeID ? type.get(p.ProductTypeID.toLowerCase())?.RequiresSaleApproval : null,
        };
        if (ResolveRequiresSaleApproval(facts)) required.add(p.ID.toLowerCase());
    }
    return required;
}

/**
 * The order's net total: its lines after discounts, before tax and charges. Reversal lines are left
 * out, since they give back what another order sold. A bundle's rollup parent stores zero and its
 * components carry the money, so neither is counted twice.
 *
 * @param inMemoryLines  lines the caller holds, which win over their persisted copies.
 */
export async function OrderNetTotal(
    orderHeaderID: string,
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<number> {
    const held = new Set(inMemoryLines.map((l) => (l.ID ?? '').toLowerCase()).filter(Boolean));
    let total = 0;
    for (const line of inMemoryLines) {
        if (!isReversal(line)) total += Number(line.LineTotalNet ?? 0);
    }
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; ReversesOrderLineID: string | null; Quantity: number; LineTotalNet: number | null }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            Fields: ['ID', 'ReversesOrderLineID', 'Quantity', 'LineTotalNet'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    for (const row of res?.Results ?? []) {
        if (held.has(row.ID.toLowerCase()) || isReversal(row)) continue;
        total += Number(row.LineTotalNet ?? 0);
    }
    return Math.round(total * 100) / 100;
}

/** What every concession on the order that is not Rejected comes to, in currency. */
export async function OrderConcessionTotal(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<number> {
    return concessionTotal(await loadConcessions(orderHeaderID, provider, user));
}

/**
 * Check (3) in the header: the reason, if any, that approvals on the requesters' own authority no
 * longer cover the order's concessions as a share of its net total.
 */
async function shareNoLongerCovered(
    orderHeaderID: string,
    rows: readonly ConcessionRow[],
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    const onAuthority = rows.filter((r) => r.Status === 'Approved' && !r.SalesRuleID && !!r.AuthorizedBySalesAuthorityID);
    if (onAuthority.length === 0) return null;

    const net = await OrderNetTotal(orderHeaderID, inMemoryLines, provider, user);
    const share = ConcessionShare(concessionTotal(rows), net);

    const limits = await loadShareLimits(
        [...new Set(onAuthority.map((r) => String(r.AuthorizedBySalesAuthorityID).toLowerCase()))],
        provider,
        user,
    );
    const breach = limits.map((limit) => ShareBreach(share, limit)).find((b) => b !== null);
    if (!breach) return null;

    return (
        `${breach} (${concessionTotal(rows).toFixed(2)} on a net total of ${net.toFixed(2)}), and ` +
        `${onAuthority.length} concession(s) on it were approved on the requester's own authority when the order ` +
        `was measured differently. Withdraw them and record them again, so they are measured against the order ` +
        `as it is now and routed for approval`
    );
}

async function loadShareLimits(authorityIDs: string[], provider: IMetadataProvider, user: UserInfo): Promise<(number | null)[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ MaxConcessionPctOfContract: number | null }>(
        {
            EntityName: SALES_AUTHORITY_ENTITY,
            ExtraFilter: `ID IN (${RequireUUIDs(authorityIDs, 'SalesAuthorityID').map((id) => `'${id}'`).join(',')})`,
            Fields: ['MaxConcessionPctOfContract'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return (res?.Results ?? []).map((r) => (r.MaxConcessionPctOfContract == null ? null : Number(r.MaxConcessionPctOfContract)));
}

function concessionTotal(rows: readonly ConcessionRow[]): number {
    return rows.filter((r) => r.Status !== 'Rejected').reduce((sum, r) => sum + Number(r.ComputedValue ?? 0), 0);
}

/** A line that gives away more, by price or `DiscountPct`, than any approved concession covers. */
export interface UncoveredLinePrice {
    Line: ConcessionLineFacts;
    Concession: LinePriceConcession;
    /** The largest Approved Price or Scope concession recorded against the line; 0 when there is none. */
    ApprovedValue: number;
    /** What the line gives away beyond `ApprovedValue`. Always above zero. */
    Shortfall: number;
}

/**
 * The confirm gate's line-price check in report-only mode: every saved line of this order whose
 * price or `DiscountPct` gives away value with no Approved concession covering it, with the value
 * left uncovered. Refuses nothing.
 *
 * Asked at booking, after the gate, for the bookings the gate lets through (golive #279). It is
 * the gate's own evaluation, so the two cannot disagree about which lines are concessions: bundle
 * components, reversals, the engine's own price and a named list pick are excluded here exactly as
 * there. A Pending concession covers nothing, as it does not at the gate.
 *
 * @param inMemoryLines  lines the caller holds, which win over their persisted copies.
 */
export async function FindUncoveredLinePrices(
    orderHeaderID: string,
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<UncoveredLinePrice[]> {
    const rows = await loadConcessions(orderHeaderID, provider, user);
    const uncovered: UncoveredLinePrice[] = [];
    const lines = (await candidateLines(orderHeaderID, inMemoryLines, provider, user)).filter(hasStatedPriceOrDiscount);
    for (const standing of await assessLinePrices(lines, rows, provider, user)) {
        if (standing.Covered || !standing.Line.ID) continue;
        const shortfall = Money(standing.Concession.Valuation.Value - standing.ApprovedValue);
        if (!(shortfall > 0)) continue;
        uncovered.push({
            Line: standing.Line,
            Concession: standing.Concession,
            ApprovedValue: standing.ApprovedValue,
            Shortfall: shortfall,
        });
    }
    return uncovered;
}

/** One line that carries a concession, and how far the approved rows cover it. */
interface LinePriceStandingOnOrder {
    Line: ConcessionLineFacts;
    Concession: LinePriceConcession;
    ApprovedValue: number;
    /** An Approved Price or Scope concession on the line is worth at least the line's concession. */
    Covered: boolean;
}

/** Every line whose price or discount is a concession, judged against the order's concession rows. */
async function assessLinePrices(
    lines: readonly ConcessionLineFacts[],
    rows: readonly ConcessionRow[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceStandingOnOrder[]> {
    const standings: LinePriceStandingOnOrder[] = [];
    for (const line of lines) {
        const concession = await LinePriceConcessionFor(line, provider, user);
        if (!concession) continue;
        const approvedValue = rows
            .filter(
                (r) =>
                    r.Status === 'Approved' &&
                    sameID(r.OrderLineID, line.ID) &&
                    (r.DeliveryForm === 'Price' || r.DeliveryForm === 'Scope'),
            )
            .reduce((max, r) => Math.max(max, Number(r.ComputedValue)), 0);
        standings.push({
            Line: line,
            Concession: concession,
            ApprovedValue: approvedValue,
            Covered: approvedValue + MONEY_TOLERANCE >= concession.Valuation.Value,
        });
    }
    return standings;
}

interface ConcessionRow {
    Status: string;
    DeliveryForm: string;
    ReasonCategory: string;
    ComputedValue: number;
    OrderLineID: string | null;
    AuthorizedBySalesAuthorityID: string | null;
    SalesRuleID: string | null;
}

async function loadConcessions(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionRow[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ConcessionRow>(
        {
            EntityName: ORDER_CONCESSION_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            Fields: [
                'Status',
                'DeliveryForm',
                'ReasonCategory',
                'ComputedValue',
                'OrderLineID',
                'AuthorizedBySalesAuthorityID',
                'SalesRuleID',
            ],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res?.Results ?? [];
}

/** A line whose price or discount could be a concession: one with a stated price or a `DiscountPct`. */
function hasStatedPriceOrDiscount(line: ConcessionLineFacts): boolean {
    return !!line.PriceStated || Number(line.DiscountPct ?? 0) > 0;
}

/**
 * The order's lines the gate judges: the caller's, plus persisted ones the caller does not hold. Bundle
 * components, reversals and lines with no product are left out. A persisted line has a stated price.
 */
async function candidateLines(
    orderHeaderID: string | null,
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionLineFacts[]> {
    const lines = inMemoryLines.filter((l) => !!l.ProductID && !isComponentOrReversal(l));
    if (!orderHeaderID) return lines;

    const held = new Set(inMemoryLines.map((l) => (l.ID ?? '').toLowerCase()).filter(Boolean));
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ConcessionLineFacts>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            Fields: [
                'ID',
                'LineNumber',
                'ParentOrderLineID',
                'ReversesOrderLineID',
                'ProductID',
                'OrderHeaderID',
                'Quantity',
                'UnitPrice',
                'ProductPriceID',
                'DiscountPct',
                'RenewsSubscriptionID',
            ],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    for (const row of res?.Results ?? []) {
        const key = (row.ID ?? '').toLowerCase();
        if (held.has(key) || !row.ProductID || isComponentOrReversal(row)) continue;
        lines.push({ ...row, PriceStated: true });
    }
    return lines;
}

function isComponentOrReversal(line: ConcessionLineFacts): boolean {
    return !!line.ParentOrderLineID || isReversal(line);
}

function isReversal(line: { ReversesOrderLineID: string | null; Quantity: number | null }): boolean {
    return !!line.ReversesOrderLineID || Number(line.Quantity ?? 0) < 0;
}

function sameID(a: string | null | undefined, b: string | null | undefined): boolean {
    return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
