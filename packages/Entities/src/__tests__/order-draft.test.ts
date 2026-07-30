/**
 * `OrderDraft` unit tests.
 *
 * The draft is the one piece of order-entry logic that runs in the browser, so it
 * is the one piece that can be wrong without the engine noticing. These tests
 * concentrate on the three things that would produce a silently wrong order:
 *
 *   1. an unset unit price must be OMITTED, never sent as 0 (0 is a free line)
 *   2. line numbers must come from array order, so a removal renumbers
 *   3. a stored preview must go stale the moment the draft changes
 *
 * No Angular, no DOM, no provider — the draft is pure by design, which is what
 * makes this file possible at all.
 */
import { describe, expect, it, vi } from 'vitest';
import { OrderDraft, type OrderDraftPayload } from '../order-draft';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const PERSON = '22222222-2222-2222-2222-222222222222';
const ORG = '33333333-3333-3333-3333-333333333333';
const PRODUCT_A = 'AAAAAAAA-0000-0000-0000-000000000001';
const PRODUCT_B = 'AAAAAAAA-0000-0000-0000-000000000002';

/** A draft that passes validation, so a test can focus on one thing at a time. */
function validDraft(): OrderDraft {
    const draft = new OrderDraft({ CompanyID: COMPANY });
    draft.SetBillTo({ PersonID: PERSON, OrganizationID: ORG });
    draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1 });
    return draft;
}

describe('OrderDraft — construction', () => {
    it('defaults to a Sale and starts new', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        expect(draft.Header.OrderType).toBe('Sale');
        expect(draft.IsNew).toBe(true);
        expect(draft.LineCount).toBe(0);
    });

    it('is not new once it carries an order id', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY, OrderHeaderID: 'abc' });
        expect(draft.IsNew).toBe(false);
    });

    it('carries origin through, so an LXP order is never inferred from a null sales rep', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY, OriginChannel: 'LXP', OriginExternalID: 'LH4I-88213' });
        expect(draft.ToInput().Header.OriginChannel).toBe('LXP');
        expect(draft.ToInput().Header.OriginExternalID).toBe('LH4I-88213');
    });
});

describe('OrderDraft — the unit-price omission rule', () => {
    it('OMITS an unstated unit price rather than sending 0', () => {
        const draft = validDraft();
        const line = draft.ToInput().Lines[0];
        expect('UnitPrice' in line).toBe(false);
    });

    it('sends a stated price of 0, because a free line is a real thing', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1, UnitPrice: 0 });
        const line = draft.ToInput().Lines[0];
        expect('UnitPrice' in line).toBe(true);
        expect(line.UnitPrice).toBe(0);
    });

    it('reports whether the price was stated', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        const resolved = draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1 });
        const stated = draft.AddLine({ ProductID: PRODUCT_B, Quantity: 1, UnitPrice: 0 });
        expect(resolved.UnitPriceWasStated).toBe(false);
        expect(stated.UnitPriceWasStated).toBe(true);
    });

    it('keeps a stated price after an unrelated update', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        const line = draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1, UnitPrice: 80 });
        draft.UpdateLine(line.ClientKey, { Quantity: 5 });
        expect(draft.ToInput().Lines[0].UnitPrice).toBe(80);
    });
});

describe('OrderDraft — lines', () => {
    it('gives every line a distinct client key', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        const a = draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1 });
        const b = draft.AddLine({ ProductID: PRODUCT_B, Quantity: 1 });
        expect(a.ClientKey).not.toBe(b.ClientKey);
    });

    it('renumbers on removal — array order is the line order', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1 });
        const middle = draft.AddLine({ ProductID: PRODUCT_B, Quantity: 2 });
        draft.AddLine({ ProductID: PRODUCT_A, Quantity: 3 });

        draft.RemoveLine(middle.ClientKey);

        const quantities = draft.ToInput().Lines.map((l) => l.Quantity);
        expect(quantities).toEqual([1, 3]);
        expect(draft.LineCount).toBe(2);
    });

    it('moves a line and clamps an out-of-range index', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        const a = draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1 });
        draft.AddLine({ ProductID: PRODUCT_B, Quantity: 2 });
        draft.MoveLine(a.ClientKey, 99);
        expect(draft.Lines.map((l) => l.Quantity)).toEqual([2, 1]);
    });

    it('ignores updates and removals for an unknown key', () => {
        const draft = validDraft();
        const before = draft.Version;
        draft.UpdateLine('nope', { Quantity: 9 });
        draft.RemoveLine('nope');
        expect(draft.Version).toBe(before);
    });

    it('treats a negative quantity as a reversal', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        const line = draft.AddLine({ ProductID: PRODUCT_A, Quantity: -1 });
        expect(line.IsReversal).toBe(true);
    });

    it('omits every field the caller did not state', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1 });
        const line = draft.ToInput().Lines[0];
        expect(Object.keys(line).sort()).toEqual(['ClientKey', 'ProductID', 'Quantity']);
    });
});

describe('OrderDraft — promotion codes', () => {
    it('normalises case and de-duplicates', () => {
        const draft = validDraft();
        draft.AddPromotionCode('spring10');
        draft.AddPromotionCode('SPRING10');
        draft.AddPromotionCode('  spring10  ');
        expect(draft.PromotionCodes).toEqual(['SPRING10']);
    });

    it('ignores an empty code', () => {
        const draft = validDraft();
        const before = draft.Version;
        draft.AddPromotionCode('   ');
        expect(draft.PromotionCodes).toEqual([]);
        expect(draft.Version).toBe(before);
    });

    it('removes case-insensitively', () => {
        const draft = validDraft();
        draft.AddPromotionCode('MEMBER40');
        draft.RemovePromotionCode('member40');
        expect(draft.PromotionCodes).toEqual([]);
    });

    it('omits the codes array entirely when there are none', () => {
        expect('PromotionCodes' in validDraft().ToInput()).toBe(false);
    });
});

describe('OrderDraft — preview staleness', () => {
    it('starts stale', () => {
        expect(validDraft().IsPreviewStale).toBe(true);
    });

    it('is current immediately after applying a preview', () => {
        const draft = validDraft();
        draft.ApplyPreview({ Totals: { GrossTotal: 170, NetTotal: 160 } });
        expect(draft.IsPreviewStale).toBe(false);
        expect(draft.ConfirmableGrossTotal).toBe(170);
    });

    it('goes stale on the next mutation, and withholds a confirmable total', () => {
        const draft = validDraft();
        draft.ApplyPreview({ Totals: { GrossTotal: 170, NetTotal: 160 } });
        draft.AddLine({ ProductID: PRODUCT_B, Quantity: 1 });

        expect(draft.IsPreviewStale).toBe(true);
        // The critical one: a stale total must NOT be offered as the number to
        // confirm against, or the guard would authorise the amount it is meant
        // to catch.
        expect(draft.ConfirmableGrossTotal).toBeUndefined();
    });

    it('goes stale when a line is edited, not just added', () => {
        const draft = validDraft();
        draft.ApplyPreview({ Totals: { GrossTotal: 170, NetTotal: 160 } });
        draft.UpdateLine(draft.Lines[0].ClientKey, { Quantity: 2 });
        expect(draft.IsPreviewStale).toBe(true);
    });

    it('clears back to stale', () => {
        const draft = validDraft();
        draft.ApplyPreview({ Totals: { GrossTotal: 170, NetTotal: 160 } });
        draft.ClearPreview();
        expect(draft.IsPreviewStale).toBe(true);
    });
});

describe('OrderDraft — validation', () => {
    it('accepts a well-formed draft', () => {
        const result = validDraft().Validate();
        expect(result.IsValid).toBe(true);
        expect(result.Issues).toEqual([]);
    });

    it('requires a bill-to party', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1 });
        const codes = draft.Validate().Issues.map((i) => i.Code);
        expect(codes).toContain('BILL_TO_REQUIRED');
        expect(draft.Validate().IsValid).toBe(false);
    });

    it('accepts an organization alone as the bill-to party', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        draft.SetBillTo({ OrganizationID: ORG });
        draft.AddLine({ ProductID: PRODUCT_A, Quantity: 1 });
        expect(draft.Validate().IsValid).toBe(true);
    });

    it('requires at least one line', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        draft.SetBillTo({ OrganizationID: ORG });
        expect(draft.Validate().Issues.map((i) => i.Code)).toContain('LINES_REQUIRED');
    });

    it('refuses a zero quantity and points at the line', () => {
        const draft = validDraft();
        const line = draft.AddLine({ ProductID: PRODUCT_B, Quantity: 0 });
        const issue = draft.Validate().Issues.find((i) => i.Code === 'LINE_QUANTITY_NONZERO');
        expect(issue).toBeDefined();
        expect(issue!.ClientKey).toBe(line.ClientKey);
    });

    it('refuses a negative unit price — a return is a negative quantity instead', () => {
        const draft = validDraft();
        draft.AddLine({ ProductID: PRODUCT_B, Quantity: 1, UnitPrice: -5 });
        expect(draft.Validate().Issues.map((i) => i.Code)).toContain('LINE_PRICE_NEGATIVE');
    });

    it('refuses a discount outside 0–100%', () => {
        const draft = validDraft();
        draft.AddLine({ ProductID: PRODUCT_B, Quantity: 1, DiscountPct: 1.5 });
        expect(draft.Validate().Issues.map((i) => i.Code)).toContain('LINE_DISCOUNT_RANGE');
    });

    it('refuses a service period that ends before it starts', () => {
        const draft = validDraft();
        draft.AddLine({
            ProductID: PRODUCT_B,
            Quantity: 1,
            ServicePeriodStart: '2027-01-01',
            ServicePeriodEnd: '2026-12-31',
        });
        expect(draft.Validate().Issues.map((i) => i.Code)).toContain('LINE_SERVICE_PERIOD_ORDER');
    });

    it('requires a reason on a manual discount', () => {
        const draft = validDraft();
        draft.AddManualDiscount({ Percent: 0.2, Reason: '  ' });
        expect(draft.Validate().Issues.map((i) => i.Code)).toContain('MANUAL_DISCOUNT_REASON_REQUIRED');
    });

    it('requires a reason on a charge override', () => {
        const draft = validDraft();
        draft.SetCharge({ ChargeTypeID: 'CH1', Amount: 0 });
        expect(draft.Validate().Issues.map((i) => i.Code)).toContain('CHARGE_OVERRIDE_REASON_REQUIRED');
    });

    it('WARNS rather than errors on a Return with no reversing line', () => {
        const draft = validDraft();
        draft.SetHeader({ OrderType: 'Return' });
        const issue = draft.Validate().Issues.find((i) => i.Code === 'RETURN_WITHOUT_REVERSAL_LINE');
        expect(issue?.Severity).toBe('warning');
        // A warning must not block the save — the engine is the authority on
        // reversal shape, and the client can only approximate it.
        expect(draft.Validate().IsValid).toBe(true);
    });

    it('reports which sections carry errors, for the tab red dots', () => {
        const draft = new OrderDraft({ CompanyID: COMPANY });
        draft.AddLine({ ProductID: '', Quantity: 0 });
        const sections = draft.SectionsWithErrors.sort();
        expect(sections).toContain('lines');
        expect(sections).toContain('parties');
    });
});

describe('OrderDraft — change notification', () => {
    it('notifies subscribers on mutation and stops after unsubscribing', () => {
        const draft = validDraft();
        const handler = vi.fn();
        const stop = draft.Subscribe(handler);

        draft.AddPromotionCode('SPRING10');
        expect(handler).toHaveBeenCalledTimes(1);

        stop();
        draft.AddPromotionCode('MEMBER40');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not notify when nothing actually changed', () => {
        const draft = validDraft();
        draft.AddPromotionCode('SPRING10');
        const handler = vi.fn();
        draft.Subscribe(handler);
        draft.AddPromotionCode('SPRING10');   // already present
        draft.RemovePromotionCode('NOPE');    // not present
        expect(handler).not.toHaveBeenCalled();
    });

    it('survives a subscriber that unsubscribes during notification', () => {
        const draft = validDraft();
        let stop: () => void = () => undefined;
        const first = vi.fn(() => stop());
        const second = vi.fn();
        stop = draft.Subscribe(first);
        draft.Subscribe(second);

        expect(() => draft.AddPromotionCode('X')).not.toThrow();
        expect(second).toHaveBeenCalledTimes(1);
    });
});

describe('OrderDraft — round trip', () => {
    it('survives ToInput → FromInput with its keys intact', () => {
        const draft = validDraft();
        draft.AddLine({ ProductID: PRODUCT_B, Quantity: 5, UnitPrice: 80 });
        draft.AddPromotionCode('SPRING10');
        draft.SetShipTo({ AddressID: 'addr-1' });

        const restored = OrderDraft.FromInput(draft.ToInput());

        expect(restored.ToInput()).toEqual(draft.ToInput());
        expect(restored.Lines.map((l) => l.ClientKey)).toEqual(draft.Lines.map((l) => l.ClientKey));
    });

    it('does not mint a key that collides with a restored one', () => {
        const payload: OrderDraftPayload = {
            Header: { CompanyID: COMPANY, BillToOrganizationID: ORG },
            Lines: [{ ClientKey: 'L7', ProductID: PRODUCT_A, Quantity: 1 }],
        };
        const restored = OrderDraft.FromInput(payload);
        const added = restored.AddLine({ ProductID: PRODUCT_B, Quantity: 1 });
        expect(added.ClientKey).not.toBe('L7');
        expect(restored.Lines.map((l) => l.ClientKey)).toEqual(['L7', 'L8']);
    });

    it('clones deeply — editing the copy leaves the original alone', () => {
        const draft = validDraft();
        const copy = draft.Clone();
        copy.UpdateLine(copy.Lines[0].ClientKey, { Quantity: 99 });
        copy.AddPromotionCode('SPRING10');

        expect(draft.Lines[0].Quantity).toBe(1);
        expect(draft.PromotionCodes).toEqual([]);
    });

    it('does not carry subscribers into a clone', () => {
        const draft = validDraft();
        const handler = vi.fn();
        draft.Subscribe(handler);
        const copy = draft.Clone();
        copy.AddPromotionCode('X');
        expect(handler).not.toHaveBeenCalled();
    });

    it('does not leak its internal arrays', () => {
        const draft = validDraft();
        draft.Lines.push(null as never);
        draft.PromotionCodes.push('SNEAKY');
        expect(draft.LineCount).toBe(1);
        expect(draft.PromotionCodes).toEqual([]);
    });
});

describe('OrderDraft — initial payment intent', () => {
    it('records intent and clears it', () => {
        const draft = validDraft();
        draft.SetInitialPayment({ PaymentTypeID: 'card', Amount: 170, SourceCustomerPaymentMethodID: 'w1' });
        expect(draft.Header.InitialPaymentTypeID).toBe('card');
        expect(draft.Header.InitialPaymentAmount).toBe(170);

        draft.ClearInitialPayment();
        expect(draft.Header.InitialPaymentTypeID).toBeNull();
        expect(draft.Header.InitialPaymentAmount).toBe(0);
    });
});
