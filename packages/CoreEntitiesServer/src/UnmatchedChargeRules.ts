/**
 * Which product and buyer an order created from an unmatched charge carries, the pure half (#481).
 *
 * The nightly reconciliation finds charges the gateway took with no Orders payment behind them.
 * `Orders.CreateOrderFromProviderPayment` turns one into a paid order when it is told the product and
 * the buyer. These rules choose both from the payment, so the reconciliation can create the order
 * without a person:
 *
 *   PRODUCT. Each line of the hosted checkout or payment link behind the charge names a gateway price.
 *   Every price must be in the provider's price map (`PaymentProviderPrice`, active), and together they
 *   must name exactly one product. Anything else (no checkout behind the charge, a price nobody mapped,
 *   two products) is left to a person: the product sets the revenue account, and a guess posts revenue
 *   to the wrong one.
 *
 *   BUYER. The e-mail the checkout collected, else the charge's billing e-mail. The Person is the one
 *   `ResolvePersonByEmail` chooses; with none, a Person is created from the buyer's name. No name, no
 *   Person: an order billed to a row with no name is worse than an exception a person resolves. No
 *   organization is set; card buyers are billed as people.
 *
 * This file reads nothing and writes nothing; `UnmatchedChargeOrders.ts` does.
 */
import type { GatewayCharge, GatewayChargeItem, ListChargeItemsResult } from './BasePaymentProvider.js';
import { NormalizePersonEmail } from './PersonByEmail.js';

/** The longest name part a Person row holds (`FirstName`, `LastName` are nvarchar(100)). */
const MAX_NAME_PART = 100;

export type UnmatchedChargeUnresolvedCode =
    | 'NoCheckoutItems'
    | 'PriceNotMapped'
    | 'SeveralProducts'
    | 'NoBuyerEmail'
    | 'NoBuyerName';

export interface UnmatchedChargeUnresolved {
    Code: UnmatchedChargeUnresolvedCode;
    Message: string;
}

/** One active row of a provider's price map. */
export interface ProviderPriceMapRow {
    ProviderPriceID: string;
    ProductID: string;
}

/** The product a charge's checkout lines name, or why none can be chosen. */
export function ChooseProductForCharge(
    chargeID: string,
    items: GatewayChargeItem[],
    priceMap: ReadonlyMap<string, string>,
): { ProductID: string } | UnmatchedChargeUnresolved {
    if (items.length === 0) {
        return {
            Code: 'NoCheckoutItems',
            Message: `Charge ${chargeID} came through no hosted checkout or payment link, so nothing names what it paid for.`,
        };
    }
    const unmapped = [...new Set(items.map((i) => i.ProviderPriceID).filter((p) => !priceMap.has(p)))];
    if (unmapped.length > 0) {
        return {
            Code: 'PriceNotMapped',
            Message: `Charge ${chargeID} paid for gateway price(s) ${unmapped.join(', ')}, which map to no product.`,
        };
    }
    const products = [...new Set(items.map((i) => priceMap.get(i.ProviderPriceID)!.toLowerCase()))];
    if (products.length > 1) {
        return {
            Code: 'SeveralProducts',
            Message: `Charge ${chargeID} paid for ${products.length} different products; an order created from a payment carries one.`,
        };
    }
    return { ProductID: priceMap.get(items[0].ProviderPriceID)! };
}

/** The price map as a lookup, keyed by the gateway's price id. */
export function PriceMapLookup(rows: ProviderPriceMapRow[]): Map<string, string> {
    return new Map(rows.map((r) => [r.ProviderPriceID, r.ProductID]));
}

export interface ChargeBuyer {
    Email: string;
    /** Null when the gateway holds no name; a Person can then be matched but not created. */
    FirstName: string | null;
    LastName: string | null;
}

/** The buyer the payment names: the checkout's details first, then the charge's. */
export function BuyerFromCharge(
    charge: GatewayCharge,
    items: Pick<ListChargeItemsResult, 'BuyerEmail' | 'BuyerName'>,
): ChargeBuyer | UnmatchedChargeUnresolved {
    const email = NormalizePersonEmail(items.BuyerEmail) ?? NormalizePersonEmail(charge.BuyerEmail);
    if (!email) {
        return { Code: 'NoBuyerEmail', Message: `Charge ${charge.ProviderChargeID} carries no buyer e-mail to find or create the buyer by.` };
    }
    const name = SplitBuyerName(items.BuyerName ?? charge.BuyerName ?? null);
    return { Email: email, FirstName: name?.FirstName ?? null, LastName: name?.LastName ?? null };
}

/**
 * A full name as first and last. The first word is the first name and the rest the last; a single
 * word is both, as the checkout's Person creation does, because `LastName` is required.
 */
export function SplitBuyerName(full: string | null): { FirstName: string; LastName: string } | null {
    const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    const first = parts[0].slice(0, MAX_NAME_PART);
    const last = (parts.slice(1).join(' ') || parts[0]).slice(0, MAX_NAME_PART);
    return { FirstName: first, LastName: last };
}

/** Why a buyer with no matching Person cannot be created. */
export function NoBuyerNameUnresolved(chargeID: string, email: string): UnmatchedChargeUnresolved {
    return {
        Code: 'NoBuyerName',
        Message: `No person has the e-mail ${email} from charge ${chargeID}, and the charge carries no name to create one with.`,
    };
}

/** The text added to a charge-without-payment exception the rules could not resolve. */
export function NotCreatedNote(reason: string): string {
    return ` Not created automatically: ${reason}`;
}
