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
 * manual discount (`DiscountAmount`) is gated where it is applied, by `AuthorizeManualDiscount`, and
 * leaves its own adjustment row. One within the rep's authority, or granted by a DiscountLimit
 * approver, is not counted here; one above the rep's authority is saved HELD, with neither an
 * authority nor an approver on its row, and is counted until an approved concession covers it
 * (golive #328). Nor is the `DiscountPct` on a line that renews a subscription, which carries the
 * renewed line's discount forward; that discount was settled when the subscription was sold.
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
 *      authority when the order's concessions, as a share of its catalog total, now reach that
 *      authority's `MaxConcessionPctOfContract`. The share is measured when a concession is
 *      recorded; a draft that loses lines afterwards raises it, and the approval on authority no
 *      longer covers what the order now gives away. An approver's decision on another concession
 *      does not cover it: the share that approver saw belongs to the order as it was then. The
 *      concession is withdrawn and recorded again, which measures it against the order as it is now
 *      and routes it for approval. The limit is the one the order now earns: a mix tier (golive #281)
 *      raises it by the order's distinct product types, so removing a product type can lower it.
 *
 *   4. on an order not yet confirmed, a line whose product always needs approval (golive #281) with no
 *      Approved Price or Scope concession decided through the ConcessionLimit rule recorded for it. Such
 *      products are priced per engagement: often nothing resolves an engine price for them, so (2) has
 *      nothing to compare against, and the requester's own authority never approves them. The flag is
 *      `RequiresSaleApproval`, inherited Product -> category -> ancestor categories -> Product Type. A
 *      renewal line is left alone, as for (2): the sale was approved when the subscription was sold.
 *
 * The order is judged as a whole on price (golive #499). A contract is often split across lines: an
 * upgrade written as the existing plan at what the customer already pays plus an upsell line for the
 * increase prices one line below its engine price and another above it, while the order gives nothing
 * away. So when the lines priced above a positive engine price make up at least as much as the
 * uncovered lines priced below theirs take off, the below-engine price is not a concession. A product
 * sold at a negotiated price lists at 0, so its whole price is the sale and makes up for nothing. Only the price is
 * netted: a `DiscountPct` or a held manual discount on the line is still counted, a line given away
 * (Scope) is never netted, nor is a line an approver refused a concession for, and a shortfall is
 * reported line by line as before. The readiness check says which lines made up for which.
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
    EffectiveShareLimit,
    ResolveRequiresSaleApproval,
    ConcessionValue,
    Money,
    OrdersEngine,
    OrdersEngineReady,
    PickConcessionTier,
    ResolveLinePriceStanding,
    ShareBreach,
    type ConcessionAuthority,
    type ConcessionTierChoice,
    type ConcessionTierMeasure,
    type ConcessionTierRule,
    type ConcessionValuation,
    type PricedLineFacts,
    type ShareLimitMixTier,
} from '@mj-biz-apps/orders-entities';
import { ORDER_CONCESSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { IsUUID, RequireUUID, RequireUUIDs } from './sql-guards.js';

const SALES_AUTHORITY_ENTITY = 'MJ_BizApps_Orders: Sales Authorities';
const SALES_AUTHORITY_MIX_TIER_ENTITY = 'MJ_BizApps_Orders: Sales Authority Mix Tiers';
const SALES_RULE_ENTITY = 'MJ_BizApps_Orders: Sales Rules';
const ORDER_ADJUSTMENT_ENTITY = 'MJ_BizApps_Orders: Order Adjustments';
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

/**
 * The active ConcessionLimit rules, each an approval tier (#308). A single rule with no tier or
 * thresholds is what every installation had before tiers, and it still takes every concession.
 */
export async function LoadConcessionTiers(provider: IMetadataProvider, user: UserInfo): Promise<ConcessionTierRule[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ConcessionTierRule>(
        {
            EntityName: SALES_RULE_ENTITY,
            ExtraFilter: `RuleType = 'ConcessionLimit' AND IsActive = 1`,
            Fields: [
                'ID',
                'Name',
                'ApprovalRequiredRoleID',
                'ConcessionTier',
                'MinConcessionValue',
                'MinConcessionPctOfContract',
                'MinTermExtensionDays',
                'RequiresDecisionWithinAuthority',
            ],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) throw new Error(`Could not read the ConcessionLimit rules: ${res?.ErrorMessage}`);
    return res.Results.map((r) => ({ ...r, RequiresDecisionWithinAuthority: !!r.RequiresDecisionWithinAuthority }));
}

/** The tier that decides a concession: the highest-ranked active ConcessionLimit rule whose thresholds it meets. */
export async function FindConcessionTier(
    measure: ConcessionTierMeasure,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionTierChoice> {
    return PickConcessionTier(await LoadConcessionTiers(provider, user), measure);
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
    /**
     * Manual discounts on the line held for approval: above the rep's authority, with no approver
     * (golive #328). See {@link HeldManualDiscounts}.
     */
    HeldDiscount?: number | null;
}

/** What a line's price and discount give away, when they give anything away. */
export interface LinePriceConcession {
    Form: 'Price' | 'Scope';
    /** Null when nothing resolves an engine price; only the `DiscountPct` is then counted (#905). */
    EngineUnitPrice: number | null;
    Valuation: ConcessionValuation;
    /** The part given away by a stated price below the engine's. */
    PriceValue: number;
    /** The part given away by `DiscountPct`. */
    DiscountValue: number;
    /** The `DiscountPct` counted, as a fraction; 0 when none is. */
    DiscountPct: number;
    /** The part given away by manual discounts held for approval. */
    HeldDiscount: number;
}

/**
 * The concession a line carries: a stated price below the engine's, plus what its `DiscountPct` and its
 * held manual discounts take off the price it is charged. Null when none of them gives anything away.
 * The engine's own price and a named list pick give nothing away by price, but a discount on either
 * still does. With no engine price, its `DiscountPct` and held manual discounts are counted against the
 * stated price (#905).
 *
 * A line charged nothing once its concession is taken off is Scope — a product given away — rather than
 * Price: a typed price of zero, or a price kept with a 100% discount (golive #328). Its value is then
 * the whole of what the line would have cost, list price times quantity.
 *
 * One figure for all of it, because one Approved Price or Scope concession covers the line: the rep
 * records it once, and the value an approver sees is everything the line gives away.
 */
export async function LinePriceConcessionFor(
    line: LineConcessionFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceConcession | null> {
    return (await linePriceFigures(line, provider, user)).Concession;
}

/** A line's concession, if it carries one, and what it charges above its engine price. */
interface LinePriceFigures {
    Concession: LinePriceConcession | null;
    /**
     * What the line charges above its engine price once its own `DiscountPct` and held manual discounts
     * are taken off; 0 when it charges no more, or when its engine price is missing or 0.
     */
    Premium: number;
}

async function linePriceFigures(line: LineConcessionFacts, provider: IMetadataProvider, user: UserInfo): Promise<LinePriceFigures> {
    const held = Money(Math.max(0, Number(line.HeldDiscount ?? 0)));
    const { engine, quantity, charged, priceConcession, base, configuredPrice } = await linePricing(line, provider, user);
    const priceValue = priceConcession
        ? ConcessionValue({ Form: 'Price', ReferenceUnitPrice: engine, ChargedUnitPrice: charged, Quantity: quantity }).Value
        : 0;

    // With no engine price the discount is counted against the stated price (#905); a line with no
    // stated price either has nothing a discount can be valued against.
    const discountPct =
        line.RenewsSubscriptionID || (engine == null && line.PriceStated === false)
            ? 0
            : Math.min(1, Math.max(0, Number(line.DiscountPct ?? 0)));
    const discountValue = Money(Math.max(0, charged) * quantity * discountPct);

    // What the line charges above its engine price, after its own discounts. A named list pick is a
    // configured price, not a premium; a line the engine has yet to price charges the engine price. A
    // product sold at a negotiated price sits in the catalog at 0 on purpose: its price is the sale, not
    // a premium above anything, so only a line with a positive engine price can make up for another.
    const premium =
        engine != null && engine > 0 && !configuredPrice && line.PriceStated !== false
            ? Money(Math.max(0, charged * quantity * (1 - discountPct) - held - engine * quantity))
            : 0;

    const value = Money(priceValue + discountValue + held);
    if (!(value > 0)) return { Concession: null, Premium: premium };
    const chargedNothing = (priceConcession && charged <= 0) || (base > 0 && value + MONEY_TOLERANCE >= base);
    return {
        Concession: {
            Form: chargedNothing ? 'Scope' : 'Price',
            EngineUnitPrice: engine,
            Valuation: { Value: value, Percent: base > 0 ? value / base : null },
            PriceValue: priceValue,
            DiscountValue: discountValue,
            DiscountPct: discountPct,
            HeldDiscount: held,
        },
        Premium: premium,
    };
}

/** A line's price as concessions are measured against it. */
interface LinePricing {
    /** Null when nothing resolves an engine price for the line. */
    engine: number | null;
    quantity: number;
    /** The unit price the line is charged before its discount. */
    charged: number;
    /** True when the charged price is below the engine's and the engine's is the one the line should carry. */
    priceConcession: boolean;
    /**
     * What the line would have cost before anything was given away: the engine price when the
     * stated price is the concession, the stated price otherwise. Both before any discount.
     */
    base: number;
    /** The engine's own price or a named list pick: a configured price, neither a concession nor a premium. */
    configuredPrice: boolean;
}

async function linePricing(line: LineConcessionFacts, provider: IMetadataProvider, user: UserInfo): Promise<LinePricing> {
    const standing = await ResolveLinePriceStanding(line, provider, user);
    const engine = standing?.EngineUnitPrice ?? null;
    const quantity = Math.abs(Number(line.Quantity ?? 0));
    const charged = line.PriceStated === false && engine != null ? engine : Number(line.UnitPrice ?? 0);
    const priceConcession = engine != null && !standing!.IsEnginePrice && !standing!.IsNamedListPick && charged < engine;
    const base = (priceConcession ? engine! : Math.max(0, charged)) * quantity;
    return { engine, quantity, charged, priceConcession, base, configuredPrice: !!standing?.IsEnginePrice || !!standing?.IsNamedListPick };
}

/**
 * The order at the catalog prices chosen for it, before any concession: each line's quantity times its
 * engine price where the stated price is below it, else times its stated price, with no discount taken
 * off. A line with no engine price is counted at its stated price (#905), and so is a line the order
 * nets (golive #499), since its price is then not a concession. The order's concessions are
 * measured as a share of this (golive #494): a 10% discount on every line is 10% of the order, the
 * same base the per-line `MaxDiscountPct` uses. Measuring against the total after discounts counted
 * that discount twice, once by raising what was given away and again by lowering the total.
 *
 * Left out, as in {@link OrderNetTotal}: reversal lines, and a bundle's components, since the bundle
 * line carries the bundle's price and is valued like any other line.
 *
 * @param inMemoryLines  lines the caller holds, which win over their persisted copies.
 */
export async function OrderCatalogTotal(
    orderHeaderID: string,
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<number> {
    const held = new Set(inMemoryLines.map((l) => (l.ID ?? '').toLowerCase()).filter(Boolean));
    const lines: ConcessionLineFacts[] = inMemoryLines.filter((l) => !isComponentOrReversal(l));
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
            ],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (res && !res.Success) throw new Error(`Could not read the order's lines to measure its concessions: ${res.ErrorMessage}`);
    for (const row of res?.Results ?? []) {
        if (held.has((row.ID ?? '').toLowerCase()) || isComponentOrReversal(row)) continue;
        lines.push({ ...row, PriceStated: true });
    }
    let total = 0;
    for (const line of lines) {
        total += line.ProductID
            ? (await linePricing(line, provider, user)).base
            : Math.max(0, Number(line.UnitPrice ?? 0)) * Math.abs(Number(line.Quantity ?? 0));
    }
    // A line the order nets (golive #499) gives nothing away by price, so it counts at its stated price:
    // counting it at its engine price would put the netted amount in the total but not in what is given away.
    const offset = await orderPriceOffset(orderHeaderID, inMemoryLines, provider, user);
    const netted = offset ? offset.Offset.reduce((t, o) => t + o.PriceValue, 0) : 0;
    return Money(total - netted);
}

/** The order's netting (golive #499), as the gate judges it now; null when nothing is netted. */
async function orderPriceOffset(
    orderHeaderID: string,
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<PriceOffset | null> {
    const rows = await loadConcessions(orderHeaderID, provider, user);
    const lines = (await candidateLines(orderHeaderID, inMemoryLines, provider, user)).filter(hasStatedPriceOrDiscount);
    return (await assessLinePrices(lines, rows, provider, user)).Offset;
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
                `${(concession.EngineUnitPrice ?? 0).toFixed(2)}`,
        );
    }
    if (concession.DiscountValue > 0) {
        parts.push(`discounted ${formatPct(concession.DiscountPct)}`);
    }
    if (concession.HeldDiscount > 0) {
        parts.push(`given a manual discount of ${concession.HeldDiscount.toFixed(2)} that needs approval`);
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
    return (await AssessConcessionGate(orderHeaderID, inMemoryLines, includeLinePrices, provider, user)).Problems;
}

/** What the gate refuses an order for, and what it let through that the rep should know about. */
export interface ConcessionGateReport {
    /** One clause per refusal, as {@link FindUnapprovedConcessions} words them. */
    Problems: string[];
    /** One clause per thing the gate let through on the order as a whole: lines priced above their engine price making up for lines below theirs (golive #499). */
    Notes: string[];
}

/** {@link FindUnapprovedConcessions}, with the notes alongside the problems. Same parameters. */
export async function AssessConcessionGate(
    orderHeaderID: string | null,
    inMemoryLines: readonly ConcessionLineFacts[],
    includeLinePrices: boolean,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionGateReport> {
    const problems: string[] = [];
    const notes: string[] = [];
    const rows = orderHeaderID ? await loadConcessions(orderHeaderID, provider, user) : [];

    for (const row of rows.filter((r) => r.Status === 'Pending')) {
        problems.push(
            `a ${row.DeliveryForm.toLowerCase()} concession worth ${Number(row.ComputedValue).toFixed(2)} ` +
                `(${row.ReasonCategory.toLowerCase()}) is awaiting approval`,
        );
    }

    if (!includeLinePrices) return { Problems: problems, Notes: notes };

    if (orderHeaderID) {
        const shareProblem = await shareNoLongerCovered(orderHeaderID, rows, inMemoryLines, provider, user);
        if (shareProblem) problems.push(shareProblem);
    }

    const candidates = await candidateLines(orderHeaderID, inMemoryLines, provider, user);
    const reported = new Set<ConcessionLineFacts>();
    const assessment = await assessLinePrices(candidates.filter(hasStatedPriceOrDiscount), rows, provider, user);
    if (assessment.Offset) notes.push(DescribePriceOffset(assessment.Offset, rows));
    for (const standing of assessment.Standings) {
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
    return { Problems: problems, Notes: notes };
}

/**
 * The note for an order whose lines priced above their engine price make up for the ones priced below
 * theirs, e.g. "line 2 is priced 2012.00 below its engine price, made up for by line 1, priced 5012.00
 * above its own, so the order as a whole gives nothing away by price".
 */
export function DescribePriceOffset(offset: PriceOffset, rows: readonly ConcessionRow[] = []): string {
    const below = Money(offset.Offset.reduce((t, o) => t + o.PriceValue, 0));
    const above = Money(offset.Premiums.reduce((t, p) => t + p.Premium, 0));
    const belowLines = offset.Offset.map((o) => o.Line);
    const aboveLines = offset.Premiums.map((p) => p.Line);
    const one = belowLines.length === 1;
    return (
        `${lineList(belowLines)} ${one ? 'is' : 'are'} priced ${below.toFixed(2)} below ${one ? 'its engine price' : 'their engine prices'}, ` +
        `made up for by ${lineList(aboveLines)}, priced ${above.toFixed(2)} above ${aboveLines.length === 1 ? 'its own' : 'their own'}, ` +
        `so the order as a whole gives nothing away by price` +
        pendingOnNettedLines(belowLines, rows)
    );
}

/**
 * A Pending Price concession on a netted line still holds confirm through check (1), though the line no
 * longer needs it: tell the rep to withdraw it.
 */
function pendingOnNettedLines(lines: readonly ConcessionLineFacts[], rows: readonly ConcessionRow[]): string {
    const pending = lines.filter((l) => rows.some((r) => r.Status === 'Pending' && r.DeliveryForm === 'Price' && sameID(r.OrderLineID, l.ID)));
    if (pending.length === 0) return '';
    return `; the Price concession awaiting approval on ${lineList(pending)} is no longer needed, so withdraw it to confirm`;
}

/** "line 2", "lines 1 and 3", "lines 1, 2 and 4". */
function lineList(lines: readonly ConcessionLineFacts[]): string {
    const numbers = lines.map((l) => String(l.LineNumber ?? '?'));
    if (numbers.length === 1) return `line ${numbers[0]}`;
    return `lines ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
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
    let categories: { ID: string; ParentProductCategoryID: string | null; RequiresSaleApproval: boolean | null }[];
    let types: { ID: string; RequiresSaleApproval: boolean | null }[];
    const engineReady = OrdersEngine.Instance.Loaded || (await OrdersEngineReady(provider, user));
    if (engineReady) {
        const hasMissing = products.some(
            (p) =>
                (p.ProductCategoryID && !OrdersEngine.Instance.ProductCategoryByID(p.ProductCategoryID)) ||
                (p.ProductTypeID && !OrdersEngine.Instance.ProductTypeByID(p.ProductTypeID)),
        );
        if (hasMissing && typeof (provider as { RunViews?: unknown })?.RunViews === 'function') {
            await OrdersEngine.Instance.Config(true, user, provider);
        }
        categories = OrdersEngine.Instance.ProductCategories.map((c) => ({
            ID: c.ID,
            ParentProductCategoryID: c.ParentProductCategoryID ?? null,
            RequiresSaleApproval: c.RequiresSaleApproval ?? null,
        }));
        types = OrdersEngine.Instance.ProductTypes.map((t) => ({
            ID: t.ID,
            RequiresSaleApproval: t.RequiresSaleApproval ?? null,
        }));
    } else {
        categories = await read<{ ID: string; ParentProductCategoryID: string | null; RequiresSaleApproval: boolean | null }>({
            EntityName: PRODUCT_CATEGORY_ENTITY,
            Fields: ['ID', 'ParentProductCategoryID', 'RequiresSaleApproval'],
        });
        types = await read<{ ID: string; RequiresSaleApproval: boolean | null }>({
            EntityName: PRODUCT_TYPE_ENTITY,
            Fields: ['ID', 'RequiresSaleApproval'],
        });
    }
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

/** What every concession on the order still standing (Pending or Approved) comes to, in currency. */
export async function OrderConcessionTotal(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<number> {
    return concessionTotal(await loadConcessions(orderHeaderID, provider, user));
}

/**
 * Check (3) in the header: the reason, if any, that approvals on the requesters' own authority no
 * longer cover the order's concessions as a share of its catalog total ({@link OrderCatalogTotal}).
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

    const catalog = await OrderCatalogTotal(orderHeaderID, inMemoryLines, provider, user);
    const share = ConcessionShare(concessionTotal(rows), catalog);

    const limits = await loadShareLimits(
        [...new Set(onAuthority.map((r) => String(r.AuthorizedBySalesAuthorityID).toLowerCase()))],
        orderHeaderID,
        inMemoryLines,
        provider,
        user,
    );
    const breach = limits.map((limit) => ShareBreach(share, limit)).find((b) => b !== null);
    if (!breach) return null;

    return (
        `${breach} (${concessionTotal(rows).toFixed(2)} on a catalog total of ${catalog.toFixed(2)}), and ` +
        `${onAuthority.length} concession(s) on it were approved on the requester's own authority when the order ` +
        `was measured differently. Withdraw them and record them again, so they are measured against the order ` +
        `as it is now and routed for approval`
    );
}

/** Each authority's share limit on this order as it is now, mix tiers applied. */
async function loadShareLimits(
    authorityIDs: string[],
    orderHeaderID: string,
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<(number | null)[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; MaxConcessionPctOfContract: number | null }>(
        {
            EntityName: SALES_AUTHORITY_ENTITY,
            ExtraFilter: `ID IN (${RequireUUIDs(authorityIDs, 'SalesAuthorityID').map((id) => `'${id}'`).join(',')})`,
            Fields: ['ID', 'MaxConcessionPctOfContract'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const authorities = res?.Results ?? [];
    const tiers = await LoadShareLimitMixTiers(
        authorities.filter((a) => a.MaxConcessionPctOfContract != null).map((a) => a.ID),
        provider,
        user,
    );
    const count = tiers.size > 0 ? await OrderProductTypeCount(orderHeaderID, inMemoryLines, provider, user) : 0;
    return authorities.map((a) =>
        EffectiveShareLimit(
            a.MaxConcessionPctOfContract == null ? null : Number(a.MaxConcessionPctOfContract),
            tiers.get(a.ID.toLowerCase()) ?? [],
            count,
        ),
    );
}

/**
 * The mix tiers of the given authorities (golive #281), keyed by lower-cased SalesAuthorityID. An
 * authority with none is absent from the map.
 */
export async function LoadShareLimitMixTiers(
    authorityIDs: readonly string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Map<string, ShareLimitMixTier[]>> {
    const byAuthority = new Map<string, ShareLimitMixTier[]>();
    if (authorityIDs.length === 0) return byAuthority;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ SalesAuthorityID: string; MinProductTypes: number; MaxConcessionPctOfContract: number }>(
        {
            EntityName: SALES_AUTHORITY_MIX_TIER_ENTITY,
            ExtraFilter: `SalesAuthorityID IN (${RequireUUIDs([...authorityIDs], 'SalesAuthorityID').map((id) => `'${id}'`).join(',')})`,
            Fields: ['SalesAuthorityID', 'MinProductTypes', 'MaxConcessionPctOfContract'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) throw new Error(`Could not read the Sales Authority mix tiers: ${res?.ErrorMessage}`);
    for (const row of res.Results) {
        const key = row.SalesAuthorityID.toLowerCase();
        const tiers = byAuthority.get(key) ?? [];
        tiers.push({ MinProductTypes: Number(row.MinProductTypes), MaxConcessionPctOfContract: Number(row.MaxConcessionPctOfContract) });
        byAuthority.set(key, tiers);
    }
    return byAuthority;
}

/**
 * How many distinct product types (product families, golive #281) the order's lines span. Bundle
 * components and reversals are left out, as the gate leaves them out: a component is part of the
 * bundle line's product, and a reversal gives back what another order sold. A renewal line counts.
 *
 * @param inMemoryLines  lines the caller holds, which win over their persisted copies.
 */
export async function OrderProductTypeCount(
    orderHeaderID: string,
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<number> {
    const productIDs = new Set<string>();
    const held = new Set(inMemoryLines.map((l) => (l.ID ?? '').toLowerCase()).filter(Boolean));
    for (const line of inMemoryLines) {
        if (line.ProductID && !isComponentOrReversal(line)) productIDs.add(line.ProductID.toLowerCase());
    }
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const lines = await rv.RunView<{ ID: string; ProductID: string | null; ParentOrderLineID: string | null; ReversesOrderLineID: string | null; Quantity: number | null }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            Fields: ['ID', 'ProductID', 'ParentOrderLineID', 'ReversesOrderLineID', 'Quantity'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!lines?.Success) throw new Error(`Could not read the order's lines: ${lines?.ErrorMessage}`);
    for (const row of lines.Results) {
        if (held.has(row.ID.toLowerCase()) || !row.ProductID || !!row.ParentOrderLineID || isReversal(row)) continue;
        productIDs.add(row.ProductID.toLowerCase());
    }
    if (productIDs.size === 0) return 0;

    const products = await rv.RunView<{ ProductTypeID: string }>(
        {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID IN (${RequireUUIDs([...productIDs], 'ProductID').map((id) => `'${id}'`).join(',')})`,
            Fields: ['ProductTypeID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!products?.Success) throw new Error(`Could not read the order's products: ${products?.ErrorMessage}`);
    return new Set(products.Results.map((p) => p.ProductTypeID.toLowerCase())).size;
}

/**
 * The rep's authority with its share limit for this order: `MaxConcessionPctOfContract` raised by the
 * highest mix tier the order's product-type count meets (golive #281). Unchanged when the authority
 * has no share limit or no tiers.
 */
export async function ApplyShareLimitMixTiers(
    authority: ConcessionAuthority | null,
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionAuthority | null> {
    if (!authority || authority.MaxConcessionPctOfContract == null) return authority;
    const tiers = (await LoadShareLimitMixTiers([authority.ID], provider, user)).get(authority.ID.toLowerCase()) ?? [];
    if (tiers.length === 0) return authority;
    const count = await OrderProductTypeCount(orderHeaderID, [], provider, user);
    return { ...authority, MaxConcessionPctOfContract: EffectiveShareLimit(authority.MaxConcessionPctOfContract, tiers, count) };
}

function concessionTotal(rows: readonly ConcessionRow[]): number {
    // Rejected and Withdrawn concessions give nothing away (golive #403).
    const active = rows.filter((r) => r.Status === 'Pending' || r.Status === 'Approved');
    // A line's price concessions are alternatives for the same give-away, not additions to it: a
    // resent save can leave two rows on one line, so each line counts once, at its largest (#387).
    const linePriceMax = new Map<string, number>();
    let otherTotal = 0;
    for (const r of active) {
        const val = Number(r.ComputedValue ?? 0);
        if (r.OrderLineID && (r.DeliveryForm === 'Price' || r.DeliveryForm === 'Scope')) {
            const key = r.OrderLineID.toLowerCase();
            linePriceMax.set(key, Math.max(linePriceMax.get(key) ?? 0, val));
        } else {
            otherTotal += val;
        }
    }
    let lineTotal = 0;
    for (const val of linePriceMax.values()) lineTotal += val;
    return otherTotal + lineTotal;
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
    for (const standing of (await assessLinePrices(lines, rows, provider, user)).Standings) {
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

/** Lines priced below their engine price that lines priced above theirs make up for (golive #499). */
export interface PriceOffset {
    /** Each line whose below-engine price is made up for, and what that price took off. */
    Offset: { Line: ConcessionLineFacts; PriceValue: number }[];
    /** Each line priced above its engine price, and by how much after its own discounts. */
    Premiums: { Line: ConcessionLineFacts; Premium: number }[];
}

interface LinePriceAssessment {
    Standings: LinePriceStandingOnOrder[];
    /** Set when lines above their engine price made up for the uncovered lines below theirs. */
    Offset: PriceOffset | null;
}

/**
 * Every line whose price or discount is a concession, judged against the order's concession rows, with
 * the order judged as a whole on price: see the header.
 */
async function assessLinePrices(
    lines: readonly ConcessionLineFacts[],
    rows: readonly ConcessionRow[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceAssessment> {
    const standings: LinePriceStandingOnOrder[] = [];
    const premiums: PriceOffset['Premiums'] = [];
    for (const line of lines) {
        const figures = await linePriceFigures(line, provider, user);
        if (figures.Premium > 0) premiums.push({ Line: line, Premium: figures.Premium });
        const concession = figures.Concession;
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
    return offsetBelowEnginePrices(standings, premiums, rows);
}

/**
 * Net the order's prices: when the premiums cover every uncovered below-engine price, those prices stop
 * being concessions. What else the line gives away (`DiscountPct`, held discounts) stays. When they fall
 * short, nothing is netted and every line is reported as before.
 *
 * A line an approver has refused a Price or Scope concession for is not netted: the refusal stands, and
 * the line is reported until the price changes or a concession is approved.
 */
function offsetBelowEnginePrices(
    standings: readonly LinePriceStandingOnOrder[],
    premiums: PriceOffset['Premiums'],
    rows: readonly ConcessionRow[],
): LinePriceAssessment {
    const refused = (line: ConcessionLineFacts) =>
        rows.some((r) => r.Status === 'Rejected' && sameID(r.OrderLineID, line.ID) && (r.DeliveryForm === 'Price' || r.DeliveryForm === 'Scope'));
    // A Scope concession gives a product away; that is not a price another line can make up for.
    const below = standings.filter(
        (s) => !s.Covered && s.Concession.Form === 'Price' && s.Concession.PriceValue > 0 && !refused(s.Line),
    );
    const given = Money(below.reduce((t, s) => t + s.Concession.PriceValue, 0));
    const madeUp = Money(premiums.reduce((t, p) => t + p.Premium, 0));
    if (below.length === 0 || madeUp + MONEY_TOLERANCE < given) return { Standings: [...standings], Offset: null };

    const netted: LinePriceStandingOnOrder[] = [];
    for (const standing of standings) {
        if (!below.includes(standing)) {
            netted.push(standing);
            continue;
        }
        const rest = withoutPricePart(standing.Concession);
        if (rest) netted.push({ ...standing, Concession: rest, Covered: standing.ApprovedValue + MONEY_TOLERANCE >= rest.Valuation.Value });
    }
    return {
        Standings: netted,
        Offset: { Offset: below.map((s) => ({ Line: s.Line, PriceValue: s.Concession.PriceValue })), Premiums: premiums },
    };
}

/** A line's concession without its below-engine price: its `DiscountPct` and held discounts. Null when that leaves nothing. */
function withoutPricePart(concession: LinePriceConcession): LinePriceConcession | null {
    const value = Money(concession.DiscountValue + concession.HeldDiscount);
    if (!(value > 0)) return null;
    const percent = concession.Valuation.Percent;
    return {
        ...concession,
        Form: 'Price',
        PriceValue: 0,
        Valuation: { Value: value, Percent: percent != null && concession.Valuation.Value > 0 ? (percent * value) / concession.Valuation.Value : null },
    };
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

/** A line whose price or discount could be a concession: a stated price, a `DiscountPct` or a held discount. */
function hasStatedPriceOrDiscount(line: ConcessionLineFacts): boolean {
    return !!line.PriceStated || Number(line.DiscountPct ?? 0) > 0 || Number(line.HeldDiscount ?? 0) > 0;
}

/**
 * Per saved line of the order, lowercased ID to amount: the manual discounts held for approval. A held
 * row names no promotion, no authority and no approver (`AuthorizeManualDiscount`, golive #328). Each
 * row names its line: an order-level discount is written as one row per line's share.
 */
export async function HeldManualDiscounts(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Map<string, number>> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ OrderLineID: string; Amount: number }>(
        {
            EntityName: ORDER_ADJUSTMENT_ENTITY,
            ExtraFilter:
                `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}' AND OrderLineID IS NOT NULL ` +
                `AND PromotionID IS NULL AND AuthorizedBySalesAuthorityID IS NULL AND ApprovedByUserID IS NULL`,
            Fields: ['OrderLineID', 'Amount'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) throw new Error(`Could not read the order's manual discounts: ${res?.ErrorMessage}`);
    const held = new Map<string, number>();
    for (const row of res.Results ?? []) {
        const key = row.OrderLineID.toLowerCase();
        held.set(key, Money((held.get(key) ?? 0) + Number(row.Amount ?? 0)));
    }
    return held;
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
    const inMemory = inMemoryLines.filter((l) => !!l.ProductID && !isComponentOrReversal(l));
    if (!orderHeaderID) return inMemory;

    const heldDiscounts = await HeldManualDiscounts(orderHeaderID, provider, user);
    const heldFor = (id: string | null) => heldDiscounts.get((id ?? '').toLowerCase()) ?? 0;
    const lines = inMemory.map((l) => (l.ID ? { ...l, HeldDiscount: heldFor(l.ID) } : l));
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
        lines.push({ ...row, PriceStated: true, HeldDiscount: heldFor(row.ID) });
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
