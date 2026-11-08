/**
 * @fileoverview `Orders: Check Payment Webhook Endpoints` — the scheduled webhook endpoint drift check
 * (#477). The same check runs once at server start (`PaymentWebhookExtension`).
 *
 * Drift is a configuration fault, not a finance item: any provider whose endpoint is missing, disabled,
 * does not send an event kind Orders acts on, or could not be read fails the run, and the check itself
 * logs each as an error. Reads only.
 *
 * @module @mj-biz-apps/orders-server
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { CheckPaymentWebhookEndpoints } from '@mj-biz-apps/orders-core-entities-server';
import { setOutput, strParam, UUID } from './action-params.js';

const refuse = (ResultCode: string, Message: string): ActionResultSimple => ({ Success: false, ResultCode, Message });

/** Input: `PaymentProviderID` (optional). Output: `Results`. */
@RegisterClass(BaseAction, 'Orders.CheckPaymentWebhookEndpoints')
export class CheckPaymentWebhookEndpointsAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const user = params.ContextUser;
            if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required to read the payment providers.');
            const providerID = strParam(params, 'PaymentProviderID');
            if (providerID !== null && !UUID.test(providerID)) {
                return refuse('INVALID_PAYMENT_PROVIDER_ID', `'${providerID}' is not a payment provider id.`);
            }

            const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const results = await CheckPaymentWebhookEndpoints(provider, user, providerID ?? undefined);
            setOutput(params, 'Results', results);

            const faults = results.filter((r) => r.Status !== 'OK' && r.Status !== 'Skipped');
            if (faults.length) {
                return {
                    Success: false,
                    ResultCode: 'WEBHOOK_ENDPOINT_DRIFT',
                    Params: params.Params,
                    Message: faults.map((r) => `${r.PaymentProviderName}: ${r.Status}. ${r.Message}`).join(' '),
                };
            }
            return {
                Success: true,
                ResultCode: 'COMPLETED',
                Params: params.Params,
                Message: `${results.length} provider(s) checked; no drift.`,
            };
        } catch (error) {
            return refuse('ERROR', `The webhook endpoint check failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadCheckPaymentWebhookEndpointsAction(): void {
    void CheckPaymentWebhookEndpointsAction;
}
