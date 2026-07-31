/**
 * Gift-card issuance decisions, with no database in sight.
 *
 * WHAT SELLING A GIFT CARD ACTUALLY IS. It is not a sale. Nothing has been delivered and no revenue
 * has been earned — the company has taken money and now OWES goods. So the line books a LIABILITY,
 * and revenue appears later, on whatever order the card is eventually spent on. Getting this wrong
 * is the classic gift-card error: recognise at issue and you book revenue twice, once when the card
 * is sold and again when it is redeemed.
 *
 * THE ONE THAT LOOKS RIGHT AND IS NOT. Face value is `UnitPrice`, deliberately NOT the discounted
 * line amount. Sell a $50 card in a 10%-off promotion and the customer pays $45 — but the card is
 * still worth $50 and the company still owes $50 of goods. Deriving the liability from what was
 * PAID understates it by exactly the discount, and every downstream number still reconciles, because
 * the order, the payment and the journal entry all agree with each other. Only the balance sheet is
 * wrong, and only until somebody redeems.
 *
 * ONE CARD PER UNIT. Quantity 3 at $50 is three $50 cards, not one $150 card. That is how a person
 * buying three gift cards expects it to work, and it is why quantity must be a whole number here —
 * half a gift card is not a thing, and silently flooring it would hand the customer less than they
 * bought.
 *
 * CONNECTS TO:
 *   CODE: GiftCardEngine (the rows) · OrderEntityServer.issueGiftCards (the lifecycle point)
 *   DOC:  plans/bizapps-orders-master.md D4 (GiftCard product type), D27 (beneficiary), D44
 */

/** The ProductType.Code that marks a product as a gift card. Seeded per D4. */
export const GIFT_CARD_PRODUCT_TYPE_CODE = 'GiftCard';

/** What a line has to say for itself before we can decide whether it issues anything. */
export interface GiftCardLineFacts {
    ID: string;
    ProductID: string;
    /** `ProductType.Code`. Null on a type that never got one — such a type is not a gift card. */
    ProductTypeCode: string | null;
    Quantity: number;
    UnitPrice: number;
    /** Set on a reversal line. A reversal never ISSUES; it voids what the origin issued. */
    ReversesOrderLineID: string | null;
    ShipToPersonID: string | null;
    ShipToOrganizationID: string | null;
}

/** The order-level fallbacks for whoever the card is for. */
export interface GiftCardOrderFacts {
    BillToPersonID: string | null;
    BillToOrganizationID: string | null;
}

/** One card to be issued. The engine turns each of these into a StoredValueAccount + Issue txn. */
export interface PlannedGiftCard {
    OrderLineID: string;
    /** 1..n within the line, so three cards on one line are distinguishable and reproducible. */
    Sequence: number;
    FaceValue: number;
    BeneficiaryPersonID: string | null;
    BeneficiaryOrganizationID: string | null;
}

/** Why a line that looked like a gift card issued nothing. Recorded rather than thrown. */
export type GiftCardRefusal =
    | 'NotAGiftCardProduct'
    | 'ReversalLine'
    | 'NonPositiveQuantity'
    | 'FractionalQuantity'
    | 'NonPositiveFaceValue';

export interface GiftCardPlan {
    Cards: PlannedGiftCard[];
    /** Populated only when `Cards` is empty, so a zero result is never mistaken for a silent pass. */
    Refusal: GiftCardRefusal | null;
}

const EMPTY = (reason: GiftCardRefusal): GiftCardPlan => ({ Cards: [], Refusal: reason });

/** Round to cents the way the rest of the engine does. */
const Money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Is this line for a gift-card product at all? */
export function IsGiftCardLine(line: Pick<GiftCardLineFacts, 'ProductTypeCode'>): boolean {
    return (line.ProductTypeCode ?? '').trim().toLowerCase() === GIFT_CARD_PRODUCT_TYPE_CODE.toLowerCase();
}

/**
 * Decide what a line issues.
 *
 * Returns an empty plan WITH a reason rather than throwing, because most lines are not gift cards
 * and that is not an error. The caller distinguishes "nothing to do" from "something was wrong" by
 * looking at `Refusal`, which is why the two cases are never both empty and silent.
 */
export function PlanGiftCardIssuance(
    line: GiftCardLineFacts,
    order: GiftCardOrderFacts,
): GiftCardPlan {
    if (!IsGiftCardLine(line)) return EMPTY('NotAGiftCardProduct');

    // A reversal line carries a negative quantity and points at the line it undoes. It must not mint
    // more cards — the return path voids the origin's cards instead (see PlanGiftCardVoid).
    if (line.ReversesOrderLineID) return EMPTY('ReversalLine');

    const qty = Number(line.Quantity ?? 0);
    if (!(qty > 0)) return EMPTY('NonPositiveQuantity');
    if (!Number.isInteger(qty)) return EMPTY('FractionalQuantity');

    const faceValue = Money(Number(line.UnitPrice ?? 0));
    if (!(faceValue > 0)) return EMPTY('NonPositiveFaceValue');

    // WHO THE CARD IS FOR (D27). A gift card is the archetypal case of a line bought by one person
    // for another, so the line's ship-to wins when stated. The order's bill-to is the fallback for
    // the ordinary case of buying a card for yourself — NOT a default that overrides an explicit
    // recipient, which is why each side falls back independently.
    const beneficiaryPersonID = line.ShipToPersonID ?? order.BillToPersonID ?? null;
    const beneficiaryOrganizationID = line.ShipToOrganizationID ?? order.BillToOrganizationID ?? null;

    const cards: PlannedGiftCard[] = [];
    for (let i = 1; i <= qty; i++) {
        cards.push({
            OrderLineID: line.ID,
            Sequence: i,
            FaceValue: faceValue,
            BeneficiaryPersonID: beneficiaryPersonID,
            BeneficiaryOrganizationID: beneficiaryOrganizationID,
        });
    }
    return { Cards: cards, Refusal: null };
}

/** How many of a line's cards a return of `reversalQuantity` units should void. */
export function PlanGiftCardVoid(reversalQuantity: number, issuedCount: number): number {
    // The reversal quantity is negative by convention (D10); its magnitude is what was sent back.
    const returned = Math.abs(Number(reversalQuantity ?? 0));
    if (!(returned > 0) || !(issuedCount > 0)) return 0;
    // Never void more than were issued. A partial return of a three-card line voids that many, and
    // returning the whole line voids the lot.
    return Math.min(Math.floor(returned), issuedCount);
}

/**
 * A card code: `GC-` + 16 unambiguous characters in groups of four.
 *
 * The alphabet omits I, L, O, 0, 1, U — the pairs people mistype when reading a card aloud or off a
 * printed insert, and U because it turns short random runs into words nobody wants printed on a gift
 * card. 30 symbols over 16 positions is ~78 bits, so collisions are not a practical concern; the
 * UNIQUE constraint on `StoredValueAccount.Code` is the actual guarantee and this only has to make
 * hitting it vanishingly unlikely.
 *
 * `randomChar` is injected so tests can make this deterministic without stubbing global crypto.
 */
export const GIFT_CARD_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function FormatGiftCardCode(randomChar: () => string, groups = 4, groupSize = 4): string {
    const parts: string[] = [];
    for (let g = 0; g < groups; g++) {
        let part = '';
        for (let i = 0; i < groupSize; i++) part += randomChar();
        parts.push(part);
    }
    return `GC-${parts.join('-')}`;
}

/** True if a string looks like a code this module would have produced. */
export function IsGiftCardCode(code: string): boolean {
    return /^GC-([23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-){3}[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/.test(code);
}

/**
 * The total liability a plan creates.
 *
 * Deliberately separate from the line's own money. `LineTotalNet` is what the CUSTOMER PAID, after
 * discounts and promotions; this is what the COMPANY OWES. On an undiscounted line they are equal,
 * which is exactly why a bug here would go unnoticed until the first discounted card.
 */
export function GiftCardLiability(plan: GiftCardPlan): number {
    return Money(plan.Cards.reduce((sum, c) => sum + c.FaceValue, 0));
}
