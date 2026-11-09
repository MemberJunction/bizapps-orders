/**
 * Orders created from unmatched charges by the nightly reconciliation (#481).
 *
 * For each charge the reconciliation reports as a charge without a payment, on an intent Orders did
 * not open: read what the charge paid for, choose the product and the buyer by the rules in
 * `UnmatchedChargeRules.ts`, and create the paid order through `CreateOrderFromGatewayCharge`, the
 * same path a person uses. A charge the rules cannot decide, or the order path refuses, stays a
 * finance exception with the reason added, for a person to resolve (#567).
 *
 * OFF UNTIL A PRICE IS MAPPED. A provider with no active `PaymentProviderPrice` row is not read at all:
 * every charge stays an exception, as before. Mapping a price is how a host turns the path on.
 *
 * A PERSON MAY OUTLIVE A REFUSED ORDER. A buyer with no Person is created before the order, which needs
 * the Person's id. If the order is then refused (a concession, tax the payment did not include), the
 * Person stays: it is a real buyer with a real e-mail, and the next run, or a person, finds it.
 *
 * CONNECTS TO:
 *   RULES:  ./UnmatchedChargeRules.ts
 *   ORDER:  ./CreateOrderFromProviderPaymentOperation.ts `CreateOrderFromGatewayCharge`
 *   CALLER: ./ReconcilePaymentProviderChargesOperation.ts
 */
import { LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import type { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import type { BasePaymentProvider, GatewayCharge, PaymentProviderConfig } from './BasePaymentProvider.js';
import type { ChargeMismatch } from './ChargeReconciliation.js';
import { CreateOrderFromGatewayCharge } from './CreateOrderFromProviderPaymentOperation.js';
import { ResolvePersonByEmail } from './PersonByEmail.js';
import { RequireUUID } from './sql-guards.js';
import {
    BuyerFromCharge,
    ChooseProductForCharge,
    NoBuyerNameUnresolved,
    PriceMapLookup,
    UnitPriceForCharge,
    type ChargeBuyer,
    type ProviderPriceMapRow,
} from './UnmatchedChargeRules.js';

export const PAYMENT_PROVIDER_PRICE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Prices';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';

export type UnmatchedChargeOutcome =
    | { Created: true; OrderHeaderID: string; OrderNumber: string | null; PaymentHeaderID: string | null; PaymentNumber: string | null }
    | { Created: false; Code: string; Message: string };

/** Whether the reconciliation should try to create an order for this mismatch. */
export function IsUnmatchedCharge(m: ChargeMismatch): boolean {
    return m.Kind === 'ChargeWithoutPayment' && !!m.ProviderChargeID && !m.PaymentHeaderID && !m.PaymentIntentID;
}

/** The provider's active price map; empty when none is mapped. */
export async function LoadProviderPriceMap(
    paymentProviderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Map<string, string>> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<ProviderPriceMapRow>(
        {
            EntityName: PAYMENT_PROVIDER_PRICE_ENTITY,
            ExtraFilter: `PaymentProviderID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}' AND IsActive = 1`,
            Fields: ['ProviderPriceID', 'ProductID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!result.Success) throw new Error(`Could not read the price map: ${result.ErrorMessage}`);
    return PriceMapLookup(result.Results ?? []);
}

/** Create the order for one unmatched charge, or say why not. Never throws for a charge-level problem. */
export async function CreateOrderForUnmatchedCharge(
    args: {
        Driver: BasePaymentProvider;
        Config: PaymentProviderConfig;
        PaymentProviderID: string;
        Charge: GatewayCharge;
        PriceMap: ReadonlyMap<string, string>;
    },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<UnmatchedChargeOutcome> {
    const { Charge: charge } = args;
    try {
        if (!charge.ProviderIntentID) {
            return { Created: false, Code: 'ChargeHasNoIntent', Message: `Charge ${charge.ProviderChargeID} has no payment intent at the payment provider, so what it paid for cannot be read. Create the order by hand.` };
        }
        const items = await args.Driver.ListChargeItems({ ProviderIntentID: charge.ProviderIntentID });
        if (!items.Success) {
            return { Created: false, Code: 'ItemsReadFailed', Message: `Could not read what charge ${charge.ProviderChargeID} paid for: ${items.Reason ?? 'no reason given'}` };
        }
        const product = ChooseProductForCharge(charge.ProviderChargeID, items.Items ?? [], args.PriceMap);
        if ('Code' in product) return { Created: false, Code: product.Code, Message: product.Message };
        // Checked before a Person is created, so a charge left to finance creates nothing.
        const unitPrice = UnitPriceForCharge(charge.ProviderChargeID, charge.Amount, product.Quantity);
        if ('Code' in unitPrice) return { Created: false, Code: unitPrice.Code, Message: unitPrice.Message };
        const buyer = BuyerFromCharge(charge, items);
        if ('Code' in buyer) return { Created: false, Code: buyer.Code, Message: buyer.Message };

        const person = await findOrCreatePerson(charge.ProviderChargeID, buyer, provider, user);
        if ('Code' in person) return person;

        const result = await CreateOrderFromGatewayCharge(
            {
                PaymentProviderID: args.PaymentProviderID,
                ProviderChargeID: charge.ProviderChargeID,
                ProductID: product.ProductID,
                Quantity: product.Quantity,
                BillToPersonID: person.PersonID,
                BillToOrganizationID: null,
                Charge: charge,
                Config: args.Config,
            },
            provider,
            user,
        );
        if (!result.Success || !result.OrderHeaderID) {
            return { Created: false, Code: result.Code ?? 'OrderRefused', Message: result.Message };
        }
        return {
            Created: true,
            OrderHeaderID: result.OrderHeaderID,
            OrderNumber: result.OrderNumber ?? null,
            PaymentHeaderID: result.PaymentHeaderID ?? null,
            PaymentNumber: result.PaymentNumber ?? null,
        };
    } catch (err) {
        LogError(`Creating the order for unmatched charge ${charge.ProviderChargeID} failed: ${(err as Error).message}`);
        return { Created: false, Code: 'Failed', Message: (err as Error).message };
    }
}

async function findOrCreatePerson(
    chargeID: string,
    buyer: ChargeBuyer,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ PersonID: string } | { Created: false; Code: string; Message: string }> {
    const found = await ResolvePersonByEmail(buyer.Email, new RunView(provider as unknown as IRunViewProvider), user);
    if (!found.Success) {
        return { Created: false, Code: 'BuyerLookupFailed', Message: `Could not look up the buyer ${buyer.Email}: ${found.ErrorMessage ?? 'unknown error'}` };
    }
    if (found.PersonID) return { PersonID: found.PersonID };
    if (!buyer.FirstName || !buyer.LastName) {
        const unresolved = NoBuyerNameUnresolved(chargeID, buyer.Email);
        return { Created: false, ...unresolved };
    }
    const person = await provider.GetEntityObject<mjBizAppsCommonPersonEntity>(PERSON_ENTITY, user);
    person.NewRecord();
    person.FirstName = buyer.FirstName;
    person.LastName = buyer.LastName;
    person.Email = buyer.Email;
    if (!(await person.Save())) {
        return {
            Created: false,
            Code: 'BuyerNotCreated',
            Message: `Could not create the buyer ${buyer.Email}: ${person.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        };
    }
    return { PersonID: person.ID };
}
