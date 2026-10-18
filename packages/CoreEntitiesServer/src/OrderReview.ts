/**
 * OrderReview — order review by trigger, on the server (bc-aidp-next-golive#320 §5).
 *
 * The rules are in `@mj-biz-apps/orders-entities` (`order-review.ts`); this file reads what they need,
 * raises the review task, and answers the order's save. Two hooks, both called from
 * `OrderEntityServer.Save` before anything is written:
 *
 *   {@link CheckOrderReviewOnChange}  a save that changes a reviewed field on a deal-created or reviewed
 *                                     order, or edits a renewal's carried-forward price, raises a review
 *                                     (or notes the change on the open one);
 *   {@link CheckOrderReviewAtConfirm} a confirm is refused while the order's review is outstanding, and
 *                                     an order that hits a trigger with no review is sent to one.
 *
 * Both return a refusal (a sentence for the person who saved) or null, and both are no-ops until a host
 * switches a trigger on in the `OrderReviewTriggers` setting.
 *
 * THE REVIEW IS A TASK. One `ORDERS_ORDER_REVIEW` task per review, linked to the order and assigned to
 * the active holders of the reviewer role, or of the escalation role when a holder of the reviewer role
 * created the order. Each is assigned through the active Person linked to their user, as the tasks app
 * notifies and lists people that way; the order's creator is never assigned. A review nobody could
 * receive is refused rather than raised, so a review is never left assigned to nobody
 * (bc-aidp-next-golive#326).
 *
 * WHY BEFORE THE WRITE. A review raised for a save that then fails is a spare task; a change saved
 * whose review then failed to raise is a confirm on a stale approval. The first is the safe one.
 *
 * The creator is read from `MJ: Record Changes` (Order Headers tracks record changes); with no Create
 * row it is the user saving.
 *
 * CONNECTS TO:
 *   CALLER: OrderEntityServer (Save)
 *   RULES:  @mj-biz-apps/orders-entities order-review.ts
 *   WRITES: Tasks · Task Links · Task Assignments · Task Activities
 *   READS:  Task Types · Task Decisions · Task Decision Outcomes · MJ: Roles · MJ: User Roles · MJ: Users
 *           · MJ: Record Changes · MJ_BizApps_Common: People · Order Concessions · the registered deal link
 */
import { LogStatus, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
// Imported for its side effect: it registers the tasks entities' generated subclasses.
import '@mj-biz-apps/tasks-entities';
import type { mjBizAppsTasksTaskEntity } from '@mj-biz-apps/tasks-entities';
import {
    DecideReviewRole,
    DecideReviewStanding,
    EvaluateOrderReviewTriggers,
    HostOrderDealLink,
    ORDER_REVIEW_TASK_TYPE_CODE,
    OrderReviewChanges,
    OrderReviewConfigProblem,
    OrderReviewEnabled,
    OrderReviewExemption,
    RenewalPriceEdits,
    ResolveLinePriceStanding,
    ResolveOrderDeal,
    ReviewerUserIDs,
    type OrderReviewChangeFacts,
    type OrderReviewConfig,
    type OrderReviewHit,
    type OrderReviewLineFacts,
    type OrderReviewScopeFacts,
    type ReviewStanding,
    type ReviewTaskFacts,
} from '@mj-biz-apps/orders-entities';
import {
    ActiveRoleHolderIDs,
    CreateTaskAssignment,
    CreateTaskLink,
    PERSON_ENTITY,
    RecordTaskActivity,
    requireSubclass,
    TASK_ASSIGNMENT_ENTITY,
    TASK_DECISION_ENTITY,
    TASK_DECISION_OUTCOME_ENTITY,
    TASK_ENTITY,
    TASK_LINK_ENTITY,
    TASK_TYPE_ENTITY,
    type ApprovalTaskContext,
} from './ConcessionApprovalTask.js';
import { OrderNetTotal, type ConcessionLineFacts } from './ConcessionGate.js';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY } from './entity-names.js';
import { OrdersSettings } from './OrdersSettings.js';
import { ResolvePersonIDsForUsers } from './person-user-link.js';
import { BusinessDay } from './PaymentGatedAccess.js';
import { EscapeText, RequireUUID, RequireUUIDs } from './sql-guards.js';

const ROLE_ENTITY = 'MJ: Roles';
const RECORD_CHANGE_ENTITY = 'MJ: Record Changes';
const LOG_PREFIX = '[BizAppsOrders] Order review:';

/** A line as the review reads it: the concession gate's facts plus its service period. */
export interface ReviewLineInput extends ConcessionLineFacts {
    ServicePeriodStart: string | null;
    ServicePeriodEnd: string | null;
    /** A renewal line whose carried-forward price this save edits. */
    RenewalPriceEdited: boolean;
}

/** The order, as the save hands it to the review. */
export interface ReviewOrderInput {
    /** Null for an order not yet saved. */
    OrderHeaderID: string | null;
    OrderNumber: string | null;
    Origin: string | null;
    ReversesOrderHeaderID: string | null;
    Lines: readonly ReviewLineInput[];
}

/** The order's most recent review task, with what the gate reads from it. */
interface LatestReview {
    Task: { ID: string; Name: string; Status: string };
    Facts: ReviewTaskFacts;
    Standing: ReviewStanding;
}

/** What a raised review was sent to. */
export interface RaisedReview {
    TaskID: string;
    TaskName: string;
    Role: string;
    Escalated: boolean;
    AssigneeCount: number;
}

// ─── The hooks ────────────────────────────────────────────────────────────────────────────────────

/**
 * Called by a save of a saved, unconfirmed order. Raises a review when the save changes a reviewed field
 * on a deal-created order, changes one after an approved review, or edits a renewal's carried-forward
 * price; notes the change on an open review instead of raising a second. Returns a refusal or null.
 */
export async function CheckOrderReviewOnChange(
    order: ReviewOrderInput,
    change: OrderReviewChangeFacts,
    ctx: ApprovalTaskContext,
): Promise<string | null> {
    if (!order.OrderHeaderID) return null;
    await OrdersSettings.Load(ctx.Provider, ctx.User);
    const config = OrdersSettings.OrderReview;
    // A configuration that cannot be used is reported at confirm, which it holds; an edit is not refused for it.
    if (!OrderReviewEnabled(config) || OrderReviewConfigProblem(config, OrdersSettings.OrderReviewTriggers.Unknown)) return null;

    const exemption = OrderReviewExemption(scopeOf(order));
    if (exemption && exemption.Kind !== 'RenewalOnly') return null;

    const changes = config.Triggers.includes('ChangedAfterDealOrReview') && !exemption ? OrderReviewChanges(change) : [];
    const renewalEdits = config.Triggers.includes('PriceVariance') ? RenewalPriceEdits(change) : [];
    if (changes.length === 0 && renewalEdits.length === 0) return null;

    try {
        const latest = await LatestReviewTask(order.OrderHeaderID, ctx);
        if (latest?.Standing.Standing === 'Open') {
            await RecordTaskActivity(
                latest.Task.ID,
                `The order changed while this review was open: ${[...changes, ...renewalEdits].join('; ')}.`,
                ctx,
            );
            return null;
        }

        const reasons: string[] = [];
        if (changes.length > 0) {
            if (latest?.Standing.Standing === 'Approved') {
                reasons.push(...changes.map((c) => `${c} after the order was reviewed`));
            } else if (!latest) {
                const deal = await ResolveOrderDeal(HostOrderDealLink(), order.OrderHeaderID, ctx.User);
                if (deal) reasons.push(...changes.map((c) => `${c} on an order deal ${deal.DealNumber ?? deal.DealID} created`));
            }
            // A review that was rejected or cancelled is replaced at the next confirm, which sees this change.
        }
        if (latest?.Standing.Standing !== 'NotApproved') reasons.push(...renewalEdits);
        if (reasons.length === 0) return null;

        await RaiseOrderReview(order, reasons, config, ctx);
        return null;
    } catch (err) {
        return `Order ${order.OrderNumber ?? ''} was not saved: this change needs an order review, and the review could not be raised. ${messageOf(err)}`;
    }
}

/**
 * Called by the save that confirms an order. Null lets the confirm through; a string refuses it and says
 * why, and when the order needed a review it did not have, that a review was raised and who it went to.
 */
export async function CheckOrderReviewAtConfirm(order: ReviewOrderInput, ctx: ApprovalTaskContext): Promise<string | null> {
    await OrdersSettings.Load(ctx.Provider, ctx.User);
    const config = OrdersSettings.OrderReview;
    const unknown = OrdersSettings.OrderReviewTriggers.Unknown;
    if (!OrderReviewEnabled(config) && unknown.length === 0) return null;
    const label = `Order ${order.OrderNumber ?? ''}`.trim();

    const problem = OrderReviewConfigProblem(config, unknown);
    if (problem) return `${label} cannot be confirmed: ${problem}.`;

    const exemption = OrderReviewExemption(scopeOf(order));
    if (exemption && exemption.Kind !== 'RenewalOnly') return null;

    try {
        const latest = order.OrderHeaderID ? await LatestReviewTask(order.OrderHeaderID, ctx) : null;
        if (!latest && exemption) return null;

        switch (latest?.Standing.Standing) {
            case 'Approved':
                return null;
            case 'Open':
                return (
                    `${label} cannot be confirmed until its review is approved. Review task '${latest.Task.Name}' is ` +
                    `waiting on its reviewer.`
                );
            case 'NotApproved': {
                const hits = await evaluate(order, config, ctx);
                const raised = await RaiseOrderReview(order, [latest.Standing.Reason, ...hits.map((h) => h.Reason)], config, ctx);
                return `${label} cannot be confirmed: ${latest.Standing.Reason}. ${describeRaised(raised)}`;
            }
            default: {
                const hits = await evaluate(order, config, ctx);
                if (hits.length === 0) return null;
                const reasons = hits.map((h) => h.Reason);
                if (!order.OrderHeaderID) {
                    return (
                        `${label} needs a review before it can be confirmed (${reasons.join('; ')}). Save the order without ` +
                        `confirming it first, then confirm it to send it for review.`
                    );
                }
                const raised = await RaiseOrderReview(order, reasons, config, ctx);
                return `${label} needs a review before it can be confirmed: ${reasons.join('; ')}. ${describeRaised(raised)}`;
            }
        }
    } catch (err) {
        return `${label} was not confirmed: whether it needs an order review could not be decided. ${messageOf(err)}`;
    }
}

// ─── Triggers ─────────────────────────────────────────────────────────────────────────────────────

/** The confirm-time triggers the order hits, with what they read loaded. */
async function evaluate(order: ReviewOrderInput, config: OrderReviewConfig, ctx: ApprovalTaskContext): Promise<OrderReviewHit[]> {
    if (OrderReviewExemption(scopeOf(order))) return [];
    const deal = await ResolveOrderDeal(HostOrderDealLink(), order.OrderHeaderID, ctx.User);
    const hasDeal = !!deal;
    const priced = config.Triggers.includes('PriceVariance') && !hasDeal;
    const covered = priced && order.OrderHeaderID ? await approvedConcessionLineIDs(order.OrderHeaderID, ctx) : new Set<string>();

    const lines: OrderReviewLineFacts[] = [];
    for (const line of order.Lines) {
        const isComponentOrReversal = !!line.ParentOrderLineID || !!line.ReversesOrderLineID || Number(line.Quantity ?? 0) < 0;
        let engine: number | null = null;
        let configured = true;
        if (priced && !isComponentOrReversal && !line.RenewsSubscriptionID && line.PriceStated) {
            const standing = await ResolveLinePriceStanding(line, ctx.Provider, ctx.User);
            engine = standing?.EngineUnitPrice ?? null;
            configured = !standing || standing.IsEnginePrice || standing.IsNamedListPick;
        }
        lines.push({
            LineNumber: line.LineNumber,
            IsComponentOrReversal: isComponentOrReversal,
            RenewsSubscriptionID: line.RenewsSubscriptionID ?? null,
            UnitPrice: line.UnitPrice,
            EngineUnitPrice: engine,
            IsConfiguredPrice: configured,
            PriceStated: line.PriceStated,
            HasApprovedConcession: !!line.ID && covered.has(line.ID.toLowerCase()),
            RenewalPriceEdited: line.RenewalPriceEdited,
            ServicePeriodStart: line.ServicePeriodStart,
            ServicePeriodEnd: line.ServicePeriodEnd,
        });
    }

    const netTotal = config.Triggers.includes('OverThreshold')
        ? order.OrderHeaderID
            ? await OrderNetTotal(order.OrderHeaderID, order.Lines, ctx.Provider, ctx.User)
            : order.Lines.reduce((sum, l) => sum + (l.ReversesOrderLineID ? 0 : Number(l.LineTotalNet ?? 0)), 0)
        : 0;
    const today = config.Triggers.includes('ServicePeriod') ? await BusinessDay(ctx.Provider, ctx.User) : '';

    return EvaluateOrderReviewTriggers({ HasDeal: hasDeal, NetTotal: netTotal, Today: today, Lines: lines }, config);
}

/** The saved lines an Approved Price or Scope concession is recorded against, lower-cased. */
async function approvedConcessionLineIDs(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<Set<string>> {
    const rows = await view<{ OrderLineID: string | null }>(ctx, {
        EntityName: ORDER_CONCESSION_ENTITY,
        ExtraFilter:
            `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}' AND Status = 'Approved' ` +
            `AND DeliveryForm IN ('Price', 'Scope')`,
        Fields: ['OrderLineID'],
        ResultType: 'simple',
    });
    return new Set(rows.filter((r) => !!r.OrderLineID).map((r) => String(r.OrderLineID).toLowerCase()));
}

function scopeOf(order: ReviewOrderInput): OrderReviewScopeFacts {
    return {
        Origin: order.Origin,
        ReversesOrderHeaderID: order.ReversesOrderHeaderID,
        Lines: order.Lines.filter((l) => !l.ParentOrderLineID && !l.ReversesOrderLineID).map((l) => ({
            RenewsSubscriptionID: l.RenewsSubscriptionID ?? null,
        })),
    };
}

// ─── The review task ──────────────────────────────────────────────────────────────────────────────

/**
 * The order's most recent review task and where it stands, or null when it has none (or the tasks app,
 * or the review task type, is not installed, in which case no review can exist).
 */
export async function LatestReviewTask(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<LatestReview | null> {
    if (!ctx.Provider.EntityByName(TASK_LINK_ENTITY)) return null;
    const typeID = await reviewTaskTypeID(ctx);
    if (!typeID) return null;

    const links = await view<{ TaskID: string }>(ctx, {
        EntityName: TASK_LINK_ENTITY,
        ExtraFilter: `EntityID = '${entityID(ORDER_HEADER_ENTITY, ctx)}' AND RecordID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
        Fields: ['TaskID'],
        ResultType: 'simple',
    });
    if (links.length === 0) return null;
    const tasks = await view<{ ID: string; Name: string; Status: string }>(ctx, {
        EntityName: TASK_ENTITY,
        ExtraFilter:
            `ID IN (${RequireUUIDs(links.map((l) => l.TaskID), 'TaskID').map((id) => `'${id}'`).join(', ')}) ` +
            `AND TypeID = '${RequireUUID(typeID, 'TypeID')}'`,
        Fields: ['ID', 'Name', 'Status'],
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 1,
        ResultType: 'simple',
    });
    const task = tasks[0];
    if (!task) return null;

    const facts = await reviewTaskFacts(task, ctx);
    return { Task: task, Facts: facts, Standing: DecideReviewStanding(facts) };
}

/** The task's most recent terminal decision and its Person assignees. */
async function reviewTaskFacts(task: { ID: string; Status: string }, ctx: ApprovalTaskContext): Promise<ReviewTaskFacts> {
    const taskID = RequireUUID(task.ID, 'TaskID');
    const [decisions, outcomes, assignments] = await Promise.all([
        view<{ OutcomeID: string; DecidedByPersonID: string | null }>(ctx, {
            EntityName: TASK_DECISION_ENTITY,
            ExtraFilter: `TaskID = '${taskID}'`,
            Fields: ['OutcomeID', 'DecidedByPersonID'],
            OrderBy: 'DecidedAt DESC',
            ResultType: 'simple',
        }),
        view<{ ID: string; Code: string; IsTerminal: boolean }>(ctx, {
            EntityName: TASK_DECISION_OUTCOME_ENTITY,
            Fields: ['ID', 'Code', 'IsTerminal'],
            ResultType: 'simple',
        }),
        view<{ AssigneeRecordID: string }>(ctx, {
            EntityName: TASK_ASSIGNMENT_ENTITY,
            ExtraFilter: `TaskID = '${taskID}' AND AssigneeEntityID = '${entityID(PERSON_ENTITY, ctx)}'`,
            Fields: ['AssigneeRecordID'],
            ResultType: 'simple',
        }),
    ]);
    const outcomeOf = (id: string) => outcomes.find((o) => UUIDsEqual(o.ID, id));
    const decision = decisions.find((d) => !!outcomeOf(d.OutcomeID)?.IsTerminal);
    return {
        Status: task.Status,
        DecisionOutcome: decision ? (outcomeOf(decision.OutcomeID)?.Code ?? null) : null,
        DecidedByPersonID: decision?.DecidedByPersonID ?? null,
        AssigneePersonIDs: assignments.map((a) => a.AssigneeRecordID),
    };
}

/**
 * Raise a review task for the order: decide the role, assign its active holders other than the order's
 * creator by Person, and link the order. Throws, saying what to fix, when nobody could receive it.
 */
export async function RaiseOrderReview(
    order: ReviewOrderInput,
    reasons: readonly string[],
    config: OrderReviewConfig,
    ctx: ApprovalTaskContext,
): Promise<RaisedReview> {
    if (!order.OrderHeaderID) throw new Error('An order must be saved before it can be sent for review.');
    if (!ctx.Provider.EntityByName(TASK_ENTITY)) {
        throw new Error('An order review is routed through the tasks app, and the tasks app is not installed.');
    }
    const typeID = await reviewTaskTypeID(ctx);
    if (!typeID) throw new Error(`The tasks app has no '${ORDER_REVIEW_TASK_TYPE_CODE}' task type, so no order review can be raised.`);

    const creatorUserID = await OrderCreatorUserID(order.OrderHeaderID, ctx);
    const reviewerHolders = config.ReviewerRole ? await roleHolders(config.ReviewerRole, ctx) : [];
    const routed = DecideReviewRole({
        ReviewerRole: config.ReviewerRole,
        EscalationRole: config.EscalationRole,
        CreatorHoldsReviewerRole: reviewerHolders.some((id) => UUIDsEqual(id, creatorUserID)),
    });
    if ('Refusal' in routed) throw new Error(`The review cannot be routed: ${routed.Refusal}.`);

    const holders = routed.Escalated ? await roleHolders(routed.Role, ctx) : reviewerHolders;
    const userIDs = ReviewerUserIDs(holders, creatorUserID);
    if (userIDs.length === 0) {
        throw new Error(
            `No active user other than the order's creator holds the role '${routed.Role}', so no one could review the order. ` +
                'Assign that role to a reviewer.',
        );
    }
    const persons = await ResolvePersonIDsForUsers(RequireUUIDs(userIDs, 'UserID'), ctx.Provider, ctx.User, { ActiveOnly: true });
    const personIDs = [...new Set(userIDs.map((id) => persons.get(id.toLowerCase())).filter((p): p is string => !!p))];
    const withoutPerson = userIDs.filter((id) => !persons.has(id.toLowerCase()));
    if (personIDs.length === 0) {
        throw new Error(
            `None of the active holders of the role '${routed.Role}' has an active Person linked to their user. The tasks app ` +
                "tells and lists a reviewer through that Person, so no one would see the review. Link a Person to a reviewer's user.",
        );
    }
    if (withoutPerson.length > 0) {
        LogStatus(`${LOG_PREFIX} ${withoutPerson.length} holder(s) of '${routed.Role}' have no active Person and were not assigned: ${withoutPerson.join(', ')}`);
    }

    const task = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskEntity>(TASK_ENTITY, ctx.User);
    requireSubclass(task, TASK_ENTITY);
    task.NewRecord();
    task.TypeID = typeID;
    task.Name = `${order.OrderNumber ?? 'Order'}: order review`;
    task.Description =
        `Order ${order.OrderNumber ?? ''} needs a review before it can be confirmed: ${reasons.join('; ')}. ` +
        `Approve this task to let the order confirm, or reject it with a note saying what to correct. ` +
        (routed.Escalated ? `It came to you because a holder of '${config.ReviewerRole}' created the order. ` : '') +
        `A change to the order's bill-to, company, prices or service dates after approval sends it back for review.`;
    task.Priority = 'High';
    task.Status = 'Open';
    if (!(await task.Save())) {
        throw new Error(`The review task for order ${order.OrderNumber ?? ''} could not be created: ${task.LatestResult?.CompleteMessage}`);
    }
    await CreateTaskLink(task.ID, entityID(ORDER_HEADER_ENTITY, ctx), order.OrderHeaderID, `Order ${order.OrderNumber ?? ''}`, ctx);
    const personEntityID = entityID(PERSON_ENTITY, ctx);
    for (const personID of personIDs) await CreateTaskAssignment(task.ID, personEntityID, personID, ctx);

    return { TaskID: task.ID, TaskName: task.Name, Role: routed.Role, Escalated: routed.Escalated, AssigneeCount: personIDs.length };
}

/**
 * The user who created the order, from its `MJ: Record Changes` Create row. With no such row (a host
 * that does not track the entity's changes, or an order older than the tracking), the user saving.
 */
export async function OrderCreatorUserID(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<string> {
    const headerEntity = ctx.Provider.EntityByName(ORDER_HEADER_ENTITY);
    if (!headerEntity || !ctx.Provider.EntityByName(RECORD_CHANGE_ENTITY)) return ctx.User.ID;
    const id = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const rows = await view<{ UserID: string }>(ctx, {
        EntityName: RECORD_CHANGE_ENTITY,
        ExtraFilter:
            `EntityID = '${RequireUUID(headerEntity.ID, 'EntityID')}' AND Type = 'Create' ` +
            `AND RecordID IN ('ID|${id.toUpperCase()}', 'ID|${id.toLowerCase()}')`,
        Fields: ['UserID'],
        OrderBy: 'ChangedAt',
        MaxRows: 1,
        ResultType: 'simple',
    });
    return rows[0]?.UserID ?? ctx.User.ID;
}

async function roleHolders(roleName: string, ctx: ApprovalTaskContext): Promise<string[]> {
    const roles = await view<{ ID: string }>(ctx, {
        EntityName: ROLE_ENTITY,
        ExtraFilter: `Name = '${EscapeText(roleName)}'`,
        Fields: ['ID'],
        ResultType: 'simple',
    });
    if (!roles[0]) throw new Error(`The role '${roleName}' named by the order review settings does not exist.`);
    return ActiveRoleHolderIDs(roles[0].ID, ctx);
}

async function reviewTaskTypeID(ctx: ApprovalTaskContext): Promise<string | null> {
    if (!ctx.Provider.EntityByName(TASK_TYPE_ENTITY)) return null;
    const types = await view<{ ID: string }>(ctx, {
        EntityName: TASK_TYPE_ENTITY,
        ExtraFilter: `Code = '${EscapeText(ORDER_REVIEW_TASK_TYPE_CODE)}'`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
    });
    return types[0]?.ID ?? null;
}

function describeRaised(raised: RaisedReview): string {
    return (
        `It was sent for review to ${raised.AssigneeCount} holder${raised.AssigneeCount === 1 ? '' : 's'} of '${raised.Role}'` +
        `${raised.Escalated ? ', since a holder of the reviewer role created it' : ''} (task '${raised.TaskName}'). ` +
        `Confirm it once the review is approved.`
    );
}

function entityID(name: string, ctx: ApprovalTaskContext): string {
    const entity = ctx.Provider.EntityByName(name);
    if (!entity) throw new Error(`Entity '${name}' is not in metadata.`);
    return entity.ID;
}

function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

async function view<T>(ctx: ApprovalTaskContext, params: Parameters<RunView['RunView']>[0]): Promise<T[]> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<T>({ ...params, BypassCache: true }, ctx.User);
    if (!res.Success) throw new Error(`Reading ${params.EntityName} failed: ${res.ErrorMessage}`);
    return res.Results;
}
