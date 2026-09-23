/**
 * A line flagged `PriceOverridden` has to say why — golive #253 item 4.
 *
 * The reason is the audit trail for a price that left the rules. Nothing validated it: the field
 * existed, the panel captured it, and a line could be moved off list by any amount with the
 * explanation left blank. The rule lives in `ValidateAsync` rather than in a database constraint
 * because lines converted from the previous system carry overridden prices with no reason and must
 * stay loadable — and an unrelated edit to one of them must not demand a reason nobody recorded at
 * the time. So the refusal fires only when the override itself is being written.
 *
 * These drive the real class. `Object.create` matches the sibling tests — it is how these server
 * entities are held without standing up metadata.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { OrderLineEntityServer } from '../OrderLineEntityServer.js';

const protoPatches: Array<() => void> = [];

/**
 * `super.ValidateAsync()` resolves on the prototype ABOVE `OrderLineEntityServer.prototype`, which
 * is shared by every instance in the module registry, so the patch is recorded and undone.
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

interface LineSpec {
    saved: boolean;
    overridden: boolean;
    reason: string | null;
    /** Fields the caller changed since load; irrelevant for an unsaved line. */
    dirty?: string[];
}

/** A real `OrderLineEntityServer` in the given override state, with everything else stubbed. */
function lineWith(spec: LineSpec) {
    const line = Object.create(OrderLineEntityServer.prototype) as OrderLineEntityServer;
    for (const [k, v] of Object.entries({
        ID: 'b1c2d3e4-0000-4000-8000-000000000002',
        IsSaved: spec.saved,
        ContextCurrentUser: { ID: 'user-1' },
        Fields: [],
        Quantity: 1,
        ReversesOrderLineID: null,
        LineNumber: 1,
        DimensionID: null,
        DimensionValueID: null,
        PriceOverridden: spec.overridden,
        PriceOverrideReason: spec.reason,
    })) {
        Object.defineProperty(line, k, { value: v, writable: true });
    }
    const dirty = new Set(spec.dirty ?? []);
    Object.defineProperty(line, 'FieldIsDirty', {
        value: (...names: string[]) => names.some((n) => dirty.has(n)),
        writable: true,
    });
    // The booked-parent rule and the external veto reach for a database and are not what this is
    // about. The reason check — the thing under test — runs for real.
    Object.defineProperty(line, 'refuseNewLineOnBookedOrder', { value: async () => undefined, writable: true });
    Object.defineProperty(line, 'refuseVetoedEdit', { value: async () => undefined, writable: true });
    patchParentProto(line, 'ValidateAsync', async () => ({ Success: true, Errors: [] }));
    return line;
}

describe('OrderLine price override reason', () => {
    it('accepts a new line on its default price with no reason — the ordinary case', async () => {
        const result = await lineWith({ saved: false, overridden: false, reason: null }).ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    // THE REPORTED GAP.
    it('refuses a new overridden line that gives no reason, in plain words', async () => {
        const result = await lineWith({ saved: false, overridden: true, reason: null }).ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('PriceOverrideReason');
        expect(result.Errors[0].Message).toBe('Enter a reason for the price override');
    });

    it('does not accept whitespace as a reason', async () => {
        const result = await lineWith({ saved: false, overridden: true, reason: '   ' }).ValidateAsync();
        expect(result.Success).toBe(false);
    });

    it('accepts a new overridden line once a reason is given', async () => {
        const result = await lineWith({ saved: false, overridden: true, reason: 'Board-approved rate' }).ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('refuses a saved line whose price is being overridden without a reason', async () => {
        const result = await lineWith({
            saved: true,
            overridden: true,
            reason: null,
            dirty: ['UnitPrice', 'PriceOverridden'],
        }).ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('PriceOverrideReason');
    });

    it('refuses clearing the reason off a saved overridden line', async () => {
        const result = await lineWith({
            saved: true,
            overridden: true,
            reason: '',
            dirty: ['PriceOverrideReason'],
        }).ValidateAsync();
        expect(result.Success).toBe(false);
    });

    // Converted lines: overridden prices, no reason, and they must stay editable for everything
    // that is not the override.
    it('leaves a saved overridden line alone when only unrelated fields change', async () => {
        const result = await lineWith({
            saved: true,
            overridden: true,
            reason: null,
            dirty: ['Quantity', 'DimensionID'],
        }).ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('leaves a saved overridden line alone when nothing changed', async () => {
        const result = await lineWith({ saved: true, overridden: true, reason: null, dirty: [] }).ValidateAsync();
        expect(result.Success).toBe(true);
    });
});
