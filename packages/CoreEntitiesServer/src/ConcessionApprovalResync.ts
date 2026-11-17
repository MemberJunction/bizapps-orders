/**
 * Keep open concession approval tasks assigned to the approving role as it is now (#844).
 *
 * An approval task is assigned to the role's holders when the concession is recorded. Role membership
 * changes afterwards were never picked up: a user given the role was not told, and a user removed kept
 * being assigned and notified. This pass walks the open approval tasks, and for each one whose linked
 * concession is still Pending, re-computes its approvers and adds or removes assignments
 * (`SyncApprovalTaskAssignees`).
 *
 * A pass rather than a hook on `MJ: User Roles`: that is an MJ core entity, which an app should not
 * subclass, and a role can also change by a user being deactivated or losing their person record. A
 * pass sees all of these. It runs on the scheduled outbound dispatch's quarter-hour sweep, beside the
 * alert-task assignment sweep, so a change is picked up within 15 minutes.
 *
 * READS:  Tasks · Task Types · Task Links · Order Concessions
 * WRITES: Task Assignments · Task Activities (through ./ConcessionApprovalTask.ts)
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { LogError, LogStatus, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import {
    APPROVAL_TASK_TYPE_CODE,
    OPEN_TASK_SQL,
    SyncApprovalTaskAssignees,
    TASK_ENTITY,
    TASK_LINK_ENTITY,
    TASK_TYPE_ENTITY,
    type ApprovalTaskContext,
} from './ConcessionApprovalTask.js';
import type { OrderConcessionEntityServer } from './OrderConcessionEntityServer.js';
import { ORDER_CONCESSION_ENTITY } from './entity-names.js';
import { EscapeText, RequireUUID } from './sql-guards.js';

/** Cap on open approval tasks re-synced in one pass; the oldest are taken first. */
export const APPROVAL_RESYNC_MAX_TASKS = 100;

export interface ApprovalResyncResult {
    Checked: number;
    Changed: number;
    Failed: number;
}

/**
 * Re-sync the assignees of up to `maxTasks` open concession approval tasks. A task that fails is logged
 * and skipped, so one bad task never stops the others or the pass that called this.
 */
export async function ResyncConcessionApprovalAssignees(
    provider: IMetadataProvider,
    user: UserInfo,
    maxTasks: number = APPROVAL_RESYNC_MAX_TASKS,
): Promise<ApprovalResyncResult> {
    const ctx: ApprovalTaskContext = { Provider: provider, User: user };
    const out: ApprovalResyncResult = { Checked: 0, Changed: 0, Failed: 0 };
    const rv = new RunView(provider as unknown as IRunViewProvider);

    const types = await rv.RunView<{ ID: string }>(
        { EntityName: TASK_TYPE_ENTITY, ExtraFilter: `Code = '${EscapeText(APPROVAL_TASK_TYPE_CODE)}'`, Fields: ['ID'], ResultType: 'simple' },
        user,
    );
    const typeID = types.Success ? types.Results[0]?.ID : undefined;
    if (!typeID) return out; // The tasks app or the type is not installed: nothing was ever raised.

    const tasks = await rv.RunView<{ ID: string }>(
        {
            EntityName: TASK_ENTITY,
            ExtraFilter: `TypeID = '${RequireUUID(typeID, 'TypeID')}' AND ${OPEN_TASK_SQL}`,
            Fields: ['ID'],
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: maxTasks,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!tasks.Success) throw new Error(`Reading open approval tasks failed: ${tasks.ErrorMessage}`);
    if (tasks.Results.length === 0) return out;

    const concessionEntityID = provider.Entities.find((e) => e.Name === ORDER_CONCESSION_ENTITY)?.ID;
    if (!concessionEntityID) throw new Error(`Entity '${ORDER_CONCESSION_ENTITY}' is not in metadata.`);
    const ids = tasks.Results.map((t) => `'${RequireUUID(t.ID, 'TaskID')}'`).join(', ');
    const links = await rv.RunView<{ TaskID: string; RecordID: string }>(
        {
            EntityName: TASK_LINK_ENTITY,
            ExtraFilter: `TaskID IN (${ids}) AND EntityID = '${RequireUUID(concessionEntityID, 'EntityID')}'`,
            Fields: ['TaskID', 'RecordID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!links.Success) throw new Error(`Reading approval task links failed: ${links.ErrorMessage}`);

    for (const link of links.Results) {
        out.Checked++;
        try {
            const concession = await provider.GetEntityObject<OrderConcessionEntityServer>(ORDER_CONCESSION_ENTITY, user);
            if (!(await concession.Load(RequireUUID(link.RecordID, 'RecordID')))) continue;
            if (concession.Status !== 'Pending') continue; // Deciding it closes the task; nothing to assign.
            const roleID = await concession.ApprovingRoleID(user);
            if (!roleID) continue;
            const sync = await SyncApprovalTaskAssignees(
                link.TaskID,
                {
                    ID: concession.ID,
                    OrderHeaderID: concession.OrderHeaderID,
                    RequestedByUserID: concession.RequestedByUserID,
                    SalesRuleID: concession.SalesRuleID,
                },
                roleID,
                ctx,
            );
            if (sync.Added.length || sync.Removed.length) {
                out.Changed++;
                LogStatus(
                    `[BizAppsOrders] Concession approval: task ${link.TaskID} re-assigned to the role's current holders ` +
                        `(+${sync.Added.length}, -${sync.Removed.length}).`,
                );
            }
        } catch (err) {
            out.Failed++;
            LogError(
                `[BizAppsOrders] Concession approval: task ${link.TaskID} could not be re-assigned: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
    return out;
}
