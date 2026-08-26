/**
 * PromotionEngine — resolve promotions for an order and write what they did (plan D70).
 *
 * The pure decisions live in `PromotionBehavior`; this is the part that needs a database: which
 * promotions a code names, which target this product, how many times they have been redeemed, and
 * whether the person applying a MANUAL discount is allowed to.
 *
 * ORDER OF OPERATIONS, and why it is not negotiable:
 *   1. line-level promotions, against each line's net
 *   2. order-level promotions, against the order net that remains
 *   3. allocate every order-level amount DOWN to lines
 *
 * Step 3 is mandatory. Tax and GL are per line, and on a multi-company order the allocation decides
 * whose revenue is reduced — an order-level discount left sitting on the header would leave both
 * companies' books wrong while the order total still looked right. That is the same failure shape
 * as the intercompany bug, so it gets the same treatment: allocation is not optional.
 *
 * MANUAL DISCOUNTS are gated by `SalesAuthority`, a table that existed for exactly this and had
 * never been used. Over the cap the discount ESCALATES rather than being refused — a hard refusal
 * is what pushes people to record the discount as something else, which defeats the cap.
 *
 * CONNECTS TO:
 *   PURE:   ./PromotionBehavior.ts · ./PricingBehavior.ts (AllocateProRata)
 *   CALLER: OrderEntityServer (after lines are priced, before charges)
 *   DOC:    plans/archive/pricing-charges-and-promotions.md §4
 */
import { BaseEntity, IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    mjBizAppsOrdersOrderAdjustmentAllocationEntity,
    mjBizAppsOrdersOrderAdjustmentEntity,
    mjBizAppsOrdersOrderLineEntity,
} from '../generated/entity_subclasses';
import { MJGlobal } from '@memberjunction/global';
import { AllocateProRata, Money } from './PricingBehavior.js';
import {
    ApplyPromotions,
    type ApplyPromotionsResult,
    type PromotionRule,
    type PromotionValueKind,
    type StackingMode,
} from './PromotionBehavior.js';

const PROMOTION_ENTITY = 'MJ_BizApps_Orders: Promotions';
const PROMOTION_CODE_ENTITY = 'MJ_BizApps_Orders: Promotion Codes';
const PROMOTION_TARGET_ENTITY = 'MJ_BizApps_Orders: Promotion Targets';
const PROMOTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Promotion Types';
const ORDER_ADJUSTMENT_ENTITY = 'MJ_BizApps_Orders: Order Adjustments';
const ORDER_ADJUSTMENT_ALLOCATION_ENTITY = 'MJ_BizApps_Orders: Order Adjustment Allocations';
const SALES_AUTHORITY_ENTITY = 'MJ_BizApps_Orders: Sales Authorities';
const SALES_RULE_ENTITY = 'MJ_BizApps_Orders: Sales Rules';

/**
 * The one sanctioned SQL-literal escape in this package (CLAUDE.md "SQL Safety" — never ad-hoc at
 * a call site). Mirrors `EscapeText` in orders-core-entities-server's sql-guards, which this
 * package cannot import (the dependency runs the other way), and cannot be
 * `@memberjunction/global`'s `EscapeSQLString` either — the published 6.1.0-edge.3 global does not
 * export it (linked-MJ-only API); switch to it once the pin carries it.
 */
function escapeSqlLiteral(value: string): string {
    return String(value).replace(/'/g, "''");
}
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

export class PromotionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PromotionError';
    }
}

/** What a qualifier is told about the buyer and the order. */
export interface PromotionQualificationContext {
    PromotionID: string;
    OrderHeaderID: string;
    OrganizationID: string | null;
    PersonID: string | null;
    CompanyID: string;
    OrderNet: number;
    AsOf: Date;
}

/**
 * Plugin seam for eligibility that the declarative fields cannot express — member for two years,
 * first-time buyer, holds an active subscription.
 *
 *     @RegisterClass(BasePromotionQualifier, 'LOYALTY-2YR')
 *     export class TwoYearMember extends BasePromotionQualifier { ... }
 *
 * The key is the promotion's `QualifierKey`. Returning false silently excludes the promotion.
 */
export abstract class BasePromotionQualifier {
    public abstract Qualifies(
        ctx: PromotionQualificationContext,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<boolean>;
}

interface PromotionRow {
    ID: string;
    Code: string;
    Name: string;
    PromotionTypeID: string;
    CompanyID: string | null;
    Value: number;
    AppliesAt: 'Line' | 'Order' | 'Either';
    AllowsStacking: boolean;
    StackSequence: number;
    MaxRedemptions: number | null;
    MaxRedemptionsPerCustomer: number | null;
    MinimumOrderAmount: number | null;
    MinimumQuantity: number | null;
    EffectiveFrom: Date | null;
    EffectiveTo: Date | null;
    RecurrenceMonths: string | null;
    RecurrenceDaysOfWeek: string | null;
    QualifierKey: string | null;
    Status: string;
}

/** A line the engine can discount. */
export interface PromotableLine {
    ID: string;
    ProductID: string;
    ProductCategoryID: string | null;
    Quantity: number;
    /** Net after pricing and any percentage concession — the base promotions work against. */
    Net: number;
    /** The line row itself, so an applied discount can be written back onto it. */
    Entity: mjBizAppsOrdersOrderLineEntity;
}

export interface PromotionApplication {
    PromotionID: string | null;
    PromotionCodeID: string | null;
    OrderLineID: string | null;
    Amount: number;
    Label: string;
    Reason?: string;
    AuthorizedBySalesAuthorityID?: string | null;
    NeedsApproval?: boolean;
    /** Set when an over-cap discount was approved — the exception, made visible. */
    ApprovedByUserID?: string | null;
}

export interface PromotionRunResult {
    Applications: PromotionApplication[];
    /** Per line, the total discount to stamp on `DiscountAmount`. */
    PerLine: Map<string, number>;
    /** Codes the customer supplied that resolved to nothing usable, with the reason. */
    Unusable: Array<{ Code: string; Reason: string }>;
}

/** Load promotions named by code, plus any auto-apply promotions in force. */
async function loadCandidates(
    codes: string[],
    companyID: string,
    asOf: Date,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{
    rows: PromotionRow[];
    codeFor: Map<string, string>;
    unusable: Array<{ Code: string; Reason: string }>;
}> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const unusable: Array<{ Code: string; Reason: string }> = [];
    const codeFor = new Map<string, string>();
    const wanted = new Set<string>();

    if (codes.length) {
        // With checkout coupons these codes arrive from ANONYMOUS callers, so this filter is an
        // injection surface — escape through the named guard below (CLAUDE.md "SQL Safety"), never
        // ad-hoc at the call site.
        const quoted = codes.map((c) => `'${escapeSqlLiteral(c)}'`).join(',');
        const res = await rv.RunView<{
            ID: string;
            PromotionID: string;
            Code: string;
            Status: string;
            MaxRedemptions: number | null;
            AssignedOrganizationID: string | null;
            AssignedPersonID: string | null;
            EffectiveFrom: Date | null;
            EffectiveTo: Date | null;
        }>(
            { EntityName: PROMOTION_CODE_ENTITY, ExtraFilter: `Code IN (${quoted})`, ResultType: 'simple', BypassCache: true },
            user,
        );
        const found = new Map((res?.Results ?? []).map((c) => [c.Code.toLowerCase(), c]));
        for (const c of codes) {
            const row = found.get(c.toLowerCase());
            if (!row) {
                unusable.push({ Code: c, Reason: 'no such code' });
                continue;
            }
            if (row.Status !== 'Active') {
                unusable.push({ Code: c, Reason: `the code is ${row.Status}` });
                continue;
            }
            const from = row.EffectiveFrom ? new Date(row.EffectiveFrom).getTime() : null;
            const to = row.EffectiveTo ? new Date(row.EffectiveTo).getTime() : null;
            if ((from !== null && asOf.getTime() < from) || (to !== null && asOf.getTime() > to)) {
                unusable.push({ Code: c, Reason: 'the code is outside its valid dates' });
                continue;
            }
            wanted.add(uuidKey(row.PromotionID));
            codeFor.set(uuidKey(row.PromotionID), row.ID);
        }
    }

    if (!wanted.size) return { rows: [], codeFor, unusable };

    const ids = [...wanted].map((id) => `'${id}'`).join(',');
    const res = await rv.RunView<PromotionRow>(
        {
            EntityName: PROMOTION_ENTITY,
            ExtraFilter: `ID IN (${ids}) AND Status = 'Active' AND (CompanyID IS NULL OR CompanyID = '${companyID}')`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const live = (res?.Results ?? []).filter((p) => {
        const from = p.EffectiveFrom ? new Date(p.EffectiveFrom).getTime() : null;
        const to = p.EffectiveTo ? new Date(p.EffectiveTo).getTime() : null;
        if (from !== null && asOf.getTime() < from) return false;
        if (to !== null && asOf.getTime() > to) return false;
        return true;
    });
    // A code naming a promotion that is paused, expired or another company's is a REAL answer the
    // customer needs, not a silent no-op.
    for (const [promoID, codeID] of codeFor) {
        if (!live.some((p) => uuidKey(p.ID) === promoID)) {
            const c = codes.find((x) => codeFor.get(promoID) === codeID);
            if (c) unusable.push({ Code: c, Reason: 'the promotion is not currently running' });
        }
    }
    return { rows: live, codeFor, unusable };
}

/** Which promotions target this product? No target rows at all means "everything". */
async function targetsFor(
    promotionIDs: string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Map<string, { products: Set<string>; categories: Set<string>; descendants: boolean } | null>> {
    const out = new Map<string, { products: Set<string>; categories: Set<string>; descendants: boolean } | null>();
    for (const id of promotionIDs) out.set(uuidKey(id), null);
    if (!promotionIDs.length) return out;

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{
        PromotionID: string;
        ProductID: string | null;
        ProductCategoryID: string | null;
        IncludeDescendants: boolean;
    }>(
        {
            EntityName: PROMOTION_TARGET_ENTITY,
            ExtraFilter: `PromotionID IN (${promotionIDs.map((i) => `'${i}'`).join(',')})`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    for (const t of res?.Results ?? []) {
        const key = uuidKey(t.PromotionID);
        const cur = out.get(key) ?? { products: new Set<string>(), categories: new Set<string>(), descendants: true };
        const entry = cur ?? { products: new Set<string>(), categories: new Set<string>(), descendants: true };
        if (t.ProductID) entry.products.add(uuidKey(t.ProductID));
        if (t.ProductCategoryID) entry.categories.add(uuidKey(t.ProductCategoryID));
        entry.descendants = entry.descendants && t.IncludeDescendants !== false;
        out.set(key, entry);
    }
    return out;
}

/** Redemption counts, read from what actually happened rather than a stored counter. */
async function redemptionCounts(
    promotionIDs: string[],
    organizationID: string | null,
    personID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Map<string, { total: number; customer: number }>> {
    const out = new Map<string, { total: number; customer: number }>();
    if (!promotionIDs.length) return out;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ PromotionID: string; OrderHeaderID: string }>(
        {
            EntityName: ORDER_ADJUSTMENT_ENTITY,
            ExtraFilter: `PromotionID IN (${promotionIDs.map((i) => `'${i}'`).join(',')})`,
            Fields: ['PromotionID', 'OrderHeaderID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const rows = res?.Results ?? [];

    // Per-customer counts need the ORDER's buyer, so gather those in one read rather than per row.
    let byOrder = new Map<string, { BillToOrganizationID: string | null; BillToPersonID: string | null }>();
    if (rows.length && (organizationID || personID)) {
        const orderIDs = [...new Set(rows.map((r) => uuidKey(r.OrderHeaderID)))].map((i) => `'${i}'`).join(',');
        const ordRes = await rv.RunView<{ ID: string; BillToOrganizationID: string | null; BillToPersonID: string | null }>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Headers',
                ExtraFilter: `ID IN (${orderIDs})`,
                Fields: ['ID', 'BillToOrganizationID', 'BillToPersonID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        byOrder = new Map((ordRes?.Results ?? []).map((o) => [uuidKey(o.ID), o]));
    }

    for (const r of rows) {
        const key = uuidKey(r.PromotionID);
        const cur = out.get(key) ?? { total: 0, customer: 0 };
        cur.total += 1;
        const o = byOrder.get(uuidKey(r.OrderHeaderID));
        const sameCustomer =
            (organizationID && o && uuidKey(o.BillToOrganizationID) === uuidKey(organizationID)) ||
            (personID && o && uuidKey(o.BillToPersonID) === uuidKey(personID));
        if (sameCustomer) cur.customer += 1;
        out.set(key, cur);
    }
    return out;
}

/** The category chain for a product, so a category-targeted promotion reaches descendants. */
async function categoryChain(
    categoryID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Set<string>> {
    const out = new Set<string>();
    if (!categoryID) return out;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; ParentProductCategoryID: string | null }>(
        { EntityName: PRODUCT_CATEGORY_ENTITY, Fields: ['ID', 'ParentProductCategoryID'], ResultType: 'simple' },
        user,
    );
    const parent = new Map((res?.Results ?? []).map((c) => [uuidKey(c.ID), c.ParentProductCategoryID]));
    let cur: string | null = categoryID;
    while (cur && !out.has(uuidKey(cur))) {
        out.add(uuidKey(cur));
        cur = parent.get(uuidKey(cur)) ?? null;
    }
    return out;
}

export interface RunPromotionsInput {
    OrderHeaderID: string;
    CompanyID: string;
    OrganizationID: string | null;
    PersonID: string | null;
    AsOf: Date;
    Codes: string[];
    Lines: PromotableLine[];
    StackingMode: StackingMode;
    AllowStacking: boolean;
}

/**
 * Resolve and value every promotion for an order. Computes only — the caller writes.
 */
export async function RunPromotions(
    input: RunPromotionsInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<PromotionRunResult> {
    const applications: PromotionApplication[] = [];
    const perLine = new Map<string, number>();
    const orderNet = Money(input.Lines.reduce((s, l) => s + l.Net, 0));

    const { rows, codeFor, unusable } = await loadCandidates(
        input.Codes,
        input.CompanyID,
        input.AsOf,
        provider,
        user,
    );
    if (!rows.length) return { Applications: applications, PerLine: perLine, Unusable: unusable };

    // Type codes decide how Value is read.
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const typeRes = await rv.RunView<{ ID: string; Code: string }>(
        {
            EntityName: PROMOTION_TYPE_ENTITY,
            ExtraFilter: `ID IN (${[...new Set(rows.map((r) => r.PromotionTypeID))].map((i) => `'${i}'`).join(',')})`,
            Fields: ['ID', 'Code'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const kindOf = new Map((typeRes?.Results ?? []).map((t) => [uuidKey(t.ID), t.Code as PromotionValueKind]));

    // Plugin qualification, before anything is valued — an ineligible promotion should never win a
    // collision and then be discarded, because the customer would have been shown the wrong offer.
    const qualified: PromotionRow[] = [];
    for (const p of rows) {
        if (!p.QualifierKey) {
            qualified.push(p);
            continue;
        }
        const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<BasePromotionQualifier>(
            BasePromotionQualifier,
            p.QualifierKey,
        );
        if (!plugin) {
            // A promotion naming a qualifier nobody registered must NOT quietly apply to everyone —
            // that is the opposite of what its author intended.
            unusable.push({ Code: p.Code, Reason: `its qualifier '${p.QualifierKey}' is not registered` });
            continue;
        }
        const ok = await plugin.Qualifies(
            {
                PromotionID: p.ID,
                OrderHeaderID: input.OrderHeaderID,
                OrganizationID: input.OrganizationID,
                PersonID: input.PersonID,
                CompanyID: input.CompanyID,
                OrderNet: orderNet,
                AsOf: input.AsOf,
            },
            provider,
            user,
        );
        if (ok) qualified.push(p);
        else unusable.push({ Code: p.Code, Reason: 'this customer does not qualify' });
    }
    if (!qualified.length) return { Applications: applications, PerLine: perLine, Unusable: unusable };

    const targets = await targetsFor(qualified.map((p) => p.ID), provider, user);
    const counts = await redemptionCounts(
        qualified.map((p) => p.ID),
        input.OrganizationID,
        input.PersonID,
        provider,
        user,
    );

    const toRule = (p: PromotionRow): PromotionRule => ({
        ID: p.ID,
        Code: p.Code,
        Name: p.Name,
        Kind: kindOf.get(uuidKey(p.PromotionTypeID)) ?? 'PercentOff',
        Value: Number(p.Value),
        AppliesAt: p.AppliesAt,
        AllowsStacking: p.AllowsStacking,
        StackSequence: p.StackSequence,
        MinimumOrderAmount: p.MinimumOrderAmount == null ? null : Number(p.MinimumOrderAmount),
        MinimumQuantity: p.MinimumQuantity == null ? null : Number(p.MinimumQuantity),
        RedemptionCount: counts.get(uuidKey(p.ID))?.total ?? 0,
        MaxRedemptions: p.MaxRedemptions,
        CustomerRedemptionCount: counts.get(uuidKey(p.ID))?.customer ?? 0,
        MaxRedemptionsPerCustomer: p.MaxRedemptionsPerCustomer,
    });

    // ── 1. LINE LEVEL ────────────────────────────────────────────────────────
    // Promotions that were CONSIDERED at line level — not merely the ones that won.
    //
    // An 'Either' promotion means it MAY apply at either level, not that it applies at both.
    // Tracking only the winners was not enough: a promotion that lost a line-level collision (or was
    // excluded because the company forbids stacking) would come back at order level and apply to the
    // remainder, so a 5% offer beaten by a 20% one still took its 5%. Once a promotion has had its
    // turn against the lines, it is done either way.
    const consideredAtLineLevel = new Set<string>();
    const remainingByLine = new Map<string, number>();
    for (const line of input.Lines) {
        remainingByLine.set(uuidKey(line.ID), line.Net);
        const chain = await categoryChain(line.ProductCategoryID, provider, user);
        const forThisLine = qualified.filter((p) => {
            if (p.AppliesAt === 'Order') return false;
            const t = targets.get(uuidKey(p.ID));
            if (!t) return true; // no targets = everything
            if (t.products.has(uuidKey(line.ProductID))) return true;
            for (const c of t.categories) if (chain.has(c)) return true;
            return false;
        });
        if (!forThisLine.length) continue;
        for (const p of forThisLine) consideredAtLineLevel.add(uuidKey(p.ID));

        const outcome: ApplyPromotionsResult = ApplyPromotions(forThisLine.map(toRule), {
            BaseAmount: line.Net,
            Quantity: line.Quantity,
            Level: 'Line',
            StackingMode: input.StackingMode,
            AllowStacking: input.AllowStacking,
        });
        for (const a of outcome.Applied) {
            if (a.Amount <= 0) continue;
            applications.push({
                PromotionID: a.Promotion.ID,
                PromotionCodeID: codeFor.get(uuidKey(a.Promotion.ID)) ?? null,
                OrderLineID: line.ID,
                Amount: a.Amount,
                Label: `${a.Promotion.Code} — ${a.Promotion.Name}`,
            });
            perLine.set(uuidKey(line.ID), Money((perLine.get(uuidKey(line.ID)) ?? 0) + a.Amount));

        }
        remainingByLine.set(uuidKey(line.ID), outcome.FinalAmount);
    }

    // ── 2. ORDER LEVEL, against what line promotions left behind ─────────────
    const netAfterLines = Money([...remainingByLine.values()].reduce((s, v) => s + v, 0));
    const orderPromos = qualified.filter((p) => p.AppliesAt !== 'Line' && !consideredAtLineLevel.has(uuidKey(p.ID)));
    if (orderPromos.length && netAfterLines > 0) {
        const outcome = ApplyPromotions(orderPromos.map(toRule), {
            BaseAmount: netAfterLines,
            Quantity: input.Lines.reduce((s, l) => s + l.Quantity, 0),
            Level: 'Order',
            StackingMode: input.StackingMode,
            AllowStacking: input.AllowStacking,
        });

        // ── 3. ALLOCATE DOWN TO LINES — mandatory, see the module header ─────
        for (const a of outcome.Applied) {
            if (a.Amount <= 0) continue;
            const weights = input.Lines.map((l) => remainingByLine.get(uuidKey(l.ID)) ?? 0);
            const parts = AllocateProRata(a.Amount, weights);
            input.Lines.forEach((l, i) => {
                if (parts[i] <= 0) return;
                applications.push({
                    PromotionID: a.Promotion.ID,
                    PromotionCodeID: codeFor.get(uuidKey(a.Promotion.ID)) ?? null,
                    OrderLineID: l.ID,
                    Amount: parts[i],
                    Label: `${a.Promotion.Code} — ${a.Promotion.Name} (order-level share)`,
                });
                perLine.set(uuidKey(l.ID), Money((perLine.get(uuidKey(l.ID)) ?? 0) + parts[i]));
                remainingByLine.set(uuidKey(l.ID), Money((remainingByLine.get(uuidKey(l.ID)) ?? 0) - parts[i]));
            });
        }
    }

    return { Applications: applications, PerLine: perLine, Unusable: unusable };
}

export interface ManualDiscountRequest {
    OrderLineID?: string | null;
    Amount: number;
    Reason: string;
}

/**
 * Check a manual discount against the applying user's `SalesAuthority`.
 *
 * Returns the authority that permitted it, or marks it as needing approval. **No authority row at
 * all means no manual discount** — absence is not permission.
 */
export async function AuthorizeManualDiscount(
    request: ManualDiscountRequest,
    baseAmount: number,
    userID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{
    AuthorityID: string | null;
    NeedsApproval: boolean;
    /** Set when an over-cap discount was permitted, so the exception is visible in the record. */
    ApprovedByUserID?: string | null;
    Refusal?: string;
}> {
    if (!request.Reason?.trim()) {
        return { AuthorityID: null, NeedsApproval: false, Refusal: 'A manual discount must state a reason.' };
    }
    if (!userID) {
        return {
            AuthorityID: null,
            NeedsApproval: false,
            Refusal: 'A manual discount must be attributable to a user, and no user was supplied.',
        };
    }

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; MaxDiscountPct: number | null; MaxOrderValue: number | null }>(
        {
            EntityName: SALES_AUTHORITY_ENTITY,
            ExtraFilter: `SalesRepUserID = '${userID}' AND IsActive = 1`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const authority = res?.Results?.[0];
    if (!authority) {
        return {
            AuthorityID: null,
            NeedsApproval: false,
            Refusal:
                `Manual discounts require a SalesAuthority, and this user has none. Grant one with a ` +
                `MaxDiscountPct before discounting — absence of an authority is not permission to discount.`,
        };
    }

    const pct = baseAmount > 0 ? request.Amount / baseAmount : 1;
    if (authority.MaxDiscountPct == null || pct <= Number(authority.MaxDiscountPct) + 1e-9) {
        return { AuthorityID: authority.ID, NeedsApproval: false, ApprovedByUserID: null };
    }

    // ── OVER THE CAP ──────────────────────────────────────────────────────────
    // This used to return `NeedsApproval: true` and nothing read it, so an over-cap discount applied
    // SILENTLY — the cap was decorative. Escalation now actually resolves: a `SalesRule` of type
    // DiscountLimit names the role that may approve, and the discount is permitted only when the
    // applying user holds it. Anyone else is refused, and told what would be needed.
    //
    // Approving one's own over-cap discount is legitimate here: holding the approver role IS the
    // authority. What matters is that it is recorded — `ApprovedByUserID` makes the exception
    // visible rather than indistinguishable from an ordinary discount.
    const cap = Number(authority.MaxDiscountPct);
    const rule = await findDiscountLimitRule(provider, user);
    if (!rule?.ApprovalRequiredRoleID) {
        return {
            AuthorityID: authority.ID,
            NeedsApproval: true,
            Refusal:
                `This discount is ${(pct * 100).toFixed(1)}% of ${baseAmount}, above the ${(cap * 100).toFixed(1)}% ` +
                `cap on this user's SalesAuthority. No SalesRule of type 'DiscountLimit' names an approving role, ` +
                `so there is no one who could authorize it. Either lower the discount, raise the cap, or configure ` +
                `a DiscountLimit rule with an ApprovalRequiredRoleID.`,
        };
    }

    if (!(await userHoldsRole(rule.ApprovalRequiredRoleID, provider, user, userID))) {
        return {
            AuthorityID: authority.ID,
            NeedsApproval: true,
            Refusal:
                `This discount is ${(pct * 100).toFixed(1)}% of ${baseAmount}, above the ${(cap * 100).toFixed(1)}% ` +
                `cap on this user's SalesAuthority. It needs approval from someone holding the role named by ` +
                `SalesRule '${rule.Name}'. Have an approver apply it, or lower the discount to the cap.`,
        };
    }

    return { AuthorityID: authority.ID, NeedsApproval: true, ApprovedByUserID: userID };
}

/** The active DiscountLimit rule, if one is configured. */
async function findDiscountLimitRule(
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Name: string; ApprovalRequiredRoleID: string | null } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ Name: string; ApprovalRequiredRoleID: string | null }>(
        {
            EntityName: SALES_RULE_ENTITY,
            ExtraFilter: `RuleType = 'DiscountLimit' AND IsActive = 1`,
            Fields: ['Name', 'ApprovalRequiredRoleID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res?.Results?.[0] ?? null;
}

/** Does this user hold the named MJ role? */
async function userHoldsRole(
    roleID: string,
    provider: IMetadataProvider,
    user: UserInfo,
    userID: string | null,
): Promise<boolean> {
    if (!userID) return false;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: User Roles',
            ExtraFilter: `UserID = '${userID}' AND RoleID = '${roleID}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return (res?.Results?.length ?? 0) > 0;
}

/**
 * Write the adjustments and their allocations, and stamp each line's `DiscountAmount`.
 *
 * The stamp is what makes everything downstream work unchanged: `LineTotalNet` subtracts it, the
 * journal entry mirrors the same arithmetic, and tax computes on the discounted base — all without
 * any of them knowing promotions exist.
 */
export async function WriteAdjustments(
    orderHeaderID: string,
    applications: PromotionApplication[],
    perLine: Map<string, number>,
    lines: PromotableLine[],
    userID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    let seq = 0;
    for (const app of applications) {
        const adj = await provider.GetEntityObject<mjBizAppsOrdersOrderAdjustmentEntity>(ORDER_ADJUSTMENT_ENTITY, user);
        adj.NewRecord();
        adj.OrderHeaderID = orderHeaderID;
        adj.OrderLineID = app.OrderLineID;
        adj.PromotionID = app.PromotionID;
        adj.PromotionCodeID = app.PromotionCodeID;
        adj.Amount = app.Amount;
        adj.Sequence = seq++;
        if (app.Reason) adj.Reason = app.Reason;
        adj.AppliedByUserID = userID;
        if (app.AuthorizedBySalesAuthorityID) adj.AuthorizedBySalesAuthorityID = app.AuthorizedBySalesAuthorityID;
        if (app.ApprovedByUserID) {
            adj.ApprovedByUserID = app.ApprovedByUserID;
            adj.ApprovedAt = new Date();
        }
        if (!(await adj.Save())) {
            throw new PromotionError(
                `Could not record the adjustment '${app.Label}': ${adj.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        if (app.OrderLineID) {
            const alloc = await provider.GetEntityObject<mjBizAppsOrdersOrderAdjustmentAllocationEntity>(ORDER_ADJUSTMENT_ALLOCATION_ENTITY, user);
            alloc.NewRecord();
            alloc.OrderAdjustmentID = adj.ID;
            alloc.OrderLineID = app.OrderLineID;
            alloc.Amount = app.Amount;
            if (!(await alloc.Save())) {
                throw new PromotionError(
                    `Could not allocate '${app.Label}' to its line: ${alloc.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
    }

    for (const line of lines) {
        const total = perLine.get(uuidKey(line.ID));
        if (!total) continue;
        line.Entity.DiscountAmount = total;
        if (!(await line.Entity.Save())) {
            throw new PromotionError(
                `Could not apply the discount to line ${line.ID}: ` +
                    `${line.Entity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }
}

/** Tree-shaking anchor for the qualifier base registration. */
export function LoadPromotionEngine(): void {
    // intentionally empty
}
