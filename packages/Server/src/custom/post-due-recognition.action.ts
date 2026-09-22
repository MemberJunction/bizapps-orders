/**
 * @fileoverview `Orders: Post Due Recognition` — the scheduling surface for `Orders.PostDueRecognition`.
 *
 * WHY THIS EXISTS, GIVEN THE OPERATION ALREADY DOES THE WORK. Same reason as the renewal pass: the
 * operation is the API a browser calls, and a month end has no browser. Once recognition is built at
 * post time rather than staged at booking (D92 §8), something has to run on the first of the month
 * whether or not anybody opens the app — and MJ's scheduler dispatches Actions and Agents, with no
 * driver that takes an operation key. This Action is the adapter, and it is deliberately the
 * thinnest thing that can be: read params, route to the operation, report what came back.
 *
 * NO RECOGNITION LOGIC LIVES HERE. Selection, the cumulative arithmetic, rule 2 and the per-line
 * transaction are all in `PostDueRecognitionOperation`. A second implementation in an Action would
 * be a second thing to keep true, and the one to drift would be the one nobody runs by hand.
 *
 * ASOF IS THE PERIOD BEING CLOSED, NOT THE DAY THE JOB RUNS. The schedule fires on the 1st and
 * recognises through the last day of the prior month, so entries land in the month they belong to
 * rather than in the one that has just started. A job configured with no `AsOf` at all is refused
 * rather than defaulted to today: today is the wrong answer most likely to look right, and it would
 * quietly push a month's revenue into the wrong period on every run.
 *
 * @module @mj-biz-apps/orders-actions
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { OrdersPostDueRecognitionOperation, type OrdersPostDueRecognitionInput } from '@mj-biz-apps/orders-entities';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function param(params: RunActionParams, name: string): unknown {
    return params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value;
}

function strParam(params: RunActionParams, name: string): string | null {
    const raw = param(params, name);
    if (raw == null) return null;
    const value = String(raw).trim();
    return value.length ? value : null;
}

/**
 * A scheduler stores every param as text, so `false` arrives as the string "false" — which is
 * truthy. Reading it loosely here is what keeps a job configured for preview from posting entries.
 */
function boolParam(params: RunActionParams, name: string): boolean | null {
    const raw = param(params, name);
    if (raw == null || raw === '') return null;
    if (typeof raw === 'boolean') return raw;
    const value = String(raw).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(value)) return true;
    if (['false', '0', 'no', 'n'].includes(value)) return false;
    return null;
}

/** Whether the caller gave us this parameter at all — a scheduler writes an unset one as blank. */
function supplied(params: RunActionParams, name: string): boolean {
    const raw = param(params, name);
    return raw != null && String(raw).trim().length > 0;
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
 * The last day of the month before `today` — what a run on the 1st is closing.
 *
 * Day 0 of this month IS the last day of the previous one, including February in a leap year, so
 * there is no month-length table to get wrong. Built from UTC parts because the job's timezone is
 * UTC and a local-time reading would slip the period by a day either side of midnight.
 */
function priorMonthEnd(today: Date): string {
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return end.toISOString().slice(0, 10);
}

/**
 * Recognise revenue earned through a date, or report what would be recognised.
 *
 * Inputs: `AsOf` (defaults to the end of the prior month), `Preview`, `OrderHeaderID`.
 * Outputs: `AsOf`, `Considered`, `Posted`, `Failed`, `Lines`, `PreviewedOnly`.
 */
@RegisterClass(BaseAction, 'Orders.PostDueRecognition')
export class PostDueRecognitionAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.run(params);
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `The recognition pass failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async run(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) {
            return {
                Success: false,
                ResultCode: 'NO_CONTEXT_USER',
                Message:
                    'ContextUser is required: recognition writes journal entries, and an entry has to be attributable to somebody.',
            };
        }

        const asOfParam = strParam(params, 'AsOf');
        // THE DEFAULT IS THE PRIOR MONTH END, not today, and it is computed here rather than in the
        // operation. The operation is also called by hand for a specific period, where guessing a
        // date would be wrong; the schedule is the only caller that has a "the usual one" to mean.
        const asOf = asOfParam ?? priorMonthEnd(new Date());
        if (Number.isNaN(new Date(`${asOf}T00:00:00Z`).getTime())) {
            return {
                Success: false,
                ResultCode: 'INVALID_AS_OF',
                Message: `'${asOf}' is not a date. AsOf takes YYYY-MM-DD, and is omitted for the end of the prior month.`,
            };
        }

        const input: OrdersPostDueRecognitionInput = { AsOf: asOf };

        const orderHeaderID = strParam(params, 'OrderHeaderID');
        if (orderHeaderID !== null) {
            if (!UUID.test(orderHeaderID)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_ORDER_HEADER_ID',
                    Message: `'${orderHeaderID}' is not an order ID. This takes the Order Header row's ID, not its OrderNumber.`,
                };
            }
            input.OrderHeaderID = orderHeaderID;
        }

        const preview = boolParam(params, 'Preview');
        if (preview === null && supplied(params, 'Preview')) {
            return {
                Success: false,
                ResultCode: 'INVALID_PREVIEW',
                Message: `Preview takes true or false — got '${String(param(params, 'Preview'))}'. Refused rather than guessed, because the wrong guess posts to the ledger.`,
            };
        }
        if (preview !== null) input.Preview = preview;

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const result = await new OrdersPostDueRecognitionOperation().Execute(input, { provider, user });

        if (!result.Success || !result.Output) {
            return {
                Success: false,
                ResultCode: result.ResultCode ?? 'OPERATION_FAILED',
                Params: params.Params,
                Message: result.ErrorMessage ?? 'Orders.PostDueRecognition returned no result.',
            };
        }

        const output = result.Output;
        setOutput(params, 'AsOf', asOf);
        setOutput(params, 'Considered', output.Considered ?? 0);
        setOutput(params, 'Posted', output.Posted ?? 0);
        setOutput(params, 'Failed', output.Failed ?? 0);
        // The per-line list is the deliverable of a preview run, so it comes back in full rather
        // than as a count. The scheduler stores it on the ScheduledJobRun, which is where the person
        // confirming the close reads it.
        setOutput(params, 'Lines', output.Lines ?? []);
        // NOT named `Preview`: an output is written back onto the param row of the same name, which
        // would overwrite the value the job was called with and lose the one fact the run record has
        // to keep — whether this pass was a rehearsal or the real close.
        setOutput(params, 'PreviewedOnly', input.Preview === true);

        if (!output.Success) {
            const detail = (output.Lines ?? [])
                .filter((l) => l.FailedReason)
                .slice(0, 3)
                .map((l) => `line ${l.LineNumber ?? l.OrderLineID}: ${l.FailedReason}`)
                .join('; ');
            return {
                Success: false,
                ResultCode: 'PARTIAL',
                Params: params.Params,
                Message:
                    `${output.Posted ?? 0} line(s) recognised through ${asOf}; ${output.Failed ?? 0} could not post ` +
                    `(every reason is on Lines)${detail ? `: ${detail}` : ''}.`,
            };
        }

        return {
            Success: true,
            ResultCode: input.Preview === true ? 'PREVIEWED' : 'COMPLETED',
            Params: params.Params,
            Message: output.Message ?? `${output.Posted ?? 0} line(s) recognised through ${asOf}.`,
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadPostDueRecognitionAction(): void {
    void PostDueRecognitionAction;
}
