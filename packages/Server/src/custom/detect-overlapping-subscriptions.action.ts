/**
 * @fileoverview `Orders: Detect Overlapping Subscriptions` — the scheduling surface for
 * `Orders.DetectOverlappingSubscriptions`, finance exception type 5 (golive #279).
 *
 * MJ's scheduler dispatches Actions, and no driver takes an operation key, so this Action is the
 * adapter between the nightly job and the operation — the same shape as `spawn-renewals.action.ts`.
 * NO DETECTION LOGIC LIVES HERE: reading the exception type, running the query, finding the
 * confirmer and raising through accounting are all in `DetectOverlappingSubscriptionsOperation`.
 *
 * IT ROUTES, IT DOES NOT CONSTRUCT. The generated `OrdersDetectOverlappingSubscriptionsOperation`
 * goes through the provider, which on a server resolves the registered subclass and runs its
 * `Authorize` hook.
 *
 * A PAIR THAT COULD NOT BE RAISED FAILS THE RUN. The operation reports and continues, so the rest of
 * the pairs still land; passing its result through as green would let a night on which accounting
 * refused everything look exactly like a night with no overlaps.
 *
 * @module @mj-biz-apps/orders-server
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersDetectOverlappingSubscriptionsOperation,
    type OrdersDetectOverlappingSubscriptionsInput,
} from '@mj-biz-apps/orders-entities';
import { RequireDate } from '@mj-biz-apps/orders-core-entities-server';

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
 * Raise a finance exception for each overlapping subscription pair.
 *
 * Input: `AsOfDate` (optional).
 * Outputs: `TypeActive`, `ExceptionDate`, `PairsFound`, `Created`, `AlreadyRaised`, `Errors`.
 */
@RegisterClass(BaseAction, 'Orders.DetectOverlappingSubscriptions')
export class DetectOverlappingSubscriptionsAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.detect(params);
        } catch (error) {
            return refuse('ERROR', `The overlapping-subscription check failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async detect(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required: the exceptions raised have to be attributable to somebody.');

        const input: OrdersDetectOverlappingSubscriptionsInput = {};
        const asOf = param(params, 'AsOfDate');
        if (asOf !== null) {
            // Through `RequireDate` rather than `new Date(asOf)`, which rolls `2026-02-30` over to
            // 2 March and would date every exception to a day nobody named.
            try {
                RequireDate(asOf, 'AsOfDate');
            } catch {
                return refuse('INVALID_AS_OF_DATE', `'${asOf}' is not a date. AsOfDate takes YYYY-MM-DD, and is omitted for "today".`);
            }
            input.AsOfDate = asOf;
        }

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const result = await new OrdersDetectOverlappingSubscriptionsOperation().Execute(input, { provider, user });
        if (!result.Success || !result.Output) {
            return {
                Success: false,
                ResultCode: result.ResultCode ?? 'OPERATION_FAILED',
                Params: params.Params,
                Message: result.ErrorMessage ?? 'Orders.DetectOverlappingSubscriptions returned no result.',
            };
        }

        const output = result.Output;
        setOutput(params, 'TypeActive', output.TypeActive);
        setOutput(params, 'ExceptionDate', output.ExceptionDate);
        setOutput(params, 'PairsFound', output.PairsFound);
        setOutput(params, 'Created', output.Created);
        setOutput(params, 'AlreadyRaised', output.AlreadyRaised);
        setOutput(params, 'Errors', output.Errors);

        if (!output.Success) {
            const detail = output.Errors.slice(0, 3)
                .map((e) => `${e.DedupeKey ? `${e.DedupeKey}: ` : ''}${e.Code} ${e.Message}`)
                .join('; ');
            return {
                Success: false,
                ResultCode: output.Created > 0 || output.AlreadyRaised > 0 ? 'PARTIAL' : 'OPERATION_REPORTED_FAILURE',
                Params: params.Params,
                Message:
                    `${output.Message ?? 'The check reported a failure.'} ` +
                    `${output.Errors.length} error(s)${detail ? `: ${detail}` : ''}` +
                    `${output.Errors.length > 3 ? `, and ${output.Errors.length - 3} more` : ''}.`,
            };
        }

        return {
            Success: true,
            ResultCode: output.TypeActive ? 'COMPLETED' : 'TYPE_INACTIVE',
            Params: params.Params,
            Message: output.Message ?? '',
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadDetectOverlappingSubscriptionsAction(): void {
    void DetectOverlappingSubscriptionsAction;
}
