/**
 * Only bundle expansion gives an order line a parent (bc-aidp-next-golive#292).
 *
 * The concession confirm gate does not re-price a line with a `ParentOrderLineID`, because a bundle
 * component is priced at its share of the bundle. A parent set by any other writer would carry a
 * price below the engine's past the gate, so the line refuses it on save.
 *
 * These drive the real class, held with `Object.create` as the sibling line tests do.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { OrderLineEntityServer } from '../OrderLineEntityServer.js';

const PARENT = 'a1111111-1111-4111-8111-111111111111';
const OTHER_PARENT = 'b2222222-2222-4222-8222-222222222222';

const protoPatches: Array<() => void> = [];

/** `super.ValidateAsync()` resolves on the shared prototype above, so the patch is undone after each test. */
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

function line(opts: { saved: boolean; parent: string | null; parentDirty?: boolean; fromExpansion?: boolean }) {
    const l = Object.create(OrderLineEntityServer.prototype) as OrderLineEntityServer;
    for (const [k, v] of Object.entries({
        ID: 'c3333333-3333-4333-8333-333333333333',
        IsSaved: opts.saved,
        ContextCurrentUser: { ID: 'user-1' },
        Fields: [],
        Quantity: 1,
        ReversesOrderLineID: null,
        ParentOrderLineID: opts.parent,
        LineNumber: 1,
        DimensionID: null,
        DimensionValueID: null,
        PriceOverridden: false,
        PriceOverrideReason: null,
        WrittenByBundleExpansion: opts.fromExpansion === true,
    })) {
        Object.defineProperty(l, k, { value: v, writable: true });
    }
    Object.defineProperty(l, 'FieldIsDirty', {
        value: (...names: string[]) => names.includes('ParentOrderLineID') && opts.parentDirty === true,
        writable: true,
    });
    // Neither the booked-order rule nor the external veto is under test, and both reach for a database.
    Object.defineProperty(l, 'refuseNewLineOnBookedOrder', { value: async () => undefined, writable: true });
    Object.defineProperty(l, 'refuseVetoedEdit', { value: async () => undefined, writable: true });
    patchParentProto(l, 'ValidateAsync', async () => ({ Success: true, Errors: [] }));
    return l;
}

describe('OrderLine parent line', () => {
    it('accepts a component that bundle expansion wrote', async () => {
        const result = await line({ saved: false, parent: PARENT, parentDirty: true, fromExpansion: true }).ValidateAsync();
        expect(result.Success).toBe(true);
    });

    it('refuses a new line given a parent by anything else', async () => {
        const result = await line({ saved: false, parent: PARENT, parentDirty: true }).ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors[0]).toMatchObject({ Source: 'ParentOrderLineID' });
        expect(result.Errors[0].Message).toContain('set only by bundle expansion');
    });

    it('refuses giving a saved ordinary line a parent', async () => {
        const result = await line({ saved: true, parent: OTHER_PARENT, parentDirty: true }).ValidateAsync();
        expect(result.Success).toBe(false);
    });

    it('leaves a saved component alone when its parent is not changing', async () => {
        const result = await line({ saved: true, parent: PARENT, parentDirty: false }).ValidateAsync();
        expect(result.Success).toBe(true);
    });

    it('allows clearing a parent, which puts the line back under the confirm gate', async () => {
        const result = await line({ saved: true, parent: null, parentDirty: true }).ValidateAsync();
        expect(result.Success).toBe(true);
    });
});
