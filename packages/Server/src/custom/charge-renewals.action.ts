/**
 * @fileoverview `Orders: Charge Renewals` — the daily pass that charges renewal cards (#289).
 *
 * MJ's scheduler dispatches Actions, so the Action is how the clock reaches `ChargeRenewals`. A
 * renewal falls due with nothing being written; only a day passes.
 *
 * NO CHARGING LOGIC LIVES HERE. Selection, the charge-day and retry rules, the gateway call, the
 * capture and the attempt log are all in `RenewalCharging.ts`; this reads parameters, calls it, and
 * reports what came back.
 *
 * PREVIEW IS A PARAMETER. The scheduled job ships disabled and set to Preview, so the first enabled
 * runs report what they would charge and charge nothing. Setting Preview to false is the act that
 * starts charging cards.
 *
 * @module @mj-biz-apps/orders-server
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { ChargeRenewals, type ChargeRenewalsInput } from '@mj-biz-apps/orders-core-entities-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Charge the renewal card of every renewal order due a charge today.
 *
 * Inputs: `AsOfDate`, `SubscriptionID`, `Preview`, `MaxCount` — all optional.
 * Outputs: `Charged`, `Failed`, `Skipped`, `Attempts`, `Failures`, `PreviewedOnly`.
 */
@RegisterClass(BaseAction, 'Orders.ChargeRenewals')
export class ChargeRenewalsAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.charge(params);
        } catch (error) {
            return refuse('ERROR', `The renewal charge pass failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async charge(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required: charging a card has to be attributable to somebody.');

        const input: ChargeRenewalsInput = {};

        const asOf = param(params, 'AsOfDate');
        if (asOf !== null) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(new Date(asOf).getTime())) {
                return refuse('INVALID_AS_OF_DATE', `'${asOf}' is not a date. AsOfDate takes YYYY-MM-DD, and is omitted for "today".`);
            }
            input.AsOfDate = asOf;
        }

        const subscriptionID = param(params, 'SubscriptionID');
        if (subscriptionID !== null) {
            if (!UUID.test(subscriptionID)) return refuse('INVALID_SUBSCRIPTION_ID', `'${subscriptionID}' is not a subscription id.`);
            input.SubscriptionID = subscriptionID;
        }

        const preview = param(params, 'Preview');
        if (preview !== null) {
            // Refused rather than guessed: the wrong guess charges customers.
            const v = preview.toLowerCase();
            if (['true', '1', 'yes', 'y'].includes(v)) input.Preview = true;
            else if (['false', '0', 'no', 'n'].includes(v)) input.Preview = false;
            else return refuse('INVALID_PREVIEW', `Preview takes true or false — got '${preview}'.`);
        }

        const maxCount = param(params, 'MaxCount');
        if (maxCount !== null) {
            const n = Number(maxCount);
            if (!Number.isInteger(n) || n < 1) {
                return refuse('INVALID_MAX_COUNT', `MaxCount must be a whole number of at least 1 — got '${maxCount}'.`);
            }
            input.MaxCount = n;
        }

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const output = await ChargeRenewals(input, provider, user);

        setOutput(params, 'Charged', output.Charged);
        setOutput(params, 'Failed', output.Failed);
        setOutput(params, 'Skipped', output.Skipped);
        setOutput(params, 'Attempts', output.Attempts);
        setOutput(params, 'Failures', output.Failures);
        // Not named `Preview`: an output overwrites the param row of the same name, and whether a
        // run was a rehearsal is the one fact the run record has to keep.
        setOutput(params, 'PreviewedOnly', input.Preview === true);

        return {
            Success: output.Success,
            ResultCode: !output.Success ? 'PARTIAL' : input.Preview ? 'PREVIEWED' : 'COMPLETED',
            Params: params.Params,
            Message: output.Message,
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadChargeRenewalsAction(): void {
    void ChargeRenewalsAction;
}
