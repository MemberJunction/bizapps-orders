/**
 * ConcessionApprovalTask — puts a Pending concession in front of the people who can decide it (golive #274).
 *
 * A Pending concession holds the order's confirm and its document send, and before this nothing told an
 * approver one was waiting. Now recording one raises an approval task in the tasks app.
 *
 * ONE TASK PER CONCESSION. Each Pending concession gets its own task, titled with the order, the concession
 * and its amount, and linking the order and that concession. A decision on the task decides only that
 * concession, so an approver never decides one the task did not show. `OrderHeader.ApprovalTaskID` points
 * at the order's most recent open approval task.
 *
 * ASSIGNED TO THE ROLE'S HOLDERS, BY PERSON. The tasks app has no group assignee, and it notifies and lists
 * an assignee through a `MJ_BizApps_Common: People` record (the user bound to it is the user told). So the
 * ConcessionLimit rule's role is expanded here: each active holder other than the requester is assigned
 * through the active person record linked to their user (./person-user-link.ts: the user's People link,
 * else the deprecated `People.LinkedUserID`). A holder with no such record is skipped and
 * logged; when no holder is left, recording is refused, for the reason a missing rule is — nobody would be
 * told the concession is waiting.
 *
 * CLOSING. Deciding a concession on its own record closes its open task: Completed when approved,
 * Cancelled when rejected. Withdrawing it cancels its task and removes its link. A decision recorded on the
 * task itself is applied by ./ConcessionApprovalListener.ts, and the tasks app closes that task.
 *
 * Recording, deciding and withdrawing run on the caller's provider, so the task work commits or rolls back
 * with the concession's own write.
 *
 * CONNECTS TO:
 *   CALLER: OrderConcessionEntityServer (record, decide, withdraw) · ConcessionApprovalListener (decide on task)
 *   WRITES: Tasks · Task Links · Task Assignments · Task Activities · Order Headers (ApprovalTaskID)
 *   READS:  Task Types · MJ: User Roles · MJ: Users · MJ_BizApps_Common: People
 */
import {
    BaseEntity,
    LogStatus,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
// Imported for its side effect: it registers the tasks entities' generated subclasses. See `requireSubclass`.
import '@mj-biz-apps/tasks-entities';
import type {
    mjBizAppsTasksTaskActivityEntity,
    mjBizAppsTasksTaskAssignmentEntity,
    mjBizAppsTasksTaskEntity,
    mjBizAppsTasksTaskLinkEntity,
    mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/tasks-entities';
import type { mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY } from './entity-names.js';
import { ResolvePersonIDsForUsers } from './person-user-link.js';
import { EscapeText, RequireUUID, RequireUUIDs } from './sql-guards.js';

export const TASK_ENTITY = 'MJ_BizApps_Tasks: Tasks';
export const TASK_TYPE_ENTITY = 'MJ_BizApps_Tasks: Task Types';
export const TASK_LINK_ENTITY = 'MJ_BizApps_Tasks: Task Links';
export const TASK_ASSIGNMENT_ENTITY = 'MJ_BizApps_Tasks: Task Assignments';
export const TASK_ACTIVITY_ENTITY = 'MJ_BizApps_Tasks: Task Activities';
export const TASK_DECISION_ENTITY = 'MJ_BizApps_Tasks: Task Decisions';
export const TASK_DECISION_OUTCOME_ENTITY = 'MJ_BizApps_Tasks: Task Decision Outcomes';

/** The entity the tasks app resolves an assignee through, for its notices and its approvals inbox. */
export const PERSON_ENTITY = 'MJ_BizApps_Common: People';

/** The tasks app's seeded approval type, resolved by Code — the type its approvals inbox lists. */
export const APPROVAL_TASK_TYPE_CODE = 'APPROVAL_REQUEST';

const USER_ENTITY = 'MJ: Users';
const USER_ROLE_ENTITY = 'MJ: User Roles';
const LOG_PREFIX = '[BizAppsOrders] Concession approval:';

/** The provider and user every read and write here runs as. */
export interface ApprovalTaskContext {
    Provider: IMetadataProvider;
    User: UserInfo;
}

/** The concession an approval task is raised for. */
export interface ConcessionForApproval {
    ID: string;
    OrderHeaderID: string;
    RequestedByUserID: string;
}

export type ConcessionDecision = 'Approved' | 'Rejected';
export type ConcessionTaskClosing = ConcessionDecision | 'Withdrawn';

/**
 * The concession status a terminal task outcome decides, or null for an outcome this app does not know.
 * Null is not "rejected": the caller leaves the concession Pending and puts it back in front of its
 * approvers, so an outcome added to the tasks app later is surfaced rather than read as either answer.
 */
export function ConcessionStatusForOutcome(code: string): ConcessionDecision | null {
    switch (code) {
        case 'Approved':
        case 'ApprovedWithConditions':
            return 'Approved';
        case 'Rejected':
            return 'Rejected';
        default:
            return null;
    }
}

/** A task that can still take a decision. */
export function IsOpenApprovalTask(status: string): boolean {
    return status !== 'Completed' && status !== 'Cancelled';
}

/** What a concession looks like to its approver, for the task title: "25% discount, 3,000.00". */
export interface ConcessionSummaryFacts {
    DeliveryForm: string;
    ComputedValue: number;
    /** The fraction off price (0.25 for 25%), when the concession reduces a price. */
    Percent?: number | null;
    AddedDays?: number | null;
    AddedQuantity?: number | null;
}

/**
 * The concession and its amount, as the approval task names them. The amount carries no currency symbol:
 * orders' tables are single-currency and hold no currency column.
 */
export function ConcessionSummary(facts: ConcessionSummaryFacts): string {
    const amount = FormatAmount(facts.ComputedValue);
    switch (facts.DeliveryForm) {
        case 'Price':
            return facts.Percent != null ? `${FormatPercent(facts.Percent)} discount, ${amount}` : `price concession, ${amount}`;
        case 'Scope':
            return facts.Percent != null ? `${FormatPercent(facts.Percent)} scope concession, ${amount}` : `scope concession, ${amount}`;
        case 'Duration': {
            const days = Number(facts.AddedDays ?? 0);
            return `${days}-day extension, ${amount}`;
        }
        case 'Seats': {
            const seats = Number(facts.AddedQuantity ?? 0);
            return `${seats} added seat${seats === 1 ? '' : 's'}, ${amount}`;
        }
        case 'Terms': {
            // Valued in days to payment, not currency: AddedDays holds the change.
            const days = Number(facts.AddedDays ?? 0);
            return `payment terms ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days < 0 ? 'sooner' : 'later'}`;
        }
        default:
            return `${facts.DeliveryForm} concession, ${amount}`;
    }
}

/** The approval task's title: the order, the concession and its amount. */
export function ApprovalTaskName(orderNumber: string, summary: string): string {
    return `${orderNumber}: ${summary}`;
}

function FormatAmount(value: number): string {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FormatPercent(fraction: number): string {
    return `${Number((Number(fraction) * 100).toFixed(2))}%`;
}

/** A role holder, and the person record the tasks app would reach them through (null when there is none). */
export interface RoleHolder {
    UserID: string;
    PersonID: string | null;
}

/**
 * Who an approval task is assigned to: each role holder other than the requester, through their person
 * record. Holders with no person record are returned separately so the caller can report them.
 */
export function ApproverAssignees(
    holders: readonly RoleHolder[],
    requesterUserID: string,
): { PersonIDs: string[]; WithoutPerson: string[] } {
    const others = holders.filter((h) => !UUIDsEqual(h.UserID, requesterUserID));
    const personIDs: string[] = [];
    for (const h of others) {
        if (h.PersonID && !personIDs.some((id) => UUIDsEqual(id, h.PersonID))) personIDs.push(h.PersonID);
    }
    return { PersonIDs: personIDs, WithoutPerson: others.filter((h) => !h.PersonID).map((h) => h.UserID) };
}

/**
 * Raise an approval task for one Pending concession: assign the role's holders by person, link the order
 * and the concession, and point the order at the task. Throws when the tasks app is absent or no one could
 * be told. Returns the task's ID.
 */
export async function RouteConcessionToApproval(
    concession: ConcessionForApproval,
    roleID: string,
    summary: string,
    ctx: ApprovalTaskContext,
): Promise<string> {
    requireTasksApp(ctx);
    const order = await loadOrder(concession.OrderHeaderID, ctx);
    return raiseTask(concession, roleID, ApprovalTaskName(order.OrderNumber, summary), summary, null, order, ctx);
}

/**
 * Put a concession whose task decision it refused back in front of its approvers: a fresh task with the
 * refused task's title and the reason, the order pointed at it, and the reason recorded on the refused
 * task. Returns the new task's ID.
 *
 * A fresh task rather than reopening the refused one: the tasks app closes that task after the decision is
 * saved, on its own schedule, and a reopen would race it.
 */
export async function RaiseConcessionApprovalAgain(
    concession: ConcessionForApproval,
    roleID: string,
    refusedTaskID: string,
    reason: string,
    ctx: ApprovalTaskContext,
): Promise<string> {
    requireTasksApp(ctx);
    const refused = await loadTask(refusedTaskID, ctx);
    const order = await loadOrder(concession.OrderHeaderID, ctx);
    const summary = linkDescriptionOf(refused.Name, order.OrderNumber);
    const newTaskID = await raiseTask(concession, roleID, refused.Name, summary, reason, order, ctx);
    await recordActivity(
        refusedTaskID,
        `The decision was not applied to the concession, which is still awaiting approval: ${reason} ` +
            `A new approval task was raised for it.`,
        ctx,
    );
    return newTaskID;
}

/**
 * Close a concession's open approval task once it is decided on its own record or withdrawn: Completed
 * when approved, Cancelled otherwise. The order moves on to its most recent other open task, unless
 * `releaseOrder` is false: a draft-line removal runs inside the order's own save, where a second save of
 * the same header would race it, so there the order keeps its pointer.
 */
export async function CloseConcessionTasks(
    concessionID: string,
    orderHeaderID: string,
    closing: ConcessionTaskClosing,
    ctx: ApprovalTaskContext,
    releaseOrder = true,
): Promise<void> {
    if (!ctx.Provider.EntityByName(TASK_LINK_ENTITY)) return; // without the tasks app nothing was ever raised
    const closed: string[] = [];
    for (const taskID of await taskIDsLinking(ORDER_CONCESSION_ENTITY, concessionID, ctx)) {
        const task = await loadTask(taskID, ctx);
        if (!IsOpenApprovalTask(task.Status)) continue;
        task.Status = closing === 'Approved' ? 'Completed' : 'Cancelled';
        task.CompletionNotes =
            closing === 'Withdrawn'
                ? 'The concession was withdrawn.'
                : `The concession was ${closing.toLowerCase()} on its own record.`;
        if (!(await task.Save())) {
            throw new Error(`Approval task ${task.ID} could not be closed: ${task.LatestResult?.CompleteMessage}`);
        }
        closed.push(task.ID);
    }
    if (releaseOrder && closed.length > 0) await ReleaseOrderFromTasks(orderHeaderID, closed, ctx);
}

/**
 * When the order points at one of `taskIDs`, point it at its most recent other open approval task. With
 * none open it keeps pointing at the last one.
 */
export async function ReleaseOrderFromTasks(orderHeaderID: string, taskIDs: readonly string[], ctx: ApprovalTaskContext): Promise<void> {
    const order = await loadOrder(orderHeaderID, ctx);
    if (!order.ApprovalTaskID || !taskIDs.some((id) => UUIDsEqual(id, order.ApprovalTaskID))) return;

    const candidates = (await taskIDsLinking(ORDER_HEADER_ENTITY, order.ID, ctx)).filter(
        (id) => !taskIDs.some((leaving) => UUIDsEqual(leaving, id)),
    );
    if (candidates.length === 0) return;
    const open = await view<{ ID: string }>(ctx, {
        EntityName: TASK_ENTITY,
        ExtraFilter:
            `ID IN (${RequireUUIDs(candidates, 'TaskID').map((id) => `'${id}'`).join(', ')}) ` +
            `AND Status NOT IN ('Completed', 'Cancelled')`,
        Fields: ['ID'],
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 1,
        ResultType: 'simple',
    });
    if (!open[0]) return;
    order.ApprovalTaskID = open[0].ID;
    if (!(await order.Save())) {
        throw new Error(`Order ${order.OrderNumber} could not be pointed at its open approval task: ${order.LatestResult?.CompleteMessage}`);
    }
}

/** Remove a withdrawn concession's links, so no task points at a record that no longer exists. */
export async function UnlinkConcession(concessionID: string, ctx: ApprovalTaskContext): Promise<void> {
    if (!ctx.Provider.EntityByName(TASK_LINK_ENTITY)) return; // without the tasks app nothing was ever linked
    const links = await view<mjBizAppsTasksTaskLinkEntity>(ctx, {
        EntityName: TASK_LINK_ENTITY,
        ExtraFilter:
            `EntityID = '${entityID(ORDER_CONCESSION_ENTITY, ctx)}' AND RecordID = '${RequireUUID(concessionID, 'ConcessionID')}'`,
        ResultType: 'entity_object',
    });
    for (const link of links) {
        if (!(await link.Delete())) {
            throw new Error(`The approval-task link for concession ${concessionID} could not be removed: ${link.LatestResult?.CompleteMessage}`);
        }
    }
}

/** The IDs of the concessions an approval task links. */
export async function LinkedConcessionIDs(taskID: string, ctx: ApprovalTaskContext): Promise<string[]> {
    const links = await view<{ RecordID: string }>(ctx, {
        EntityName: TASK_LINK_ENTITY,
        ExtraFilter: `TaskID = '${RequireUUID(taskID, 'TaskID')}' AND EntityID = '${entityID(ORDER_CONCESSION_ENTITY, ctx)}'`,
        Fields: ['RecordID'],
        ResultType: 'simple',
    });
    return links.map((l) => l.RecordID);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireTasksApp(ctx: ApprovalTaskContext): void {
    if (!ctx.Provider.EntityByName(TASK_ENTITY)) {
        throw new Error(
            'A concession awaiting approval is routed to its approvers through the tasks app, and the tasks app ' +
                'is not installed, so no one would be told it is waiting.',
        );
    }
}

function entityID(name: string, ctx: ApprovalTaskContext): string {
    const entity = ctx.Provider.EntityByName(name);
    if (!entity) throw new Error(`Entity '${name}' is not in metadata.`);
    return entity.ID;
}

async function raiseTask(
    concession: ConcessionForApproval,
    roleID: string,
    name: string,
    linkDescription: string,
    refusal: string | null,
    order: mjBizAppsOrdersOrderHeaderEntity,
    ctx: ApprovalTaskContext,
): Promise<string> {
    const approverPersonIDs = await approverPersons(roleID, concession.RequestedByUserID, ctx);
    const task = await createTask(order, name, refusal, ctx);

    await createLink(task.ID, entityID(ORDER_HEADER_ENTITY, ctx), order.ID, `Order ${order.OrderNumber}`, ctx);
    await createLink(task.ID, entityID(ORDER_CONCESSION_ENTITY, ctx), concession.ID, linkDescription, ctx);

    const personEntityID = entityID(PERSON_ENTITY, ctx);
    for (const personID of approverPersonIDs) {
        await createAssignment(task.ID, personEntityID, personID, ctx);
    }

    order.ApprovalTaskID = task.ID;
    if (!(await order.Save())) {
        throw new Error(`Order ${order.OrderNumber} could not be pointed at its approval task: ${order.LatestResult?.CompleteMessage}`);
    }
    return task.ID;
}

/**
 * The person records to assign: one per active holder of the role other than the requester, through the
 * active person linked to their user. Throws when that leaves no one.
 */
async function approverPersons(roleID: string, requesterUserID: string, ctx: ApprovalTaskContext): Promise<string[]> {
    const holderIDs = await ActiveRoleHolderIDs(roleID, ctx);
    const others = holderIDs.filter((id) => !UUIDsEqual(id, requesterUserID));
    if (others.length === 0) {
        throw new Error(
            'This concession is outside the requester\'s authority, and no active user other than the requester ' +
                'holds the role the ConcessionLimit rule names, so no one could approve it. Assign that role to an approver.',
        );
    }

    const persons = await ResolvePersonIDsForUsers(RequireUUIDs(others, 'UserID'), ctx.Provider, ctx.User, { ActiveOnly: true });
    const holders: RoleHolder[] = others.map((userID) => ({
        UserID: userID,
        PersonID: persons.get(userID.toLowerCase()) ?? null,
    }));
    const { PersonIDs, WithoutPerson } = ApproverAssignees(holders, requesterUserID);
    if (PersonIDs.length === 0) {
        throw new Error(
            'This concession is outside the requester\'s authority, and none of the active holders of the role the ' +
                'ConcessionLimit rule names has an active person record linked to their user. The tasks app tells ' +
                'and lists an approver through that person record, so no one would be told the concession is ' +
                'waiting. Link a person record to an approver\'s user.',
        );
    }
    if (WithoutPerson.length > 0) {
        LogStatus(
            `${LOG_PREFIX} ${WithoutPerson.length} holder(s) of role ${roleID} have no active person record linked ` +
                `to their user and were not assigned the approval task: ${WithoutPerson.join(', ')}`,
        );
    }
    return PersonIDs;
}

/** Every active user holding the role, by name order. The tasks app has no group assignee, so a role is expanded to these. */
export async function ActiveRoleHolderIDs(roleID: string, ctx: ApprovalTaskContext): Promise<string[]> {
    const holders = await view<{ UserID: string }>(ctx, {
        EntityName: USER_ROLE_ENTITY,
        ExtraFilter: `RoleID = '${RequireUUID(roleID, 'RoleID')}'`,
        Fields: ['UserID'],
        ResultType: 'simple',
    });
    if (holders.length === 0) return [];
    const ids = RequireUUIDs(holders.map((h) => h.UserID), 'UserID');
    const active = await view<{ ID: string }>(ctx, {
        EntityName: USER_ENTITY,
        ExtraFilter: `IsActive = 1 AND ID IN (${ids.map((id) => `'${id}'`).join(', ')})`,
        Fields: ['ID'],
        OrderBy: 'Name',
        ResultType: 'simple',
    });
    return active.map((u) => u.ID);
}

/** The IDs of the tasks that link a record. */
async function taskIDsLinking(entityName: string, recordID: string, ctx: ApprovalTaskContext): Promise<string[]> {
    const links = await view<{ TaskID: string }>(ctx, {
        EntityName: TASK_LINK_ENTITY,
        ExtraFilter: `EntityID = '${entityID(entityName, ctx)}' AND RecordID = '${RequireUUID(recordID, 'RecordID')}'`,
        Fields: ['TaskID'],
        ResultType: 'simple',
    });
    return links.map((l) => l.TaskID);
}

async function loadTask(taskID: string, ctx: ApprovalTaskContext): Promise<mjBizAppsTasksTaskEntity> {
    const task = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskEntity>(TASK_ENTITY, ctx.User);
    requireSubclass(task, TASK_ENTITY);
    if (!(await task.Load(RequireUUID(taskID, 'TaskID')))) throw new Error(`Approval task ${taskID} was not found.`);
    return task;
}

async function createTask(
    order: mjBizAppsOrdersOrderHeaderEntity,
    name: string,
    refusal: string | null,
    ctx: ApprovalTaskContext,
): Promise<mjBizAppsTasksTaskEntity> {
    const types = await view<mjBizAppsTasksTaskTypeEntity>(ctx, {
        EntityName: TASK_TYPE_ENTITY,
        ExtraFilter: `Code = '${EscapeText(APPROVAL_TASK_TYPE_CODE)}'`,
        ResultType: 'entity_object',
        MaxRows: 1,
    });
    const typeID = types[0]?.ID;
    if (!typeID) throw new Error(`The tasks app has no '${APPROVAL_TASK_TYPE_CODE}' task type, so no approval task can be raised.`);

    const task = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskEntity>(TASK_ENTITY, ctx.User);
    requireSubclass(task, TASK_ENTITY);
    task.NewRecord();
    task.TypeID = typeID;
    task.Name = name;
    task.Description =
        (refusal ? `A decision recorded on this concession's previous approval task was not applied: ${refusal} ` : '') +
        `This concession on order ${order.OrderNumber} is outside the requester's sales authority. The order ` +
        `cannot be confirmed, and its documents cannot be sent, until it is decided. A decision on this task ` +
        `decides this concession only.`;
    task.Priority = 'High';
    task.Status = 'Open';
    if (!(await task.Save())) {
        throw new Error(`The approval task for order ${order.OrderNumber} could not be created: ${task.LatestResult?.CompleteMessage}`);
    }
    return task;
}

async function createLink(
    taskID: string,
    linkEntityID: string,
    recordID: string,
    description: string,
    ctx: ApprovalTaskContext,
): Promise<void> {
    const link = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskLinkEntity>(TASK_LINK_ENTITY, ctx.User);
    requireSubclass(link, TASK_LINK_ENTITY);
    link.NewRecord();
    link.TaskID = taskID;
    link.EntityID = linkEntityID;
    link.RecordID = recordID;
    link.Description = description;
    if (!(await link.Save())) {
        throw new Error(`Approval task ${taskID} could not be linked to record ${recordID}: ${link.LatestResult?.CompleteMessage}`);
    }
}

async function createAssignment(taskID: string, personEntityID: string, personID: string, ctx: ApprovalTaskContext): Promise<void> {
    const assignment = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskAssignmentEntity>(TASK_ASSIGNMENT_ENTITY, ctx.User);
    requireSubclass(assignment, TASK_ASSIGNMENT_ENTITY);
    assignment.NewRecord();
    assignment.TaskID = taskID;
    assignment.AssigneeEntityID = personEntityID;
    assignment.AssigneeRecordID = personID;
    assignment.Status = 'Pending';
    assignment.AssignedAt = new Date();
    if (!(await assignment.Save())) {
        throw new Error(`Approval task ${taskID} could not be assigned to person ${personID}: ${assignment.LatestResult?.CompleteMessage}`);
    }
}

export async function EnsureTaskLink(taskID: string, linkEntityID: string, recordID: string, ctx: ApprovalTaskContext): Promise<void> {
    const existing = await view<{ ID: string }>(ctx, {
        EntityName: TASK_LINK_ENTITY,
        ExtraFilter:
            `TaskID = '${RequireUUID(taskID, 'TaskID')}' AND EntityID = '${RequireUUID(linkEntityID, 'EntityID')}' ` +
            `AND RecordID = '${RequireUUID(recordID, 'RecordID')}'`,
        Fields: ['ID'],
        ResultType: 'simple',
    });
    if (existing.length > 0) return;

    const link = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskLinkEntity>(TASK_LINK_ENTITY, ctx.User);
    requireSubclass(link, TASK_LINK_ENTITY);
    link.NewRecord();
    link.TaskID = taskID;
    link.EntityID = linkEntityID;
    link.RecordID = recordID;
    if (!(await link.Save())) {
        throw new Error(`Approval task ${taskID} could not be linked to record ${recordID}: ${link.LatestResult?.CompleteMessage}`);
    }
}

export async function EnsureTaskAssignment(taskID: string, userEntityID: string, userID: string, ctx: ApprovalTaskContext): Promise<void> {
    const existing = await view<{ ID: string }>(ctx, {
        EntityName: TASK_ASSIGNMENT_ENTITY,
        ExtraFilter:
            `TaskID = '${RequireUUID(taskID, 'TaskID')}' AND AssigneeEntityID = '${RequireUUID(userEntityID, 'EntityID')}' ` +
            `AND AssigneeRecordID = '${RequireUUID(userID, 'UserID')}'`,
        Fields: ['ID'],
        ResultType: 'simple',
    });
    if (existing.length > 0) return;

    const assignment = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskAssignmentEntity>(TASK_ASSIGNMENT_ENTITY, ctx.User);
    requireSubclass(assignment, TASK_ASSIGNMENT_ENTITY);
    assignment.NewRecord();
    assignment.TaskID = taskID;
    assignment.AssigneeEntityID = userEntityID;
    assignment.AssigneeRecordID = userID;
    assignment.Status = 'Pending';
    assignment.AssignedAt = new Date();
    if (!(await assignment.Save())) {
        throw new Error(`Approval task ${taskID} could not be assigned to user ${userID}: ${assignment.LatestResult?.CompleteMessage}`);
    }
}

/** A note on a task's activity feed, where the tasks app shows it with the task. */
async function recordActivity(taskID: string, description: string, ctx: ApprovalTaskContext): Promise<void> {
    const activity = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskActivityEntity>(TASK_ACTIVITY_ENTITY, ctx.User);
    requireSubclass(activity, TASK_ACTIVITY_ENTITY);
    activity.NewRecord();
    activity.TaskID = taskID;
    activity.ActivityType = 'StatusChange';
    activity.Description = description;
    if (!(await activity.Save())) {
        throw new Error(`The refusal could not be recorded on approval task ${taskID}: ${activity.LatestResult?.CompleteMessage}`);
    }
}

/** The concession part of a task title ("25% discount, 3,000.00"), for the new task's concession link. */
function linkDescriptionOf(taskName: string, orderNumber: string): string {
    const prefix = `${orderNumber}: `;
    return taskName.startsWith(prefix) ? taskName.slice(prefix.length) : taskName;
}

async function loadOrder(id: string, ctx: ApprovalTaskContext): Promise<mjBizAppsOrdersOrderHeaderEntity> {
    const order = await ctx.Provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    if (!(await order.Load(RequireUUID(id, 'OrderHeaderID')))) throw new Error(`Order ${id} was not found.`);
    return order;
}

/**
 * The tasks entities are written through their typed subclasses. With no subclass registered,
 * `GetEntityObject` hands back a bare BaseEntity whose typed "properties" are plain fields that never reach
 * the row — so refuse that rather than save an empty record.
 *
 * This asks "is it a subclass at all", not `instanceof` one particular class: a host that loads the tasks
 * app registers its own copy of the same generated classes, and whichever copy wins the class factory is
 * the right one to write through.
 */
export function requireSubclass(entity: BaseEntity, name: string): void {
    if (Object.getPrototypeOf(entity) === BaseEntity.prototype) {
        throw new Error(`'${name}' has no registered entity subclass; @mj-biz-apps/tasks-entities is not loaded.`);
    }
}

async function view<T>(
    ctx: ApprovalTaskContext,
    params: Parameters<RunView['RunView']>[0],
): Promise<T[]> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const res = await rv.RunView<T>({ ...params, BypassCache: true }, ctx.User);
    if (!res.Success) throw new Error(`Reading ${params.EntityName} failed: ${res.ErrorMessage}`);
    return res.Results;
}
