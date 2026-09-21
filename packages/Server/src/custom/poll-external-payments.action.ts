/**
 * @fileoverview `Orders: Poll External Payments` — the scheduling surface for `Orders.PollExternalPayments`.
 *
 * The thinnest adapter between MJ's scheduler (which dispatches Actions) and the operation that does
 * the work. No polling logic lives here. See `send-external-invoices.action.ts` for why.
 *
 * A PASS THAT LEFT MONEY FOR A PERSON IS NOT A SUCCESS. The operation reports `ATTENTION` when it
 * captured what it could but left payments unmatched or needing reversal; that is passed through as
 * Success false so a job that notifies only on failure tells somebody.
 *
 * @module @mj-biz-apps/orders-server
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { OrdersPollExternalPaymentsOperation, type OrdersPollExternalPaymentsInput } from '@mj-biz-apps/orders-entities';
import { boolParam, numParam, param, setOutput, strParam, supplied, UUID } from './action-params.js';

/**
 * Inputs: `PaymentProviderID`, `Preview`, `MaxCount`, `SinceWatermark` — all optional.
 * Outputs: `Captured`, `Held`, `Unmatched`, `Refused`, `ReversalNeeded`, `Ignored`, `Outcomes`, `NewWatermarks`, `PreviewedOnly`.
 */
@RegisterClass(BaseAction, 'Orders.PollExternalPayments')
export class PollExternalPaymentsAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.poll(params);
        } catch (error) {
            return { Success: false, ResultCode: 'ERROR', Message: `The external payment poll failed: ${error instanceof Error ? error.message : String(error)}` };
        }
    }

    private async poll(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) {
            return { Success: false, ResultCode: 'NO_CONTEXT_USER', Message: 'ContextUser is required: a captured payment has to be attributable to somebody.' };
        }
        const input: OrdersPollExternalPaymentsInput = {};

        const providerID = strParam(params, 'PaymentProviderID');
        if (providerID !== null) {
            if (!UUID.test(providerID)) return { Success: false, ResultCode: 'INVALID_PAYMENT_PROVIDER_ID', Message: `'${providerID}' is not a payment provider ID.` };
            input.PaymentProviderID = providerID;
        }

        const maxCount = numParam(params, 'MaxCount');
        if (maxCount !== null) {
            if (!Number.isInteger(maxCount) || maxCount < 1) {
                return { Success: false, ResultCode: 'INVALID_MAX_COUNT', Message: `MaxCount must be a whole number of at least 1 — got '${String(param(params, 'MaxCount'))}'.` };
            }
            input.MaxCount = maxCount;
        }

        const since = strParam(params, 'SinceWatermark');
        if (since !== null) {
            if (Number.isNaN(new Date(since).getTime())) return { Success: false, ResultCode: 'INVALID_SINCE_WATERMARK', Message: `'${since}' is not a date/time. SinceWatermark takes ISO 8601.` };
            input.SinceWatermark = new Date(since).toISOString();
        }

        const preview = boolParam(params, 'Preview');
        if (preview === null && supplied(params, 'Preview')) {
            return { Success: false, ResultCode: 'INVALID_PREVIEW', Message: `Preview takes true or false — got '${String(param(params, 'Preview'))}'. Refused rather than guessed, because the wrong guess records cash.` };
        }
        if (preview !== null) input.Preview = preview;

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const result = await new OrdersPollExternalPaymentsOperation().Execute(input, { provider, user });
        if (!result.Success || !result.Output) {
            return { Success: false, ResultCode: result.ResultCode ?? 'OPERATION_FAILED', Params: params.Params, Message: result.ErrorMessage ?? 'Orders.PollExternalPayments returned no result.' };
        }
        const out = result.Output;
        setOutput(params, 'Captured', out.Captured);
        setOutput(params, 'Held', out.Held);
        setOutput(params, 'Unmatched', out.Unmatched);
        setOutput(params, 'Refused', out.Refused);
        setOutput(params, 'ReversalNeeded', out.ReversalNeeded);
        setOutput(params, 'Ignored', out.Ignored);
        setOutput(params, 'Outcomes', out.Outcomes);
        setOutput(params, 'NewWatermarks', out.NewWatermarks);
        setOutput(params, 'PreviewedOnly', input.Preview === true);

        if (!out.Success) {
            return { Success: false, ResultCode: out.ResultCode, Params: params.Params, Message: out.Message ?? 'The poll needs attention.' };
        }
        return { Success: true, ResultCode: out.ResultCode, Params: params.Params, Message: out.Message ?? `${out.Captured} payment(s) captured.` };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadPollExternalPaymentsAction(): void {
    void PollExternalPaymentsAction;
}
