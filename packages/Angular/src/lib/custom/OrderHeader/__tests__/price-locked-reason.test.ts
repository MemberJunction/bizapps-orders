// See the note in price-pick.test.ts: the import graph reaches partially-compiled injectables that
// fall back to JIT, so the compiler is loaded. Nothing here bootstraps Angular.
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

/**
 * #1013: an editable line with no price pencil says why, instead of hiding the control silently.
 * Driven off the prototype with a stand-in `this`, like the discount tests.
 */

interface Stub {
    editMode?: boolean;
    override?: 'none' | 'list' | 'any';
    authority?: boolean;
    bandUndecided?: boolean;
    loaded?: boolean;
}

const line = { ID: 'L1' } as unknown as mjBizAppsOrdersOrderLineEntity;

function component(stub: Stub): MJOOrderLinesEditorComponent {
    const instance = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(instance as object, {
        EditMode: stub.editMode ?? true,
        OverrideKind: stub.override ?? 'none',
        DiscountAuthorityLoaded: stub.loaded ?? true,
        DiscountAuthority: stub.authority ? { ID: 'SA1', MaxDiscountPct: null } : null,
        applicableByLine: new Map([['L1', stub.bandUndecided ? [{ BandUndecided: true }] : []]]),
    });
    return instance;
}

describe('PriceLockedReason (#1013)', () => {
    it('names what is missing when the user can neither override, discount nor pick a band', () => {
        expect(component({}).PriceLockedReason(line)).toMatch(/price-override permission or an active Sales Authority/);
    });

    it('says nothing when the pencil shows', () => {
        expect(component({ override: 'any' }).PriceLockedReason(line)).toBeNull();
        expect(component({ authority: true }).PriceLockedReason(line)).toBeNull();
        expect(component({ bandUndecided: true }).PriceLockedReason(line)).toBeNull();
    });

    it('says nothing on a read-only order, or while the grants are still loading', () => {
        expect(component({ editMode: false }).PriceLockedReason(line)).toBeNull();
        expect(component({ loaded: false }).PriceLockedReason(line)).toBeNull();
    });
});
