/**
 * @fileoverview `Orders: Create Provider Subscriptions` — the retry and backfill for gateway-billed
 * subscriptions (option E, E2).
 *
 * The checkout hands each new auto-renewing subscription to the gateway once, right after its payment
 * is booked. When that fails (the gateway is down, no price is mapped yet), nothing at checkout tries
 * again: a replayed checkout returns before that step once its payment is booked. And a term that
 * starts after the purchase day cannot be handed over until its first charge is within the gateway's
 * limit. This Action is how both get done: the daily schedule runs it over every eligible subscription
 * that has no gateway id yet, and an operator can run it for one subscription.
 *
 * NO LOGIC LIVES HERE. Selection, the first-charge rule, the gateway search and create, and the alert
 * Tasks are all `EnsureProviderSubscriptions` (packages/CoreEntitiesServer/src/ProviderSubscriptions.ts),
 * the same code the checkout calls, and on its own provider the same way
 * (`EnsureProviderSubscriptionsOnOwnProvider`): the scheduler's provider is shared with the process.
 *
 * PREVIEW DEFAULTS TO TRUE, and is read strictly: the scheduled job ships Disabled and set to Preview.
 *
 * THE RUN FAILS ONLY FOR NEW PROBLEMS. A subscription that needs a person raises one open Task; while
 * it stays open, later runs report it in `Waiting` and succeed, so the job's failure notice means
 * "something new needs a person", not "the same thing still does". There is no Remote Operation or UI
 * button for it: an operator runs this Action (with `SubscriptionID`) from the Actions screen.
 *
 * @module @mj-biz-apps/orders-server
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { EnsureProviderSubscriptionsOnOwnProvider, type EnsureProviderSubscriptionsInput } from '@mj-biz-apps/orders-core-entities-server';
import { boolParam, numParam, setOutput, strParam, supplied, UUID } from './action-params.js';

const refuse = (ResultCode: string, Message: string): ActionResultSimple => ({ Success: false, ResultCode, Message });

/**
 * Inputs: `SubscriptionID`, `Preview` (default true), `MaxCount` (gateway subscriptions created per
 * run) — all optional. Outputs: `Linked`, `Deferred`, `Alerts` (new Tasks), `Waiting`, `Outcomes`,
 * `PreviewedOnly`.
 */
@RegisterClass(BaseAction, 'Orders.CreateProviderSubscriptions')
export class CreateProviderSubscriptionsAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const user = params.ContextUser;
            if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required: creating a gateway subscription has to be attributable to somebody.');

            const input: EnsureProviderSubscriptionsInput = { Preview: true };

            const subscriptionID = strParam(params, 'SubscriptionID');
            if (subscriptionID !== null) {
                if (!UUID.test(subscriptionID)) return refuse('INVALID_SUBSCRIPTION_ID', `'${subscriptionID}' is not a subscription id.`);
                input.SubscriptionIDs = [subscriptionID];
            }

            if (supplied(params, 'Preview')) {
                const preview = boolParam(params, 'Preview');
                // Refused rather than guessed: the wrong guess creates gateway subscriptions.
                if (preview === null) return refuse('INVALID_PREVIEW', `Preview takes true or false — got '${strParam(params, 'Preview')}'.`);
                input.Preview = preview;
            }

            const maxCount = numParam(params, 'MaxCount');
            if (maxCount !== null) {
                if (!Number.isInteger(maxCount) || maxCount < 1) {
                    return refuse('INVALID_MAX_COUNT', `MaxCount must be a whole number of at least 1 — got '${strParam(params, 'MaxCount')}'.`);
                }
                input.MaxCount = maxCount;
            }

            const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const output = await EnsureProviderSubscriptionsOnOwnProvider(input, provider, user);

            setOutput(params, 'Linked', output.Linked);
            setOutput(params, 'Deferred', output.Deferred);
            setOutput(params, 'Alerts', output.Alerts);
            setOutput(params, 'Waiting', output.Waiting);
            setOutput(params, 'Outcomes', output.Outcomes);
            // Not named Preview: an output overwrites the input's row of the same name.
            setOutput(params, 'PreviewedOnly', input.Preview === true);

            if (!output.Success) return { Success: false, ResultCode: 'ERROR', Params: params.Params, Message: output.Message };
            return {
                // A NEW problem for a person fails the run, so the job's failure notice reaches someone; one
                // whose Task is already open does not fail every run after it.
                Success: output.Alerts === 0,
                ResultCode: output.Alerts > 0 ? 'NEEDS_ATTENTION' : input.Preview ? 'PREVIEWED' : 'COMPLETED',
                Params: params.Params,
                Message: output.Message,
            };
        } catch (error) {
            return refuse('ERROR', `The provider subscription pass failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadCreateProviderSubscriptionsAction(): void {
    void CreateProviderSubscriptionsAction;
}
