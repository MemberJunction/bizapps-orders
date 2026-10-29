/**
 * LinkProviderSubscription — the checked way to record that a gateway already bills an existing Orders
 * subscription (E3).
 *
 * Linking is the write that makes the gateway bill a subscription and Orders stop renewing it, and it
 * cannot be undone (E2b). Typed by hand it is a guess: a typo renews a subscription free forever, and
 * another customer's id points this subscription's Cancel at their gateway subscription. So the shared
 * entity refuses it from any form or API, and the two server doors that may make it take the sanction:
 * the checkout hand-over (E2, which created the gateway subscription itself) and this function, which
 * checks the gateway subscription first:
 *
 *   · it exists at the gateway and has not ended;
 *   · no other Orders subscription records it;
 *   · the Orders subscription records no gateway id yet;
 *   · the gateway customer's e-mail is the subscriber's, when both are known;
 *   · the account's gateway can bill subscriptions.
 *
 * Then it links (sanctioned) and syncs, so everything the gateway charged since the subscription's term
 * ended is booked (E4). Used for an `UnknownGatewaySubscription` Task (a subscriber the import missed or
 * held back), a support repair, and later by the importer.
 *
 * CONNECTS TO:
 *   CALLERS: Server: Orders.LinkProviderSubscription (Action)
 *   SYNC:    ./ProviderSubscriptionSync.ts
 *   RULE:    @mj-biz-apps/orders-entities SubscriptionEntity (the link refusal) · ./SubscriptionEntityServer.ts
 */
import { CompositeKey, LogStatus, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { PERSON_ENTITY } from './entity-names.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { SyncProviderSubscription, type SyncProviderSubscriptionResult } from './ProviderSubscriptionSync.js';
import { EscapeText, RequireUUID } from './sql-guards.js';
import { SanctionProviderBilledChange } from './SubscriptionEntityServer.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';

export interface LinkProviderSubscriptionInput {
    SubscriptionID: string;
    PaymentProviderID: string;
    ProviderSubscriptionID: string;
    /** Check only; link nothing. */
    Preview?: boolean;
}

export type LinkProviderSubscriptionCode =
    | 'Linked'
    | 'WouldLink'
    | 'BadInput'
    | 'SubscriptionNotFound'
    | 'AlreadyLinked'
    | 'ProviderCannotBill'
    | 'NotAtGateway'
    | 'EndedAtGateway'
    | 'LinkedElsewhere'
    | 'EmailMismatch'
    | 'LinkFailed';

export interface LinkProviderSubscriptionResult {
    Success: boolean;
    Code: LinkProviderSubscriptionCode;
    Message: string;
    /** The sync that followed the link (what was booked). */
    Sync?: SyncProviderSubscriptionResult;
}

/** Check, link and sync. Never throws: every refusal is a result. */
export async function LinkProviderSubscription(
    input: LinkProviderSubscriptionInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinkProviderSubscriptionResult> {
    const refuse = (Code: LinkProviderSubscriptionCode, Message: string): LinkProviderSubscriptionResult => ({ Success: false, Code, Message });
    let subscriptionID: string;
    let providerID: string;
    try {
        subscriptionID = RequireUUID(input.SubscriptionID, 'SubscriptionID');
        providerID = RequireUUID(input.PaymentProviderID, 'PaymentProviderID');
    } catch (err) {
        return refuse('BadInput', err instanceof Error ? err.message : String(err));
    }
    const gatewayID = (input.ProviderSubscriptionID ?? '').trim();
    if (!gatewayID) return refuse('BadInput', 'ProviderSubscriptionID is required.');

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const sub = (
        await rv.RunView<{ ID: string; SubscriptionNumber: string; ProviderSubscriptionID: string | null; BeneficiaryPersonID: string | null }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `ID = '${subscriptionID}'`,
                Fields: ['ID', 'SubscriptionNumber', 'ProviderSubscriptionID', 'BeneficiaryPersonID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        )
    ).Results?.[0];
    if (!sub) return refuse('SubscriptionNotFound', `No subscription ${subscriptionID}.`);
    if (sub.ProviderSubscriptionID) {
        return refuse(
            'AlreadyLinked',
            `${sub.SubscriptionNumber} already records gateway subscription ${sub.ProviderSubscriptionID}. A recorded id is never replaced.`,
        );
    }

    let config;
    let driver;
    try {
        config = await LoadPaymentProviderConfig(providerID, provider, user);
        driver = await BuildPaymentProvider(config, provider, user);
    } catch (err) {
        return refuse('ProviderCannotBill', `Payment provider ${providerID} cannot be used: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!config.Capabilities?.SupportsSubscriptionBilling) {
        return refuse('ProviderCannotBill', `Payment provider '${config.Name}' is not a gateway that bills subscriptions.`);
    }

    const described = await driver.DescribeProviderSubscription(gatewayID);
    if (!described.Success || !described.State) {
        return refuse('NotAtGateway', `The gateway has no subscription ${gatewayID} (or could not be read): ${described.Reason ?? 'no state'}.`);
    }
    if (described.State === 'Ended') {
        return refuse('EndedAtGateway', `Gateway subscription ${gatewayID} has ended (${described.Status}); linking it would bill nothing.`);
    }

    const elsewhere = (
        await rv.RunView<{ SubscriptionNumber: string }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `PaymentProviderID = '${providerID}' AND ProviderSubscriptionID = '${EscapeText(gatewayID)}'`,
                Fields: ['ID', 'SubscriptionNumber'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        )
    ).Results?.[0];
    if (elsewhere) return refuse('LinkedElsewhere', `Gateway subscription ${gatewayID} is already recorded on ${elsewhere.SubscriptionNumber}.`);

    if (described.CustomerEmail && sub.BeneficiaryPersonID) {
        const person = (
            await rv.RunView<{ Email: string | null }>(
                {
                    EntityName: PERSON_ENTITY,
                    ExtraFilter: `ID = '${RequireUUID(sub.BeneficiaryPersonID, 'BeneficiaryPersonID')}'`,
                    Fields: ['ID', 'Email'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                user,
            )
        ).Results?.[0];
        const email = (person?.Email ?? '').trim().toLowerCase();
        if (email && email !== described.CustomerEmail.trim().toLowerCase()) {
            return refuse(
                'EmailMismatch',
                `Gateway subscription ${gatewayID} bills ${described.CustomerEmail}, but ${sub.SubscriptionNumber}'s subscriber is ${person?.Email}. ` +
                    `Check it is the same customer; nothing was linked.`,
            );
        }
    }

    if (input.Preview) {
        return { Success: true, Code: 'WouldLink', Message: `${sub.SubscriptionNumber} can be linked to ${gatewayID} (${described.State}).` };
    }

    const entity = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(SUBSCRIPTION_ENTITY, CompositeKey.FromID(subscriptionID), user);
    SanctionProviderBilledChange(entity);
    entity.PaymentProviderID = providerID;
    entity.ProviderSubscriptionID = gatewayID;
    if (!(await entity.Save())) {
        return refuse('LinkFailed', `Could not link ${sub.SubscriptionNumber}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    LogStatus(`[LinkProviderSubscription] ${sub.SubscriptionNumber} linked to ${gatewayID} on '${config.Name}'.`);
    const sync = await SyncProviderSubscription(subscriptionID, {}, provider, user);
    return {
        Success: true,
        Code: 'Linked',
        Message:
            `Linked ${sub.SubscriptionNumber} to gateway subscription ${gatewayID}; the sync ${sync.Outcome}` +
            (sync.Actions.length ? `: ${sync.Actions.join('; ')}` : '.'),
        Sync: sync,
    };
}
