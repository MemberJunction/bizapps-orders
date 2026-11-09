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
 *   QUANTITY. The sum of the checkout lines' quantities, so three seats bought through a payment link
 *   book three seats. The unit price is the charge divided by that quantity, and it must come out exact
 *   at the line's four decimals; a charge that does not divide evenly is left to a person rather than
 *   booked at a quantity and price that do not multiply back to what was paid.
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
    | 'BadItemQuantity'
    | 'QuantityDoesNotDivide'
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

/** The product a charge's checkout lines name and how many units they bought, or why neither can be chosen. */
export function ChooseProductForCharge(
    chargeID: string,
    items: GatewayChargeItem[],
    priceMap: ReadonlyMap<string, string>,
): { ProductID: string; Quantity: number } | UnmatchedChargeUnresolved {
    if (items.length === 0) {
        return {
            Code: 'NoCheckoutItems',
            Message: `Charge ${chargeID} did not come through a hosted checkout or payment link, so nothing says what it paid for. Create the order by hand.`,
        };
    }
    const unmapped = [...new Set(items.map((i) => i.ProviderPriceID).filter((p) => !priceMap.has(p)))];
    if (unmapped.length > 0) {
        return {
            Code: 'PriceNotMapped',
            Message: `Charge ${chargeID} paid for payment provider price(s) ${unmapped.join(', ')}, which are not linked to any product. Link them in the provider's price map, or create the order by hand.`,
        };
    }
    const products = [...new Set(items.map((i) => priceMap.get(i.ProviderPriceID)!.toLowerCase()))];
    if (products.length > 1) {
        return {
            Code: 'SeveralProducts',
            Message: `Charge ${chargeID} paid for ${products.length} different products, but an order can be created automatically for only one. Create the order by hand.`,
        };
    }
    const badQuantity = items.find((i) => !Number.isInteger(Number(i.Quantity)) || Number(i.Quantity) < 1);
    if (badQuantity) {
        return {
            Code: 'BadItemQuantity',
            Message: `Charge ${chargeID} paid for gateway price ${badQuantity.ProviderPriceID} at quantity ${badQuantity.Quantity}, which is not a whole number of units.`,
        };
    }
    const quantity = items.reduce((sum, i) => sum + Number(i.Quantity), 0);
    return { ProductID: priceMap.get(items[0].ProviderPriceID)!, Quantity: quantity };
}

/** The decimals an order line's unit price holds (`UnitPrice` is decimal(19,4)). */
const UNIT_PRICE_SCALE = 10_000;

/**
 * The unit price that books `quantity` units for exactly `amount`, or why there is none. A charge of
 * 100.00 for 3 units is 33.3333 each, which multiplies back to 99.9999: the order would not total the
 * payment, so it is left to a person.
 */
export function UnitPriceForCharge(
    chargeID: string,
    amount: number,
    quantity: number,
): { UnitPrice: number } | UnmatchedChargeUnresolved {
    // Compared in ten-thousandths, the line's own precision, so 33.3333 × 3 does not round back to 100.00.
    const scaled = Math.round(amount * 100) * (UNIT_PRICE_SCALE / 100);
    const unitScaled = Math.round(scaled / quantity);
    const unit = unitScaled / UNIT_PRICE_SCALE;
    if (unitScaled * quantity !== scaled) {
        return {
            Code: 'QuantityDoesNotDivide',
            Message: `Charge ${chargeID} of ${amount} for ${quantity} units does not split into an even unit price, so no order line would add back up to the payment. Create the order by hand.`,
        };
    }
    return { UnitPrice: unit };
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
        return { Code: 'NoBuyerEmail', Message: `Charge ${charge.ProviderChargeID} has no buyer email, so the buyer cannot be found or created. Create the order by hand.` };
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
        Message: `No person has the email ${email} from charge ${chargeID}, and the charge has no name to create one with. Add the person first, or create the order by hand.`,
    };
}

/** The text added to a charge-without-payment exception the rules could not resolve. */
export function NotCreatedNote(reason: string): string {
    return ` Not created automatically: ${reason}`;
}
