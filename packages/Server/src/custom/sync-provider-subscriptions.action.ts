/**
 * @fileoverview `Orders: Sync Provider Subscriptions` — the nightly check and repair of gateway-billed
 * subscriptions (option E, E3 + E4 + E6).
 *
 * Once a payment gateway bills a subscription it renews, fails to collect, retries and ends it on its own.
 * Each of those reaches Orders as a webhook, and the webhook brings that one subscription in line. This
 * Action is the backstop: every night it reads every gateway-billed subscription (live, paused, or
 * cancelled within a term) from the gateway and does the same, so a missed or failed webhook is caught
 * within a day. It is also how the cutover catches up after the import, and an operator can run it for one
 * subscription.
 *
 * NO LOGIC LIVES HERE: `SyncProviderSubscriptions` (packages/CoreEntitiesServer/src/ProviderSubscriptionSync.ts)
 * is the same code the webhook runs, each subscription on a provider of its own.
 *
 * PREVIEW DEFAULTS TO TRUE, read strictly. The scheduled job ships Disabled and set to Preview: a preview
 * reads both sides and reports every difference and what a run would do; it writes nothing.
 *
 * THE RUN FAILS FOR A FAILURE, NOT FOR A DIFFERENCE IT FIXED. A subscription it could not read or book is a
 * failure (the job's notice reaches someone); one it brought in line, or raised a Task for, is not.
 *
 * @module @mj-biz-apps/orders-server
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { SyncProviderSubscriptions, type SyncProviderSubscriptionsInput } from '@mj-biz-apps/orders-core-entities-server';
import { boolParam, setOutput, strParam, supplied, UUID } from './action-params.js';

const refuse = (ResultCode: string, Message: string): ActionResultSimple => ({ Success: false, ResultCode, Message });

/**
 * Inputs: `SubscriptionID`, `Preview` (default true). Outputs: `Read`, `Changed`, `NeedsPerson`, `Failed`,
 * `Differences`, `Results`, `PreviewedOnly`.
 */
@RegisterClass(BaseAction, 'Orders.SyncProviderSubscriptions')
export class SyncProviderSubscriptionsAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const user = params.ContextUser;
            if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required: booking a gateway renewal has to be attributable to somebody.');

            const input: SyncProviderSubscriptionsInput = { Preview: true };
            const subscriptionID = strParam(params, 'SubscriptionID');
            if (subscriptionID !== null) {
                if (!UUID.test(subscriptionID)) return refuse('INVALID_SUBSCRIPTION_ID', `'${subscriptionID}' is not a subscription id.`);
                input.SubscriptionIDs = [subscriptionID];
            }
            if (supplied(params, 'Preview')) {
                const preview = boolParam(params, 'Preview');
                // Refused rather than guessed: the wrong guess books renewals and records cancels.
                if (preview === null) return refuse('INVALID_PREVIEW', `Preview takes true or false — got '${strParam(params, 'Preview')}'.`);
                input.Preview = preview;
            }

            const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const output = await SyncProviderSubscriptions(input, provider, user);

            setOutput(params, 'Read', output.Read);
            setOutput(params, 'Changed', output.Changed);
            setOutput(params, 'NeedsPerson', output.NeedsPerson);
            setOutput(params, 'Failed', output.Failed);
            setOutput(params, 'Differences', output.Differences);
            setOutput(params, 'Results', output.Results);
            // Not named Preview: an output overwrites the input's row of the same name.
            setOutput(params, 'PreviewedOnly', input.Preview === true);

            return {
                Success: output.Success,
                ResultCode: !output.Success ? 'FAILED' : input.Preview ? 'PREVIEWED' : output.NeedsPerson > 0 ? 'NEEDS_ATTENTION' : 'COMPLETED',
                Params: params.Params,
                Message: output.Message,
            };
        } catch (error) {
            return refuse('ERROR', `The provider subscription sync failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadSyncProviderSubscriptionsAction(): void {
    void SyncProviderSubscriptionsAction;
}
