/**
 * OrderStatusBehavior — the lifecycle, exhaustively.
 *
 * The database enforced the legal SET and never the legal MOVES, so `Fulfilled → Draft` and
 * `Voided → Confirmed` both saved: a voided order could come back to life, keep the journal entries
 * its reversal had already unwound, and be shipped. Every row valid, the CHECK satisfied, nothing
 * looking.
 *
 * So this file walks the WHOLE matrix — all thirty-six ordered pairs — rather than spot-checking the
 * transitions somebody thought of. A table that is right about the five moves a test names and wrong
 * about the thirty-one it does not is exactly the shape that ships.
 */
import { describe, expect, it } from 'vitest';
import {
    CanOfferConfirm,
    CanTransition,
    CountsTowardReceivable,
    IsBooked,
    IsDeliverable,
    IsEditable,
    IsOrderStatus,
    IsTerminal,
    NextStatuses,
    ORDER_STATUSES,
    type OrderStatus,
} from '../OrderStatusBehavior.js';

/** The lifecycle as a person would describe it, written out independently of the implementation. */
const LEGAL: Record<OrderStatus, OrderStatus[]> = {
    Draft: ['Quoted', 'Confirmed', 'Voided'],
    Quoted: ['Draft', 'Confirmed', 'Voided'],
    Confirmed: ['Posted', 'Fulfilled'],
    Posted: ['Fulfilled'],
    Fulfilled: [],
    Voided: ['Draft', 'Quoted'],
};

describe('the whole transition matrix', () => {
    // Thirty-six pairs, asserted in both directions against a table written out by hand above. If the
    // implementation and this list ever disagree, one of them is a decision somebody changed without
    // saying so.
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

    it('never returns a booked order to an editable state or voided in-place', () => {
        // Confirm books journal entries (D8). Going back to Draft/Quoted or Voided in-place would
        // leave the entries standing or bypass reversal orders.
        for (const booked of ['Confirmed', 'Posted', 'Fulfilled'] as const) {
            expect(CanTransition(booked, 'Draft').Allowed).toBe(false);
            expect(CanTransition(booked, 'Quoted').Allowed).toBe(false);
            expect(CanTransition(booked, 'Voided').Allowed).toBe(false);
        }
    });

    it('lets Voided return to Draft and Quoted, but not directly to Confirmed', () => {
        expect(CanTransition('Voided', 'Draft').Allowed).toBe(true);
        expect(CanTransition('Voided', 'Quoted').Allowed).toBe(true);
        expect(CanTransition('Voided', 'Confirmed').Allowed).toBe(false);
        expect(CanTransition('Voided', 'Posted').Allowed).toBe(false);
        expect(CanTransition('Voided', 'Fulfilled').Allowed).toBe(false);
        expect(IsTerminal('Voided')).toBe(false);
        expect(NextStatuses('Voided')).toEqual(['Draft', 'Quoted']);
    });

    it('treats Fulfilled as terminal', () => {
        expect(IsTerminal('Fulfilled')).toBe(true);
        expect(NextStatuses('Fulfilled')).toEqual([]);
    });

    it('only allows Draft and Quoted to be voided (pre-booking void)', () => {
        expect(CanTransition('Draft', 'Voided').Allowed).toBe(true);
        expect(CanTransition('Quoted', 'Voided').Allowed).toBe(true);
        expect(CanTransition('Confirmed', 'Voided').Allowed).toBe(false);
        expect(CanTransition('Posted', 'Voided').Allowed).toBe(false);
        expect(CanTransition('Fulfilled', 'Voided').Allowed).toBe(false);
    });

    it('lets Confirmed reach Fulfilled without passing through Posted', () => {
        // An order with nothing to ship auto-advances (FulfillmentBehavior), so the direct edge is real.
        expect(CanTransition('Confirmed', 'Fulfilled').Allowed).toBe(true);
    });

    it('does not let Fulfilled go backwards to Posted', () => {
        expect(CanTransition('Fulfilled', 'Posted').Allowed).toBe(false);
    });

    it('allows re-saving a row without changing its status', () => {
        // An ordinary update touching other columns is not a transition.
        for (const status of ORDER_STATUSES) expect(CanTransition(status, status).Allowed).toBe(true);
    });
});

describe('creation and bad input', () => {
    it('allows a NEW order to be created in any legal status', () => {
        // Back-office entry saves an order straight at Confirmed, then advances it.
        for (const status of ORDER_STATUSES) {
            expect(CanTransition(null, status).Allowed).toBe(true);
            expect(CanTransition('', status).Allowed).toBe(true);
        }
    });

    it('refuses a status that is not one of the six, on creation and on move', () => {
        // The CHECK constraint would catch it a moment later with a message naming a constraint
        // rather than a status.
        expect(CanTransition(null, 'Complete').Allowed).toBe(false);
        expect(CanTransition('Draft', 'Complete').Allowed).toBe(false);
        expect(CanTransition('Complete', 'Draft').Allowed).toBe(false);
    });

    it('says what was attempted and what is possible instead', () => {
        const refused = CanTransition('Fulfilled', 'Draft');
        expect(refused.Allowed).toBe(false);
        expect(refused.Reason).toContain('Fulfilled');
        expect(refused.Reason).toContain('final');
    });

    it('says plainly when a transition is blocked', () => {
        expect(CanTransition('Voided', 'Confirmed').Reason).toMatch(/reopen it as draft or quoted/i);
        expect(CanTransition('Confirmed', 'Voided').Reason).toMatch(/reversal order/i);
    });

    it('recognises exactly the six legal statuses', () => {
        for (const status of ORDER_STATUSES) expect(IsOrderStatus(status)).toBe(true);
        for (const bad of ['Complete', 'Cancelled', 'Canceled', 'draft', '', null, undefined])
            expect(IsOrderStatus(bad as string)).toBe(false);
    });
});

describe('what a status permits', () => {
    it('calls exactly Draft and Quoted editable', () => {
        expect(ORDER_STATUSES.filter(IsEditable)).toEqual(['Draft', 'Quoted']);
    });

    it('calls exactly the post-confirm statuses booked', () => {
        // This is the test for "does this order owe money" — the collections worklist and every
        // ledger reconciliation read it.
        expect(ORDER_STATUSES.filter(IsBooked)).toEqual(['Confirmed', 'Posted', 'Fulfilled']);
        expect(ORDER_STATUSES.filter(CountsTowardReceivable)).toEqual(['Confirmed', 'Posted', 'Fulfilled']);
    });

    it('will not deliver a draft or a voided order, and will deliver a quote', () => {
        // A voided order still RENDERS so somebody can see what was voided; it must never be emailed,
        // because a bill for money nobody owes is indistinguishable from a real one in an inbox.
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
        expect(CanOfferConfirm('Posted').Allowed).toBe(false);
        expect(CanOfferConfirm('Fulfilled').Allowed).toBe(false);
        expect(CanOfferConfirm('Voided').Allowed).toBe(false);
        expect(CanOfferConfirm('Confirmed').Reason).toMatch(/already booked/i);
        expect(CanOfferConfirm('Voided').Reason).toMatch(/reopen/i);
    });

    it('has exactly one terminal status', () => {
        expect(ORDER_STATUSES.filter(IsTerminal)).toEqual(['Fulfilled']);
    });

    it('never reports a status as both editable and booked', () => {
        for (const status of ORDER_STATUSES) expect(IsEditable(status) && IsBooked(status)).toBe(false);
    });
});
