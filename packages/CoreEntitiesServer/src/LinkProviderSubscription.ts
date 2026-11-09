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
 *   · the account's gateway can bill subscriptions, and the account is the subscription's company's;
 *   · it exists at the gateway and has not ended;
 *   · no other Orders subscription records it, and it was not created by Orders for another one (the
 *     `OrdersSubscriptionID` metadata E2 writes, which the webhook reads too);
 *   · the Orders subscription records no gateway id yet, and no other payment provider;
 *   · it bills the subscriber: the gateway customer's e-mail is the beneficiary's. A MISMATCH is evidence of
 *     another customer and always refuses. When there is nothing to compare (no e-mail at the gateway, no
 *     beneficiary, or a beneficiary with no e-mail; typically an organization's subscription), a person must
 *     say they checked (`CustomerConfirmed`): absence of evidence can be confirmed, contrary evidence cannot,
 *     and the check is never skipped silently;
 *   · the price it bills maps to the subscription's product (unless a person confirms an older price).
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
import { CompositeKey, LogStatus, RunView, type DatabaseProviderBase, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { PERSON_ENTITY } from './entity-names.js';
import { ORDERS_SUBSCRIPTION_METADATA_KEY } from './ProviderSubscriptions.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { SyncProviderSubscription, type SyncProviderSubscriptionResult } from './ProviderSubscriptionSync.js';
import { EscapeText, RequireUUID } from './sql-guards.js';
import { SanctionProviderBilledChange } from './SubscriptionEntityServer.js';
import { WithIsolatedProvider } from './isolatedProvider.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';

export interface LinkProviderSubscriptionInput {
    SubscriptionID: string;
    PaymentProviderID: string;
    ProviderSubscriptionID: string;
    /** Check only; link nothing. */
    Preview?: boolean;
    /**
     * A person checked at the gateway that it bills this subscription's customer, for a link with nothing to compare
     * (no e-mail at the gateway, or no beneficiary e-mail, as for most organization-held subscriptions). Never
     * overrides a MISMATCH.
     */
    CustomerConfirmed?: boolean;
    /**
     * Link although the gateway bills it on a price this account maps to ANOTHER product (or maps to none): a
     * person confirmed the subscription's product is right (an imported Professional subscriber on the $399
     * Foundation price). Off by default, so a typed id for the wrong customer's plan is refused.
     */
    AllowPriceOfAnotherProduct?: boolean;
}

export type LinkProviderSubscriptionCode =
    | 'Linked'
    | 'WouldLink'
    | 'BadInput'
    | 'SubscriptionNotFound'
    | 'AlreadyLinked'
    | 'OtherProvider'
    | 'CompanyMismatch'
    | 'CreatedForAnother'
    | 'CustomerUnverified'
    | 'ProviderCannotBill'
    | 'NotAtGateway'
    | 'EndedAtGateway'
    | 'LinkedElsewhere'
    | 'EmailMismatch'
    | 'PriceForAnotherProduct'
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
        await rv.RunView<{
            ID: string;
            SubscriptionNumber: string;
            CompanyID: string;
            PaymentProviderID: string | null;
            ProviderSubscriptionID: string | null;
            BeneficiaryPersonID: string | null;
            HolderOrganizationID: string | null;
            ProductID: string;
        }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `ID = '${subscriptionID}'`,
                Fields: ['ID', 'SubscriptionNumber', 'CompanyID', 'PaymentProviderID', 'ProviderSubscriptionID', 'BeneficiaryPersonID', 'HolderOrganizationID', 'ProductID'],
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
    if (sub.PaymentProviderID && sub.PaymentProviderID.toLowerCase() !== providerID.toLowerCase()) {
        return refuse(
            'OtherProvider',
            `${sub.SubscriptionNumber} already names payment provider ${sub.PaymentProviderID}, not ${providerID}. A recorded provider is never replaced here.`,
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
    if ((config.CompanyID ?? '').toLowerCase() !== (sub.CompanyID ?? '').toLowerCase()) {
        return refuse(
            'CompanyMismatch',
            `Payment provider '${config.Name}' belongs to company ${config.CompanyID}, but ${sub.SubscriptionNumber} is company ${sub.CompanyID}'s. Nothing was linked.`,
        );
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
    // Orders' own hand-over (E2) stamps the subscription it created the gateway one for; the webhook reads the same key.
    const createdFor = (described.Metadata?.[ORDERS_SUBSCRIPTION_METADATA_KEY] ?? '').trim();
    if (createdFor && createdFor.toLowerCase() !== subscriptionID.toLowerCase()) {
        return refuse(
            'CreatedForAnother',
            `Gateway subscription ${gatewayID} was created by Orders for subscription ${createdFor} (its ${ORDERS_SUBSCRIPTION_METADATA_KEY}), not ${sub.SubscriptionNumber}. Nothing was linked.`,
        );
    }

    // It must bill this subscription's customer. Compared by e-mail when both are known (a mismatch always refuses);
    // with nothing to compare, a person says they checked.
    let personEmail = '';
    if (sub.BeneficiaryPersonID) {
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
        personEmail = (person?.Email ?? '').trim();
    }
    const gatewayEmail = (described.CustomerEmail ?? '').trim();
    if (personEmail && gatewayEmail) {
        if (personEmail.toLowerCase() !== gatewayEmail.toLowerCase()) {
            return refuse(
                'EmailMismatch',
                `Gateway subscription ${gatewayID} bills ${gatewayEmail}, but ${sub.SubscriptionNumber}'s subscriber is ${personEmail}. ` +
                    `Check it is the same customer; nothing was linked.`,
            );
        }
    } else if (!input.CustomerConfirmed) {
        const why = !gatewayEmail
            ? `the gateway customer has no e-mail`
            : sub.BeneficiaryPersonID
              ? `${sub.SubscriptionNumber}'s subscriber has no e-mail`
              : `${sub.SubscriptionNumber} names no subscriber${sub.HolderOrganizationID ? ' (an organization holds it)' : ''}`;
        return refuse(
            'CustomerUnverified',
            `Cannot check that gateway subscription ${gatewayID} bills ${sub.SubscriptionNumber}'s customer: ${why}. Nothing was linked. ` +
                `Check the customer at the gateway, then link again with CustomerConfirmed.`,
        );
    }

    // The plan it bills must be this subscription's product: a typed id for another customer's plan is refused.
    if (!input.AllowPriceOfAnotherProduct) {
        const mapped = described.ProviderPriceID
            ? (
                  await rv.RunView<{ ProductID: string }>(
                      {
                          EntityName: 'MJ_BizApps_Orders: Payment Provider Prices',
                          ExtraFilter: `PaymentProviderID = '${providerID}' AND ProviderPriceID = '${EscapeText(described.ProviderPriceID)}' AND IsActive = 1`,
                          Fields: ['ID', 'ProductID'],
                          ResultType: 'simple',
                          BypassCache: true,
                      },
                      user,
                  )
              ).Results ?? []
            : [];
        if (!mapped.some((m) => m.ProductID?.toLowerCase() === sub.ProductID?.toLowerCase())) {
            return refuse(
                'PriceForAnotherProduct',
                `Gateway subscription ${gatewayID} bills price ${described.ProviderPriceID ?? '(none)'}, which this account ` +
                    `${mapped.length ? 'maps to another product' : 'does not map to any product'}, not ${sub.SubscriptionNumber}'s. ` +
                    `If the subscription's product is right (an imported subscriber on an older price), link again with AllowPriceOfAnotherProduct.`,
            );
        }
    }

    if (input.Preview) {
        return { Success: true, Code: 'WouldLink', Message: `${sub.SubscriptionNumber} can be linked to ${gatewayID} (${described.State}).` };
    }

    // The elsewhere-check and the write, under locks, on a provider of its own: two links of one gateway id (or of
    // one subscription) at once cannot both pass the checks above and both save. The unique index backs it up.
    const linked = await WithIsolatedProvider(async (own) => {
        const db = own as unknown as DatabaseProviderBase & { ExecuteSQL: (q: string) => Promise<unknown> };
        await db.BeginTransaction();
        try {
            const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { Results?: unknown[] })?.Results ?? [])) as Array<{ ID: string }>;
            const taken = rows(
                await db.ExecuteSQL(
                    `SELECT ID FROM __mj_BizAppsOrders.Subscription WITH (UPDLOCK, HOLDLOCK) WHERE PaymentProviderID = '${providerID}' AND ProviderSubscriptionID = '${EscapeText(gatewayID)}'`,
                ),
            );
            const mine = rows(
                await db.ExecuteSQL(
                    `SELECT ID FROM __mj_BizAppsOrders.Subscription WITH (UPDLOCK, ROWLOCK) WHERE ID = '${subscriptionID}' AND ProviderSubscriptionID IS NULL ` +
                        `AND (PaymentProviderID IS NULL OR PaymentProviderID = '${providerID}')`,
                ),
            );
            if (taken.length || !mine.length) {
                await db.RollbackTransaction();
                return taken.length
                    ? refuse('LinkedElsewhere', `Gateway subscription ${gatewayID} was just recorded on another subscription.`)
                    : refuse('AlreadyLinked', `${sub.SubscriptionNumber} was just linked by another request.`);
            }
            const entity = await own.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(SUBSCRIPTION_ENTITY, CompositeKey.FromID(subscriptionID), user);
            SanctionProviderBilledChange(entity);
            entity.PaymentProviderID = providerID;
            entity.ProviderSubscriptionID = gatewayID;
            if (!(await entity.Save())) {
                await db.RollbackTransaction();
                return refuse('LinkFailed', `Could not link ${sub.SubscriptionNumber}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            await db.CommitTransaction();
            return null;
        } catch (err) {
            await db.RollbackTransaction().catch(() => undefined);
            return refuse('LinkFailed', `Could not link ${sub.SubscriptionNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, provider);
    if (linked) return linked;
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
