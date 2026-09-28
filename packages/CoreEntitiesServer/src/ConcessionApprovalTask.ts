/**
 * ConcessionApprovalTask — puts a Pending concession in front of the people who can decide it (golive #274).
 *
 * A Pending concession holds the order's confirm and its document send, and before this nothing told an
 * approver one was waiting. Now recording one raises an approval task in the tasks app.
 *
 * ONE TASK PER ORDER. `OrderHeader.ApprovalTaskID` names the order's approval task. While that task is open a
 * new Pending concession joins it; once it has closed, the next Pending concession opens a new one and the
 * order is repointed. The task links the order and every Pending concession on it.
 *
 * ASSIGNED TO THE ROLE'S HOLDERS. The tasks app has no group assignee, so the ConcessionLimit rule's role is
 * expanded here: one assignment per active user who holds it when the concession is recorded. A role with no
 * active holder is refused, for the reason a missing rule is — nobody could approve the concession.
 *
 * CLOSING. When nothing the task links is Pending any more — each concession decided on its own record, or
 * withdrawn — the task closes: Completed when any linked concession was approved, Cancelled otherwise. A
 * decision recorded on the task itself is applied by ./ConcessionApprovalListener.ts.
 *
 * Everything here runs on the caller's provider, so it commits or rolls back with the concession's own write.
 *
 * CONNECTS TO:
 *   CALLER: OrderConcessionEntityServer (record, decide, withdraw) · ConcessionApprovalListener (links)
 *   WRITES: Tasks · Task Links · Task Assignments · Order Headers (ApprovalTaskID)
 *   READS:  Task Types · MJ: User Roles · MJ: Users · Order Concessions
 */
import {
    BaseEntity,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
// Imported for its side effect: it registers the tasks entities' generated subclasses. See `requireSubclass`.
import '@mj-biz-apps/tasks-entities';
import type {
    mjBizAppsTasksTaskAssignmentEntity,
    mjBizAppsTasksTaskEntity,
    mjBizAppsTasksTaskLinkEntity,
    mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/tasks-entities';
import type { mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY } from './entity-names.js';
import { EscapeText, RequireUUID, RequireUUIDs } from './sql-guards.js';

export const TASK_ENTITY = 'MJ_BizApps_Tasks: Tasks';
export const TASK_TYPE_ENTITY = 'MJ_BizApps_Tasks: Task Types';
export const TASK_LINK_ENTITY = 'MJ_BizApps_Tasks: Task Links';
export const TASK_ASSIGNMENT_ENTITY = 'MJ_BizApps_Tasks: Task Assignments';
export const TASK_DECISION_ENTITY = 'MJ_BizApps_Tasks: Task Decisions';
export const TASK_DECISION_OUTCOME_ENTITY = 'MJ_BizApps_Tasks: Task Decision Outcomes';

/** The tasks app's seeded approval type, resolved by Code — the type its approvals inbox lists. */
export const APPROVAL_TASK_TYPE_CODE = 'APPROVAL_REQUEST';

const USER_ENTITY = 'MJ: Users';
const USER_ROLE_ENTITY = 'MJ: User Roles';

/** The provider and user every read and write here runs as. */
export interface ApprovalTaskContext {
    Provider: IMetadataProvider;
    User: UserInfo;
}

export type ConcessionDecision = 'Approved' | 'Rejected';
export type ApprovalTaskClosingStatus = 'Completed' | 'Cancelled';

/**
 * The concession status a terminal task outcome decides, or null for an outcome this app does not know.
 * Null is not "rejected": the caller leaves the concessions Pending and reports the outcome, so an outcome
 * added to the tasks app later is surfaced rather than read as either answer.
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

/**
 * How an approval task closes, given the statuses of the concessions it still links: null while any is
 * Pending, Completed when any was approved, Cancelled when all were rejected or withdrawn.
 */
export function ClosingStatusFor(statuses: readonly string[]): ApprovalTaskClosingStatus | null {
    if (statuses.includes('Pending')) return null;
    return statuses.includes('Approved') ? 'Completed' : 'Cancelled';
}

/** A task that can still take a decision. */
export function IsOpenApprovalTask(status: string): boolean {
    return status !== 'Completed' && status !== 'Cancelled';
}

/**
 * Put the order's Pending concessions in front of the holders of `roleID`: find or open the order's approval
 * task, link the order and each Pending concession, assign every active holder, and point the order at it.
 * Throws when the tasks app is absent or nobody holds the role.
 */
export async function RouteConcessionToApproval(
    orderHeaderID: string,
    roleID: string,
    ctx: ApprovalTaskContext,
): Promise<string> {
    requireTasksApp(ctx);
    const approverIDs = await ActiveRoleHolderIDs(roleID, ctx);
    if (approverIDs.length === 0) {
        throw new Error(
            'This concession is outside the requester\'s authority, and no active user holds the role the ' +
                'ConcessionLimit rule names, so no one could approve it. Assign that role to an approver.',
        );
    }

    const order = await loadOrder(orderHeaderID, ctx);
    const task = (await openTask(order.ApprovalTaskID, ctx)) ?? (await createTask(order, ctx));

    await EnsureTaskLink(task.ID, EntityIDByName(ORDER_HEADER_ENTITY, ctx), order.ID, ctx);
    const concessionEntityID = EntityIDByName(ORDER_CONCESSION_ENTITY, ctx);
    for (const concessionID of await pendingConcessionIDs(order.ID, ctx)) {
        await EnsureTaskLink(task.ID, concessionEntityID, concessionID, ctx);
    }

    const userEntityID = EntityIDByName(USER_ENTITY, ctx);
    for (const userID of approverIDs) {
        await EnsureTaskAssignment(task.ID, userEntityID, userID, ctx);
    }

    if (!UUIDsEqual(order.ApprovalTaskID, task.ID)) {
        order.ApprovalTaskID = task.ID;
        if (!(await order.Save())) {
            throw new Error(`Order ${order.OrderNumber} could not be pointed at its approval task: ${order.LatestResult?.CompleteMessage}`);
        }
    }
    return task.ID;
}

/**
 * Close the order's approval task once nothing it links is Pending. A no-op when the order has no task, or
 * its task has already closed.
 */
export async function SettleApprovalTask(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<void> {
    const order = await loadOrder(orderHeaderID, ctx);
    if (!order.ApprovalTaskID) return;
    requireTasksApp(ctx);
    const task = await openTask(order.ApprovalTaskID, ctx);
    if (!task) return;

    const closing = ClosingStatusFor(await linkedConcessionStatuses(task.ID, ctx));
    if (!closing) return;
    task.Status = closing;
    task.CompletionNotes =
        closing === 'Completed'
            ? 'Every concession on the order was decided on its own record.'
            : 'No concession on the order is awaiting approval: each was rejected or withdrawn.';
    if (!(await task.Save())) {
        throw new Error(`Approval task ${task.ID} could not be closed: ${task.LatestResult?.CompleteMessage}`);
    }
}

/** Remove a withdrawn concession's links, so no task points at a record that no longer exists. */
export async function UnlinkConcession(concessionID: string, ctx: ApprovalTaskContext): Promise<void> {
    if (!ctx.Provider.EntityByName(TASK_LINK_ENTITY)) return; // without the tasks app nothing was ever linked
    const links = await view<mjBizAppsTasksTaskLinkEntity>(ctx, {
        EntityName: TASK_LINK_ENTITY,
        ExtraFilter:
            `EntityID = '${EntityIDByName(ORDER_CONCESSION_ENTITY, ctx)}' AND RecordID = '${RequireUUID(concessionID, 'ConcessionID')}'`,
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
        ExtraFilter: `TaskID = '${RequireUUID(taskID, 'TaskID')}' AND EntityID = '${EntityIDByName(ORDER_CONCESSION_ENTITY, ctx)}'`,
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

export function EntityIDByName(name: string, ctx: ApprovalTaskContext): string {
    const entity = ctx.Provider.EntityByName(name);
    if (!entity) throw new Error(`Entity '${name}' is not in metadata.`);
    return entity.ID;
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

/** The order's approval task when it can still take a decision; null when there is none or it has closed. */
async function openTask(taskID: string | null, ctx: ApprovalTaskContext): Promise<mjBizAppsTasksTaskEntity | null> {
    if (!taskID) return null;
    const task = await ctx.Provider.GetEntityObject<mjBizAppsTasksTaskEntity>(TASK_ENTITY, ctx.User);
    requireSubclass(task, TASK_ENTITY);
    if (!(await task.Load(taskID))) return null;
    return IsOpenApprovalTask(task.Status) ? task : null;
}

async function createTask(order: mjBizAppsOrdersOrderHeaderEntity, ctx: ApprovalTaskContext): Promise<mjBizAppsTasksTaskEntity> {
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
    task.Name = `Approve concessions on order ${order.OrderNumber}`;
    task.Description =
        `One or more concessions on order ${order.OrderNumber} are outside the requester's sales authority. The ` +
        `order cannot be confirmed, and its documents cannot be sent, until each is decided. A decision on this ` +
        `task decides every concession on the order still awaiting one; to decide them separately, decide each ` +
        `on its concession record.`;
    task.Priority = 'High';
    task.Status = 'Open';
    if (!(await task.Save())) {
        throw new Error(`The approval task for order ${order.OrderNumber} could not be created: ${task.LatestResult?.CompleteMessage}`);
    }
    return task;
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

async function pendingConcessionIDs(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<string[]> {
    const rows = await view<{ ID: string }>(ctx, {
        EntityName: ORDER_CONCESSION_ENTITY,
        ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}' AND Status = 'Pending'`,
        Fields: ['ID'],
        ResultType: 'simple',
    });
    return rows.map((r) => r.ID);
}

async function linkedConcessionStatuses(taskID: string, ctx: ApprovalTaskContext): Promise<string[]> {
    const ids = await LinkedConcessionIDs(taskID, ctx);
    if (ids.length === 0) return [];
    const rows = await view<{ Status: string }>(ctx, {
        EntityName: ORDER_CONCESSION_ENTITY,
        ExtraFilter: `ID IN (${RequireUUIDs(ids, 'ConcessionID').map((id) => `'${id}'`).join(', ')})`,
        Fields: ['Status'],
        ResultType: 'simple',
    });
    return rows.map((r) => r.Status);
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
