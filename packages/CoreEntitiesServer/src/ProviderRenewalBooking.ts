/**
 * ProviderRenewalBooking — book a renewal the payment gateway already charged (E4).
 *
 * Once a gateway bills a subscription (option E), the gateway renews it: it charges the card at the
 * period end and Orders never does. Orders then records what the gateway did, so the subscription has its
 * next term, the money is on the books, and the Learning Hub hears of the new access. Andrew's rule
 * (22 Oct): once the gateway has charged, it's done. A payment already taken is never refused, held up or
 * second-guessed; anything unusual is booked anyway and someone is told.
 *
 * THE STEPS, the same order the unmatched-charge path uses (`CreateOrderFromProviderPaymentOperation`):
 *   1. in one transaction, with the subscription row locked: the money first, as a Succeeded
 *      `PaymentIntent` for the gateway's intent; then the renewal order (one line naming the subscription,
 *      on the subscription's OWN product, at the amount charged, no service period), confirmed; the
 *      intent stamped with the order; the lifecycle events;
 *   2. the capture through `Orders.CapturePayment`, keyed by the gateway charge, so this path and the
 *      unmatched-charge path can never book one charge twice;
 *   3. any refund the gateway already made on that charge (a refund that arrived before this payment
 *      existed was answered "ignored" and is never sent again).
 * A failure in 1 rolls it back whole; 2 and 3 are idempotent, and the next sync finishes them.
 *
 * WHY THE PRODUCT IS THE SUBSCRIPTION'S, NEVER THE PRICE'S. Imported subscribers were given products by
 * their Learning Hub tier: 348 Professional buyers pay the $399 "Foundation" price. Choosing the product
 * from the gateway price would silently downgrade them.
 *
 * WHY THE ORDER IS ALLOWED TO RENEW A GATEWAY-BILLED SUBSCRIPTION. E2b refuses every order that would
 * extend or renew one (`ProviderBilledPurchaseVerdict`). This order carries the server-only mark
 * `SanctionGatewayRenewal`, which lets exactly its renewal line through: an active subscription is
 * extended, a cancelled one reactivated keeping its gateway id (Q5), never a second subscription.
 *
 * Example: Jane's SUB-000110, Professional, term 1 to 30 Oct 2027. Stripe charges $599 at 00:00 Central on
 * 30 Oct 2027 (invoice in_…, intent pi_…, charge ch_…). This books order ORD-… dated 30 Oct 2027, one line
 * of Professional at $599 renewing SUB-000110, term 2 = 31 Oct 2027 → 30 Oct 2028, a $599 card payment
 * keyed `provider-charge:<account>:ch_…`, and the events PaymentSucceeded and RenewalOrderSpawned.
 *
 * CONNECTS TO:
 *   CALLER:  ./ProviderSubscriptionSync.ts
 *   PATTERN: ./CreateOrderFromProviderPaymentOperation.ts (intent → order → capture)
 *   RENEWAL: ./SpawnRenewalsOperation.ts (the line, the pricing mark, the carried choices)
 *   GATE:    ./SubscriptionEntityServer.ts (SanctionGatewayRenewal) · ./ProviderBilledSubscriptions.ts
 */
import {
    LogError,
    RunView,
    type DatabaseProviderBase,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    AsDateValue,
    LocalDay,
    TodayAsDateValue,
    type mjBizAppsOrdersOrderLineEntity,
    type mjBizAppsOrdersPaymentIntentEntity,
    type mjBizAppsOrdersSubscriptionEventEntity,
} from '@mj-biz-apps/orders-entities';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import type { BasePaymentProvider, GatewaySubscriptionInvoice, PaymentProviderConfig, WebhookEvent } from './BasePaymentProvider.js';
import { CapturePaymentOperation } from './CapturePaymentOperation.js';
import { ORDER_HEADER_ENTITY, PAYMENT_HEADER_ENTITY } from './entity-names.js';
import { MarkAsOrdersOwnWrite } from './OrderLineEntityServer.js';
import type { OrderEntityServer } from './OrderEntityServer.js';
import { PROVIDER_PAYMENT_ORDER_ORIGIN, ProviderPaymentIdempotencyKey } from './ProviderPaymentOrder.js';
import { BookProviderRefunds } from './ProviderRefundBooking.js';
import { EscapeText, RequireUUID } from './sql-guards.js';
import { SanctionGatewayRenewal } from './SubscriptionEntityServer.js';
import { SetSystemOrderOrigin } from './SystemOrderOrigin.js';
import { UnitPriceForCharge } from './UnmatchedChargeRules.js';

const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORDER_LINE_CHOICE_ENTITY = 'MJ_BizApps_Orders: Order Line Choices';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
/** The tender a card charge is recorded as, the same default the checkout capture uses. */
const CARD_TENDER_CODE = 'CreditCard';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** The subscription being renewed, as the sync read it. */
export interface RenewalSubscription {
    ID: string;
    SubscriptionNumber: string;
    Status: string;
    ProductID: string;
    CompanyID: string;
    HolderOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
    PaymentProviderID: string;
    ProviderSubscriptionID: string;
    /** The line that sold the latest term: its choices carry forward, as Spawn Renewals carries them. */
    LatestTermOrderLineID: string | null;
    /** Units the latest term covers (seats). */
    LatestTermQuantity: number | null;
    /** The unit price of the line that sold the latest term: a $0 renewal is booked at it, 100% off. */
    LatestTermUnitPrice: number | null;
}

export type RenewalBookingOutcome =
    | { Outcome: 'Booked'; OrderID: string; OrderNumber: string; PaymentNumber: string | null; Reactivated: boolean; Message: string }
    | { Outcome: 'AlreadyBooked'; OrderID: string | null; Message: string }
    /** The order is confirmed but its payment did not capture; the next sync finishes it. */
    | { Outcome: 'CaptureFailed'; OrderID: string; Message: string }
    /** Nothing written: a person must decide (the sync raises RenewalNotBooked). */
    | { Outcome: 'Refused'; Message: string };

/**
 * Book one paid renewal invoice. Never throws for a refusal; throws only for an unexpected fault, which
 * the caller reports and the next sync retries (step 1 rolled back, so nothing half-written remains).
 */
export async function BookProviderRenewal(
    subscription: RenewalSubscription,
    invoice: GatewaySubscriptionInvoice,
    config: PaymentProviderConfig,
    driver: BasePaymentProvider,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RenewalBookingOutcome> {
    const amount = money(invoice.AmountPaid);
    const zero = amount === 0;
    if (!zero && (!invoice.ProviderIntentID || !invoice.ProviderChargeID)) {
        return { Outcome: 'Refused', Message: `Renewal invoice ${invoice.ProviderInvoiceID} names no gateway intent or charge to record.` };
    }

    // Warmed before the transaction, as the other writers do.
    await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
    const paidDay = invoice.PaidAt ? (AsDateValue(LocalDay(invoice.PaidAt)) ?? TodayAsDateValue()) : TodayAsDateValue();

    const net = money(amount - money(invoice.Tax));
    const quantity = Math.max(1, Math.round(Number(subscription.LatestTermQuantity ?? 1)));
    // A $0 renewal (a 100% coupon at the gateway) is the last term's price, 100% off: the way Spawn
    // Renewals carries a discount. A bare 0 is not a price to Orders (pricing reads it as "no price given"
    // and fills in the list price, so the customer would owe for a renewal nobody charged).
    const lastPrice = money(Number(subscription.LatestTermUnitPrice ?? 0));
    if (zero && lastPrice <= 0) {
        return {
            Outcome: 'Refused',
            Message: `Renewal invoice ${invoice.ProviderInvoiceID} charged nothing, and ${subscription.SubscriptionNumber}'s last term has no price to discount; book it by hand.`,
        };
    }
    const unit = zero ? { UnitPrice: lastPrice } : UnitPriceForCharge(invoice.ProviderChargeID!, net, quantity);
    if ('Code' in unit) return { Outcome: 'Refused', Message: unit.Message };

    // An earlier run may have recorded the intent and confirmed the order, then failed to capture.
    if (!zero) {
        const prior = await findIntent(invoice.ProviderIntentID!, provider, user);
        if (prior) {
            if (!prior.OrderHeaderID) {
                return { Outcome: 'Refused', Message: `Gateway intent ${invoice.ProviderIntentID} is recorded with no order; a person must link it.` };
            }
            const order = await loadOrder(prior.OrderHeaderID, provider, user);
            if (!order || order.Origin !== PROVIDER_PAYMENT_ORDER_ORIGIN) {
                return {
                    Outcome: 'Refused',
                    Message:
                        `Gateway intent ${invoice.ProviderIntentID} of renewal invoice ${invoice.ProviderInvoiceID} already belongs to ` +
                        `order ${order?.OrderNumber ?? prior.OrderHeaderID}, which Orders did not book for a gateway renewal.`,
                };
            }
            if (await paymentExists(config.ID, invoice.ProviderChargeID!, provider, user)) {
                return { Outcome: 'AlreadyBooked', OrderID: order.ID, Message: `Renewal invoice ${invoice.ProviderInvoiceID} is already booked as ${order.OrderNumber}.` };
            }
            return captureAndRefunds(subscription, invoice, prior.ID, order.ID, order.OrderNumber, amount, paidDay, config, driver, provider, user, false);
        }
    }

    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    let orderID: string;
    let orderNumber: string;
    let intentID: string | null = null;
    let reactivated = false;
    try {
        // The subscription row is locked for the booking: two deliveries of this renewal on two workers
        // run one at a time, and the second finds the first's intent (or event) below.
        const locked = await lockSubscription(subscription.ID, provider);
        if (!locked) throw new Error(`Subscription ${subscription.SubscriptionNumber} could not be read for the renewal.`);
        if (zero ? await zeroRenewalBooked(subscription.ID, invoice.ProviderInvoiceID, provider, user) : await findIntent(invoice.ProviderIntentID!, provider, user)) {
            await db.RollbackTransaction();
            return { Outcome: 'AlreadyBooked', OrderID: null, Message: `Renewal invoice ${invoice.ProviderInvoiceID} was booked by another run.` };
        }
        reactivated = locked.Status === 'Canceled';

        if (!zero) {
            const intent = await provider.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, user);
            intent.NewRecord();
            intent.PaymentProviderID = config.ID;
            intent.ProviderIntentID = invoice.ProviderIntentID!;
            intent.Status = 'Succeeded';
            intent.Amount = amount;
            intent.BillToPersonID = subscription.BeneficiaryPersonID;
            intent.BillToOrganizationID = subscription.HolderOrganizationID;
            if (!(await intent.Save())) {
                throw new Error(`Could not record gateway intent ${invoice.ProviderIntentID}: ${intent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            intentID = intent.ID;
        }

        const order = await provider.GetEntityObject<OrderEntityServer>(ORDER_HEADER_ENTITY, user);
        order.NewRecord();
        order.OrderType = 'Sale';
        order.OrderDate = paidDay;
        order.CompanyID = subscription.CompanyID;
        order.BillToOrganizationID = subscription.HolderOrganizationID;
        order.BillToPersonID = subscription.BeneficiaryPersonID;
        order.ShipToOrganizationID = subscription.HolderOrganizationID;
        order.ShipToPersonID = subscription.BeneficiaryPersonID;
        SetSystemOrderOrigin(order, PROVIDER_PAYMENT_ORDER_ORIGIN);
        order.Description = `Renewal of ${subscription.SubscriptionNumber} charged by the payment gateway (invoice ${invoice.ProviderInvoiceID})`;
        // The one order that may renew a gateway-billed subscription.
        SanctionGatewayRenewal(order);

        const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        MarkAsOrdersOwnWrite(line);
        line.NewRecord();
        line.ProductID = subscription.ProductID;
        line.LineNumber = 1;
        line.RenewsSubscriptionID = subscription.ID;
        line.ShipToOrganizationID = subscription.HolderOrganizationID;
        line.ShipToPersonID = subscription.BeneficiaryPersonID;
        line.Quantity = quantity;
        line.UnitPrice = unit.UnitPrice;
        if (zero) line.DiscountPct = 1; // a fraction: 1 = 100% off
        // What the gateway charged is the price (Q3): the concession gate and order review leave it alone.
        order.MarkRenewalPriced(line);
        order.Lines.Add(line);
        if (subscription.LatestTermOrderLineID) {
            for (const choice of await loadChoices(subscription.LatestTermOrderLineID, provider, user)) {
                const row = await line.Choices.Create();
                row.GroupKey = choice.GroupKey;
                row.GroupLabel = choice.GroupLabel;
                row.OptionValue = choice.OptionValue;
                row.OptionLabel = choice.OptionLabel;
            }
        }

        order.Status = 'Draft';
        if (!(await order.Save())) {
            throw new Error(`The renewal order could not be saved: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        order.Status = 'Confirmed';
        if (!(await order.Save())) {
            throw new Error(`The renewal order could not be confirmed: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        orderID = order.ID;
        orderNumber = order.OrderNumber;

        if (intentID) {
            const intent = await provider.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, user);
            if (!(await intent.Load(intentID))) throw new Error(`Gateway intent ${intentID} could not be reloaded.`);
            intent.OrderHeaderID = orderID;
            if (!(await intent.Save())) throw new Error(`Could not link the intent to the order: ${intent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        const facts = {
            Source: 'Gateway',
            InvoiceID: invoice.ProviderInvoiceID,
            PaymentIntentID: invoice.ProviderIntentID,
            ChargeID: invoice.ProviderChargeID,
            BillingReason: invoice.BillingReason,
            AmountPaid: amount,
            Tax: money(invoice.Tax),
            UnitPrice: unit.UnitPrice,
            Quantity: quantity,
            GatewayPriceID: invoice.ProviderPriceID,
            GatewayQuantity: invoice.Quantity,
            Discounted: invoice.Discounted,
            OrderNumber: orderNumber,
            ...(reactivated ? { Reactivated: true } : {}),
        };
        await logEvent(subscription.ID, 'PaymentSucceeded', orderID, facts, provider, user);
        await logEvent(subscription.ID, 'RenewalOrderSpawned', orderID, facts, provider, user);
        await db.CommitTransaction();
    } catch (err) {
        try {
            await db.RollbackTransaction();
        } catch (rollbackErr) {
            LogError(`Rollback failed after a gateway renewal booking error: ${rollbackErr}`);
        }
        throw err;
    }

    if (zero) {
        return {
            Outcome: 'Booked',
            OrderID: orderID,
            OrderNumber: orderNumber,
            PaymentNumber: null,
            Reactivated: reactivated,
            Message: `Booked the gateway's $0 renewal of ${subscription.SubscriptionNumber} as ${orderNumber}.`,
        };
    }
    return captureAndRefunds(subscription, invoice, intentID!, orderID, orderNumber, amount, paidDay, config, driver, provider, user, reactivated);
}

/** Steps 2 and 3: the capture keyed by the gateway charge, then any refund the gateway already made. */
async function captureAndRefunds(
    subscription: RenewalSubscription,
    invoice: GatewaySubscriptionInvoice,
    intentID: string,
    orderID: string,
    orderNumber: string,
    amount: number,
    paidDay: Date,
    config: PaymentProviderConfig,
    driver: BasePaymentProvider,
    provider: IMetadataProvider,
    user: UserInfo,
    reactivated: boolean,
): Promise<RenewalBookingOutcome> {
    const op = new CapturePaymentOperation();
    const result = await op.ExecuteServer(
        {
            PaymentIntentID: intentID,
            Amount: amount,
            ReceivingCompanyID: config.CompanyID,
            // CapturePayment takes exactly one payer: the organization when the subscription is held by one.
            BillToPersonID: subscription.HolderOrganizationID ? null : subscription.BeneficiaryPersonID,
            BillToOrganizationID: subscription.HolderOrganizationID,
            TenderCode: CARD_TENDER_CODE,
            PaymentDate: paidDay.toISOString().slice(0, 10),
            Reference: invoice.ProviderChargeID!,
            Notes: `Gateway renewal of ${subscription.SubscriptionNumber}, invoice ${invoice.ProviderInvoiceID}`,
            Allocations: [{ OrderHeaderID: orderID, Amount: amount }],
            PaymentDetail: { PaymentProviderID: config.ID },
            IdempotencyKey: ProviderPaymentIdempotencyKey(config.ID, invoice.ProviderChargeID!),
        },
        { provider, user, emitProgress: () => undefined },
    );
    const out = result.Output;
    if (!result.Success || !out?.Success) {
        const detail = result.ErrorMessage ?? out?.Message ?? out?.Blockers?.map((b) => b.Message).join('; ') ?? 'unknown error';
        return {
            Outcome: 'CaptureFailed',
            OrderID: orderID,
            Message: `Renewal ${orderNumber} of ${subscription.SubscriptionNumber} is booked, but its ${amount} payment did not capture: ${detail}. The next sync tries again.`,
        };
    }

    // A refund the gateway made before this payment existed was answered "ignored" and is not sent again.
    const charge = await driver.RetrieveCharge({ ProviderChargeID: invoice.ProviderChargeID! });
    if (charge.Success && charge.Charge && charge.Charge.AmountRefunded > 0) {
        const event: WebhookEvent = {
            EventID: `renewal-refunds:${invoice.ProviderChargeID}`,
            Kind: 'charge.refunded',
            ProviderChargeID: invoice.ProviderChargeID!,
            ProviderIntentID: invoice.ProviderIntentID!,
            Amount: charge.Charge.AmountRefunded,
        };
        await BookProviderRefunds(event, intentID, driver, provider, user);
    }
    return {
        Outcome: 'Booked',
        OrderID: orderID,
        OrderNumber: orderNumber,
        PaymentNumber: out.PaymentNumber ?? null,
        Reactivated: reactivated,
        Message: `Booked the gateway's renewal of ${subscription.SubscriptionNumber} (${amount}) as ${orderNumber}, paid by ${out.PaymentNumber ?? 'a card payment'}.`,
    };
}

/** The subscription's status, read under an update lock the booking transaction holds to its end. */
async function lockSubscription(subscriptionID: string, provider: IMetadataProvider): Promise<{ Status: string } | null> {
    const sql = provider as unknown as { ExecuteSQL: (sql: string) => Promise<unknown> };
    const rows = (await sql.ExecuteSQL(
        `SELECT Status FROM __mj_BizAppsOrders.Subscription WITH (UPDLOCK, ROWLOCK) WHERE ID = '${RequireUUID(subscriptionID, 'SubscriptionID')}'`,
    )) as Array<{ Status?: string }> | { Results?: Array<{ Status?: string }> } | undefined;
    const row = (Array.isArray(rows) ? rows : (rows?.Results ?? []))[0];
    return row?.Status ? { Status: row.Status } : null;
}

async function findIntent(providerIntentID: string, provider: IMetadataProvider, user: UserInfo): Promise<{ ID: string; OrderHeaderID: string | null } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ ID: string; OrderHeaderID: string | null }>(
        {
            EntityName: PAYMENT_INTENT_ENTITY,
            ExtraFilter: `ProviderIntentID = '${EscapeText(providerIntentID)}'`,
            Fields: ['ID', 'OrderHeaderID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!r.Success) throw new Error(`Could not look up gateway intent ${providerIntentID}: ${r.ErrorMessage}`);
    return r.Results?.[0] ?? null;
}

async function paymentExists(paymentProviderID: string, providerChargeID: string, provider: IMetadataProvider, user: UserInfo): Promise<boolean> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ ID: string }>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter: `IdempotencyKey = '${EscapeText(ProviderPaymentIdempotencyKey(paymentProviderID, providerChargeID))}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!r.Success) throw new Error(`Could not look for the payment of charge ${providerChargeID}: ${r.ErrorMessage}`);
    return (r.Results ?? []).length > 0;
}

async function loadOrder(orderID: string, provider: IMetadataProvider, user: UserInfo): Promise<{ ID: string; OrderNumber: string; Origin: string } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ ID: string; OrderNumber: string; Origin: string }>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(orderID, 'OrderHeaderID')}'`,
            Fields: ['ID', 'OrderNumber', 'Origin'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return r.Results?.[0] ?? null;
}

/** True when a $0 renewal for this invoice is already booked (it has no intent; its event names the invoice). */
async function zeroRenewalBooked(subscriptionID: string, invoiceID: string, provider: IMetadataProvider, user: UserInfo): Promise<boolean> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ ID: string }>(
        {
            EntityName: SUBSCRIPTION_EVENT_ENTITY,
            ExtraFilter:
                `SubscriptionID = '${RequireUUID(subscriptionID, 'SubscriptionID')}' AND EventType = 'PaymentSucceeded' ` +
                `AND EventData LIKE '%"InvoiceID":"${EscapeText(invoiceID)}"%'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!r.Success) throw new Error(`Could not look for the booking of invoice ${invoiceID}: ${r.ErrorMessage}`);
    return (r.Results ?? []).length > 0;
}

async function loadChoices(
    orderLineID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Array<{ GroupKey: string; GroupLabel: string; OptionValue: string; OptionLabel: string }>> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ GroupKey: string; GroupLabel: string; OptionValue: string; OptionLabel: string }>(
        {
            EntityName: ORDER_LINE_CHOICE_ENTITY,
            ExtraFilter: `OrderLineID = '${RequireUUID(orderLineID, 'OrderLineID')}'`,
            Fields: ['GroupKey', 'GroupLabel', 'OptionValue', 'OptionLabel'],
            OrderBy: 'GroupKey, OptionValue',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return r.Results ?? [];
}

async function logEvent(
    subscriptionID: string,
    type: 'PaymentSucceeded' | 'RenewalOrderSpawned',
    orderID: string,
    data: Record<string, unknown>,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    const event = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, user);
    event.NewRecord();
    event.SubscriptionID = subscriptionID;
    event.EventType = type;
    event.OccurredAt = new Date();
    event.RelatedOrderHeaderID = orderID;
    event.Set('EventData', JSON.stringify(data));
    if (!(await event.Save())) {
        throw new Error(`Failed to log ${type} for the gateway renewal: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}
