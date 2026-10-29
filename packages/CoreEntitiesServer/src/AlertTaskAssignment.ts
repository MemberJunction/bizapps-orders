/**
 * AlertTaskAssignment — every alert Task Orders raises is assigned to a person.
 *
 * Orders raises alert Tasks when something needs a person: a checkout payment it could not book, a
 * provider subscription it could not hand over or record, an outbound delivery that was dead-lettered.
 * The tasks app notifies a person only when a task is ASSIGNED to them. Raised unassigned, an alert was a
 * row in a list nobody was told about.
 *
 * So each alert is assigned to the active holders of the role the `AlertTaskRole` setting names, through
 * the same helpers approval tasks use (`ActiveRoleHolderIDs`, `EnsureTaskAssignment`): one role for every
 * alert, the tasks app has no group assignee. Unset, alerts stay unassigned, as before.
 *
 * NEVER FAILS THE CALLER. An alert is raised because something already went wrong; an assignment that
 * cannot be made is logged, and the Task stays raised.
 *
 * Example: AIDP names the role "Sidecar Support"; Sess and Ethan hold it. A delivery to the Learning Hub
 * that fails for 24 hours raises a Task assigned to both, and each sees it with an in-app notification.
 */
import { LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { ActiveRoleHolderIDs, EnsureTaskAssignment } from './ConcessionApprovalTask.js';
import { OrdersSettings } from './OrdersSettings.js';
import { EscapeText } from './sql-guards.js';

const ROLE_ENTITY = 'MJ: Roles';
const USER_ENTITY = 'MJ: Users';

/** What happened, for the caller's log and tests. */
export type AlertTaskAssignmentOutcome =
    | { Assigned: number }
    | { Skipped: 'NoRoleConfigured' | 'RoleNotFound' | 'NoActiveHolders' }
    | { Failed: string };

/**
 * Assign an alert Task to the active holders of the `AlertTaskRole` role. Idempotent: a holder already
 * assigned is not assigned twice. Never throws.
 */
export async function AssignAlertTask(taskID: string, provider: IMetadataProvider, user: UserInfo): Promise<AlertTaskAssignmentOutcome> {
    try {
        await OrdersSettings.Load(provider, user);
        const roleName = OrdersSettings.AlertTaskRole;
        if (!roleName) return { Skipped: 'NoRoleConfigured' };

        const rv = new RunView(provider as unknown as IRunViewProvider);
        const roles = await rv.RunView<{ ID: string }>(
            { EntityName: ROLE_ENTITY, ExtraFilter: `Name = '${EscapeText(roleName)}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
            user,
        );
        const roleID = roles.Success ? roles.Results?.[0]?.ID : undefined;
        if (!roleID) {
            LogError(`[BizAppsOrders] Alert Task ${taskID}: the alert role '${roleName}' (Orders setting AlertTaskRole) does not exist, so nobody was assigned.`);
            return { Skipped: 'RoleNotFound' };
        }
        const ctx = { Provider: provider, User: user };
        const holders = await ActiveRoleHolderIDs(roleID, ctx);
        if (holders.length === 0) {
            LogError(`[BizAppsOrders] Alert Task ${taskID}: the alert role '${roleName}' has no active holder, so nobody was assigned.`);
            return { Skipped: 'NoActiveHolders' };
        }
        const userEntity = provider.EntityByName(USER_ENTITY);
        if (!userEntity) return { Failed: `Entity '${USER_ENTITY}' is not in metadata.` };
        for (const holder of holders) await EnsureTaskAssignment(taskID, userEntity.ID, holder, ctx);
        return { Assigned: holders.length };
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        LogError(`[BizAppsOrders] Alert Task ${taskID} could not be assigned: ${reason}`);
        return { Failed: reason };
    }
}
