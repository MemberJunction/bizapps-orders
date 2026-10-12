/**
 * Orders.CreateOrderFromProviderPayment — a paid order from a gateway charge that matched nothing (#481).
 *
 * The reconciliation job reports a charge the gateway took with no Orders payment behind it
 * (`ChargeWithoutPayment`). The decision recorded on the issue is to create the order from the payment
 * rather than hold it as unapplied cash. This operation does that for one charge:
 *
 *   1. reads the charge from the gateway, and refuses one that has not succeeded, carries any refund,
 *      has no gateway intent or is in another currency (`ProviderPaymentOrder.ts`);
 *   2. in one transaction: records the gateway intent as a `PaymentIntent`, creates the order in the
 *      provider's company with one line of the named product at the charge's gross amount, confirms it
 *      (which books it and makes it the invoice), and stamps the order on the intent;
 *   3. captures the charge against the order through `Orders.CapturePayment`, which asks the gateway
 *      for the charge and its fee, so the payment is gross, the fee is booked, and the bank deposit
 *      that follows is net of a fee the ledger already holds.
 *
 * ONE ORDER PER CHARGE. The capture carries `provider-charge:<provider>:<charge>` as its idempotency
 * key, which the database holds unique, and the intent row is unique per gateway intent. A repeat call
 * finds the order already created and, if its capture had failed, finishes it.
 *
 * WHAT A PERSON SUPPLIES. The product and the buyer. Choosing them from the payment without a person,
 * and what to do when a matching order turns up later, are open on the issue; nothing here guesses.
 *
 * NOTHING IS BYPASSED. The order confirms through the ordinary path: a charge below the product's
 * price is a concession and is refused until one is approved, and a product that draws tax or charges
 * the payment did not include is refused because the order would not total the payment.
 *
 * CONNECTS TO:
 *   PURE:    ./ProviderPaymentOrder.ts
 *   DRIVER:  ./BasePaymentProvider.ts `RetrieveCharge`
 *   CAPTURE: ./CapturePaymentOperation.ts
 *   FINDS:   ./ReconcilePaymentProviderChargesOperation.ts (the charges this resolves)
 */
import {
    BaseRemotableOperation,
    LogError,
    RunView,
    type DatabaseProviderBase,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    AsDateValue,
    LocalDay,
    OrdersCreateOrderFromProviderPaymentOperation as OrdersCreateOrderFromProviderPaymentOperationBase,
    TodayAsDateValue,
    type OrderHeaderEntity,
    type OrderLineEntity,
    type OrdersCreateOrderFromProviderPaymentInput,
    type OrdersCreateOrderFromProviderPaymentOutput,
    type mjBizAppsOrdersPaymentIntentEntity,
} from '@mj-biz-apps/orders-entities';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import type { GatewayCharge, PaymentProviderConfig } from './BasePaymentProvider.js';
import { CapturePaymentOperation } from './CapturePaymentOperation.js';
import { ORDER_HEADER_ENTITY, PAYMENT_HEADER_ENTITY } from './entity-names.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import {
    CheckChargeForOrder,
    CheckProviderPaymentInput,
    PROVIDER_PAYMENT_ORDER_ORIGIN,
    ProviderPaymentIdempotencyKey,
    ProviderPaymentLineReason,
} from './ProviderPaymentOrder.js';
import { EscapeText, RequireUUID } from './sql-guards.js';

const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const ACCOUNTING_PROFILE_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
/** The tender a card charge is recorded as, the same default the checkout capture uses. */
const CARD_TENDER_CODE = 'CreditCard';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

type Output = OrdersCreateOrderFromProviderPaymentOutput;

function refuse(code: string, message: string, extra: Partial<Output> = {}): Output {
    return { Success: false, Code: code, Message: message, ...extra };
}

@RegisterClass(BaseRemotableOperation, 'Orders.CreateOrderFromProviderPayment')
export class CreateOrderFromProviderPaymentOperation extends OrdersCreateOrderFromProviderPaymentOperationBase {
    protected async InternalExecute(
        input: OrdersCreateOrderFromProviderPaymentInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<Output> {
        const checked = CheckProviderPaymentInput(input);
        if (typeof checked === 'string') return refuse('BadInput', checked);

        let config: PaymentProviderConfig;
        try {
            config = await LoadPaymentProviderConfig(checked.PaymentProviderID, provider, user);
        } catch (err) {
            return refuse('ProviderNotFound', err instanceof Error ? err.message : String(err));
        }

        // Already created: answered from the database, without asking the gateway again.
        const existing = await findOrderForCharge(checked.PaymentProviderID, checked.ProviderChargeID, provider, user);
        if (existing) return existing;

        const driver = await BuildPaymentProvider(config, provider, user);
        const read = await driver.RetrieveCharge({ ProviderChargeID: checked.ProviderChargeID });
        if (!read.Success || !read.Charge) {
            return refuse(
                'ChargeNotFound',
                read.NotFound
                    ? `The gateway has no charge ${checked.ProviderChargeID} for provider ${config.Name}.`
                    : `Could not read charge ${checked.ProviderChargeID} from the gateway: ${read.Reason ?? 'no reason given'}`,
            );
        }
        return CreateOrderFromGatewayCharge({ ...checked, Charge: read.Charge, Config: config }, provider, user);
    }
}

/**
 * Steps 2 and 3 for a charge already read from the gateway. Exported so a check can supply the charge:
 * a provider in test mode runs the stub driver, which has no charges to read.
 */
export async function CreateOrderFromGatewayCharge(
    args: {
        PaymentProviderID: string;
        ProviderChargeID: string;
        ProductID: string;
        BillToPersonID: string;
        BillToOrganizationID: string | null;
        Charge: GatewayCharge;
        Config: PaymentProviderConfig;
    },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Output> {
    const { Charge: charge, Config: config } = args;
    if (charge.ProviderChargeID !== args.ProviderChargeID) {
        return refuse('BadInput', `The gateway returned charge ${charge.ProviderChargeID} for ${args.ProviderChargeID}.`);
    }
    const existing = await findOrderForCharge(args.PaymentProviderID, args.ProviderChargeID, provider, user);
    if (existing) return existing;

    const refusal = CheckChargeForOrder(charge, await functionalCurrency(config.CompanyID, provider, user));
    if (refusal) return refuse(refusal.Code, refusal.Message);
    const amount = money(charge.Amount);

    // Warmed before the transaction opens, as the other writers do: a metadata read has no business
    // inside the order's write transaction. A no-op once loaded.
    await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
    const paymentDay = charge.CreatedAt ? AsDateValue(LocalDay(charge.CreatedAt)) ?? TodayAsDateValue() : TodayAsDateValue();

    const intentRow = await loadIntent(charge.ProviderIntentID!, provider, user);
    let orderID: string;
    let intentID: string;
    if (intentRow) {
        // An intent Orders already holds. Ours from an earlier call that confirmed but did not capture:
        // finish it. Anyone else's (a checkout, an invoice link): not an unmatched payment at all.
        const prior = intentRow.OrderHeaderID ? await loadOrder(intentRow.OrderHeaderID, provider, user) : null;
        if (!prior || prior.Origin !== PROVIDER_PAYMENT_ORDER_ORIGIN) {
            return refuse(
                'IntentOpenedByOrders',
                `Charge ${charge.ProviderChargeID} belongs to gateway intent ${charge.ProviderIntentID}, which Orders opened` +
                    (prior ? ` for order ${prior.OrderNumber}` : '') +
                    `. Book it through that order's own payment path, not as an unmatched payment.`,
            );
        }
        orderID = prior.ID;
        intentID = intentRow.ID;
    } else {
        const created = await createOrderAndIntent(args, amount, paymentDay, provider, user);
        if (!('OrderID' in created)) return created;
        orderID = created.OrderID;
        intentID = created.IntentID;
    }

    return captureAgainstOrder(args, orderID, intentID, amount, paymentDay, provider, user);
}

/** The intent, the order and its confirm, in one transaction: a refused confirm leaves neither row. */
async function createOrderAndIntent(
    args: {
        PaymentProviderID: string;
        ProviderChargeID: string;
        ProductID: string;
        BillToPersonID: string;
        BillToOrganizationID: string | null;
        Charge: GatewayCharge;
        Config: PaymentProviderConfig;
    },
    amount: number,
    orderDay: Date,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ OrderID: string; IntentID: string } | Output> {
    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    try {
        const intent = await provider.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, user);
        intent.NewRecord();
        intent.PaymentProviderID = args.PaymentProviderID;
        intent.ProviderIntentID = args.Charge.ProviderIntentID!;
        intent.Status = 'Succeeded';
        intent.Amount = amount;
        intent.BillToPersonID = args.BillToPersonID;
        intent.BillToOrganizationID = args.BillToOrganizationID;
        if (!(await intent.Save())) {
            throw new RefusedStep('ConfirmRefused', `Could not record gateway intent ${args.Charge.ProviderIntentID}: ${intent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        const order = await provider.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
        order.NewRecord();
        order.CompanyID = args.Config.CompanyID;
        order.BillToPersonID = args.BillToPersonID;
        order.ShipToPersonID = args.BillToPersonID;
        order.BillToOrganizationID = args.BillToOrganizationID;
        order.ShipToOrganizationID = args.BillToOrganizationID;
        order.Origin = PROVIDER_PAYMENT_ORDER_ORIGIN;
        order.OrderType = 'Sale';
        order.OrderDate = orderDay;
        order.Description = `Created from provider payment ${args.ProviderChargeID}`;

        const line = (await order.Lines.Create()) as OrderLineEntity;
        await line.EnsureISAChild();
        line.ProductID = args.ProductID;
        line.Quantity = 1;
        line.LineNumber = 1;
        line.UnitPrice = amount;
        line.PriceOverridden = true;
        line.PriceOverrideReason = ProviderPaymentLineReason(args.ProviderChargeID);

        order.Status = 'Confirmed';
        if (!(await order.Save())) {
            throw new RefusedStep('ConfirmRefused', `The order could not be confirmed: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        // The payment is the whole order. Tax or a charge the payment did not include would leave a
        // balance the deposit will never clear, so the order is refused rather than left part-paid.
        const total = money(Number(order.TotalGross ?? 0));
        if (total !== amount) {
            throw new RefusedStep(
                'ConfirmRefused',
                `The order would total ${total}, not the payment's ${amount}: the product draws tax or charges the payment did not include.`,
            );
        }

        intent.OrderHeaderID = order.ID;
        if (!(await intent.Save())) {
            throw new RefusedStep('ConfirmRefused', `Could not link the intent to the order: ${intent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        await db.CommitTransaction();
        return { OrderID: order.ID, IntentID: intent.ID };
    } catch (err) {
        await db.RollbackTransaction();
        if (err instanceof RefusedStep) return refuse(err.Code, err.message);
        LogError(err as Error);
        throw err;
    }
}

class RefusedStep extends Error {
    constructor(
        public readonly Code: string,
        message: string,
    ) {
        super(message);
    }
}

async function captureAgainstOrder(
    args: { PaymentProviderID: string; ProviderChargeID: string; BillToPersonID: string; BillToOrganizationID: string | null; Config: PaymentProviderConfig },
    orderID: string,
    intentID: string,
    amount: number,
    paymentDay: Date,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Output> {
    const order = await loadOrder(orderID, provider, user);
    const base: Partial<Output> = { OrderHeaderID: orderID, OrderNumber: order?.OrderNumber ?? null, PaymentIntentID: intentID, Amount: amount };

    const op = new CapturePaymentOperation();
    const result = await op.ExecuteServer(
        {
            PaymentIntentID: intentID,
            Amount: amount,
            ReceivingCompanyID: args.Config.CompanyID,
            // CapturePayment takes exactly one payer: the organization when the order is billed to one.
            BillToPersonID: args.BillToOrganizationID ? null : args.BillToPersonID,
            BillToOrganizationID: args.BillToOrganizationID,
            TenderCode: CARD_TENDER_CODE,
            PaymentDate: paymentDay.toISOString().slice(0, 10),
            Reference: args.ProviderChargeID,
            Notes: `Unmatched provider payment ${args.ProviderChargeID}`,
            Allocations: [{ OrderHeaderID: orderID, Amount: amount }],
            PaymentDetail: { PaymentProviderID: args.PaymentProviderID },
            IdempotencyKey: ProviderPaymentIdempotencyKey(args.PaymentProviderID, args.ProviderChargeID),
        },
        { provider, user, emitProgress: () => undefined },
    );
    const out = result.Output;
    if (!result.Success || !out?.Success) {
        const detail = result.ErrorMessage ?? out?.Message ?? out?.Blockers?.map((b) => b.Message).join('; ') ?? 'unknown error';
        return refuse(
            'CaptureRefused',
            `Order ${order?.OrderNumber ?? orderID} was created but the payment did not capture: ${detail}. Run this again to finish the capture.`,
            base,
        );
    }
    return {
        ...base,
        Success: true,
        WasExisting: false,
        PaymentHeaderID: out.PaymentHeaderID ?? null,
        PaymentNumber: out.PaymentNumber ?? null,
        Message: `Created order ${order?.OrderNumber ?? orderID} from provider payment ${args.ProviderChargeID} and captured ${amount} against it as ${out.PaymentNumber ?? 'a payment'}.`,
    };
}

/** The order an earlier call created and paid for this charge, answered as a repeat. */
async function findOrderForCharge(
    paymentProviderID: string,
    providerChargeID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Output | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const key = ProviderPaymentIdempotencyKey(paymentProviderID, providerChargeID);
    const payments = await rv.RunView<{ ID: string; PaymentNumber: string; PaymentIntentID: string | null; Amount: number }>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter: `IdempotencyKey = '${EscapeText(key)}'`,
            Fields: ['ID', 'PaymentNumber', 'PaymentIntentID', 'Amount'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!payments.Success) throw new Error(`Could not look for an earlier payment of charge ${providerChargeID}: ${payments.ErrorMessage}`);
    const payment = payments.Results?.[0];
    if (!payment) return null;
    const lines = await rv.RunView<{ OrderHeaderID: string }>(
        {
            EntityName: PAYMENT_LINE_ENTITY,
            ExtraFilter: `PaymentHeaderID = '${RequireUUID(payment.ID, 'PaymentHeaderID')}'`,
            Fields: ['OrderHeaderID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const orderID = lines.Results?.[0]?.OrderHeaderID ?? null;
    const order = orderID ? await loadOrder(orderID, provider, user) : null;
    return {
        Success: true,
        WasExisting: true,
        OrderHeaderID: orderID,
        OrderNumber: order?.OrderNumber ?? null,
        PaymentIntentID: payment.PaymentIntentID,
        PaymentHeaderID: payment.ID,
        PaymentNumber: payment.PaymentNumber,
        Amount: money(payment.Amount),
        Message: `Provider payment ${providerChargeID} is already booked as ${payment.PaymentNumber}${order ? ` on order ${order.OrderNumber}` : ''}.`,
    };
}

async function loadIntent(
    providerIntentID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ ID: string; OrderHeaderID: string | null } | null> {
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

async function loadOrder(
    orderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ ID: string; OrderNumber: string; Origin: string } | null> {
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

/** The receiving company's booking currency, with the same USD fallback the capture path uses. */
async function functionalCurrency(companyID: string, provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ FunctionalCurrencyCode: string | null }>(
        { EntityName: ACCOUNTING_PROFILE_ENTITY, ExtraFilter: `ID = '${RequireUUID(companyID, 'CompanyID')}'`, ResultType: 'simple' },
        user,
    );
    return (r?.Results?.[0]?.FunctionalCurrencyCode ?? 'USD').trim().toUpperCase();
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadCreateOrderFromProviderPaymentOperation(): void {
    void CreateOrderFromProviderPaymentOperation;
}
