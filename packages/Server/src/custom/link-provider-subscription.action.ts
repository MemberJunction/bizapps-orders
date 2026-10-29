/**
 * @fileoverview `Orders: Link Provider Subscription` — record, after checking, that a payment gateway
 * already bills an existing Orders subscription (option E, E3).
 *
 * Linking makes the gateway bill a subscription and Orders stop renewing it, and it cannot be undone, so
 * the shared entity refuses it from any form or API. This Action is the checked door for a person: it reads
 * the gateway subscription and refuses one that does not exist, has ended, is recorded on another Orders
 * subscription, or bills a different customer's e-mail; then it links and syncs, booking everything the
 * gateway charged since the subscription's term ended. It answers an `UnknownGatewaySubscription` Task.
 *
 * NO LOGIC LIVES HERE: `LinkProviderSubscription` (packages/CoreEntitiesServer/src/LinkProviderSubscription.ts).
 * PREVIEW DEFAULTS TO TRUE: a preview runs every check and links nothing.
 *
 * @module @mj-biz-apps/orders-server
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { LinkProviderSubscription } from '@mj-biz-apps/orders-core-entities-server';
import { boolParam, setOutput, strParam, supplied, UUID } from './action-params.js';

const refuse = (ResultCode: string, Message: string): ActionResultSimple => ({ Success: false, ResultCode, Message });

/**
 * Inputs: `SubscriptionID`, `PaymentProviderID`, `ProviderSubscriptionID` (required), `Preview` (default true).
 * Outputs: `Code`, `Sync`, `PreviewedOnly`.
 */
@RegisterClass(BaseAction, 'Orders.LinkProviderSubscription')
export class LinkProviderSubscriptionAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const user = params.ContextUser;
            if (!user) return refuse('NO_CONTEXT_USER', 'ContextUser is required: linking a gateway subscription has to be attributable to somebody.');
            const subscriptionID = strParam(params, 'SubscriptionID');
            const providerID = strParam(params, 'PaymentProviderID');
            const gatewayID = strParam(params, 'ProviderSubscriptionID');
            if (!subscriptionID || !UUID.test(subscriptionID)) return refuse('INVALID_SUBSCRIPTION_ID', 'SubscriptionID must be a subscription id.');
            if (!providerID || !UUID.test(providerID)) return refuse('INVALID_PAYMENT_PROVIDER_ID', 'PaymentProviderID must be a payment provider id.');
            if (!gatewayID) return refuse('INVALID_PROVIDER_SUBSCRIPTION_ID', 'ProviderSubscriptionID is required.');
            let preview = true;
            if (supplied(params, 'Preview')) {
                const value = boolParam(params, 'Preview');
                if (value === null) return refuse('INVALID_PREVIEW', `Preview takes true or false — got '${strParam(params, 'Preview')}'.`);
                preview = value;
            }

            const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const result = await LinkProviderSubscription(
                { SubscriptionID: subscriptionID, PaymentProviderID: providerID, ProviderSubscriptionID: gatewayID, Preview: preview },
                provider,
                user,
            );
            setOutput(params, 'Code', result.Code);
            setOutput(params, 'Sync', result.Sync ?? null);
            setOutput(params, 'PreviewedOnly', preview);
            return { Success: result.Success, ResultCode: result.Code, Params: params.Params, Message: result.Message };
        } catch (error) {
            return refuse('ERROR', `Linking the gateway subscription failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/** Tree-shaking anchor. */
export function LoadLinkProviderSubscriptionAction(): void {
    void LinkProviderSubscriptionAction;
}
