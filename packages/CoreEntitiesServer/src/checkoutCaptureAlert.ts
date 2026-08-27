/**
 * Durable signal when a settled checkout payment will never book on retry.
 *
 * The log marker is the alert floor. A Tasks row is the human-visible artifact —
 * only if bizapps-tasks is installed AND a GENERAL TaskType can be resolved by
 * Code. TypeID is NOT NULL with no default; writing a Task without it always fails.
 */
import { LogError, Metadata, RunView, type UserInfo } from '@memberjunction/core';
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
    if (!contextUser) {
        return;
    }
    try {
        const md = new Metadata();
        if (!md.EntityByName(CHECKOUT_CAPTURE_TASK_ENTITY)) {
            return;
        }

        const rv = new RunView();
        const types = await rv.RunView<{ ID: string }>(
            {
                EntityName: CHECKOUT_CAPTURE_TASK_TYPE_ENTITY,
                ExtraFilter: `Code = '${EscapeText(CHECKOUT_CAPTURE_TASK_TYPE_CODE)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                MaxRows: 1,
            },
            contextUser,
        );
        const typeID = types.Success ? types.Results?.[0]?.ID : undefined;
        if (!typeID) {
            LogError(`${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} No GENERAL TaskType — cannot raise a Task`);
            return;
        }

        const task = await md.GetEntityObject(CHECKOUT_CAPTURE_TASK_ENTITY, contextUser);
        task.NewRecord();
        task.Set('Name', `Checkout capture not booked: ${orderID}`);
        task.Set(
            'Description',
            `A Stripe payment settled and the checkout order is Confirmed, but Orders.CapturePayment was refused and will not succeed on retry.\n\nOrder: ${orderID}\nSession: ${sessionID ?? '(unknown)'}\nReason: ${reason}`,
        );
        task.Set('Status', 'Open');
        task.Set('TypeID', typeID);
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
