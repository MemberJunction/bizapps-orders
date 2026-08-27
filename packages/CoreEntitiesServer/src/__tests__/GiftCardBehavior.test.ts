/**
 * GiftCardBehavior — the decisions, with no database.
 *
 * The two that matter most and are asserted hardest:
 *   · face value comes from UnitPrice, NOT the discounted line amount, so a promotion cannot
 *     understate what the company owes;
 *   · a reversal line issues nothing, so returning a gift card cannot mint another one.
 * Both are cases where the wrong answer produces a perfectly balanced, perfectly plausible order.
 */
import { describe, expect, it } from 'vitest';
import {
    FormatGiftCardCode,
    GIFT_CARD_ALPHABET,
    GIFT_CARD_PRODUCT_TYPE_CODE,
    GiftCardLiability,
    IsGiftCardCode,
    IsGiftCardLine,
    PlanGiftCardIssuance,
    PlanGiftCardVoid,
    type GiftCardLineFacts,
    type GiftCardOrderFacts,
} from '../GiftCardBehavior.js';

const ORDER: GiftCardOrderFacts = {
    BillToPersonID: 'buyer-person',
    BillToOrganizationID: 'buyer-org',
};

const line = (over: Partial<GiftCardLineFacts> = {}): GiftCardLineFacts => ({
    ID: 'line-1',
    ProductID: 'product-1',
    ProductTypeCode: GIFT_CARD_PRODUCT_TYPE_CODE,
    Quantity: 1,
    UnitPrice: 50,
    ReversesOrderLineID: null,
    ShipToPersonID: null,
    ShipToOrganizationID: null,
    ...over,
});

describe('IsGiftCardLine', () => {
    it('matches the seeded code', () => {
        expect(IsGiftCardLine({ ProductTypeCode: 'GiftCard' })).toBe(true);
    });

    it('is case- and whitespace-insensitive, because type codes are hand-entered', () => {
        expect(IsGiftCardLine({ ProductTypeCode: '  giftcard ' })).toBe(true);
        expect(IsGiftCardLine({ ProductTypeCode: 'GIFTCARD' })).toBe(true);
    });

    it('does not match a type with no code, or a different one', () => {
        expect(IsGiftCardLine({ ProductTypeCode: null })).toBe(false);
        expect(IsGiftCardLine({ ProductTypeCode: '' })).toBe(false);
        expect(IsGiftCardLine({ ProductTypeCode: 'Gift' })).toBe(false);
        expect(IsGiftCardLine({ ProductTypeCode: 'PhysicalGood' })).toBe(false);
    });
});

describe('PlanGiftCardIssuance', () => {
    it('issues one card per unit, not one card for the line', () => {
        const plan = PlanGiftCardIssuance(line({ Quantity: 3, UnitPrice: 50 }), ORDER);
        expect(plan.Cards).toHaveLength(3);
        expect(plan.Cards.map((c) => c.FaceValue)).toEqual([50, 50, 50]);
        expect(plan.Cards.map((c) => c.Sequence)).toEqual([1, 2, 3]);
        expect(GiftCardLiability(plan)).toBe(150);
    });

    it('takes face value from UnitPrice, so a discount cannot understate the liability', () => {
        // A $50 card sold in a 10%-off promotion: the customer pays 45, the company owes 50.
        // Deriving the liability from what was PAID would be wrong by exactly the discount, and
        // every other number on the order would still reconcile.
        const plan = PlanGiftCardIssuance(line({ Quantity: 1, UnitPrice: 50 }), ORDER);
        expect(GiftCardLiability(plan)).toBe(50);
        expect(GiftCardLiability(plan)).not.toBe(45);
    });

    it('rounds face value to cents', () => {
        const plan = PlanGiftCardIssuance(line({ UnitPrice: 33.333 }), ORDER);
        expect(plan.Cards[0].FaceValue).toBe(33.33);
    });

    it('refuses a reversal line rather than minting more cards', () => {
        const plan = PlanGiftCardIssuance(
            line({ Quantity: -1, ReversesOrderLineID: 'origin-line' }),
            ORDER,
        );
        expect(plan.Cards).toHaveLength(0);
        expect(plan.Refusal).toBe('ReversalLine');
    });

    it('refuses a fractional quantity instead of flooring it', () => {
        // Flooring would hand the customer two cards when they bought two and a half — quietly
        // less than they paid for. There is no such thing as half a gift card.
        const plan = PlanGiftCardIssuance(line({ Quantity: 2.5 }), ORDER);
        expect(plan.Cards).toHaveLength(0);
        expect(plan.Refusal).toBe('FractionalQuantity');
    });

    it('refuses zero or negative quantity and non-positive face value', () => {
        expect(PlanGiftCardIssuance(line({ Quantity: 0 }), ORDER).Refusal).toBe('NonPositiveQuantity');
        expect(PlanGiftCardIssuance(line({ Quantity: -2 }), ORDER).Refusal).toBe('NonPositiveQuantity');
        expect(PlanGiftCardIssuance(line({ UnitPrice: 0 }), ORDER).Refusal).toBe('NonPositiveFaceValue');
        expect(PlanGiftCardIssuance(line({ UnitPrice: -5 }), ORDER).Refusal).toBe('NonPositiveFaceValue');
    });

    it('is not a gift card at all when the type code does not match', () => {
        const plan = PlanGiftCardIssuance(line({ ProductTypeCode: 'Service' }), ORDER);
        expect(plan.Refusal).toBe('NotAGiftCardProduct');
    });

    it('always states a reason when it issues nothing', () => {
        for (const over of [
            { ProductTypeCode: 'Service' },
            { ReversesOrderLineID: 'x' },
            { Quantity: 0 },
            { Quantity: 1.5 },
            { UnitPrice: 0 },
        ]) {
            const plan = PlanGiftCardIssuance(line(over as Partial<GiftCardLineFacts>), ORDER);
            expect(plan.Cards).toHaveLength(0);
            expect(plan.Refusal, `empty plan with no reason for ${JSON.stringify(over)}`).not.toBeNull();
        }
    });
});

describe('PlanGiftCardIssuance — who the card is for (D27)', () => {
    it("prefers the line's ship-to, because a gift card is bought FOR somebody", () => {
        const plan = PlanGiftCardIssuance(
            line({ ShipToPersonID: 'recipient-person', ShipToOrganizationID: 'recipient-org' }),
            ORDER,
        );
        expect(plan.Cards[0].BeneficiaryPersonID).toBe('recipient-person');
        expect(plan.Cards[0].BeneficiaryOrganizationID).toBe('recipient-org');
    });

    it("falls back to the order's bill-to when nobody is named", () => {
        const plan = PlanGiftCardIssuance(line(), ORDER);
        expect(plan.Cards[0].BeneficiaryPersonID).toBe('buyer-person');
        expect(plan.Cards[0].BeneficiaryOrganizationID).toBe('buyer-org');
    });

    it('falls back PER SIDE, so naming a person does not drag in the buyer organization', () => {
        // A card bought by a company for a named individual: the person is the recipient, and the
        // organization side independently falls back to the buyer. Collapsing these into one
        // decision would either lose the recipient or attach the wrong org.
        const plan = PlanGiftCardIssuance(line({ ShipToPersonID: 'recipient-person' }), ORDER);
        expect(plan.Cards[0].BeneficiaryPersonID).toBe('recipient-person');
        expect(plan.Cards[0].BeneficiaryOrganizationID).toBe('buyer-org');
    });

    it('leaves a side null when neither the line nor the order names one', () => {
        const plan = PlanGiftCardIssuance(line(), {
            BillToPersonID: null,
            BillToOrganizationID: null,
        });
        expect(plan.Cards[0].BeneficiaryPersonID).toBeNull();
        expect(plan.Cards[0].BeneficiaryOrganizationID).toBeNull();
    });

    it('gives every card on a multi-unit line the same beneficiary', () => {
        const plan = PlanGiftCardIssuance(
            line({ Quantity: 3, ShipToPersonID: 'recipient-person' }),
            ORDER,
        );
        expect(new Set(plan.Cards.map((c) => c.BeneficiaryPersonID))).toEqual(
            new Set(['recipient-person']),
        );
    });
});

describe('PlanGiftCardVoid', () => {
    it('voids as many cards as units came back', () => {
        expect(PlanGiftCardVoid(-2, 3)).toBe(2);
    });

    it('takes the magnitude, since reversal quantities are negative by convention (D10)', () => {
        expect(PlanGiftCardVoid(-3, 3)).toBe(3);
        expect(PlanGiftCardVoid(3, 3)).toBe(3);
    });

    it('never voids more than were issued', () => {
        // Returning more than was bought is refused upstream, but if it ever reached here, voiding
        // five cards from a line that issued three would take somebody else's card with it.
        expect(PlanGiftCardVoid(-5, 3)).toBe(3);
    });

    it('voids nothing when nothing came back or nothing was issued', () => {
        expect(PlanGiftCardVoid(0, 3)).toBe(0);
        expect(PlanGiftCardVoid(-2, 0)).toBe(0);
    });

    it('floors a fractional return rather than rounding up', () => {
        // Rounding up would void a card the customer still holds.
        expect(PlanGiftCardVoid(-2.9, 5)).toBe(2);
    });
});

describe('FormatGiftCardCode', () => {
    const cycling = () => {
        let i = 0;
        return () => GIFT_CARD_ALPHABET[i++ % GIFT_CARD_ALPHABET.length];
    };

    it('produces the documented shape', () => {
        const code = FormatGiftCardCode(cycling());
        expect(code).toMatch(/^GC-\w{4}-\w{4}-\w{4}-\w{4}$/);
        expect(IsGiftCardCode(code)).toBe(true);
    });

    it('omits the characters people misread', () => {
        // I/L/O/0/1 are the classic misreads; U is excluded so short random runs stay printable.
        for (const bad of ['I', 'L', 'O', '0', '1', 'U']) {
            expect(GIFT_CARD_ALPHABET).not.toContain(bad);
        }
    });

    it('rejects a code that is not ours', () => {
        expect(IsGiftCardCode('GC-IIII-IIII-IIII-IIII')).toBe(false); // excluded characters
        expect(IsGiftCardCode('GC-ABC-DEFG-HJKM-NPQR')).toBe(false); // wrong group size
        expect(IsGiftCardCode('ABCD-EFGH-JKMN-PQRS')).toBe(false); // no prefix
        expect(IsGiftCardCode('')).toBe(false);
    });

    it('draws every character from the alphabet', () => {
        const code = FormatGiftCardCode(cycling()).slice(3).replace(/-/g, '');
        for (const ch of code) expect(GIFT_CARD_ALPHABET).toContain(ch);
    });
});

describe('GiftCardLiability', () => {
    it('is zero for a plan that issues nothing', () => {
        expect(GiftCardLiability({ Cards: [], Refusal: 'ReversalLine' })).toBe(0);
    });

    it('sums to cents without float drift', () => {
        const plan = PlanGiftCardIssuance(line({ Quantity: 3, UnitPrice: 0.1 }), ORDER);
        expect(GiftCardLiability(plan)).toBe(0.3);
    });
});
