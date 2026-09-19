/**
 * @fileoverview `Orders: Spawn Renewals` — the scheduling surface for `Orders.SpawnRenewals`.
 *
 * WHY THIS EXISTS AT ALL, GIVEN THE OPERATION ALREADY DOES THE WORK. `Orders.SpawnRenewals` is a
 * remote operation, which is the API a browser calls. Nothing calls it, because renewals have no
 * browser: the term expires whether or not somebody opens the app that week. A scheduled job is the
 * caller this needs, and MJ's scheduler dispatches Actions and Agents — there is no driver that
 * takes an operation key. So the Action is the adapter between the two, and it is deliberately the
 * thinnest thing that can be: read params, route to the operation, report what came back.
 *
 * NO RENEWAL LOGIC LIVES HERE, and that is the point. Selection, both idempotency guards, the
 * booking path and the lead-day inheritance are all in `SpawnRenewalsOperation`, where the check
 * suite (SR1–SR11) already holds them. A second implementation living in an Action would be a
 * second thing to keep true, and the first one to drift would be the one nobody runs by hand.
 *
 * IT ROUTES, IT DOES NOT CONSTRUCT. `OrdersSpawnRenewalsOperation.Execute` goes through the
 * provider, which on a server resolves the registered subclass and runs its `Authorize` hook.
 * Calling the server class directly would skip that hook and pin this file to a server-only import
 * it does not otherwise need.
 *
 * PREVIEW IS A PARAMETER, NOT A SEPARATE ACTION. The go-live gate is one preview run whose list a
 * person confirms before the same job is allowed to place anything. Two Actions would be two code
 * paths, and the one that bills customers would be the one that had never been rehearsed.
 *
 * @module @mj-biz-apps/orders-actions
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { OrdersSpawnRenewalsOperation, type SpawnRenewalsInput } from '@mj-biz-apps/orders-entities';

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

function numParam(params: RunActionParams, name: string): number | null {
    const raw = param(params, name);
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

/**
 * A scheduler stores every param as text, so `false` arrives as the string "false" — which is
 * truthy. Reading it loosely here is what keeps a job configured for preview from placing orders.
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
 * Place the renewal orders that are due, or report what would be placed.
 *
 * Inputs: `AsOfDate`, `Preview`, `MaxCount`, `SubscriptionID` — all optional.
 * Outputs: `Placed`, `Skipped`, `CandidateCount`, `Candidates`, `Preview`.
 */
@RegisterClass(BaseAction, 'Orders.SpawnRenewals')
export class SpawnRenewalsAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.spawn(params);
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `The renewal pass failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async spawn(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) {
            return {
                Success: false,
                ResultCode: 'NO_CONTEXT_USER',
                Message:
                    'ContextUser is required: a renewal places a confirmed order, and the order has to be attributable to somebody.',
            };
        }

        const input: SpawnRenewalsInput = {};

        const asOf = strParam(params, 'AsOfDate');
        if (asOf !== null) {
            // A date we cannot read is refused rather than quietly replaced with today. Today is
            // the one value most likely to look right and be wrong — a preview run for the cutover
            // would silently report the wrong quarter, and a live run would bill it.
            if (Number.isNaN(new Date(asOf).getTime())) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_AS_OF_DATE',
                    Message: `'${asOf}' is not a date. AsOfDate takes YYYY-MM-DD, and is omitted for "today".`,
                };
            }
            input.AsOfDate = asOf;
        }

        const subscriptionID = strParam(params, 'SubscriptionID');
        if (subscriptionID !== null) {
            if (!UUID.test(subscriptionID)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_SUBSCRIPTION_ID',
                    Message: `'${subscriptionID}' is not a subscription ID. This takes the Subscription row's ID, not its SubscriptionNumber.`,
                };
            }
            input.SubscriptionID = subscriptionID;
        }

        const maxCount = numParam(params, 'MaxCount');
        if (maxCount !== null) {
            if (!Number.isInteger(maxCount) || maxCount < 1) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_MAX_COUNT',
                    Message: `MaxCount is a cap on orders placed in one pass, so it must be a whole number of at least 1 — got '${maxCount}'.`,
                };
            }
            input.MaxCount = maxCount;
        }

        const preview = boolParam(params, 'Preview');
        if (preview === null && param(params, 'Preview') != null) {
            return {
                Success: false,
                ResultCode: 'INVALID_PREVIEW',
                Message: `Preview takes true or false — got '${String(param(params, 'Preview'))}'. Refused rather than guessed, because the wrong guess bills customers.`,
            };
        }
        if (preview !== null) {
            input.Preview = preview;
        }

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const result = await new OrdersSpawnRenewalsOperation().Execute(input, { provider, user });

        if (!result.Success || !result.Output) {
            return {
                Success: false,
                ResultCode: result.ResultCode ?? 'OPERATION_FAILED',
                Params: params.Params,
                Message: result.ErrorMessage ?? 'Orders.SpawnRenewals returned no result.',
            };
        }

        const output = result.Output;
        setOutput(params, 'Placed', output.Placed);
        setOutput(params, 'Skipped', output.Skipped);
        setOutput(params, 'CandidateCount', output.Candidates.length);
        // The candidate list is the deliverable of a preview run, so it comes back in full rather
        // than as a count. The scheduler stores it on the ScheduledJobRun, which is where the
        // person confirming the list reads it.
        setOutput(params, 'Candidates', output.Candidates);
        setOutput(params, 'Preview', input.Preview === true);

        return {
            Success: true,
            ResultCode: input.Preview === true ? 'PREVIEWED' : 'COMPLETED',
            Params: params.Params,
            Message: output.Message ?? `${output.Placed} renewal order(s) placed, ${output.Skipped} skipped.`,
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadSpawnRenewalsAction(): void {
    void SpawnRenewalsAction;
}
