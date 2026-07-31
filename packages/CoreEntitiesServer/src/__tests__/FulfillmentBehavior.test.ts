/**
 * FulfillmentBehavior — the decisions, with no database.
 *
 * The case worth the most attention is the MIXED order: some lines fulfillable, some not. Testing
 * "are all lines Fulfilled?" passes every single-kind order and holds every mixed one open forever,
 * because a subscription line never flips. That failure is invisible in a demo and permanent in
 * production, so it gets its own tests from both directions.
 */
import { describe, expect, it } from 'vitest';
import {
    AutoAdvances,
    AwaitingFulfillment,
    ExplainRefusal,
    GroupForQueue,
    InitialFulfillmentStatus,
    IsAwaitingFulfillment,
    RefuseFlip,
    ShouldAdvanceToFulfilled,
    type FulfillableLine,
} from '../FulfillmentBehavior.js';

const line = (over: Partial<FulfillableLine> = {}): FulfillableLine => ({
    ID: 'line-1',
    RequiresFulfillment: true,
    FulfillmentStatus: 'Pending',
    ReversesOrderLineID: null,
    IsRollupParent: false,
    ...over,
});

describe('IsAwaitingFulfillment', () => {
    it('holds the order for a pending physical line', () => {
        expect(IsAwaitingFulfillment(line())).toBe(true);
    });

    it('ignores a line whose type requires no fulfilment', () => {
        // A subscription, a download, a donation. Nothing ships.
        expect(IsAwaitingFulfillment(line({ RequiresFulfillment: false }))).toBe(false);
    });

    it('ignores a REVERSAL — goods coming back are tracked on the origin line', () => {
        expect(IsAwaitingFulfillment(line({ ReversesOrderLineID: 'origin' }))).toBe(false);
    });

    it("ignores a bundle's rollup parent, which carries no goods of its own", () => {
        expect(IsAwaitingFulfillment(line({ IsRollupParent: true }))).toBe(false);
    });

    it('ignores a line already fulfilled or returned', () => {
        expect(IsAwaitingFulfillment(line({ FulfillmentStatus: 'Fulfilled' }))).toBe(false);
        expect(IsAwaitingFulfillment(line({ FulfillmentStatus: 'Returned' }))).toBe(false);
    });

    it('treats a null status on a fulfillable line as Pending', () => {
        // Defensive: the column should not be null when the type requires fulfilment, but if it is,
        // the safe reading is "not yet shipped" rather than "done".
        expect(IsAwaitingFulfillment(line({ FulfillmentStatus: null }))).toBe(true);
    });
});

describe('ShouldAdvanceToFulfilled', () => {
    it('advances an order with nothing to ship at all (D15 auto-advance)', () => {
        const lines = [line({ RequiresFulfillment: false }), line({ ID: 'l2', RequiresFulfillment: false })];
        expect(ShouldAdvanceToFulfilled(lines)).toBe(true);
    });

    it('holds an order with one pending physical line', () => {
        expect(ShouldAdvanceToFulfilled([line()])).toBe(false);
    });

    it('advances once the last fulfillable line is flipped', () => {
        expect(ShouldAdvanceToFulfilled([line({ FulfillmentStatus: 'Fulfilled' })])).toBe(true);
    });

    it('ADVANCES A MIXED ORDER once its shippable lines are done', () => {
        // THE ONE THAT MATTERS. A naive "every line is Fulfilled" test would hold this open forever:
        // the subscription line never flips, because it has nothing to flip.
        const lines = [
            line({ ID: 'physical', RequiresFulfillment: true, FulfillmentStatus: 'Fulfilled' }),
            line({ ID: 'subscription', RequiresFulfillment: false, FulfillmentStatus: null }),
        ];
        expect(ShouldAdvanceToFulfilled(lines)).toBe(true);
    });

    it('holds a mixed order while its physical line is still pending', () => {
        const lines = [
            line({ ID: 'physical', RequiresFulfillment: true, FulfillmentStatus: 'Pending' }),
            line({ ID: 'subscription', RequiresFulfillment: false, FulfillmentStatus: null }),
        ];
        expect(ShouldAdvanceToFulfilled(lines)).toBe(false);
    });

    it('advances an empty order rather than hanging on nothing', () => {
        expect(ShouldAdvanceToFulfilled([])).toBe(true);
    });

    it('is not held open by a returned line', () => {
        const lines = [
            line({ ID: 'sold', FulfillmentStatus: 'Fulfilled' }),
            line({ ID: 'credit', ReversesOrderLineID: 'sold', FulfillmentStatus: 'Pending' }),
        ];
        expect(ShouldAdvanceToFulfilled(lines)).toBe(true);
    });
});

describe('AutoAdvances', () => {
    it('is true only when NO line ever required fulfilment', () => {
        expect(AutoAdvances([line({ RequiresFulfillment: false })])).toBe(true);
        expect(AutoAdvances([line({ RequiresFulfillment: true })])).toBe(false);
    });

    it('differs from ShouldAdvanceToFulfilled on a fully worked order', () => {
        // Both say "the order may move on", but only one says "nobody had to do anything".
        // The queue keys off THIS one, so a worked order does not vanish from history.
        const worked = [line({ FulfillmentStatus: 'Fulfilled' })];
        expect(ShouldAdvanceToFulfilled(worked)).toBe(true);
        expect(AutoAdvances(worked)).toBe(false);
    });
});

describe('RefuseFlip', () => {
    it('allows a pending physical line on a Posted order', () => {
        expect(RefuseFlip(line(), 'Posted')).toBeNull();
        expect(RefuseFlip(line(), 'Confirmed')).toBeNull();
        expect(RefuseFlip(line(), 'Fulfilled')).toBeNull();
    });

    it('refuses before Confirmed, and on a Voided order', () => {
        // Nothing is owed until an order is confirmed, so nothing can ship.
        expect(RefuseFlip(line(), 'Draft')).toBe('OrderNotPosted');
        expect(RefuseFlip(line(), 'Quoted')).toBe('OrderNotPosted');
        expect(RefuseFlip(line(), 'Voided')).toBe('OrderNotPosted');
    });

    it('refuses a missing line, a non-fulfillable type, a reversal, a parent, and a repeat', () => {
        expect(RefuseFlip(null, 'Posted')).toBe('LineNotFound');
        expect(RefuseFlip(line({ RequiresFulfillment: false }), 'Posted')).toBe('DoesNotRequireFulfillment');
        expect(RefuseFlip(line({ ReversesOrderLineID: 'x' }), 'Posted')).toBe('IsReversal');
        expect(RefuseFlip(line({ IsRollupParent: true }), 'Posted')).toBe('IsRollupParent');
        expect(RefuseFlip(line({ FulfillmentStatus: 'Fulfilled' }), 'Posted')).toBe('AlreadyFulfilled');
    });

    it('checks the ORDER state before the line, so the message names the real blocker', () => {
        // A non-fulfillable line on a Draft order fails for both reasons; the order's state is the
        // one the caller can act on.
        expect(RefuseFlip(line({ RequiresFulfillment: false }), 'Draft')).toBe('OrderNotPosted');
    });

    it('explains every refusal in words, with the line named', () => {
        const reasons = [
            'LineNotFound',
            'OrderNotPosted',
            'DoesNotRequireFulfillment',
            'IsReversal',
            'IsRollupParent',
            'AlreadyFulfilled',
        ] as const;
        for (const reason of reasons) {
            const text = ExplainRefusal(reason, 'line-9');
            expect(text, reason).toContain('line-9');
            expect(text.length, reason).toBeGreaterThan(30);
        }
    });
});

describe('GroupForQueue', () => {
    const queued = (over: Partial<FulfillableLine> & { OrderHeaderID: string }) => ({
        ...line(),
        ...over,
    });

    it('groups pending lines by order', () => {
        const groups = GroupForQueue([
            queued({ ID: 'a1', OrderHeaderID: 'order-1' }),
            queued({ ID: 'a2', OrderHeaderID: 'order-1' }),
            queued({ ID: 'b1', OrderHeaderID: 'order-2' }),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups.find((g) => g.OrderHeaderID === 'order-1')!.AwaitingLineIDs).toEqual(['a1', 'a2']);
    });

    it('omits an order with nothing awaiting', () => {
        // A queue is work to do. A screen full of finished orders is how a real backlog gets missed.
        const groups = GroupForQueue([
            queued({ ID: 'done', OrderHeaderID: 'order-1', FulfillmentStatus: 'Fulfilled' }),
        ]);
        expect(groups).toEqual([]);
    });

    it('counts every fulfillable line as the denominator, not just the pending ones', () => {
        // So a screen can say "1 of 3 remaining" rather than just "1".
        const groups = GroupForQueue([
            queued({ ID: 'a1', OrderHeaderID: 'order-1', FulfillmentStatus: 'Fulfilled' }),
            queued({ ID: 'a2', OrderHeaderID: 'order-1', FulfillmentStatus: 'Fulfilled' }),
            queued({ ID: 'a3', OrderHeaderID: 'order-1', FulfillmentStatus: 'Pending' }),
        ]);
        expect(groups[0].FulfillableCount).toBe(3);
        expect(groups[0].AwaitingLineIDs).toEqual(['a3']);
    });

    it('excludes non-fulfillable lines from the denominator too', () => {
        const groups = GroupForQueue([
            queued({ ID: 'sub', OrderHeaderID: 'order-1', RequiresFulfillment: false }),
            queued({ ID: 'box', OrderHeaderID: 'order-1' }),
        ]);
        expect(groups[0].FulfillableCount).toBe(1);
    });

    it('returns nothing for an empty input', () => {
        expect(GroupForQueue([])).toEqual([]);
    });
});

describe('InitialFulfillmentStatus', () => {
    it("is null — not 'Pending' — when the type requires no fulfilment", () => {
        // Writing 'Pending' on a subscription would park it in the queue forever, waiting for a
        // shipment that does not exist.
        expect(InitialFulfillmentStatus(false)).toBeNull();
    });

    it("is 'Pending' when it does", () => {
        expect(InitialFulfillmentStatus(true)).toBe('Pending');
    });
});
