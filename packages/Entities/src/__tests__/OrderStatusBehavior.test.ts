/**
 * OrderStatusBehavior — the lifecycle, exhaustively.
 *
 * The database enforces the legal SET and the entity server enforces the legal MOVES.
 * 3-way orthogonal model:
 * 1. Status: Draft, Quoted, Confirmed, Voided
 * 2. FulfillmentStatus: Pending, PartiallyFulfilled, Fulfilled, NotApplicable, Returned
 * 3. Payment: Derived from TotalGross, AmountPaid, Balance
 */
import { describe, expect, it } from 'vitest';
import {
    CanOfferConfirm,
    CanTransition,
    CountsTowardReceivable,
    DeriveHeaderFulfillmentStatus,
    DerivePaymentStatus,
    IsBooked,
    IsDeliverable,
    IsEditable,
    IsOrderFulfillmentStatus,
    IsOrderStatus,
    IsTerminal,
    NextStatuses,
    ORDER_FULFILLMENT_STATUSES,
    ORDER_STATUSES,
    type OrderStatus,
} from '../OrderStatusBehavior.js';

/** The lifecycle as a person would describe it, written out independently of the implementation. */
const LEGAL: Record<OrderStatus, OrderStatus[]> = {
    Draft: ['Quoted', 'Confirmed', 'Voided'],
    Quoted: ['Draft', 'Confirmed', 'Voided'],
    Confirmed: [],
    Voided: ['Draft', 'Quoted'],
};

describe('the whole transition matrix', () => {
    // 16 ordered pairs, asserted in both directions against the table written out above.
    for (const from of ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
            const expected = from === to || LEGAL[from].includes(to);
            it(`${from} → ${to} is ${expected ? 'allowed' : 'refused'}`, () => {
                expect(CanTransition(from, to).Allowed).toBe(expected);
            });
        }
    }
});

describe('the rules the matrix encodes', () => {
    it('lets Draft, Quoted, and Voided move between each other freely before booking', () => {
        expect(CanTransition('Draft', 'Quoted').Allowed).toBe(true);
        expect(CanTransition('Quoted', 'Draft').Allowed).toBe(true);
        expect(CanTransition('Draft', 'Voided').Allowed).toBe(true);
        expect(CanTransition('Voided', 'Draft').Allowed).toBe(true);
        expect(CanTransition('Quoted', 'Voided').Allowed).toBe(true);
        expect(CanTransition('Voided', 'Quoted').Allowed).toBe(true);
    });

    it('never returns a booked order (Confirmed) to an editable state or voided in-place', () => {
        expect(CanTransition('Confirmed', 'Draft').Allowed).toBe(false);
        expect(CanTransition('Confirmed', 'Quoted').Allowed).toBe(false);
        expect(CanTransition('Confirmed', 'Voided').Allowed).toBe(false);
    });

    it('lets Voided return to Draft and Quoted, but not directly to Confirmed', () => {
        expect(CanTransition('Voided', 'Draft').Allowed).toBe(true);
        expect(CanTransition('Voided', 'Quoted').Allowed).toBe(true);
        expect(CanTransition('Voided', 'Confirmed').Allowed).toBe(false);
        expect(IsTerminal('Voided')).toBe(false);
        expect(NextStatuses('Voided')).toEqual(['Draft', 'Quoted']);
    });

    it('treats Confirmed as terminal on the commercial lifecycle', () => {
        expect(IsTerminal('Confirmed')).toBe(true);
        expect(NextStatuses('Confirmed')).toEqual([]);
    });

    it('only allows Draft and Quoted to be voided (pre-booking void)', () => {
        expect(CanTransition('Draft', 'Voided').Allowed).toBe(true);
        expect(CanTransition('Quoted', 'Voided').Allowed).toBe(true);
        expect(CanTransition('Confirmed', 'Voided').Allowed).toBe(false);
    });

    it('allows re-saving a row without changing its status', () => {
        for (const status of ORDER_STATUSES) expect(CanTransition(status, status).Allowed).toBe(true);
    });
});

describe('creation and bad input', () => {
    it('allows a NEW order to be created in any legal status', () => {
        for (const status of ORDER_STATUSES) {
            expect(CanTransition(null, status).Allowed).toBe(true);
            expect(CanTransition('', status).Allowed).toBe(true);
        }
    });

    it('refuses a status that is not one of the four, on creation and on move', () => {
        expect(CanTransition(null, 'Complete').Allowed).toBe(false);
        expect(CanTransition('Draft', 'Complete').Allowed).toBe(false);
        expect(CanTransition('Complete', 'Draft').Allowed).toBe(false);
        expect(CanTransition('Draft', 'Posted').Allowed).toBe(false);
        expect(CanTransition('Draft', 'Fulfilled').Allowed).toBe(false);
    });

    it('says what was attempted and what is possible instead', () => {
        const refused = CanTransition('Confirmed', 'Draft');
        expect(refused.Allowed).toBe(false);
        expect(refused.Reason).toContain('Confirmed');
        expect(refused.Reason).toContain('final');
    });

    it('says plainly when a transition is blocked', () => {
        expect(CanTransition('Voided', 'Confirmed').Reason).toMatch(/reopen it as draft or quoted/i);
        expect(CanTransition('Confirmed', 'Voided').Reason).toMatch(/reversal order/i);
    });

    it('recognises exactly the four legal commercial statuses', () => {
        for (const status of ORDER_STATUSES) expect(IsOrderStatus(status)).toBe(true);
        for (const bad of ['Complete', 'Cancelled', 'Canceled', 'Posted', 'Fulfilled', 'draft', '', null, undefined])
            expect(IsOrderStatus(bad as string)).toBe(false);
    });

    it('recognises exactly the five legal fulfillment statuses', () => {
        for (const status of ORDER_FULFILLMENT_STATUSES) expect(IsOrderFulfillmentStatus(status)).toBe(true);
        for (const bad of ['Complete', 'Unknown', '', null, undefined])
            expect(IsOrderFulfillmentStatus(bad as string)).toBe(false);
    });
});

describe('what a status permits', () => {
    it('calls exactly Draft and Quoted editable', () => {
        expect(ORDER_STATUSES.filter(IsEditable)).toEqual(['Draft', 'Quoted']);
    });

    it('calls exactly Confirmed booked', () => {
        expect(ORDER_STATUSES.filter(IsBooked)).toEqual(['Confirmed']);
        expect(ORDER_STATUSES.filter(CountsTowardReceivable)).toEqual(['Confirmed']);
    });

    it('will not deliver a draft or a voided order, and will deliver a quote and confirmed order', () => {
        expect(IsDeliverable('Draft')).toBe(false);
        expect(IsDeliverable('Voided')).toBe(false);
        expect(IsDeliverable('Quoted')).toBe(true);
        expect(IsDeliverable('Confirmed')).toBe(true);
    });

    it('offers Confirm only from Draft, Quoted, or a brand-new row', () => {
        expect(CanOfferConfirm(null).Allowed).toBe(true);
        expect(CanOfferConfirm('Draft').Allowed).toBe(true);
        expect(CanOfferConfirm('Quoted').Allowed).toBe(true);
        expect(CanOfferConfirm('Confirmed').Allowed).toBe(false);
        expect(CanOfferConfirm('Voided').Allowed).toBe(false);
        expect(CanOfferConfirm('Confirmed').Reason).toMatch(/already booked/i);
        expect(CanOfferConfirm('Voided').Reason).toMatch(/reopen/i);
    });

    it('has exactly Confirmed as terminal commercial status', () => {
        expect(ORDER_STATUSES.filter(IsTerminal)).toEqual(['Confirmed']);
    });
});

describe('fulfillment and payment derivations', () => {
    it('DeriveHeaderFulfillmentStatus correctly computes across lines', () => {
        // No fulfillable lines -> NotApplicable
        expect(DeriveHeaderFulfillmentStatus([])).toBe('NotApplicable');
        expect(DeriveHeaderFulfillmentStatus([{ RequiresFulfillment: false }])).toBe('NotApplicable');
        expect(DeriveHeaderFulfillmentStatus([{ RequiresFulfillment: true, IsRollupParent: true }])).toBe('NotApplicable');
        expect(DeriveHeaderFulfillmentStatus([{ RequiresFulfillment: true, ReversesOrderLineID: 'rev1' }])).toBe('NotApplicable');

        // All pending -> Pending
        expect(
            DeriveHeaderFulfillmentStatus([
                { RequiresFulfillment: true, FulfillmentStatus: 'Pending' },
                { RequiresFulfillment: true, FulfillmentStatus: 'Pending' },
            ])
        ).toBe('Pending');

        // Partially fulfilled -> PartiallyFulfilled
        expect(
            DeriveHeaderFulfillmentStatus([
                { RequiresFulfillment: true, FulfillmentStatus: 'Fulfilled' },
                { RequiresFulfillment: true, FulfillmentStatus: 'Pending' },
            ])
        ).toBe('PartiallyFulfilled');

        // All fulfilled -> Fulfilled
        expect(
            DeriveHeaderFulfillmentStatus([
                { RequiresFulfillment: true, FulfillmentStatus: 'Fulfilled' },
                { RequiresFulfillment: true, FulfillmentStatus: 'Fulfilled' },
            ])
        ).toBe('Fulfilled');
    });

    it('DerivePaymentStatus derives Unpaid, PartiallyPaid, and Paid', () => {
        expect(DerivePaymentStatus(100, 0, 100)).toBe('Unpaid');
        expect(DerivePaymentStatus(100, 40, 60)).toBe('PartiallyPaid');
        expect(DerivePaymentStatus(100, 100, 0)).toBe('Paid');
        expect(DerivePaymentStatus(100, 120, -20)).toBe('Paid');
        expect(DerivePaymentStatus(0, 0, 0)).toBe('Unpaid');
    });
});
