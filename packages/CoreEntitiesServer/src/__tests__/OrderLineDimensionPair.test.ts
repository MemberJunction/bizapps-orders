/**
 * A GL dimension tag on an order line is a PAIR, and the entity says so before the database does.
 *
 * WHY THIS IS WORTH A TEST. `CK_OrderLine_DimensionPair` already refuses a half-set row, so the
 * data cannot go wrong. What can go wrong is how the refusal ARRIVES: a raw CHECK violation names
 * the constraint rather than the field, and it surfaces from inside the order's transaction after
 * every other line has already been written, so an operator is told that "the INSERT statement
 * conflicted with the CHECK constraint" on an order they thought they were saving. The check in
 * `ValidateAsync` exists to say which half is missing, on the line that is missing it, while the
 * caller can still fix it — and a validation that silently stops running is invisible, because the
 * database still refuses the write and the order still fails. It just fails illegibly.
 *
 * Both halves absent is the untagged line, which is legal and common: most order lines carry no
 * dimension at all.
 *
 * These drive the real class. `Object.create` matches the sibling veto tests — it is how these
 * server entities are held without standing up metadata.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { OrderLineEntityServer } from '../OrderLineEntityServer.js';

const DIMENSION = 'a1111111-1111-4111-8111-111111111111';
const VALUE = 'c3333333-3333-4333-8333-333333333333';

const protoPatches: Array<() => void> = [];

/**
 * `super.ValidateAsync()` resolves on the prototype ABOVE `OrderLineEntityServer.prototype`, which
 * is shared by every instance in the module registry, so the patch is recorded and undone rather
 * than left to vitest's per-file isolation.
 */
function patchParentProto(instance: object, name: string, value: unknown): void {
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(instance)) as Record<string, unknown>;
    const original = Object.getOwnPropertyDescriptor(proto, name);
    protoPatches.push(() => {
        if (original) Object.defineProperty(proto, name, original);
        else delete proto[name];
    });
    Object.defineProperty(proto, name, { value, writable: true, configurable: true });
}

afterEach(() => {
    while (protoPatches.length) protoPatches.pop()!();
});

/** A real `OrderLineEntityServer` carrying the given tag halves, with everything else stubbed. */
function lineWith(dimensionID: string | null, dimensionValueID: string | null) {
    const line = Object.create(OrderLineEntityServer.prototype) as OrderLineEntityServer;
    for (const [k, v] of Object.entries({
        ID: 'b1c2d3e4-0000-4000-8000-000000000002',
        IsSaved: true,
        ContextCurrentUser: { ID: 'user-1' },
        Fields: [],
        Quantity: 1,
        ReversesOrderLineID: null,
        LineNumber: 1,
        DimensionID: dimensionID,
        DimensionValueID: dimensionValueID,
        // Read by the override-reason check that runs in the same ValidateAsync; a line on its
        // default price, which is what this test is about.
        PriceOverridden: false,
        PriceOverrideReason: null,
    })) {
        Object.defineProperty(line, k, { value: v, writable: true });
    }
    // The booked-parent rule and the external veto are not what this is about, and both reach for a
    // database. The dimension check — the thing under test — still runs for real.
    Object.defineProperty(line, 'refuseNewLineOnBookedOrder', { value: async () => undefined, writable: true });
    Object.defineProperty(line, 'refuseVetoedEdit', { value: async () => undefined, writable: true });
    patchParentProto(line, 'ValidateAsync', async () => ({ Success: true, Errors: [] }));
    return line;
}

describe('OrderLine GL dimension pair', () => {
    it('accepts a line with neither half — an untagged line is the ordinary case', async () => {
        const result = await lineWith(null, null).ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('accepts a line with both halves', async () => {
        const result = await lineWith(DIMENSION, VALUE).ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('refuses a dimension with no value, and names the missing half', async () => {
        const result = await lineWith(DIMENSION, null).ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('DimensionValueID');
        // The message has to be actionable on its own: it is what an operator sees instead of
        // "conflicted with the CHECK constraint".
        expect(result.Errors[0].Message).toMatch(/both halves/i);
        expect(result.Errors[0].Message).toMatch(/clear both/i);
    });

    it('refuses a value with no dimension, and names the missing half', async () => {
        const result = await lineWith(null, VALUE).ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('DimensionID');
    });

    it('reports the failure through Success, not only through Errors', async () => {
        // A caller that checks `Success` and never reads `Errors` must still be stopped — the order
        // save does exactly that.
        const result = await lineWith(DIMENSION, null).ValidateAsync();
        expect(result.Success).toBe(false);
    });
});
