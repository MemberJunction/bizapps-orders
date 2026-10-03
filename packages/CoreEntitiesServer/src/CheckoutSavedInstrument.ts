/**
 * Keeping a checkout's card so an auto-renewing subscription can be charged at renewal.
 *
 * A subscription sold through the anonymous checkout renews through `Orders.SpawnRenewals`, which can
 * only charge a card the gateway kept. The gateway keeps one only if it was ASKED to at the first
 * payment — asking later is impossible, because the buyer and their card entry are gone. So this runs
 * in two places, and both are about the first purchase:
 *
 *   BEFORE PAYMENT   `SnapshotSellsSubscription` decides whether to ask at all, from the products in
 *                    the session's priced draft: the order is created only after payment, so there is
 *                    no order to read yet. `FindReusableProviderCustomerRef` finds the gateway
 *                    customer the card will belong to. One customer per person per provider: a
 *                    person's second subscription reuses the customer their first created, found
 *                    through their own wallet — never by searching the gateway by e-mail, which would
 *                    attach to records this application did not create. A first-time buyer has no
 *                    person yet (completion creates it), so their customer is opened for the checkout
 *                    session instead, and becomes that person's once the card is filed.
 *   AFTER PAYMENT    `SaveCheckoutInstrumentForRenewals` reads back the card the buyer paid with, puts
 *                    it in their wallet (`CustomerPaymentMethod` over its own `PaymentDetail`, D38/D39)
 *                    and makes it each new subscription's renewal card.
 *
 * FAIL-SOFT AFTER PAYMENT. By the time the card is saved the money has moved and the order is
 * confirmed. A failure here must not undo either; it leaves the subscription without a renewal card,
 * which is logged and visible (`DefaultCustomerPaymentMethodID` is null) and is fixed by the buyer
 * adding a card, not by refusing a sale that succeeded.
 *
 * IDEMPOTENT. Checkout completion is replayed (client retry, the settled-payment webhook), so a second
 * call finds the wallet entry the first one wrote — matched on the gateway's instrument id — and only
 * fills subscriptions that still have no renewal card.
 *
 * CONNECTS TO:
 *   CALLER:  ./CheckoutSessionService.ts (OpenPaymentIntentForSession, applySettledPaymentToOrder)
 *   DRIVER:  ./BasePaymentProvider.ts (EnsureCustomer, RetrieveIntent.Instrument)
 *   TABLES:  __mj_BizAppsOrders.{CustomerPaymentMethod,PaymentDetail,PaymentType,Subscription,OrderLine,Product}
 */
import { IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import type {
    mjBizAppsOrdersCustomerPaymentMethodEntity,
    mjBizAppsOrdersPaymentDetailEntity,
    mjBizAppsOrdersSubscriptionEntity,
} from '@mj-biz-apps/orders-entities';
import type { RetrievedInstrument } from './BasePaymentProvider.js';
import { ResolvePaymentProvider } from './PaymentProviderResolver.js';
import { EscapeText, RequireUUID, RequireUUIDs } from './sql-guards.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const CUSTOMER_PAYMENT_METHOD_ENTITY = 'MJ_BizApps_Orders: Customer Payment Methods';
const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
const PAYMENT_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Types';

/**
 * True when the session's priced draft sells a product that renews as a subscription. Read from the
 * snapshot because the order does not exist until payment has settled.
 */
export async function SnapshotSellsSubscription(metadataJSON: string | null | undefined, user: UserInfo): Promise<boolean> {
    let priced: Array<{ ProductID?: string | null }> = [];
    if (metadataJSON) {
        try {
            priced = (JSON.parse(metadataJSON) as { PricedLines?: Array<{ ProductID?: string | null }> }).PricedLines ?? [];
        } catch {
            priced = [];
        }
    }
    const productIDs = [...new Set(priced.map((l) => l.ProductID).filter((id): id is string => !!id))];
    if (productIDs.length === 0) return false;

    const rv = new RunView();
    const products = await rv.RunView<{ ID: string }>(
        {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID IN (${RequireUUIDs(productIDs, 'ProductID').map((id) => `'${id}'`).join(',')}) AND SubscriptionTypeID IS NOT NULL`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        user,
    );
    return (products.Results ?? []).length > 0;
}

/**
 * The gateway customer this person already has with this provider — the one their first saved card
 * belongs to — or null when they have none yet.
 */
export async function FindReusableProviderCustomerRef(
    personID: string,
    paymentProviderID: string,
    user: UserInfo,
): Promise<string | null> {
    const rv = new RunView();
    const wallet = await rv.RunView<{ PaymentDetailID: string }>(
        {
            EntityName: CUSTOMER_PAYMENT_METHOD_ENTITY,
            ExtraFilter: `OwnerPersonID = '${RequireUUID(personID, 'OwnerPersonID')}' AND IsActive = 1`,
            Fields: ['PaymentDetailID'],
            ResultType: 'simple',
        },
        user,
    );
    const detailIDs = (wallet.Results ?? []).map((w) => w.PaymentDetailID).filter((id): id is string => !!id);
    if (detailIDs.length === 0) return null;

    const details = await rv.RunView<{ ProviderCustomerRef: string | null }>(
        {
            EntityName: PAYMENT_DETAIL_ENTITY,
            ExtraFilter:
                `ID IN (${RequireUUIDs(detailIDs, 'PaymentDetailID').map((id) => `'${id}'`).join(',')}) ` +
                `AND PaymentProviderID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}' ` +
                `AND ProviderCustomerRef IS NOT NULL`,
            Fields: ['ProviderCustomerRef'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        user,
    );
    return details.Results?.[0]?.ProviderCustomerRef ?? null;
}

export interface SaveCheckoutInstrumentInput {
    OrderHeaderID: string;
    CompanyID: string;
    OwnerPersonID: string | null;
    PaymentProviderID: string;
    /** The gateway's intent id, read back to learn which card paid. */
    ProviderIntentID: string;
    /** `PaymentType.Code` of the tender the card is filed under. */
    TenderCode: string;
}

export interface SaveCheckoutInstrumentResult {
    Saved: boolean;
    /** The wallet entry, when one was written or found. */
    CustomerPaymentMethodID?: string;
    /** Subscriptions that were given this card as their renewal card by this call. */
    SubscriptionIDs?: string[];
    /** Why nothing was saved. Not an error: most checkouts sell nothing that renews. */
    Reason?: string;
}

/**
 * Put the card that paid for this order in the buyer's wallet, and make it the renewal card of every
 * subscription the order created that has none. Fail-soft — see the header.
 */
export async function SaveCheckoutInstrumentForRenewals(
    input: SaveCheckoutInstrumentInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<SaveCheckoutInstrumentResult> {
    try {
        if (!input.OwnerPersonID) {
            return { Saved: false, Reason: 'the order has no bill-to person to own a saved card' };
        }

        const subscriptions = await subscriptionsNeedingRenewalCard(input.OrderHeaderID, user);
        if (subscriptions.length === 0) {
            return { Saved: false, Reason: 'the order created no subscription that needs a renewal card' };
        }

        const driver = await ResolvePaymentProvider(input.PaymentProviderID, provider, user);
        const retrieved = await driver.RetrieveIntent({ ProviderIntentID: input.ProviderIntentID });
        const instrument = retrieved.Success ? retrieved.Instrument : undefined;
        if (!instrument?.ProviderInstrumentRef || !instrument.ProviderCustomerRef) {
            // The gateway kept no card for this payment — the intent was opened without a customer,
            // or the gateway does not keep instruments. Nothing to file; the subscription will need a
            // card before it renews.
            LogError(
                `[CheckoutSavedInstrument] Order ${input.OrderHeaderID}: the gateway reported no saved card for intent ` +
                    `${input.ProviderIntentID}; ${subscriptions.length} subscription(s) have no renewal card.`,
            );
            return { Saved: false, Reason: 'the gateway kept no card for this payment' };
        }

        const walletID =
            (await findWalletEntryForInstrument(input.OwnerPersonID, input.PaymentProviderID, instrument.ProviderInstrumentRef, user)) ??
            (await createWalletEntry(input, instrument, provider, user));

        const updated: string[] = [];
        for (const subscription of subscriptions) {
            subscription.DefaultCustomerPaymentMethodID = walletID;
            if (await subscription.Save()) {
                updated.push(subscription.ID);
            } else {
                LogError(
                    `[CheckoutSavedInstrument] Could not set the renewal card on subscription ${subscription.ID}: ` +
                        `${subscription.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        LogStatus(`[CheckoutSavedInstrument] Order ${input.OrderHeaderID}: renewal card ${walletID} set on ${updated.length} subscription(s).`);
        return { Saved: true, CustomerPaymentMethodID: walletID, SubscriptionIDs: updated };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        LogError(`[CheckoutSavedInstrument] Could not save the card for order ${input.OrderHeaderID}: ${message}`);
        return { Saved: false, Reason: message };
    }
}

/** The order's auto-renewing subscriptions that do not yet have a renewal card. */
async function subscriptionsNeedingRenewalCard(
    orderID: string,
    user: UserInfo,
): Promise<mjBizAppsOrdersSubscriptionEntity[]> {
    const rv = new RunView();
    const lines = await rv.RunView<{ ID: string }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderID, 'OrderHeaderID')}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        user,
    );
    const lineIDs = (lines.Results ?? []).map((l) => l.ID);
    if (lineIDs.length === 0) return [];

    const found = await rv.RunView<mjBizAppsOrdersSubscriptionEntity>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter:
                `OrderLineID IN (${RequireUUIDs(lineIDs, 'OrderLineID').map((id) => `'${id}'`).join(',')}) ` +
                `AND AutoRenew = 1 AND DefaultCustomerPaymentMethodID IS NULL`,
            ResultType: 'entity_object',
        },
        user,
    );
    return found.Results ?? [];
}

/** The wallet entry already holding this gateway instrument for this person, if a prior call wrote it. */
async function findWalletEntryForInstrument(
    personID: string,
    paymentProviderID: string,
    instrumentRef: string,
    user: UserInfo,
): Promise<string | null> {
    const rv = new RunView();
    const details = await rv.RunView<{ ID: string }>(
        {
            EntityName: PAYMENT_DETAIL_ENTITY,
            ExtraFilter:
                `PaymentProviderID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}' ` +
                `AND ProviderInstrumentRef = '${EscapeText(instrumentRef)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        user,
    );
    const detailIDs = (details.Results ?? []).map((d) => d.ID);
    if (detailIDs.length === 0) return null;

    const wallet = await rv.RunView<{ ID: string }>(
        {
            EntityName: CUSTOMER_PAYMENT_METHOD_ENTITY,
            ExtraFilter:
                `OwnerPersonID = '${RequireUUID(personID, 'OwnerPersonID')}' AND IsActive = 1 ` +
                `AND PaymentDetailID IN (${RequireUUIDs(detailIDs, 'PaymentDetailID').map((id) => `'${id}'`).join(',')})`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        user,
    );
    return wallet.Results?.[0]?.ID ?? null;
}

/** Write the instrument snapshot and the wallet entry over it; the new entry becomes the default. */
async function createWalletEntry(
    input: SaveCheckoutInstrumentInput,
    instrument: RetrievedInstrument,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string> {
    const paymentTypeID = await paymentTypeIDFor(input.TenderCode, user);

    const detail = await provider.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(PAYMENT_DETAIL_ENTITY, user);
    detail.NewRecord();
    detail.CompanyID = input.CompanyID;
    detail.PaymentTypeID = paymentTypeID;
    detail.PaymentProviderID = input.PaymentProviderID;
    detail.ProviderCustomerRef = instrument.ProviderCustomerRef;
    detail.ProviderInstrumentRef = instrument.ProviderInstrumentRef;
    if (instrument.Brand) detail.Brand = instrument.Brand;
    if (instrument.Last4) detail.Last4 = instrument.Last4;
    if (instrument.ExpiryMonth) detail.ExpiryMonth = instrument.ExpiryMonth;
    if (instrument.ExpiryYear) detail.ExpiryYear = instrument.ExpiryYear;
    if (instrument.HolderName) detail.HolderName = instrument.HolderName;
    if (!(await detail.Save())) {
        throw new Error(`could not record the card: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    const wallet = await provider.GetEntityObject<mjBizAppsOrdersCustomerPaymentMethodEntity>(CUSTOMER_PAYMENT_METHOD_ENTITY, user);
    wallet.NewRecord();
    wallet.OwnerPersonID = input.OwnerPersonID;
    wallet.PaymentDetailID = detail.ID;
    wallet.IsDefault = true;
    wallet.IsActive = true;
    const nickname = [instrument.Brand, instrument.Last4 ? `ending ${instrument.Last4}` : null].filter(Boolean).join(' ');
    if (nickname) wallet.Nickname = nickname;
    if (!(await wallet.Save())) {
        throw new Error(`could not add the card to the wallet: ${wallet.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return wallet.ID;
}

async function paymentTypeIDFor(tenderCode: string, user: UserInfo): Promise<string> {
    const rv = new RunView();
    const found = await rv.RunView<{ ID: string }>(
        {
            EntityName: PAYMENT_TYPE_ENTITY,
            ExtraFilter: `Code = '${EscapeText(tenderCode)}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        user,
    );
    const id = found.Results?.[0]?.ID;
    if (!id) throw new Error(`no payment type with code '${tenderCode}'`);
    return id;
}
