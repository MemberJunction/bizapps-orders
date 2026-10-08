/**
 * @fileoverview `Orders: Reconcile Payment Provider Charges` — the scheduling surface for
 * `Orders.ReconcilePaymentProviderCharges` (#477).
 *
 * MJ's scheduler dispatches Actions, so this Action is the adapter between the nightly job and the
 * operation, the same shape as `detect-overlapping-subscriptions.action.ts`. NO MATCHING LOGIC LIVES
 * HERE.
 *
 * PREVIEW IS READ STRICTLY. A scheduler writes `false` as the text "false"; read loosely it is truthy,
 * and read wrongly the other way a job configured for preview raises on its first run. An unreadable
 * value is refused (see `action-params.ts`).
 *
 * A PROVIDER THAT COULD NOT BE READ FAILS THE RUN. Passing the result through as green would let a
 * night on which the gateway refused every read look exactly like a night with no mismatches.
 *
 * @module @mj-biz-apps/orders-server
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersReconcilePaymentProviderChargesOperation,
    type OrdersReconcilePaymentProviderChargesInput,
} from '@mj-biz-apps/orders-entities';
import { RequireDate } from '@mj-biz-apps/orders-core-entities-server';
import { boolParam, setOutput, strParam, supplied, UUID } from './action-params.js';

const refuse = (ResultCode: string, Message: string): ActionResultSimple => ({ Success: false, ResultCode, Message });

/**
 * Inputs: `PaymentProviderID`, `FromDate`, `ToDate`, `Preview` (all optional; Preview defaults to true).
 * Outputs: `Mismatches`, `Raised`, `Errors`.
 */
@RegisterClass(BaseAction, 'Orders.ReconcilePaymentProviderCharges')
export class ReconcilePaymentProviderChargesAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.reconcile(params);
        } catch (error) {
            return refuse('ERROR', `The charge reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async reconcile(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required: any exceptions raised have to be attributable to somebody.');

        const input: OrdersReconcilePaymentProviderChargesInput = {};
        const providerID = strParam(params, 'PaymentProviderID');
        if (providerID !== null) {
            if (!UUID.test(providerID)) return refuse('INVALID_PAYMENT_PROVIDER_ID', `'${providerID}' is not a payment provider id.`);
            input.PaymentProviderID = providerID;
        }
        for (const name of ['FromDate', 'ToDate'] as const) {
            const value = strParam(params, name);
            if (value === null) continue;
            try {
                RequireDate(value, name);
            } catch {
                return refuse('INVALID_DATE', `'${value}' is not a date. ${name} takes YYYY-MM-DD.`);
            }
            input[name] = value;
        }
        const preview = boolParam(params, 'Preview');
        if (supplied(params, 'Preview') && preview === null) {
            return refuse('INVALID_PREVIEW', 'Preview takes true or false.');
        }
        input.Preview = preview ?? true;

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const result = await new OrdersReconcilePaymentProviderChargesOperation().Execute(input, { provider, user });
        if (!result.Success || !result.Output) {
            return {
                Success: false,
                ResultCode: result.ResultCode ?? 'OPERATION_FAILED',
                Params: params.Params,
                Message: result.ErrorMessage ?? 'Orders.ReconcilePaymentProviderCharges returned no result.',
            };
        }

        const output = result.Output;
        setOutput(params, 'Mismatches', output.Mismatches);
        setOutput(params, 'Raised', output.Raised);
        setOutput(params, 'Errors', output.Errors);
        return {
            Success: output.Success,
            ResultCode: output.Success ? (output.Mismatches.length ? 'MISMATCHES_FOUND' : 'COMPLETED') : 'OPERATION_REPORTED_FAILURE',
            Params: params.Params,
            Message:
                `${output.Message ?? ''}` +
                (output.Errors.length ? ` ${output.Errors.slice(0, 3).map((e) => `${e.Code}: ${e.Message}`).join('; ')}` : ''),
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadReconcilePaymentProviderChargesAction(): void {
    void ReconcilePaymentProviderChargesAction;
}
