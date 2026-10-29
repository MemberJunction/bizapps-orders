/**
 * Durable signal when a settled checkout payment will never book on retry.
 *
 * The log marker is the alert floor. A Tasks row is the human-visible artifact —
 * only if bizapps-tasks is installed AND a GENERAL TaskType can be resolved by
 * Code. TypeID is NOT NULL with no default; writing a Task without it always fails.
 *
 * Reads and writes go through the generated Tasks subclasses, not `.Get()` / `.Set()`.
 *
 * Every alert Task is assigned to the holders of the `AlertTaskRole` role (`AssignAlertTask`), so the
 * tasks app tells a person; with no role configured it stays unassigned, as before.
 */
import { LogError, Metadata, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    mjBizAppsTasksTaskEntity,
    mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/tasks-entities';
import { AssignAlertTask } from './AlertTaskAssignment.js';
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
 *
 * One Task per session: the refusal, the webhook's attempt and the expiry sweep can each report the
 * same session, and staff act on it once (#724).
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
        { OncePerName: true },
    );
}

/** Log marker for a dead-lettered outbound delivery; the alert floor when no tasks app is installed. */
export const OUTBOUND_DEAD_LETTER_LOG_MARKER = '[ORDERS-OUTBOUND-DEAD-LETTER]';

/**
 * An outbound delivery was retried until its deadline and gave up: the consumer (the Learning Hub, a CRM)
 * never heard of a change Orders made. Its copy is now wrong until a person re-sends it.
 *
 * One Task per dead-lettered EVENT: the event id is in the name, so a second delivery failure for the same
 * event (another pass, a replay) raises nothing new, while a later change to the same grant that also
 * fails is a new Task, because it is a different change nobody heard of.
 *
 * Example: the Learning Hub is down for a day; Jane's access change (Status Active, until 31 Dec) is never
 * delivered. "Outbound delivery failed: sidecar-lxp, GrantStatusChanged, grant 6F1…" is raised, assigned to
 * the alert role, naming the last error.
 */
export async function raiseOutboundDeadLetterAlert(
    delivery: { ID: string; ConsumerKey: string; Attempts: number | null; LastError: string | null },
    event: { ID: string; EventType: string; OrderHeaderID: string | null; EntitlementGrantID: string | null } | null,
    contextUser?: UserInfo,
): Promise<void> {
    const subject = event?.EntitlementGrantID ? `grant ${event.EntitlementGrantID}` : event?.OrderHeaderID ? `order ${event.OrderHeaderID}` : 'an unreadable event';
    LogError(
        `${OUTBOUND_DEAD_LETTER_LOG_MARKER} delivery ${delivery.ID} to '${delivery.ConsumerKey}' (${event?.EventType ?? 'unknown event'}, ${subject}) ` +
            `was dead-lettered after ${delivery.Attempts ?? 0} attempts: ${delivery.LastError ?? 'no error recorded'}`,
    );
    await raiseAlertTask(
        `Outbound delivery failed: ${delivery.ConsumerKey}, ${event?.EventType ?? 'unknown event'}, ${subject} (event ${event?.ID ?? delivery.ID})`,
        `Orders could not tell '${delivery.ConsumerKey}' about a change after retrying until the delivery's deadline, so that ` +
            `system's copy is out of date (for the Learning Hub, the person's access).

` +
            `Event: ${event?.EventType ?? '(unknown)'} ${event?.ID ?? ''}
` +
            `About: ${subject}${event?.OrderHeaderID ? ` (order ${event.OrderHeaderID})` : ''}
` +
            `Attempts: ${delivery.Attempts ?? 0}
Last error: ${delivery.LastError ?? '(none recorded)'}

` +
            `Once '${delivery.ConsumerKey}' answers again, re-send this change to it.`,
        contextUser,
        { OncePerName: true },
    );
}

/**
 * Writes the human-visible Tasks row; the caller has already logged the marker. `OncePerName` skips
 * the write when a Task with this name already exists. A written Task is assigned to the alert role's
 * holders (`AssignAlertTask`), which never fails the alert.
 */
async function raiseAlertTask(
    name: string,
    description: string,
    contextUser?: UserInfo,
    options?: { OncePerName?: boolean },
): Promise<void> {
    if (!contextUser) {
        return;
    }
    try {
        const md = new Metadata();
        if (!md.EntityByName(CHECKOUT_CAPTURE_TASK_ENTITY)) {
            return;
        }

        const rv = new RunView();
        if (options?.OncePerName) {
            const existing = await rv.RunView<{ ID: string }>(
                {
                    EntityName: CHECKOUT_CAPTURE_TASK_ENTITY,
                    ExtraFilter: `Name = '${EscapeText(name)}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    MaxRows: 1,
                },
                contextUser,
            );
            if (existing.Success && existing.Results.length > 0) {
                return;
            }
        }
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
            return;
        }
        // Told to a person, not left in a list: the tasks app notifies an assignee. The provider is the one the
        // `Metadata` facade above delegates to: the facade itself has no RunView, so passing it failed every read.
        await AssignAlertTask(task.ID, Metadata.Provider as unknown as IMetadataProvider, contextUser);
    } catch (err) {
        LogError(
            `${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} Could not raise a Task: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}
