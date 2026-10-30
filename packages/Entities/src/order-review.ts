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
 *                             an order a deal created. Until the sales app registers its deal link
 *                             (bizapps-sales#462) no order has a deal, so this trigger fires on nothing.
 *                             A change after an APPROVED review voids that approval whether or not this
 *                             trigger is on (the "OrReview" in its name predates that);
 *   OverThreshold             its net total is above a configured amount;
 *   ServicePeriod             a line's service starts more than N months out, or covers more than M.
 *
 * Every trigger is OFF until a host lists it in the `OrderReviewTriggers` setting, so an install that
 * never configures review behaves exactly as before.
 *
 * The review is a task in the tasks app, assigned to the holders of the reviewer role (or, when a
 * holder of that role created the order, the escalation role), each reached through the Person linked
 * to their user. The order's confirm is refused until the order's review carries an approving decision
 * written by a holder of that role who is not the order's creator. Once an order has been reviewed,
 * every later confirm goes through review: a rejected or cancelled review is replaced by a fresh one,
 * and a reviewed change after approval voids the approval, whichever triggers are on.
 *
 * ── WHAT THE GATE TRUSTS ────────────────────────────────────────────────────────────────────────
 *
 * The order's creator can write tasks, task links, assignments and decisions through the ordinary
 * tasks surface, so none of what those rows SAY about who decided is believed. An approval counts
 * only when (see {@link DecideReviewStanding}):
 *
 *   - the user who WROTE the decision row, read from `MJ: Record Changes` (not the row's own
 *     `DecidedByPersonID`, which its writer sets), holds the routed role and is not the creator;
 *   - the task's link to this order was in place, unchanged, before the decision was written, and
 *     the task links no other order, so an approval given to another order cannot be pointed here;
 *   - nothing reviewed on the order was written after the decision (`MJ: Record Changes` again),
 *     so an approval covers the order as it stood when it was given;
 *   - no other review of the order is still open: a newer closed task cannot outrank an open one.
 *
 * This file holds the decisions that need no database, so both tiers and the unit tests can use them.
 * The reads, the task writes and the hooks into the order's save are in
 * `@mj-biz-apps/orders-core-entities-server` (`OrderReview.ts`).
 *
 * ── WHICH ORDERS ARE REVIEWED AT ALL ────────────────────────────────────────────────────────────
 *
 * Every order except those this app's own processes create. A checkout (`Origin` = `Widget`) or
 * provider-payment (`ProviderPayment`) order is paid before anyone could look at it, a reversal has its
 * own cancellation approval, and a renewal the renewal job books is covered by the renewal register
 * review. A renewal whose carried-forward price someone edits is still raised for review when the edit
 * is saved.
 *
 * `Origin` is plain text, so the exemption is an allow-list of the exact values those processes write
 * ({@link SYSTEM_ORDER_ORIGINS}); any other value, including a misspelt `Direct`, is reviewed. The order's
 * server save also refuses a write of `Origin` that did not come from one of those processes.
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

/**
 * The `Origin` values only this app's own processes write, exactly as they write them: `Widget` by
 * checkout (`CheckoutSessionService`) and `ProviderPayment` by `CreateOrderFromProviderPaymentOperation`.
 * The only origins exempt from review.
 */
export const SYSTEM_ORDER_ORIGINS = ['Widget', 'ProviderPayment'] as const;

export type SystemOrderOrigin = (typeof SYSTEM_ORDER_ORIGINS)[number];

/** True for an `Origin` only one of this app's own processes writes. Exact match: `' Widget'` is not one. */
export function IsSystemOrderOrigin(origin: string | null | undefined): origin is SystemOrderOrigin {
    return (SYSTEM_ORDER_ORIGINS as readonly string[]).includes(origin ?? '');
}

/** Why an order is outside review: `NotDirect` and `Reversal` are never reviewed; see {@link OrderReviewExemption}. */
export interface OrderReviewExemptionReason {
    Kind: 'NotDirect' | 'Reversal' | 'RenewalOnly';
    Reason: string;
}

/**
 * Why an order is outside review, or null when it is reviewed. Every order is reviewed except one a
 * system process created ({@link SYSTEM_ORDER_ORIGINS}), a reversal, and a renewal-only order; see the
 * file header for why. A `RenewalOnly` order is not reviewed by trigger, but an edit to its
 * carried-forward price still raises a review, and once it has one its confirm waits for it.
 */
export function OrderReviewExemption(facts: OrderReviewScopeFacts): OrderReviewExemptionReason | null {
    if (IsSystemOrderOrigin(facts.Origin)) return { Kind: 'NotDirect', Reason: `it came from ${facts.Origin}, not direct entry` };
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

/** The order's review task, as the gate reads it. Every field comes from rows the gate can trust; see the file header. */
export interface ReviewTaskFacts {
    Status: string;
    /** The Persons the task is assigned to. An open review assigned to nobody can never be decided. */
    AssigneePersonIDs: readonly string[];
    /** The task's most recently written terminal decision, or null when none is recorded. */
    Decision: ReviewDecisionFacts | null;
}

/** A terminal decision on a review task. */
export interface ReviewDecisionFacts {
    /** The outcome's code. */
    Outcome: string;
    /**
     * The user who wrote the decision row, from its newest `MJ: Record Changes` entry. Not the row's
     * `DecidedByPersonID`: whoever writes the row sets that. Null when no record change names one.
     */
    WrittenByUserID: string | null;
    /** The task's link to this order was in place, unchanged, before the decision was written. */
    LinkedBeforeDecision: boolean;
    /** The task links an order other than this one. */
    LinksAnotherOrder: boolean;
    /** Reviewed changes to the order written after the decision, in words. */
    ChangesSinceDecision: readonly string[];
}

/** Who may decide the order's review, worked out the way the review was routed. */
export interface ReviewAuthority {
    /** The role whose holders may decide it; null when no role can ({@link Refusal} says why). */
    Role: string | null;
    /** The role's active holders other than the order's creator. */
    EligibleUserIDs: readonly string[];
    CreatorUserID: string | null;
    Refusal: string | null;
}

export type ReviewStanding =
    | { Standing: 'None' }
    | { Standing: 'Open' }
    | { Standing: 'Approved' }
    | { Standing: 'NotApproved'; Reason: string };

const APPROVING_OUTCOMES: readonly string[] = ['Approved', 'ApprovedWithConditions'];

/** True for a decision outcome that approves. */
export function IsApprovingReviewOutcome(outcome: string | null | undefined): boolean {
    return APPROVING_OUTCOMES.includes(outcome ?? '');
}

/**
 * Where the order's review stands. Approved only on an approving decision written by an active holder
 * of the routed role who is not the order's creator, on a task that was linked to this order (and no
 * other) before the decision, with nothing reviewed written to the order since. Completing the task
 * without a decision, or a decision by anyone else, is not a review.
 *
 * `authority` is needed only for an approving decision; without it one is not taken.
 */
export function DecideReviewStanding(task: ReviewTaskFacts | null, authority: ReviewAuthority | null): ReviewStanding {
    if (!task) return { Standing: 'None' };
    if (task.Status !== 'Completed' && task.Status !== 'Cancelled') {
        if (task.AssigneePersonIDs.length === 0) {
            return { Standing: 'NotApproved', Reason: 'its last review was assigned to nobody, so nobody could decide it' };
        }
        return { Standing: 'Open' };
    }
    if (task.Status === 'Cancelled') return { Standing: 'NotApproved', Reason: 'its last review was cancelled' };
    const decision = task.Decision;
    if (!decision || !IsApprovingReviewOutcome(decision.Outcome)) {
        return {
            Standing: 'NotApproved',
            Reason: decision ? `its last review was decided '${decision.Outcome}'` : 'its last review was closed without an approving decision',
        };
    }
    const notApproved = (reason: string): ReviewStanding => ({ Standing: 'NotApproved', Reason: reason });
    if (!decision.WrittenByUserID) {
        return notApproved(
            'who recorded its last review\'s approval cannot be read from the record-change log (MJ: Record Changes on Task Decisions)',
        );
    }
    if (!authority) return notApproved('who may approve its review could not be worked out');
    if (authority.CreatorUserID && UUIDsEqual(decision.WrittenByUserID, authority.CreatorUserID)) {
        return notApproved("its last review was approved by the order's creator, who may not review their own order");
    }
    if (!authority.Role) return notApproved(`no one may approve its review: ${authority.Refusal ?? 'no reviewer role applies'}`);
    if (!authority.EligibleUserIDs.some((id) => UUIDsEqual(id, decision.WrittenByUserID))) {
        return notApproved(`its last review was approved by someone who does not hold the role '${authority.Role}'`);
    }
    if (decision.LinksAnotherOrder) return notApproved('its last review task is linked to another order as well');
    if (!decision.LinkedBeforeDecision) {
        return notApproved('its last review task was linked to this order only after it was approved');
    }
    if (decision.ChangesSinceDecision.length > 0) {
        return notApproved(`it changed after its review was approved (${decision.ChangesSinceDecision.join('; ')})`);
    }
    return { Standing: 'Approved' };
}

/**
 * The reviewed field names a record change's `ChangesJSON` names (`{ [field]: { field, oldValue,
 * newValue } }`), among `reviewed`; or, for a value that cannot be read, why. The caller counts an
 * unreadable record as a change: a write whose fields cannot be read is not shown to have left the
 * reviewed fields alone.
 */
export function ReviewedFieldsInChanges(
    changesJSON: string | null | undefined,
    reviewed: readonly string[],
): { Fields: string[] } | { Unreadable: string } {
    if (!changesJSON) return { Fields: [] };
    let parsed: unknown;
    try {
        parsed = JSON.parse(changesJSON);
    } catch (err: unknown) {
        return { Unreadable: err instanceof Error ? err.message : String(err) };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { Unreadable: 'it is not an object of changed fields' };
    const names = Object.keys(parsed);
    return { Fields: reviewed.filter((field) => names.includes(field)) };
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
