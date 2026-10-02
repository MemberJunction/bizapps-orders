/**
 * `Orders.ReplayCheckoutStep` — an operator re-drives one post-payment step of a checkout (#326).
 *
 * The step comes from its CheckoutSessionStep record, which the "Checkouts: Needs Review" view
 * lists. The operation:
 *
 *   - refuses a caller without MJ.BizApps.Orders.Checkout.Replay, before any read;
 *   - does nothing for a step that already Succeeded, and says so (Outcome AlreadySucceeded);
 *   - refuses a step still Running inside STALE_RUNNING_MINUTES, since another attempt may be in
 *     flight and a second would race it;
 *   - runs Capture through CheckoutSessionService.ReplayCapture, the same CapturePayment the
 *     complete call and the webhook use, idempotent on `checkout-complete:${session.ID}`;
 *   - refuses Confirm. A failed Confirm sends the session back to Open, and the buyer's own
 *     complete call retries it. Replaying it for them would book an order outside the checkout.
 *
 * FAILURE MODEL: every refusal and every failed replay comes back inside the output with
 * `Success: false`. Only genuine faults throw.
 */
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersReplayCheckoutStepOperation as OrdersReplayCheckoutStepOperationBase,
    type OrdersReplayCheckoutStepInput,
    type OrdersReplayCheckoutStepOutput,
    UserHasAuthorization,
    type mjBizAppsOrdersCheckoutSessionStepEntity,
} from '@mj-biz-apps/orders-entities';
import { CheckoutSessionService } from './CheckoutSessionService.js';
import { CheckoutStepLog, STALE_RUNNING_MINUTES, type CheckoutStepName } from './CheckoutStepLog.js';
import { RequireUUID } from './sql-guards.js';

/** Held by the Checkout Operator role. */
export const CHECKOUT_REPLAY_AUTH = 'MJ.BizApps.Orders.Checkout.Replay';

const STEP_NAMES: ReadonlyArray<CheckoutStepName> = ['Confirm', 'Capture'];

@RegisterClass(BaseRemotableOperation, 'Orders.ReplayCheckoutStep')
export class ReplayCheckoutStepOperation extends OrdersReplayCheckoutStepOperationBase {
    protected async InternalExecute(
        input: OrdersReplayCheckoutStepInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersReplayCheckoutStepOutput> {
        if (!UserHasAuthorization(CHECKOUT_REPLAY_AUTH, user, provider)) {
            return refuse(`Replaying a checkout step requires the ${CHECKOUT_REPLAY_AUTH} authorization (the Checkout Operator role).`);
        }
        const sessionID = RequireUUID(input?.CheckoutSessionID, 'CheckoutSessionID');
        const stepName = STEP_NAMES.find((s) => s === input?.StepName);
        if (!stepName) {
            return refuse(`StepName must be one of ${STEP_NAMES.join(', ')}.`, { CheckoutSessionID: sessionID });
        }
        // Past the gate the operation is the authority: the operator holds read on the record and
        // nothing on payments, so the replay itself runs as the system user. The record names the
        // operator as LastReplayedByUserID.
        const system = UserCache.Instance.GetSystemUser();
        if (!system) throw new Error('Orders.ReplayCheckoutStep needs the MJ system user, and the user cache does not hold it.');

        const step = await CheckoutStepLog.Find(sessionID, stepName, system);
        if (!step) {
            return refuse(`Checkout session ${sessionID} has no ${stepName} step on record.`, { CheckoutSessionID: sessionID, StepName: stepName });
        }
        if (step.Status === 'Succeeded') {
            return { ...echo(step), Success: true, Outcome: 'AlreadySucceeded', Message: `${stepName} already succeeded; nothing was run.` };
        }
        if (step.Status === 'Running' && !CheckoutStepLog.IsStaleRunning(step)) {
            return { ...echo(step), Success: false, Outcome: 'Refused', Message: `${stepName} is running now (last attempt started at ${new Date(step.LastAttemptAt).toISOString()}). Replay it if it has not finished in ${STALE_RUNNING_MINUTES} minutes.` };
        }
        if (stepName === 'Confirm') {
            return { ...echo(step), Success: false, Outcome: 'Refused', Message: 'Confirm is not replayable here. A failed Confirm leaves the session Open, and the buyer\'s complete call retries it.' };
        }

        const result = await CheckoutSessionService.ReplayCapture(sessionID, system, user.ID);
        if (typeof result === 'string') {
            return { ...echo(step), Success: false, Outcome: 'Refused', Message: result };
        }
        const after = (await CheckoutStepLog.Find(sessionID, stepName, system)) ?? step;
        return {
            ...echo(after),
            Success: result.Booked,
            Outcome: 'Replayed',
            Message: result.Booked ? 'Capture booked.' : `Capture did not book: ${result.ErrorMessage ?? 'unknown error'}`,
        };
    }
}

function refuse(message: string, extra: Partial<OrdersReplayCheckoutStepOutput> = {}): OrdersReplayCheckoutStepOutput {
    return { Success: false, Outcome: 'Refused', Message: message, ...extra };
}

function echo(step: mjBizAppsOrdersCheckoutSessionStepEntity): Partial<OrdersReplayCheckoutStepOutput> {
    return {
        CheckoutSessionID: step.CheckoutSessionID,
        StepName: step.StepName,
        Status: step.Status,
        Attempts: step.Attempts,
        LastError: step.LastError,
    };
}

/** Registers {@link ReplayCheckoutStepOperation}. Called from the server bootstrap. */
export function LoadReplayCheckoutStepOperation(): void {
    void ReplayCheckoutStepOperation;
}
