/**
 * Durable signal when a settled checkout payment will never book on retry.
 *
 * The log marker is the alert floor. A Tasks row is the human-visible artifact —
 * only if bizapps-tasks is installed AND a GENERAL TaskType can be resolved by
 * Code. TypeID is NOT NULL with no default; writing a Task without it always fails.
 *
 * Reads and writes go through the generated Tasks subclasses, not `.Get()` / `.Set()`.
 */
import { LogError, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type {
    mjBizAppsTasksTaskEntity,
    mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/tasks-entities';
import { CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER } from './checkoutCaptureRetry.js';
import { EscapeText } from './sql-guards.js';

export const CHECKOUT_CAPTURE_TASK_ENTITY = 'MJ_BizApps_Tasks: Tasks';
export const CHECKOUT_CAPTURE_TASK_TYPE_ENTITY = 'MJ_BizApps_Tasks: Task Types';
/** Seeded TaskType.Code — resolved at runtime, never a hardcoded GUID. */
export const CHECKOUT_CAPTURE_TASK_TYPE_CODE = 'GENERAL';

export async function raiseCheckoutCaptureTerminalAlert(
    orderID: string,
    sessionID: string | undefined,
    reason: string,
    contextUser?: UserInfo,
): Promise<void> {
    LogError(
        `${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} Settled payment was not booked onto confirmed checkout order ${orderID}` +
            `${sessionID ? ` session=${sessionID}` : ''}: ${reason}`,
    );
    await raiseAlertTask(
        `Checkout capture not booked: ${orderID}`,
        `A Stripe payment settled and the checkout order is Confirmed, but Orders.CapturePayment was refused and will not succeed on retry.\n\nOrder: ${orderID}\nSession: ${sessionID ?? '(unknown)'}\nReason: ${reason}`,
        contextUser,
    );
}

/**
 * The session-scoped counterpart: a payment settled but completing the checkout refused it, so
 * NO order exists — typically the re-priced total rose above the amount paid (a promotion that
 * expired or hit its limit between the draft and the payment). Staff refund or book by hand.
 */
export async function raiseCheckoutSettledNotBookedAlert(
    sessionID: string,
    paymentIntentID: string | null | undefined,
    reason: string,
    contextUser?: UserInfo,
): Promise<void> {
    LogError(
        `${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} Settled payment for checkout session ${sessionID} was refused at completion; no order was booked: ${reason}`,
    );
    await raiseAlertTask(
        `Checkout payment settled with no order: session ${sessionID}`,
        `A payment settled for a checkout session, but completing the checkout refused it, so no order was created. Refund the payment or book the order by hand.\n\nSession: ${sessionID}\nPayment intent: ${paymentIntentID ?? '(unknown)'}\nReason: ${reason}`,
        contextUser,
    );
}

/** Writes the human-visible Tasks row; the caller has already logged the marker. */
async function raiseAlertTask(name: string, description: string, contextUser?: UserInfo): Promise<void> {
    if (!contextUser) {
        return;
    }
    try {
        const md = new Metadata();
        if (!md.EntityByName(CHECKOUT_CAPTURE_TASK_ENTITY)) {
            return;
        }

        const rv = new RunView();
        const types = await rv.RunView<mjBizAppsTasksTaskTypeEntity>(
            {
                EntityName: CHECKOUT_CAPTURE_TASK_TYPE_ENTITY,
                ExtraFilter: `Code = '${EscapeText(CHECKOUT_CAPTURE_TASK_TYPE_CODE)}'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            },
            contextUser,
        );
        const typeID = types.Success ? types.Results?.[0]?.ID : undefined;
        if (!typeID) {
            LogError(`${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} No GENERAL TaskType — cannot raise a Task`);
            return;
        }

        const task = await md.GetEntityObject<mjBizAppsTasksTaskEntity>(
            CHECKOUT_CAPTURE_TASK_ENTITY,
            contextUser,
        );
        task.NewRecord();
        task.TypeID = typeID;
        task.Name = name;
        task.Description = description;
        task.Status = 'Open';
        if (!(await task.Save())) {
            LogError(
                `${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} Could not raise a Task: ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    } catch (err) {
        LogError(
            `${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} Could not raise a Task: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}
