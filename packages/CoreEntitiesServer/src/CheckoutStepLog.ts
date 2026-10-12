/**
 * The per-session record of a checkout's post-payment steps (#326).
 *
 * One CheckoutSessionStep row per session per step. Each attempt, from the buyer's complete
 * call, a payment webhook or an operator replay, moves the row to Running and adds one to
 * Attempts; the attempt then ends it Succeeded or Failed. A Failed row, or a Running row older
 * than STALE_RUNNING_MINUTES, is what the "Checkouts: Needs Review" view lists and what
 * `Orders.ReplayCheckoutStep` re-drives.
 *
 * WRITTEN OUTSIDE THE STEP'S TRANSACTION. Confirm rolls its whole booking back on failure; a
 * record written inside that transaction would roll back with it and the failure would leave no
 * trace. Every write here is its own save.
 *
 * NEVER FAILS THE STEP. The record is an observer. A write that fails is logged and the step
 * carries on exactly as it would without the record.
 */
import { LogError, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersCheckoutSessionStepEntity } from '@mj-biz-apps/orders-entities';
import { CHECKOUT_SESSION_STEP_ENTITY } from './entity-names.js';
import { EscapeText } from './sql-guards.js';

export type CheckoutStepName = mjBizAppsOrdersCheckoutSessionStepEntity['StepName'];
export type CheckoutStepSource = mjBizAppsOrdersCheckoutSessionStepEntity['LastAttemptSource'];
export type CheckoutStepStatus = mjBizAppsOrdersCheckoutSessionStepEntity['Status'];

/**
 * A Running row whose last attempt started longer ago than this was interrupted: the process
 * died, or the attempt hung. The "Checkouts: Needs Review" view uses the same threshold in its
 * WhereClause (metadata/user-views/.orders-working-view.json); change both together.
 */
export const STALE_RUNNING_MINUTES = 15;

/** One attempt in progress, handed back to {@link CheckoutStepLog.Succeed} or {@link CheckoutStepLog.Fail}. */
export interface CheckoutStepAttempt {
    /** The row this attempt updates. Null when it could not be written; the attempt still runs. */
    Step: mjBizAppsOrdersCheckoutSessionStepEntity | null;
    /** The row's Status before this attempt, or null when this is the first. */
    PreviousStatus: CheckoutStepStatus | null;
    /** The row's Retryable before this attempt. */
    PreviousRetryable: boolean | null;
}

export class CheckoutStepLog {
    /** The row for this session's step, or null when the step has never been attempted. */
    public static async Find(
        sessionID: string,
        stepName: CheckoutStepName,
        contextUser?: UserInfo,
    ): Promise<mjBizAppsOrdersCheckoutSessionStepEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<mjBizAppsOrdersCheckoutSessionStepEntity>(
            {
                EntityName: CHECKOUT_SESSION_STEP_ENTITY,
                ExtraFilter: `CheckoutSessionID = '${EscapeText(sessionID)}' AND StepName = '${EscapeText(stepName)}'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            },
            contextUser,
        );
        return result.Success ? (result.Results?.[0] ?? null) : null;
    }

    /** True when the row is Running and its last attempt started more than STALE_RUNNING_MINUTES ago. */
    public static IsStaleRunning(step: mjBizAppsOrdersCheckoutSessionStepEntity, now: Date = new Date()): boolean {
        if (step.Status !== 'Running') return false;
        return now.getTime() - new Date(step.LastAttemptAt).getTime() > STALE_RUNNING_MINUTES * 60_000;
    }

    /** Mark the step Running and count the attempt. Creates the row on the first attempt. */
    public static async Begin(
        sessionID: string,
        stepName: CheckoutStepName,
        source: CheckoutStepSource,
        contextUser?: UserInfo,
        replayedByUserID?: string,
    ): Promise<CheckoutStepAttempt> {
        try {
            const existing = await this.Find(sessionID, stepName, contextUser);
            const attempt = await this.saveBegin(existing, sessionID, stepName, source, contextUser, replayedByUserID);
            if (attempt.Step || existing) return attempt;
            // A concurrent first attempt (the complete call and a webhook) created the row between
            // the read and the insert, and UQ_CheckoutSessionStep_Session_Step refused ours.
            const raced = await this.Find(sessionID, stepName, contextUser);
            return raced ? await this.saveBegin(raced, sessionID, stepName, source, contextUser, replayedByUserID) : attempt;
        } catch (err) {
            LogError(`[CheckoutStepLog] Could not record the start of ${stepName} for session ${sessionID}: ${message(err)}`);
            return { Step: null, PreviousStatus: null, PreviousRetryable: null };
        }
    }

    /** End the attempt Succeeded. Clears the last error. */
    public static async Succeed(attempt: CheckoutStepAttempt): Promise<void> {
        const step = attempt.Step;
        if (!step) return;
        step.Status = 'Succeeded';
        step.SucceededAt = new Date();
        step.LastError = null;
        step.Retryable = null;
        await this.saveEnd(step);
    }

    /**
     * Mark a recorded step Succeeded without counting an attempt: the work it stood for is already
     * done. A no-op when the step was never recorded or already succeeded.
     */
    public static async CloseIfOpen(sessionID: string, stepName: CheckoutStepName, contextUser?: UserInfo): Promise<void> {
        try {
            const step = await this.Find(sessionID, stepName, contextUser);
            if (step && step.Status !== 'Succeeded') {
                await this.Succeed({ Step: step, PreviousStatus: step.Status, PreviousRetryable: step.Retryable });
            }
        } catch (err) {
            LogError(`[CheckoutStepLog] Could not close ${stepName} for session ${sessionID}: ${message(err)}`);
        }
    }

    /** End the attempt Failed, with why and whether it can succeed on a later attempt unchanged. */
    public static async Fail(attempt: CheckoutStepAttempt, error: string, retryable?: boolean): Promise<void> {
        const step = attempt.Step;
        if (!step) return;
        step.Status = 'Failed';
        step.LastError = error;
        step.Retryable = retryable ?? null;
        await this.saveEnd(step);
    }

    /**
     * True when this failure is the step's first non-retryable one. The terminal-capture Task is
     * raised only then; before the record existed, every replay of a terminal failure raised another.
     */
    public static IsNewTerminalFailure(attempt: CheckoutStepAttempt): boolean {
        return !(attempt.PreviousStatus === 'Failed' && attempt.PreviousRetryable === false);
    }

    private static async saveBegin(
        existing: mjBizAppsOrdersCheckoutSessionStepEntity | null,
        sessionID: string,
        stepName: CheckoutStepName,
        source: CheckoutStepSource,
        contextUser: UserInfo | undefined,
        replayedByUserID: string | undefined,
    ): Promise<CheckoutStepAttempt> {
        const now = new Date();
        let step = existing;
        if (!step) {
            step = await new Metadata().GetEntityObject<mjBizAppsOrdersCheckoutSessionStepEntity>(CHECKOUT_SESSION_STEP_ENTITY, contextUser);
            step.NewRecord();
            step.CheckoutSessionID = sessionID;
            step.StepName = stepName;
            step.Attempts = 0;
            step.FirstAttemptAt = now;
        }
        const previous = { PreviousStatus: existing?.Status ?? null, PreviousRetryable: existing?.Retryable ?? null };
        step.Status = 'Running';
        step.Attempts = (step.Attempts ?? 0) + 1;
        step.LastAttemptAt = now;
        step.LastAttemptSource = source;
        if (replayedByUserID) {
            step.LastReplayedByUserID = replayedByUserID;
        }
        if (await step.Save()) {
            return { Step: step, ...previous };
        }
        LogError(`[CheckoutStepLog] Could not record the start of ${stepName} for session ${sessionID}: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return { Step: null, ...previous };
    }

    private static async saveEnd(step: mjBizAppsOrdersCheckoutSessionStepEntity): Promise<void> {
        try {
            if (!(await step.Save())) {
                LogError(`[CheckoutStepLog] Could not record ${step.Status} for ${step.StepName} on session ${step.CheckoutSessionID}: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (err) {
            LogError(`[CheckoutStepLog] Could not record ${step.Status} for ${step.StepName} on session ${step.CheckoutSessionID}: ${message(err)}`);
        }
    }
}

function message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
