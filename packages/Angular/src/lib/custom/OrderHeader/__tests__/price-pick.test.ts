// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import {
    PRICE_PICK_CUSTOM,
    PRICE_PICK_DEFAULT,
    type ApplicablePrice,
    type LineEngineDefault,
    type PriceOverrideKind,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { MJOLinePricePickerComponent } from '../../../panels/line-price-picker.component';

/**
 * The price picker behind the pencil — golive #253, and the deal line's use of it (golive #270).
 *
 * Three faults in one control: Default did nothing, the "overridden" badge stuck after a return
 * to list price, and Default and the named base rule both read $1,200 and appeared to mean the
 * same thing. These pin the decisions that fix them, off the prototype with its inputs assigned,
 * so the tests stay out of Angular's DI.
 */

const BASE = 'a1b2c3d4-0000-4000-8000-000000000001';
const MEMBER = 'a1b2c3d4-0000-4000-8000-000000000002';

interface Stub {
    engine?: LineEngineDefault | null;
    defaultUnit?: number | null;
    priceSource?: string | null;
    applicable?: Array<{ ID: string; Name: string; UnitPrice: number }>;
    custom?: boolean;
    overrideKind?: PriceOverrideKind;
    allowCustomAmount?: boolean;
    overridden?: boolean;
    dirty?: string[];
    reason?: string | null;
    productPriceID?: string | null;
    unitPrice?: number;
}

function component(stub: Stub): MJOLinePricePickerComponent {
    const instance = Object.create(MJOLinePricePickerComponent.prototype) as MJOLinePricePickerComponent;
    Object.assign(instance as object, {
        customAmountOpen: stub.custom === true,
        Applicable: (stub.applicable ?? []) as ApplicablePrice[],
        OverrideKind: stub.overrideKind ?? 'any',
        AllowCustomAmount: stub.allowCustomAmount ?? true,
        EngineDefault: stub.engine,
        DefaultUnit: stub.defaultUnit ?? stub.engine?.UnitPrice ?? null,
        PriceSource: stub.priceSource ?? null,
        PricedUnit: null,
    });
    return instance;
}

function line(stub: Stub): mjBizAppsOrdersOrderLineEntity {
    const dirty = new Set(stub.dirty ?? []);
    return {
        ID: 'L1',
        ProductPriceID: stub.productPriceID ?? null,
        UnitPrice: stub.unitPrice ?? 0,
        GetFieldByName: (name: string) => {
            if (name === 'PriceOverridden') return { Value: stub.overridden === true, Dirty: dirty.has(name) };
            if (name === 'PriceOverrideReason') return { Value: stub.reason ?? null, Dirty: dirty.has(name) };
            return { Value: null, Dirty: dirty.has(name) };
        },
    } as unknown as mjBizAppsOrdersOrderLineEntity;
}

const engine = { UnitPrice: 1200, ProductPriceID: BASE, PriceName: 'Base list price' };

describe('the Default row', () => {
    it('is the pick for a line on its default price', () => {
        const c = component({ engine });
        const l = line({});
        expect(c.SelectedPriceID(l)).toBe(PRICE_PICK_DEFAULT);
        expect(c.IsPicked(l, PRICE_PICK_DEFAULT)).toBe(true);
        expect(c.IsPicked(l, PRICE_PICK_CUSTOM)).toBe(false);
    });

    it('names the engine rule even while the line is pinned to something else', () => {
        // PriceSource says 'stated' for a pinned line; that is not a rule name.
        const c = component({ engine, priceSource: 'stated' });
        expect(c.DefaultLabel()).toBe('Default (Base list price) · $1,200.00');
    });
});

describe('the overridden badge', () => {
    // ITEM 2, as reported: back on $1,200 through the named rule, still "overridden".
    it('is off for a dirty price that equals the engine default', () => {
        const c = component({ engine });
        expect(c.IsOverridden(line({ dirty: ['UnitPrice', 'ProductPriceID'], unitPrice: 1200, productPriceID: BASE }))).toBe(false);
    });

    it('is on for a dirty price that differs from the engine default', () => {
        const c = component({ engine });
        expect(c.IsOverridden(line({ dirty: ['UnitPrice'], unitPrice: 1100 }))).toBe(true);
    });

    it('is on for the same amount from a DIFFERENT rule — the audit trail changed', () => {
        const c = component({ engine });
        expect(c.IsOverridden(line({ dirty: ['ProductPriceID'], unitPrice: 1200, productPriceID: MEMBER }))).toBe(true);
    });

    it('trusts the stored flag when it is set', () => {
        const c = component({ engine });
        expect(c.IsOverridden(line({ overridden: true }))).toBe(true);
    });

    it('still treats a dirty price as an override when no default is known to compare against', () => {
        const c = component({});
        expect(c.IsOverridden(line({ dirty: ['UnitPrice'], unitPrice: 1100 }))).toBe(true);
    });
});

describe('the named rules offered beside Default', () => {
    const applicable = [
        { ID: BASE, Name: 'Base list price', UnitPrice: 1200 },
        { ID: MEMBER, Name: 'Member', UnitPrice: 950 },
    ];

    // ITEM 3. Default IS the base rule; listing it again is the ambiguity.
    it('omit the rule the engine already chose', () => {
        const c = component({ engine, applicable });
        expect(c.NamedPricesFor().map((p) => p.ID)).toEqual([MEMBER]);
    });

    it('offer nothing for a single-rule product, leaving Default and Custom amount', () => {
        const c = component({ engine, applicable: [applicable[0]] });
        expect(c.NamedPricesFor()).toEqual([]);
    });

    it('offer every rule when the engine default is not known', () => {
        const c = component({ applicable });
        expect(c.NamedPricesFor().map((p) => p.ID)).toEqual([BASE, MEMBER]);
    });
});

describe('the override reason', () => {
    const c = component({ engine });

    // ITEM 4. Done waits for a reason; the server refuses the save on the same rule.
    it('is required while the line is overridden and blank', () => {
        expect(c.NeedsOverrideReason(line({ overridden: true, reason: null }))).toBe(true);
        expect(c.NeedsOverrideReason(line({ overridden: true, reason: '   ' }))).toBe(true);
    });

    it('is satisfied by any non-blank text', () => {
        expect(c.NeedsOverrideReason(line({ overridden: true, reason: 'Board-approved rate' }))).toBe(false);
    });

    it('is not asked of a line on its default price', () => {
        expect(c.NeedsOverrideReason(line({}))).toBe(false);
        expect(c.CanExplainOverride(line({}))).toBe(false);
    });
});

describe('the Custom amount row', () => {
    it('is offered to a user who may type any price, where the screen allows it', () => {
        const c = component({ engine });
        expect(c.CustomAmountOffered).toBe(true);
        expect(c.ShowCustomRow(line({}))).toBe(true);
    });

    it('is not offered to a user who may only pick a named rule', () => {
        const c = component({ engine, overrideKind: 'list' });
        expect(c.CustomAmountOffered).toBe(false);
        expect(c.ShowCustomRow(line({}))).toBe(false);
    });

    // golive #270: the deal line editor keeps typed prices out of the rep's hands (sales D-DL2).
    it('is not offered where the screen disallows it, whatever the grant', () => {
        const c = component({ engine, allowCustomAmount: false });
        expect(c.CustomAmountOffered).toBe(false);
        expect(c.ShowCustomRow(line({}))).toBe(false);
        expect(c.ShowCustomAmount(line({}))).toBe(false);
    });

    it('still says so, disabled, when the line is already on a typed amount it cannot offer', () => {
        const c = component({ engine, allowCustomAmount: false });
        const typed = line({ overridden: true, unitPrice: 6000 });
        expect(c.ShowCustomRow(typed)).toBe(true);
        expect(c.SelectedPriceID(typed)).toBe(PRICE_PICK_CUSTOM);
        expect(c.CustomRowLabel(typed)).toBe('Custom amount · $6,000.00');
    });
});
