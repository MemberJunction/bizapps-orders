/**
 * AlertTaskAssignment — every alert Task Orders raises is assigned to a person.
 *
 * Orders raises alert Tasks when something needs a person: a settled checkout payment it could not book
 * onto its order, a settled payment with no order at all, an outbound delivery that was dead-lettered.
 * The tasks app notifies a person only when a task is ASSIGNED to them. Raised unassigned, an alert was a
 * row in a list nobody was told about.
 *
 * So each alert is assigned to the active holders of the role the `AlertTaskRole` setting names, through
 * the same helpers approval tasks use (`ActiveRoleHolderIDs`, `EnsureTaskAssignment`): one role for every
 * alert, the tasks app has no group assignee. Unset, alerts stay unassigned, as before.
 *
 * NEVER FAILS THE CALLER. An alert is raised because something already went wrong; an assignment that
 * cannot be made is logged, and the Task stays raised. Each outbound dispatch pass then assigns the open
 * alerts nobody holds (`AssignUnassignedAlertTasks`), so a first failure is retried, not final.
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
    | { Assigned: number; Unassignable?: number }
    | { Skipped: 'NoRoleConfigured' | 'RoleNotFound' | 'NoActiveHolders' }
    | { Failed: string };

/**
 * The start of every alert Task name Orders raises. The sweep below finds alerts by these, so a new alert
 * kind names itself here and in its raiser (`checkoutCaptureAlert.ts`) from the same constant.
 */
export const ORDERS_ALERT_TASK_PREFIX = {
    CheckoutCaptureNotBooked: 'Checkout capture not booked: ',
    CheckoutSettledNoOrder: 'Checkout payment settled with no order: ',
    OutboundDeliveryFailed: 'Outbound delivery failed: ',
    // A gateway subscription Orders could not create, record or cancel (#972), and its urgent form.
    GatewaySubscription: 'Gateway subscription needs attention: ',
    GatewaySubscriptionUrgent: 'URGENT: Gateway subscription needs attention: ',
} as const;

/** Unassigned alerts assigned per sweep, at most: a backlog clears over a few passes, never in one long one. */
export const ALERT_SWEEP_BATCH = 25;

/** How often the sweep runs, in minutes. The dispatch job runs every minute; the sweep on every 15th. */
export const ALERT_SWEEP_EVERY_MINUTES = 15;

/**
 * Whether a scheduled dispatch pass at `now` runs the sweep: on the quarter hours (UTC minute 0, 15, 30, 45),
 * so 96 sweeps a day instead of 1,440, the same in every process with no shared counter. A pass that misses
 * a quarter hour leaves the sweep to the next one.
 */
export function AlertSweepDue(now: Date): boolean {
    return now.getUTCMinutes() % ALERT_SWEEP_EVERY_MINUTES === 0;
}

const TASK_ENTITY = 'MJ_BizApps_Tasks: Tasks';

type Assignees =
    | { Skipped: 'NoRoleConfigured' | 'RoleNotFound' | 'NoActiveHolders'; RoleName: string | null }
    | { RoleName: string; UserEntityID: string; Holders: string[] };

/** The users every alert is assigned to, read once per call. */
async function alertAssignees(provider: IMetadataProvider, user: UserInfo): Promise<Assignees> {
    await OrdersSettings.Load(provider, user);
    const roleName = OrdersSettings.AlertTaskRole;
    if (!roleName) return { Skipped: 'NoRoleConfigured', RoleName: null };

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const roles = await rv.RunView<{ ID: string }>(
        { EntityName: ROLE_ENTITY, ExtraFilter: `Name = '${EscapeText(roleName)}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
        user,
    );
    const roleID = roles.Success ? roles.Results?.[0]?.ID : undefined;
    if (!roleID) return { Skipped: 'RoleNotFound', RoleName: roleName };
    const holders = await ActiveRoleHolderIDs(roleID, { Provider: provider, User: user });
    if (holders.length === 0) return { Skipped: 'NoActiveHolders', RoleName: roleName };
    const userEntity = provider.EntityByName(USER_ENTITY);
    if (!userEntity) throw new Error(`Entity '${USER_ENTITY}' is not in metadata.`);
    return { RoleName: roleName, UserEntityID: userEntity.ID, Holders: holders };
}

function skipReason(taskID: string, a: Extract<Assignees, { Skipped: string }>): string {
    return a.Skipped === 'RoleNotFound'
        ? `[BizAppsOrders] Alert Task ${taskID}: the alert role '${a.RoleName}' (Orders setting AlertTaskRole) does not exist, so nobody was assigned.`
        : `[BizAppsOrders] Alert Task ${taskID}: the alert role '${a.RoleName}' has no active holder, so nobody was assigned.`;
}

/**
 * Assign an alert Task to the active holders of the `AlertTaskRole` role. Idempotent: a holder already
 * assigned is not assigned twice. Never throws.
 */
export async function AssignAlertTask(taskID: string, provider: IMetadataProvider, user: UserInfo): Promise<AlertTaskAssignmentOutcome> {
    try {
        const a = await alertAssignees(provider, user);
        if ('Skipped' in a) {
            if (a.Skipped !== 'NoRoleConfigured') LogError(skipReason(taskID, a));
            return { Skipped: a.Skipped };
        }
        const ctx = { Provider: provider, User: user };
        for (const holder of a.Holders) await EnsureTaskAssignment(taskID, a.UserEntityID, holder, ctx);
        return { Assigned: a.Holders.length };
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        LogError(`[BizAppsOrders] Alert Task ${taskID} could not be assigned: ${reason}`);
        return { Failed: reason };
    }
}

/**
 * Assign the open Orders alert Tasks that nobody holds yet: one whose assignment failed when it was
 * raised (a transient error, a role named before it existed), or raised before `AlertTaskRole` was set.
 * A dead-letter alert is raised once, when its delivery is dead-lettered, so without this sweep a first
 * failure would leave it unassigned for good.
 *
 * Runs on the scheduled dispatch pass every `ALERT_SWEEP_EVERY_MINUTES` (`AlertSweepDue`). With no role
 * configured it reads nothing; otherwise one query for at most `ALERT_SWEEP_BATCH` open Tasks with no
 * assignment at all, then the same idempotent assignment a new alert gets. A role that cannot be resolved is
 * logged once per sweep, not once per Task. A Task that cannot be assigned is logged and skipped, so it never
 * holds up the others. Never throws.
 *
 * A Task a person deliberately unassigns (removes every assignment from) while it is still Open is assigned
 * again by the next sweep: an open alert must reach someone. To retire one, close it; the sweep only takes
 * `Status = 'Open'`.
 *
 * Example: Ethan names "Sidecar Support" a day after two deliveries dead-lettered. On the next pass, both
 * Tasks are assigned to Sess and Ethan.
 */
export async function AssignUnassignedAlertTasks(provider: IMetadataProvider, user: UserInfo): Promise<AlertTaskAssignmentOutcome> {
    try {
        const a = await alertAssignees(provider, user);
        if ('Skipped' in a) {
            if (a.Skipped !== 'NoRoleConfigured') LogError(skipReason('sweep', a));
            return { Skipped: a.Skipped };
        }
        const prefixes = Object.values(ORDERS_ALERT_TASK_PREFIX)
            .map((p) => `Name LIKE '${EscapeText(p).replace(/[[%_]/g, '[$&]')}%'`)
            .join(' OR ');
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const open = await rv.RunView<{ ID: string }>(
            {
                EntityName: TASK_ENTITY,
                ExtraFilter:
                    `Status = 'Open' AND (${prefixes}) AND ID NOT IN ` +
                    `(SELECT ta.TaskID FROM __mj_BizAppsTasks.TaskAssignment ta WHERE ta.TaskID IS NOT NULL)`,
                Fields: ['ID'],
                // Newest first: Tasks that can never be assigned (they are logged and skipped) collect at the old
                // end, so they cannot fill every batch and starve the alerts raised since.
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: ALERT_SWEEP_BATCH,
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!open.Success) throw new Error(open.ErrorMessage ?? 'the unassigned alert Tasks could not be read');
        const ctx = { Provider: provider, User: user };
        let assigned = 0;
        let unassignable = 0;
        for (const task of open.Results ?? []) {
            try {
                for (const holder of a.Holders) await EnsureTaskAssignment(task.ID, a.UserEntityID, holder, ctx);
                assigned++;
            } catch (err) {
                // One Task that cannot be assigned must not hold up the rest.
                unassignable++;
                LogError(`[BizAppsOrders] Alert Task ${task.ID} could not be assigned: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return unassignable ? { Assigned: assigned, Unassignable: unassignable } : { Assigned: assigned };
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        LogError(`[BizAppsOrders] Unassigned alert Tasks could not be assigned: ${reason}`);
        return { Failed: reason };
    }
}
