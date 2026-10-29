/**
 * Durable signal when a settled checkout payment will never book on retry.
 *
 * The log marker is the alert floor. A Tasks row is the human-visible artifact —
 * only if bizapps-tasks is installed AND a GENERAL TaskType can be resolved by
 * Code. TypeID is NOT NULL with no default; writing a Task without it always fails.
 *
 * Reads and writes go through the generated Tasks subclasses, not `.Get()` / `.Set()`.
 */
import { LogError, Metadata, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import type {
    mjBizAppsTasksTaskEntity,
    mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/tasks-entities';
import { CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER } from './checkoutCaptureRetry.js';
import { OPEN_TASK_SQL } from './ConcessionApprovalTask.js';
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

/** The log marker of a gateway subscription Orders could not create or record (option E, E2). */
export const PROVIDER_SUBSCRIPTION_ALERT_LOG_MARKER = '[ProviderSubscriptionAlert]';

const PROVIDER_SUBSCRIPTION_ALERT_TITLE = 'Gateway subscription needs attention: ';
const URGENT_PREFIX = 'URGENT: ';

/** The alert Task's name: one per subscription and problem, which is what makes it the dedupe key. */
export function ProviderSubscriptionAlertName(subscriptionNumber: string, code: string, urgent = false): string {
    return `${urgent ? URGENT_PREFIX : ''}${PROVIDER_SUBSCRIPTION_ALERT_TITLE}${subscriptionNumber} (${code})`;
}

/**
 * A subscription the gateway should bill has no gateway subscription, or its gateway subscription
 * needs a person: Orders could not create it, could not record the one the gateway returned, or the
 * gateway did something it must not (billed at creation).
 *
 * One OPEN Task per subscription and code: the checkout and every daily pass report the same failure,
 * and staff act on it once. Once staff close it, the next report of the same problem raises a new one,
 * so a problem that comes back is seen again.
 *
 * @returns true when this call raised a new Task (or could not look for an open one); false when a
 *          Task for this subscription and problem is already open, so nobody needs telling again.
 */
export async function raiseProviderSubscriptionAlert(
    alert: { SubscriptionID: string; SubscriptionNumber: string; Code: string; Reason: string; Urgent?: boolean; Linked?: boolean },
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
): Promise<boolean> {
    LogError(
        `${PROVIDER_SUBSCRIPTION_ALERT_LOG_MARKER} ${alert.Urgent ? 'URGENT ' : ''}Subscription ${alert.SubscriptionNumber} ` +
            `(${alert.SubscriptionID}): ${alert.Code}: ${alert.Reason}`,
    );
    // What Orders does with the subscription until a person acts depends on whether the gateway's id
    // is recorded on it.
    const consequence = alert.Linked
        ? `The gateway's subscription is recorded on it (ProviderSubscriptionID), so Orders' renewal jobs skip it and the ` +
          `gateway bills it. Check the gateway subscription and fix it there.`
        : `No gateway subscription is recorded on it (ProviderSubscriptionID is empty), so Orders' own renewal jobs still ` +
          `treat it as theirs to renew: if the gateway does hold a subscription for it, the customer will be charged twice. ` +
          `Fix the cause, close this Task, and the daily Create Provider Subscriptions job (which must be enabled wherever ` +
          `an account has BillsSubscriptions on) tries again; or run that action for this subscription, or record the ` +
          `gateway's id by hand.`;
    const outcome = await raiseAlertTask(
        ProviderSubscriptionAlertName(alert.SubscriptionNumber, alert.Code, alert.Urgent),
        `Subscription ${alert.SubscriptionNumber} is sold on an account whose payment gateway bills renewals, and its gateway ` +
            `subscription needs a person.\n\nSubscription: ${alert.SubscriptionNumber} (${alert.SubscriptionID})\nProblem: ${alert.Code}\n` +
            `Reason: ${alert.Reason}\n\n${consequence}`,
        contextUser,
        { OncePerOpenName: true, Provider: provider },
    );
    return outcome !== 'AlreadyRaised';
}

/**
 * A gateway subscription on a price Orders sells, which no Orders subscription records (E3): a subscriber
 * the import missed or held back, or one someone created at the gateway. Nothing is booked until a person
 * links it (`LinkProviderSubscription`); one open Task per gateway subscription.
 */
export async function raiseUnknownGatewaySubscriptionAlert(
    alert: { ProviderSubscriptionID: string; Reason: string },
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
): Promise<boolean> {
    LogError(`${PROVIDER_SUBSCRIPTION_ALERT_LOG_MARKER} Unknown gateway subscription ${alert.ProviderSubscriptionID}: ${alert.Reason}`);
    const outcome = await raiseAlertTask(
        `Gateway subscription not recorded in Orders: ${alert.ProviderSubscriptionID} (UnknownGatewaySubscription)`,
        `The payment gateway bills subscription ${alert.ProviderSubscriptionID} on a price Orders sells, but no Orders ` +
            `subscription records it, so nothing it charges is booked and the customer's access is not managed by Orders.\n\n` +
            `Reason: ${alert.Reason}\n\nIf it is a real subscriber, link it to their Orders subscription with the ` +
            `Link Provider Subscription action; Orders then books everything the gateway charged since that subscription's term ` +
            `ended. If it is not one of ours, close this Task.`,
        contextUser,
        { OncePerOpenName: true, Provider: provider },
    );
    return outcome !== 'AlreadyRaised';
}

/**
 * The problems that have an OPEN alert Task, by subscription number, or why the Tasks could not be read.
 * Empty (and `Ok`) when the tasks app is not installed: such a host raises no alert Tasks at all.
 */
export async function ReadOpenProviderSubscriptionAlerts(
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<{ Ok: true; Open: Map<string, Set<string>> } | { Ok: false; Reason: string }> {
    const open = new Map<string, Set<string>>();
    const md: IMetadataProvider = provider ?? (new Metadata() as unknown as IMetadataProvider);
    if (!md.EntityByName(CHECKOUT_CAPTURE_TASK_ENTITY)) return { Ok: true, Open: open };
    const rv = provider ? new RunView(provider as unknown as IRunViewProvider) : new RunView();
    const tasks = await rv.RunView<{ ID: string; Name: string }>(
        {
            EntityName: CHECKOUT_CAPTURE_TASK_ENTITY,
            ExtraFilter:
                `(Name LIKE '${EscapeText(PROVIDER_SUBSCRIPTION_ALERT_TITLE)}%' ` +
                `OR Name LIKE '${EscapeText(`${URGENT_PREFIX}${PROVIDER_SUBSCRIPTION_ALERT_TITLE}`)}%') AND ${OPEN_TASK_SQL}`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
            IgnoreMaxRows: true,
            BypassCache: true,
        },
        contextUser,
    );
    if (!tasks.Success) {
        const reason = `could not read the open alert Tasks: ${tasks.ErrorMessage ?? 'unknown error'}`;
        LogError(`${PROVIDER_SUBSCRIPTION_ALERT_LOG_MARKER} ${reason}`);
        return { Ok: false, Reason: reason };
    }
    // The inverse of `ProviderSubscriptionAlertName`, built from the same parts so a reworded title cannot drift.
    const pattern = new RegExp(`^(?:${escapeRegExp(URGENT_PREFIX)})?${escapeRegExp(PROVIDER_SUBSCRIPTION_ALERT_TITLE)}(.+) \\(([A-Za-z]+)\\)$`);
    for (const task of tasks.Results ?? []) {
        const match = pattern.exec(task.Name);
        if (!match) continue;
        const codes = open.get(match[1]) ?? new Set<string>();
        codes.add(match[2]);
        open.set(match[1], codes);
    }
    return { Ok: true, Open: open };
}


/**
 * The problems that have an OPEN alert Task, by subscription number: what the daily pass leaves for a
 * person rather than asking the gateway again. Empty when the tasks app is not installed or the read
 * fails (the pass then simply retries everything). A cancel reads `ReadOpenProviderSubscriptionAlerts`
 * instead, because there "no alert" decides whether money keeps moving.
 */
export async function OpenProviderSubscriptionAlerts(
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<Map<string, Set<string>>> {
    const read = await ReadOpenProviderSubscriptionAlerts(contextUser, provider);
    return 'Open' in read ? read.Open : new Map();
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Writes the human-visible Tasks row; the caller has already logged the marker.
 *   · `OncePerName` skips the write when a Task with this name exists in any status: for a one-off
 *     event (a session, an order) that staff resolve once.
 *   · `OncePerOpenName` skips it only while a Task with this name is still open (`OPEN_TASK_SQL`):
 *     for a condition that can come back after staff closed it.
 * `Provider` is the one to read and write through, for a caller working on its own provider; the
 * global one otherwise.
 */
async function raiseAlertTask(
    name: string,
    description: string,
    contextUser?: UserInfo,
    options?: { OncePerName?: boolean; OncePerOpenName?: boolean; Provider?: IMetadataProvider },
): Promise<'Raised' | 'AlreadyRaised' | 'NotRaised'> {
    if (!contextUser) {
        return 'NotRaised';
    }
    try {
        const md: IMetadataProvider = options?.Provider ?? (new Metadata() as unknown as IMetadataProvider);
        if (!md.EntityByName(CHECKOUT_CAPTURE_TASK_ENTITY)) {
            return 'NotRaised';
        }

        const rv = options?.Provider ? new RunView(options.Provider as unknown as IRunViewProvider) : new RunView();
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
                return 'AlreadyRaised';
            }
        } else if (options?.OncePerOpenName) {
            const existing = await rv.RunView<{ ID: string }>(
                {
                    EntityName: CHECKOUT_CAPTURE_TASK_ENTITY,
                    ExtraFilter: `Name = '${EscapeText(name)}' AND ${OPEN_TASK_SQL}`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    MaxRows: 1,
                    BypassCache: true,
                },
                contextUser,
            );
            if (existing.Success && existing.Results.length > 0) {
                return 'AlreadyRaised';
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
            return 'NotRaised';
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
            return 'NotRaised';
        }
        return 'Raised';
    } catch (err) {
        LogError(
            `${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} Could not raise a Task: ${err instanceof Error ? err.message : String(err)}`,
        );
        return 'NotRaised';
    }
}
