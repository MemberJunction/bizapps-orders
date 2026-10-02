/**
 * @fileoverview `Orders: Dispatch Outbound Events` — the scheduled half of the outbound hook (#293).
 *
 * Events are recorded inside the transaction that caused them and sent after it. Something has to
 * do the sending when no request is in flight — a renewal booked overnight, a grant suspended by
 * the nightly pass, a consumer that was down and is back — and MJ's scheduler dispatches Actions,
 * so this Action is how the clock reaches `DispatchOutboundDeliveries`.
 *
 * NO DELIVERY LOGIC LIVES HERE. Claiming, calling consumers, backoff and dead-lettering are in
 * `OutboundEvents.ts`; this reads parameters, calls it, and reports what came back.
 *
 * @module @mj-biz-apps/orders-server
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { DispatchOutboundDeliveries, type DispatchOutboundInput } from '@mj-biz-apps/orders-core-entities-server';

function param(params: RunActionParams, name: string): string | null {
    const raw = params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value;
    if (raw == null) return null;
    const value = String(raw).trim();
    // A scheduler writes an unset parameter as an empty string, so blank is absent.
    return value.length ? value : null;
}

function setOutput(params: RunActionParams, name: string, value: unknown): void {
    const existing = params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase());
    if (existing) {
        existing.Value = value;
        existing.Type = 'Output';
        return;
    }
    params.Params = params.Params ?? [];
    params.Params.push({ Name: name, Value: value, Type: 'Output' } as ActionParam);
}

const refuse = (ResultCode: string, Message: string): ActionResultSimple => ({ Success: false, ResultCode, Message });

/**
 * Send the outbound deliveries that are due.
 *
 * Input: `MaxCount` (optional). Outputs: `Claimed`, `Delivered`, `Retrying`, `DeadLettered`.
 */
@RegisterClass(BaseAction, 'Orders.DispatchOutboundEvents')
export class DispatchOutboundEventsAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.dispatch(params);
        } catch (error) {
            return refuse('ERROR', `The outbound dispatch pass failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async dispatch(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required: deliveries are recorded against somebody.');

        const input: DispatchOutboundInput = {};
        const maxCount = param(params, 'MaxCount');
        if (maxCount !== null) {
            const n = Number(maxCount);
            if (!Number.isInteger(n) || n < 1) {
                return refuse('INVALID_MAX_COUNT', `MaxCount must be a whole number of at least 1 — got '${maxCount}'.`);
            }
            input.MaxCount = n;
        }

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const output = await DispatchOutboundDeliveries(input, provider, user);

        setOutput(params, 'Claimed', output.Claimed);
        setOutput(params, 'Delivered', output.Delivered);
        setOutput(params, 'Retrying', output.Retrying);
        setOutput(params, 'DeadLettered', output.DeadLettered);

        return {
            Success: output.Success,
            ResultCode: output.Success ? 'COMPLETED' : 'PARTIAL',
            Params: params.Params,
            Message: output.Message ?? '',
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadDispatchOutboundEventsAction(): void {
    void DispatchOutboundEventsAction;
}
