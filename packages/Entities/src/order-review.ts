/**
 * @fileoverview Order review by trigger (bc-aidp-next-golive#320 §5): the rules, without the database.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────────
 *
 * Most orders confirm without anyone looking at them first. An order that hits one of five triggers
 * waits for a reviewer to approve it before it may confirm:
 *
 *   NoDeal                    it was entered by hand, with no deal behind it;
 *   PriceVariance             a line's price differs from the catalog's with no approved concession
 *                             covering it, or a renewal's carried-forward price was edited;
 *   ChangedAfterDealOrReview  before confirm, its bill-to, company, prices or service dates changed on
 *                             an order a deal created, or on one already reviewed;
 *   OverThreshold             its net total is above a configured amount;
 *   ServicePeriod             a line's service starts more than N months out, or covers more than M.
 *
 * Every trigger is OFF until a host lists it in the `OrderReviewTriggers` setting, so an install that
 * never configures review behaves exactly as before.
 *
 * The review is a task in the tasks app, assigned to the holders of the reviewer role (or, when a
 * holder of that role created the order, the escalation role), each reached through the Person linked
 * to their user. The order's confirm is refused until the order's most recent review task carries an
 * approving decision. Once an order has been reviewed, every later confirm goes through review: a
 * rejected or cancelled review is replaced by a fresh one, and a change after approval raises a fresh
 * one.
 *
 * This file holds the decisions that need no database, so both tiers and the unit tests can use them.
 * The reads, the task writes and the hooks into the order's save are in
 * `@mj-biz-apps/orders-core-entities-server` (`OrderReview.ts`).
 *
 * ── WHICH ORDERS ARE REVIEWED AT ALL ────────────────────────────────────────────────────────────
 *
 * Only hand-entered and deal-created orders (`Origin` = `Direct`). A checkout or provider-payment order
 * is paid before anyone could look at it, a reversal has its own cancellation approval, and a renewal
 * the renewal job books is covered by the renewal register review. A renewal whose carried-forward
 * price someone edits is still raised for review when the edit is saved.
 *
 * ── WHERE THE DEAL COMES FROM ───────────────────────────────────────────────────────────────────
 *
 * `OrderHeader` carries no `DealID`; `Deal.OrderID` points this way. So, as with the confirm veto, the
 * app that owns deals answers through {@link RegisterOrderDealLink}. On a host where nothing registers,
 * every order counts as having no deal: right on a host without a sales app, and on a host with one
 * that has not registered yet it over-reviews rather than under-reviews.
 *
 * @module @mj-biz-apps/orders-entities
 */

import type { UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore, UUIDsEqual } from '@memberjunction/global';

// ─── Triggers ─────────────────────────────────────────────────────────────────────────────────────

/** The five triggers, by the code the `OrderReviewTriggers` setting lists. */
export const ORDER_REVIEW_TRIGGERS = [
    'NoDeal',
    'PriceVariance',
    'ChangedAfterDealOrReview',
    'OverThreshold',
    'ServicePeriod',
] as const;

export type OrderReviewTrigger = (typeof ORDER_REVIEW_TRIGGERS)[number];

/** The `Code` of the task type a review task is raised as. Shipped in this app's metadata. */
export const ORDER_REVIEW_TASK_TYPE_CODE = 'ORDERS_ORDER_REVIEW';

/** The `OrderReviewTriggers` setting, read: the triggers it switches on, and any entry it does not know. */
export interface ParsedOrderReviewTriggers {
    Enabled: OrderReviewTrigger[];
    /** Entries that name no trigger. The caller refuses rather than guess what a typo meant. */
    Unknown: string[];
}

/**
 * Read the comma-separated `OrderReviewTriggers` setting. Matching ignores case and spacing; an
 * absent or empty value switches every trigger off.
 */
export function ParseOrderReviewTriggers(raw: string | null | undefined): ParsedOrderReviewTriggers {
    const enabled: OrderReviewTrigger[] = [];
    const unknown: string[] = [];
    for (const part of (raw ?? '').split(',')) {
        const entry = part.trim();
        if (!entry) continue;
        const match = ORDER_REVIEW_TRIGGERS.find((t) => t.toLowerCase() === entry.replace(/\s+/g, '').toLowerCase());
        if (!match) unknown.push(entry);
        else if (!enabled.includes(match)) enabled.push(match);
    }
    return { Enabled: enabled, Unknown: unknown };
}

/** The review configuration, as read from the orders settings. */
export interface OrderReviewConfig {
    Triggers: readonly OrderReviewTrigger[];
    /** Net total above which `OverThreshold` fires. Null when unset or unreadable. */
    TotalThreshold: number | null;
    /** `ServicePeriod` fires for a service start more than this many months after today. */
    MaxMonthsToServiceStart: number;
    /** `ServicePeriod` fires for a line whose service covers more than this many months. */
    MaxLineServiceMonths: number;
    /** The NAME of the MJ role whose holders review an order. */
    ReviewerRole: string | null;
    /** The NAME of the MJ role whose holders review an order a holder of the reviewer role created. */
    EscalationRole: string | null;
}

/** True when any trigger is switched on, so the save path does its review work at all. */
export function OrderReviewEnabled(config: Pick<OrderReviewConfig, 'Triggers'>): boolean {
    return config.Triggers.length > 0;
}

/**
 * What is wrong with a configuration that has triggers switched on, or null when it can be used.
 * A review nobody can be routed to, or a threshold nobody set, refuses rather than quietly passing.
 */
export function OrderReviewConfigProblem(config: OrderReviewConfig, unknownTriggers: readonly string[] = []): string | null {
    if (unknownTriggers.length > 0) {
        return (
            `the Orders setting OrderReviewTriggers names ${unknownTriggers.map((t) => `'${t}'`).join(', ')}, which ` +
            `${unknownTriggers.length === 1 ? 'is not a trigger' : 'are not triggers'}. The triggers are ` +
            `${ORDER_REVIEW_TRIGGERS.join(', ')}`
        );
    }
    if (!OrderReviewEnabled(config)) return null;
    if (!config.ReviewerRole) {
        return 'order review is switched on (Orders setting OrderReviewTriggers) but no reviewer role is set (Orders setting OrderReviewerRole), so no one could review the order';
    }
    if (config.Triggers.includes('OverThreshold') && (config.TotalThreshold == null || !(config.TotalThreshold >= 0))) {
        return 'the OverThreshold review trigger is switched on but the Orders setting OrderReviewTotalThreshold holds no amount';
    }
    return null;
}

// ─── Which orders are in scope ────────────────────────────────────────────────────────────────────

/** The header facts that decide whether an order is reviewed at all. */
export interface OrderReviewScopeFacts {
    Origin: string | null;
    ReversesOrderHeaderID: string | null;
    /** The order's lines that are neither bundle components nor reversals. */
    Lines: ReadonlyArray<{ RenewsSubscriptionID: string | null }>;
}

/** Why an order is outside review: `NotDirect` and `Reversal` are never reviewed; see {@link OrderReviewExemption}. */
export interface OrderReviewExemptionReason {
    Kind: 'NotDirect' | 'Reversal' | 'RenewalOnly';
    Reason: string;
}

/**
 * Why an order is outside review, or null when it is reviewed. Only `Direct` orders (hand-entered or
 * deal-created) are reviewed; see the file header for why the others are not. A `RenewalOnly` order is
 * not reviewed by trigger, but an edit to its carried-forward price still raises a review, and once it
 * has one its confirm waits for it.
 */
export function OrderReviewExemption(facts: OrderReviewScopeFacts): OrderReviewExemptionReason | null {
    const origin = (facts.Origin ?? 'Direct').trim() || 'Direct';
    if (origin.toLowerCase() !== 'direct') return { Kind: 'NotDirect', Reason: `it came from ${origin}, not direct entry` };
    if (facts.ReversesOrderHeaderID) return { Kind: 'Reversal', Reason: 'it reverses another order, which has its own approval' };
    if (facts.Lines.length > 0 && facts.Lines.every((l) => !!l.RenewsSubscriptionID)) {
        return { Kind: 'RenewalOnly', Reason: 'it renews subscriptions, which the renewal register review covers' };
    }
    return null;
}

// ─── Triggers evaluated at confirm ────────────────────────────────────────────────────────────────

/** A line as the confirm-time triggers read it. */
export interface OrderReviewLineFacts {
    LineNumber: number | null;
    /** Bundle components and reversals are left out: their prices are allocations or the origin's. */
    IsComponentOrReversal: boolean;
    RenewsSubscriptionID: string | null;
    UnitPrice: number | null;
    /** The catalog's price for the line, or null when nothing resolves one. */
    EngineUnitPrice: number | null;
    /** The line's price is the catalog's own, or a named price-list pick: a configured price, not a variance. */
    IsConfiguredPrice: boolean;
    /** False for an unsaved line the engine prices at confirm. */
    PriceStated: boolean;
    /** An Approved Price or Scope concession is recorded against the line (an approval on the rep's own authority counts). */
    HasApprovedConcession: boolean;
    /** Set on a renewal line whose carried-forward price was edited in this save. */
    RenewalPriceEdited: boolean;
    ServicePeriodStart: string | null;
    ServicePeriodEnd: string | null;
}

/** What the confirm-time triggers read. */
export interface OrderReviewFacts {
    /** A deal created the order. */
    HasDeal: boolean;
    /** The order's lines after discounts, before tax and charges. */
    NetTotal: number;
    /** Today, as `YYYY-MM-DD`. */
    Today: string;
    Lines: readonly OrderReviewLineFacts[];
}

/** One trigger an order hit, with the reason a reviewer reads. */
export interface OrderReviewHit {
    Trigger: OrderReviewTrigger;
    Reason: string;
}

/** Pennies of tolerance when comparing prices. */
const PRICE_TOLERANCE = 0.005;

/**
 * The confirm-time triggers an order hits, among those switched on: NoDeal, PriceVariance,
 * OverThreshold and ServicePeriod. ChangedAfterDealOrReview is decided when the change is saved
 * ({@link OrderReviewChanges}), because by confirm time the change is no longer visible.
 *
 * PriceVariance at confirm reads lines on an order with no deal: a deal order's prices are the deal's,
 * and a change to them is a ChangedAfterDealOrReview. A discount within the rep's own authority is
 * recorded as a concession approved on that authority, so it counts as covered.
 */
export function EvaluateOrderReviewTriggers(facts: OrderReviewFacts, config: OrderReviewConfig): OrderReviewHit[] {
    const on = new Set(config.Triggers);
    const hits: OrderReviewHit[] = [];

    if (on.has('NoDeal') && !facts.HasDeal) {
        hits.push({ Trigger: 'NoDeal', Reason: 'it was entered directly, with no deal behind it' });
    }

    if (on.has('PriceVariance')) {
        for (const line of facts.Lines) {
            const reason = priceVariance(line, facts.HasDeal);
            if (reason) hits.push({ Trigger: 'PriceVariance', Reason: reason });
        }
    }

    if (on.has('OverThreshold') && config.TotalThreshold != null && facts.NetTotal > config.TotalThreshold) {
        hits.push({
            Trigger: 'OverThreshold',
            Reason: `its net total of ${formatAmount(facts.NetTotal)} is above the review threshold of ${formatAmount(config.TotalThreshold)}`,
        });
    }

    if (on.has('ServicePeriod')) {
        const latestStart = AddMonths(facts.Today, config.MaxMonthsToServiceStart);
        for (const line of facts.Lines) {
            if (line.IsComponentOrReversal) continue;
            const start = line.ServicePeriodStart;
            const end = line.ServicePeriodEnd;
            if (start && latestStart && start > latestStart) {
                hits.push({
                    Trigger: 'ServicePeriod',
                    Reason: `line ${line.LineNumber ?? '?'}'s service starts ${start}, more than ${config.MaxMonthsToServiceStart} months out`,
                });
            }
            if (start && end && ServiceMonthsExceed(start, end, config.MaxLineServiceMonths)) {
                hits.push({
                    Trigger: 'ServicePeriod',
                    Reason: `line ${line.LineNumber ?? '?'} covers ${start} to ${end}, more than ${config.MaxLineServiceMonths} months`,
                });
            }
        }
    }
    return hits;
}

function priceVariance(line: OrderReviewLineFacts, hasDeal: boolean): string | null {
    if (line.IsComponentOrReversal || line.HasApprovedConcession) return null;
    if (line.RenewsSubscriptionID) {
        return line.RenewalPriceEdited ? `line ${line.LineNumber ?? '?'}'s carried-forward renewal price was edited` : null;
    }
    if (hasDeal || !line.PriceStated || line.IsConfiguredPrice || line.EngineUnitPrice == null) return null;
    const price = Number(line.UnitPrice ?? 0);
    if (Math.abs(price - line.EngineUnitPrice) < PRICE_TOLERANCE) return null;
    return (
        `line ${line.LineNumber ?? '?'} is priced at ${formatAmount(price)} against a catalog price of ` +
        `${formatAmount(line.EngineUnitPrice)}, with no approved concession covering the difference`
    );
}

// ─── Changes that send an order to review when they are saved ─────────────────────────────────────

/** What a save changes, as the ChangedAfterDealOrReview and renewal-price checks read it. */
export interface OrderReviewChangeFacts {
    /** Header fields this save changes, by name. */
    HeaderFieldsChanged: readonly string[];
    /** Saved lines this save changes, with the fields it changes on each. */
    LinesChanged: ReadonlyArray<{ LineNumber: number | null; Fields: readonly string[]; RenewsSubscriptionID: string | null }>;
    /** Lines this save adds (not bundle components). */
    LinesAdded: number;
    /** Saved lines this save removes. */
    LinesRemoved: number;
}

/** Header fields whose change on a deal-created or reviewed order sends it back to review. */
export const REVIEWED_HEADER_FIELDS = ['BillToOrganizationID', 'BillToPersonID', 'CompanyID'] as const;
/** Line fields whose change on a deal-created or reviewed order sends it back to review. */
export const REVIEWED_LINE_FIELDS = ['UnitPrice', 'DiscountPct', 'DiscountAmount', 'Quantity', 'ProductID', 'CompanyID', 'ServicePeriodStart', 'ServicePeriodEnd'] as const;
/** Line fields that, edited on a renewal line, change its carried-forward price. */
export const RENEWAL_PRICE_FIELDS = ['UnitPrice', 'DiscountPct', 'DiscountAmount'] as const;

const HEADER_LABELS: Record<string, string> = {
    BillToOrganizationID: 'bill-to organization',
    BillToPersonID: 'bill-to person',
    CompanyID: 'company',
};
const LINE_LABELS: Record<string, string> = {
    UnitPrice: 'price',
    DiscountPct: 'discount',
    DiscountAmount: 'discount',
    Quantity: 'quantity',
    ProductID: 'product',
    CompanyID: 'company',
    ServicePeriodStart: 'service dates',
    ServicePeriodEnd: 'service dates',
};

/**
 * The reviewed changes a save makes, in words, or an empty list for none: the header's bill-to and
 * company, and each line's price, discount, quantity, product, company and service dates, plus lines
 * added or removed (each changes what the order charges).
 */
export function OrderReviewChanges(facts: OrderReviewChangeFacts): string[] {
    const changes: string[] = [];
    const header = [...new Set(facts.HeaderFieldsChanged.filter((f) => f in HEADER_LABELS).map((f) => HEADER_LABELS[f]))];
    if (header.length > 0) changes.push(`the ${header.join(' and ')} changed`);
    for (const line of facts.LinesChanged) {
        const labels = [...new Set(line.Fields.filter((f) => f in LINE_LABELS).map((f) => LINE_LABELS[f]))];
        if (labels.length > 0) changes.push(`line ${line.LineNumber ?? '?'}'s ${labels.join(' and ')} changed`);
    }
    if (facts.LinesAdded > 0) changes.push(`${facts.LinesAdded} line${facts.LinesAdded === 1 ? ' was' : 's were'} added`);
    if (facts.LinesRemoved > 0) changes.push(`${facts.LinesRemoved} line${facts.LinesRemoved === 1 ? ' was' : 's were'} removed`);
    return changes;
}

/** The renewal lines whose carried-forward price this save edits, in words. */
export function RenewalPriceEdits(facts: OrderReviewChangeFacts): string[] {
    return facts.LinesChanged.filter(
        (l) => !!l.RenewsSubscriptionID && l.Fields.some((f) => (RENEWAL_PRICE_FIELDS as readonly string[]).includes(f)),
    ).map((l) => `line ${l.LineNumber ?? '?'}'s carried-forward renewal price was edited`);
}

// ─── The review task's standing ───────────────────────────────────────────────────────────────────

/** The order's most recent review task, as the gate reads it. */
export interface ReviewTaskFacts {
    Status: string;
    /** The outcome code of the task's most recent terminal decision, or null when none is recorded. */
    DecisionOutcome: string | null;
    /** The Person who recorded that decision. */
    DecidedByPersonID: string | null;
    /** The Persons the task is assigned to. */
    AssigneePersonIDs: readonly string[];
}

export type ReviewStanding =
    | { Standing: 'None' }
    | { Standing: 'Open' }
    | { Standing: 'Approved' }
    | { Standing: 'NotApproved'; Reason: string };

/**
 * Where the order's review stands. Approved only on an approving decision recorded by one of the
 * task's assignees: completing the task without a decision, or a decision by someone it was not
 * routed to, is not a review.
 */
export function DecideReviewStanding(task: ReviewTaskFacts | null): ReviewStanding {
    if (!task) return { Standing: 'None' };
    if (task.Status !== 'Completed' && task.Status !== 'Cancelled') return { Standing: 'Open' };
    if (task.Status === 'Cancelled') return { Standing: 'NotApproved', Reason: 'its last review was cancelled' };
    const outcome = task.DecisionOutcome;
    if (outcome !== 'Approved' && outcome !== 'ApprovedWithConditions') {
        return {
            Standing: 'NotApproved',
            Reason: outcome ? `its last review was decided '${outcome}'` : 'its last review was closed without an approving decision',
        };
    }
    if (!task.DecidedByPersonID || !task.AssigneePersonIDs.some((id) => UUIDsEqual(id, task.DecidedByPersonID))) {
        return { Standing: 'NotApproved', Reason: 'its last review was approved by someone it was not assigned to' };
    }
    return { Standing: 'Approved' };
}

// ─── Routing ──────────────────────────────────────────────────────────────────────────────────────

/** What decides which role reviews an order. */
export interface ReviewRoutingFacts {
    ReviewerRole: string | null;
    EscalationRole: string | null;
    /** The order's creator holds the reviewer role. */
    CreatorHoldsReviewerRole: boolean;
}

/**
 * The role an order's review goes to: the reviewer role, or the escalation role when a holder of the
 * reviewer role created the order, since no one reviews their own order.
 */
export function DecideReviewRole(facts: ReviewRoutingFacts): { Role: string; Escalated: boolean } | { Refusal: string } {
    if (!facts.ReviewerRole) {
        return { Refusal: 'no reviewer role is set (Orders setting OrderReviewerRole), so no one could review this order' };
    }
    if (!facts.CreatorHoldsReviewerRole) return { Role: facts.ReviewerRole, Escalated: false };
    if (!facts.EscalationRole) {
        return {
            Refusal:
                `this order was created by a holder of the reviewer role '${facts.ReviewerRole}', who may not review it, and no ` +
                'escalation role is set (Orders setting OrderReviewEscalationRole)',
        };
    }
    return { Role: facts.EscalationRole, Escalated: true };
}

/** The users a review is assigned to: the role's active holders other than the order's creator. */
export function ReviewerUserIDs(holderUserIDs: readonly string[], creatorUserID: string | null): string[] {
    const out: string[] = [];
    for (const id of holderUserIDs) {
        if (creatorUserID && UUIDsEqual(id, creatorUserID)) continue;
        if (!out.some((o) => UUIDsEqual(o, id))) out.push(id);
    }
    return out;
}

// ─── Calendar months ──────────────────────────────────────────────────────────────────────────────

/**
 * `day` (`YYYY-MM-DD`) moved by whole calendar months, clamped to the target month's last day (Jan 31
 * plus one month is Feb 28 or 29). Null for an unreadable day.
 */
export function AddMonths(day: string, months: number): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? '');
    if (!m || !Number.isFinite(months)) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1 + Math.trunc(months);
    const targetYear = year + Math.floor(month / 12);
    const targetMonth = ((month % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const dayOfMonth = Math.min(Number(m[3]), lastDay);
    return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
}

/**
 * Whether a service period from `start` to `end` (both inclusive) covers more than `months` months.
 * A twelve-month term runs Jan 1 to Dec 31; Jan 1 to Jan 1 of the next year is a day more.
 */
export function ServiceMonthsExceed(start: string, end: string, months: number): boolean {
    const limit = AddMonths(start, months);
    return !!limit && end.slice(0, 10) >= limit;
}

function formatAmount(value: number): string {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── The deal an order came from: a seam the sales app answers ────────────────────────────────────

/** The deal an order came from. */
export interface OrderDeal {
    DealID: string;
    DealNumber: string | null;
}

/** Implemented by the app that owns deals. One per host. */
export interface OrderDealLink {
    /** The deal the order came from, or null when none did. Throw when it cannot tell. */
    DealForOrder(orderHeaderID: string, contextUser: UserInfo | null): Promise<OrderDeal | null>;
}

const DEAL_LINK_KEY = '__MJ_BizAppsOrders_OrderDealLink__';

/** The process-wide slot, on the global store for the reason `order-confirm-veto.ts` gives. */
function store(): Record<string, unknown> {
    return (GetGlobalObjectStore() ?? globalThis) as unknown as Record<string, unknown>;
}

/** Register the one deal link for this process. Passing null clears it, which is what tests want. */
export function RegisterOrderDealLink(link: OrderDealLink | null): void {
    store()[DEAL_LINK_KEY] = link;
}

/** The registered deal link, or null on a host where nothing registered. */
export function HostOrderDealLink(): OrderDealLink | null {
    return (store()[DEAL_LINK_KEY] as OrderDealLink | null | undefined) ?? null;
}

/**
 * The deal an order came from. With nothing registered, none: every order counts as entered directly.
 * A link that throws is not swallowed: the caller refuses, since "could not tell" is not "no deal".
 */
export async function ResolveOrderDeal(
    link: OrderDealLink | null,
    orderHeaderID: string | null,
    contextUser: UserInfo | null,
): Promise<OrderDeal | null> {
    if (!link || !orderHeaderID) return null;
    return link.DealForOrder(orderHeaderID, contextUser);
}
