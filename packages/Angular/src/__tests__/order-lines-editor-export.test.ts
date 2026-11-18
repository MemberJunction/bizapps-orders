/**
 * Other apps embed the order lines editor in their own forms (golive #331: the sales deal form), so
 * the package entry point exports it as a standalone component with the inputs and outputs a host
 * binds. A host cannot import it from a deep path: the package's exports map does not expose one.
 */
import '@angular/compiler';
import { reflectComponentType, ɵresolveComponentResources as resolveComponentResources, type ComponentMirror } from '@angular/core';
import { beforeAll, describe, expect, it } from 'vitest';
import * as ordersNg from '../public-api';

let mirror: ComponentMirror<unknown> | null;

beforeAll(async () => {
    // Templates and styles are separate files the JIT compiler cannot fetch here; the metadata under
    // test (selector, standalone, inputs, outputs) is on the class, so empty resources will do.
    await resolveComponentResources(() => Promise.resolve(''));
    mirror = reflectComponentType(ordersNg.MJOOrderLinesEditorComponent);
});

describe('orders-ng public API: order lines editor', () => {
    it('exports MJOOrderLinesEditorComponent as a standalone component', () => {
        expect(mirror?.selector).toBe('mjo-order-lines-editor');
        expect(mirror?.isStandalone).toBe(true);
    });

    it('takes Order, EditMode and Provider, and emits PricingChanged and Navigate', () => {
        expect(mirror!.inputs.map((i) => i.propName).sort()).toEqual(['EditMode', 'Order', 'Provider']);
        expect(mirror!.outputs.map((o) => o.propName).sort()).toEqual(['Navigate', 'PricingChanged']);
    });
});
