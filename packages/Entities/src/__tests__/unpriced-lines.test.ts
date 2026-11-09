/**
 * A line at a price of zero on a hand-entered order is refused before confirm (bc-aidp-next-golive#328).
 *
 * Products sold at a negotiated price sit in the catalog at zero, so a line left at the catalog price
 * would otherwise reach journal booking, where accounting refuses each recognition period of it.
 *
 * `OrderHeaderEntity` cannot be constructed cheaply (see order-header-default-date.test.ts), so the
 * methods under test are called on a stand-in that carries only the members they read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/core';
import { OrdersEngine } from '../pricing/OrdersEngine.js';
import { OrderHeaderEntity } from '../OrderHeaderEntity.js';
import { IsHandEnteredOrigin } from '../order-origin.js';

type Row = Record<string, unknown>;

function seed(products: Row[]): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = products;
    engine._productTypes = [];
    engine._revenueRecognitionTypes = [];
    engine._eventProducts = [];
}

beforeEach(() => seed([{ ID: 'p-free', Name: 'Negotiated Seat' }, { ID: 'p-paid', Name: 'Paid Seat' }]));
afterEach(() => seed([]));

function line(n: number, productID: string, unitPrice: number | null, extra: Row = {}): Row {
    return {
        LineNumber: n,
        ProductID: productID,
        Product: null,
        UnitPrice: unitPrice,
        DiscountPct: 0,
        DiscountAmount: 0,
        ParentOrderLineID: null,
        ReversesOrderLineID: null,
        ServicePeriodStart: null,
        ServicePeriodEnd: null,
        ...extra,
    };
}

function order(lines: Row[], origin = 'Direct'): OrderHeaderEntity {
    const stub = {
        IsSaved: true,
        Status: 'Draft',
        Origin: origin,
        BillToPersonID: 'person-1',
        BillToOrganizationID: null,
        Lines: { Items: lines, Count: lines.length, IsLoaded: true },
        GetFieldByName: () => ({ OldValue: 'Draft' }),
    };
    Object.setPrototypeOf(stub, OrderHeaderEntity.prototype);
    return stub as unknown as OrderHeaderEntity;
}

describe('UnpricedLines', () => {
    it('finds a line at a price of zero beside a paid one', () => {
        const o = order([line(1, 'p-paid', 100), line(2, 'p-free', 0)]);
        expect(o.UnpricedLines().map((l) => l.LineNumber)).toEqual([2]);
    });

    it('leaves out a line with no price yet, which the server prices', () => {
        expect(order([line(1, 'p-free', null)]).UnpricedLines()).toEqual([]);
    });

    it('leaves out a line given away as its price with a 100% discount', () => {
        expect(order([line(1, 'p-free', 250, { DiscountPct: 1 })]).UnpricedLines()).toEqual([]);
    });

    it('leaves out bundle components and return lines', () => {
        const o = order([
            line(1, 'p-paid', 100),
            line(2, 'p-free', 0, { ParentOrderLineID: 'parent-1' }),
            line(3, 'p-free', 0, { ReversesOrderLineID: 'origin-1' }),
        ]);
        expect(o.UnpricedLines()).toEqual([]);
    });

    it('leaves out checkout and payment-created orders', () => {
        expect(order([line(1, 'p-free', 0)], 'Widget').UnpricedLines()).toEqual([]);
        expect(order([line(1, 'p-free', 0)], 'ProviderPayment').UnpricedLines()).toEqual([]);
    });
});

describe('UnpricedLinesRefusal', () => {
    it('names each line once, with its product', () => {
        const message = order([line(1, 'p-paid', 100), line(2, 'p-free', 0)]).UnpricedLinesRefusal();
        expect(message).toBe(
            'Line 2 (Negotiated Seat) has a price of 0. Enter the negotiated price, or to give it away, ' +
                'enter its price with a 100% discount.',
        );
    });

    it('lists several lines in one message', () => {
        const message = order([line(1, 'p-free', 0, { Product: 'Seat A' }), line(3, 'p-free', 0)]).UnpricedLinesRefusal();
        expect(message).toMatch(/^Line 1 \(Seat A\), Line 3 \(Negotiated Seat\) have a price of 0\./);
    });

    it('is null when every line is priced', () => {
        expect(order([line(1, 'p-paid', 100)]).UnpricedLinesRefusal()).toBeNull();
    });
});

describe('ConfirmEligibility', () => {
    it('blocks the confirm checklist on a line at a price of zero', () => {
        const verdict = order([line(1, 'p-paid', 100), line(2, 'p-free', 0)]).ConfirmEligibility();
        expect(verdict.Allowed).toBe(false);
        expect(verdict.Reason).toContain('Line 2 (Negotiated Seat) has a price of 0');
    });

    it('allows a checkout order with a free line', () => {
        expect(order([line(1, 'p-free', 0)], 'Widget').ConfirmEligibility().Allowed).toBe(true);
    });
});

/**
 * The save itself refuses, not only the checklist: `Validate()` on an order moving to Confirmed. The
 * base entity's field checks and the other confirm rules are stood down, so the result is this rule's
 * alone; deleting the refusal from `Validate()` turns the first test red.
 */
describe('Validate on confirm', () => {
    function confirming(lines: Row[], origin = 'Direct'): OrderHeaderEntity {
        const o = order(lines, origin);
        const pass = () => undefined;
        for (const [k, v] of Object.entries({
            Status: 'Confirmed',
            OrderNumber: 'ORD-1',
            InitialPaymentDetailID_Object: null,
            dropSavePopulatedFieldErrors: pass,
            refuseBookedMoneyEdits: pass,
            refuseBookedAddressEdits: pass,
            refuseBookedPaymentTermsEdit: pass,
            statusTransitionVerdict: () => ({ Allowed: true }),
            willBookOnThisSave: () => true,
        })) {
            Object.defineProperty(o, k, { value: v, writable: true });
        }
        return o;
    }

    beforeEach(() => {
        vi.spyOn(Object.getPrototypeOf(OrderHeaderEntity.prototype), 'Validate').mockImplementation(() => {
            const result = new ValidationResult();
            result.Success = true;
            return result;
        });
    });
    afterEach(() => vi.restoreAllMocks());

    it('refuses a hand-entered order with a line at a price of zero', () => {
        const result = confirming([line(1, 'p-paid', 100), line(2, 'p-free', 0)]).Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Message).join(' ')).toContain(
            'Order ORD-1 cannot be confirmed: Line 2 (Negotiated Seat) has a price of 0',
        );
    });

    it('confirms when every line is priced, and a checkout order with a free line', () => {
        expect(confirming([line(1, 'p-paid', 100)]).Validate().Success).toBe(true);
        expect(confirming([line(1, 'p-free', 0)], 'Widget').Validate().Success).toBe(true);
    });
});

describe('IsHandEnteredOrigin', () => {
    it('reads Direct and an unset origin as hand-entered', () => {
        expect(IsHandEnteredOrigin('Direct')).toBe(true);
        expect(IsHandEnteredOrigin(null)).toBe(true);
        expect(IsHandEnteredOrigin('')).toBe(true);
        expect(IsHandEnteredOrigin('Widget')).toBe(false);
        expect(IsHandEnteredOrigin('ProviderPayment')).toBe(false);
    });
});
