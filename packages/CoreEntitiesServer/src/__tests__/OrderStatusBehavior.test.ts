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
    Confirmed: ['Posted', 'Fulfilled', 'Voided'],
    Posted: ['Fulfilled', 'Voided'],
    Fulfilled: ['Voided'],
    Voided: [],
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
    it('lets a draft and a quote move to each other freely', () => {
        // Both are editable; quoting a draft and pulling a quote back for edit are ordinary.
        expect(CanTransition('Draft', 'Quoted').Allowed).toBe(true);
        expect(CanTransition('Quoted', 'Draft').Allowed).toBe(true);
    });

    it('never returns a booked order to an editable state', () => {
        // Confirm books journal entries (D8). Going back to Draft would leave the entries standing
        // against an order that is being edited underneath them.
        for (const booked of ['Confirmed', 'Posted', 'Fulfilled'] as const) {
            expect(CanTransition(booked, 'Draft').Allowed).toBe(false);
            expect(CanTransition(booked, 'Quoted').Allowed).toBe(false);
        }
    });

    it('treats Voided as final — nothing comes back', () => {
        // A voided order has given back what it took, and the reversal is its own record. Re-confirming
        // would book a second time against a reversal that already stands.
        for (const status of ORDER_STATUSES) {
            if (status === 'Voided') continue;
            expect(CanTransition('Voided', status).Allowed).toBe(false);
        }
        expect(IsTerminal('Voided')).toBe(true);
        expect(NextStatuses('Voided')).toEqual([]);
    });

    it('lets any live status be voided', () => {
        for (const status of ORDER_STATUSES) {
            if (status === 'Voided') continue;
            expect(CanTransition(status, 'Voided').Allowed).toBe(true);
        }
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
        // `Orders.CreateOrderInState` enters back-office orders directly as Confirmed or Fulfilled.
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
        expect(refused.Reason).toContain('Draft');
        // The reason names the way out rather than only the refusal.
        expect(refused.Reason).toContain('Voided');
    });

    it('says plainly when a status is final rather than listing nothing', () => {
        expect(CanTransition('Voided', 'Confirmed').Reason).toMatch(/final/i);
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

    it('has exactly one terminal status', () => {
        expect(ORDER_STATUSES.filter(IsTerminal)).toEqual(['Voided']);
    });

    it('never reports a status as both editable and booked', () => {
        for (const status of ORDER_STATUSES) expect(IsEditable(status) && IsBooked(status)).toBe(false);
    });
});
