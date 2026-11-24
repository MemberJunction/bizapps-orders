/**
 * @fileoverview `Orders: Apply Refund Request Decision` — the Tasks hook for bc-aidp-next-golive#355.
 *
 * The `ORDERS_REFUND_APPROVAL` task type names this Action as its OnComplete, OnCancel and OnReject
 * hook, so an approval decided in the Tasks inbox reaches the refund request without anyone opening the
 * payment. Tasks passes the task's ID; the run's ContextUser is whoever closed the task, and is recorded
 * as the request's decider.
 *
 * NO REFUND REQUEST LOGIC LIVES HERE. It is idempotent downstream, so a hook that fires twice, or fires
 * for a Blocked task, changes nothing.
 *
 * @module @mj-biz-apps/orders-server
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { ApplyRefundRequestDecision } from '@mj-biz-apps/orders-core-entities-server';

const refuse = (ResultCode: string, Message: string): ActionResultSimple => ({ Success: false, ResultCode, Message });

@RegisterClass(BaseAction, 'Orders.ApplyRefundRequestDecision')
export class ApplyRefundRequestDecisionAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const user = params.ContextUser;
            if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required: a refund request decision is attributed to whoever made it.');
            const raw = params.Params?.find((p) => p.Name?.toLowerCase() === 'taskid')?.Value;
            const taskID = raw == null ? '' : String(raw).trim();
            if (!taskID) return refuse('NO_TASK_ID', 'TaskID is required.');

            const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const out = await ApplyRefundRequestDecision(taskID, provider, user);
            return { Success: out.Success, ResultCode: out.Success ? 'APPLIED' : 'NOT_APPLIED', Message: out.Message ?? '' };
        } catch (error) {
            return refuse('ERROR', `Applying the refund request decision failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadApplyRefundRequestDecisionAction(): void {
    // intentionally empty
}
