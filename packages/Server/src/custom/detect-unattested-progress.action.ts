/**
 * @fileoverview `Orders: Detect Unattested Progress` — the scheduling surface for
 * `Orders.DetectUnattestedProgress` (golive #279, type 2).
 *
 * A percentage-of-completion line that nobody attests recognises nothing and reports nothing; only
 * the days pass. MJ's scheduler dispatches Actions, not operation keys, so this Action is how the
 * clock reaches the operation. Like `spawn-renewals.action.ts` it is deliberately thin: read the
 * params, route to the operation, report what came back.
 *
 * NO DETECTION LOGIC LIVES HERE. The selection (the progress worklist), the threshold (accounting's
 * `PROGRESS_UNATTESTED` configuration), the monthly dedupe key and the raise are all in
 * `DetectUnattestedProgressOperation`.
 *
 * A FAILED RAISE IS A FAILED RUN. The operation reports it in its output rather than throwing, and
 * this passes it through as `Success: false`, so a scheduled job that notifies on failure tells
 * somebody instead of recording a green run that put nothing on the list.
 *
 * @module @mj-biz-apps/orders-server
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { OrdersDetectUnattestedProgressOperation, type OrdersDetectUnattestedProgressInput } from '@mj-biz-apps/orders-entities';
import { RequireDate } from '@mj-biz-apps/orders-core-entities-server';

function strParam(params: RunActionParams, name: string): string | null {
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

/**
 * Put percentage-of-completion lines overdue for attestation on finance's review list.
 *
 * Inputs: `AsOfDate` — optional.
 * Outputs: `LineCount`, `Raised`, `AlreadyRaised`, `Lines`.
 */
@RegisterClass(BaseAction, 'Orders.DetectUnattestedProgress')
export class DetectUnattestedProgressAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.detect(params);
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `The unattested-progress pass failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async detect(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) {
            return { Success: false, ResultCode: 'NO_CONTEXT_USER', Message: 'ContextUser is required: raising a finance exception has to be attributable to somebody.' };
        }

        const input: OrdersDetectUnattestedProgressInput = {};
        const asOf = strParam(params, 'AsOfDate');
        if (asOf !== null) {
            // Refused rather than replaced with today: `RequireDate` rejects a day that does not
            // exist, which `new Date()` would roll over into the next month.
            try {
                RequireDate(asOf, 'AsOfDate');
            } catch {
                return { Success: false, ResultCode: 'INVALID_AS_OF_DATE', Message: `'${asOf}' is not a date. AsOfDate takes YYYY-MM-DD, and is omitted for the business day.` };
            }
            input.AsOfDate = asOf;
        }

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const result = await new OrdersDetectUnattestedProgressOperation().Execute(input, { provider, user });
        if (!result.Success || !result.Output) {
            return {
                Success: false,
                ResultCode: result.ResultCode ?? 'OPERATION_FAILED',
                Params: params.Params,
                Message: result.ErrorMessage ?? 'Orders.DetectUnattestedProgress returned no result.',
            };
        }

        const output = result.Output;
        setOutput(params, 'LineCount', output.Lines.length);
        setOutput(params, 'Raised', output.Raised);
        setOutput(params, 'AlreadyRaised', output.AlreadyRaised);
        setOutput(params, 'Lines', output.Lines);

        if (!output.Success) {
            return {
                Success: false,
                ResultCode: 'RAISE_FAILED',
                Params: params.Params,
                Message: output.Message ?? 'The unattested-progress pass reported a failure with no message.',
            };
        }
        return {
            Success: true,
            ResultCode: output.TypeInactive ? 'TYPE_INACTIVE' : 'COMPLETED',
            Params: params.Params,
            Message: output.Message ?? `${output.Raised} raised, ${output.AlreadyRaised} already on the review list.`,
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadDetectUnattestedProgressAction(): void {
    void DetectUnattestedProgressAction;
}
