// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent, PRICE_PICK_DEFAULT } from '../order-lines-editor.component';

/**
 * What the picker WRITES on a saved, overridden line — golive #253 item 2, the review's hole.
 *
 * A saved line's baseline is whatever was stored, which for an overridden line is the override
 * itself. "Back to the rules" therefore cannot be an undo of the dirty fields: undoing puts the
 * $1,100 concession back while clearing its flag and reason, which leaves the concession on the
 * line with no badge and no audit trail — worse than the sticking badge the issue reported. Every
 * return-to-default path has to stamp the engine's answer instead, and when that answer is not
 * known for a saved line, leave the line alone.
 *
 * `price-pick.test.ts` covers the decisions; this covers the stamps. Real field semantics are
 * modelled (Value/OldValue/Dirty/RestoreOldValue) because `stamp` and `clearOverride` depend on them.
 */

const BASE = 'a1b2c3d4-0000-4000-8000-000000000001';
const engine = { UnitPrice: 1200, ProductPriceID: BASE, PriceName: 'Base list price' };

class Field {
    private current: unknown;
    constructor(public OldValue: unknown) {
        this.current = OldValue;
    }
    get Value(): unknown {
        return this.current;
    }
    set Value(v: unknown) {
        this.current = v;
    }
    get Dirty(): boolean {
        return this.current !== this.OldValue;
    }
    RestoreOldValue(baseline: unknown): void {
        this.OldValue = baseline;
    }
}

interface Stored {
    UnitPrice: number;
    ProductPriceID: string | null;
    PriceOverridden: boolean;
    PriceOverrideReason: string | null;
}

function savedLine(stored: Stored) {
    const fields: Record<string, Field> = {
        UnitPrice: new Field(stored.UnitPrice),
        ProductPriceID: new Field(stored.ProductPriceID),
        PriceOverridden: new Field(stored.PriceOverridden),
        PriceOverrideReason: new Field(stored.PriceOverrideReason),
    };
    const line = {
        ID: 'L1',
        IsSaved: true,
        GetFieldByName: (name: string) => fields[name],
        get UnitPrice() {
            return fields.UnitPrice.Value;
        },
        get ProductPriceID() {
            return fields.ProductPriceID.Value;
        },
    };
    return { line: line as unknown as mjBizAppsOrdersOrderLineEntity, fields };
}

/** The stored concession from the review: $1,100 against a $1,200 default, flagged, with a reason. */
const CONCESSION: Stored = { UnitPrice: 1100, ProductPriceID: null, PriceOverridden: true, PriceOverrideReason: 'Board rate' };

function component(opts: { engineKnown: boolean; applicable?: Array<{ ID: string; Name: string; UnitPrice: number }> }) {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    const pricingCalls = { count: 0 };
    Object.assign(c as object, {
        customAmountLineIds: new Set(['L1']),
        overrideEditorLineIds: new Set(['L1']),
        defaultUnitByLine: new Map(),
        applicableByLine: new Map([['L1', opts.applicable ?? []]]),
        OverrideKind: 'any',
        cdr: { detectChanges: () => undefined },
        PricedLine: () => ({ UnitPrice: 1100, PriceSource: 'stated', Default: opts.engineKnown ? engine : undefined }),
        schedulePricing: () => {
            pricingCalls.count += 1;
        },
    });
    Object.defineProperty(c, 'CanOverride', { value: true });
    return { c, pricingCalls };
}

class Input {
    constructor(public value: string) {}
}
class Select {
    constructor(public value: string) {}
}

const globals = globalThis as unknown as Record<string, unknown>;
let savedInput: unknown;
let savedSelect: unknown;
beforeEach(() => {
    savedInput = globals.HTMLInputElement;
    savedSelect = globals.HTMLSelectElement;
    globals.HTMLInputElement = Input;
    globals.HTMLSelectElement = Select;
});
afterEach(() => {
    globals.HTMLInputElement = savedInput;
    globals.HTMLSelectElement = savedSelect;
});

function expectOnDefault(fields: Record<string, Field>) {
    expect(fields.UnitPrice.Value).toBe(1200);
    expect(fields.ProductPriceID.Value).toBe(BASE);
    expect(fields.PriceOverridden.Value).toBe(false);
    expect(fields.PriceOverrideReason.Value).toBeNull();
}

function expectUntouched(fields: Record<string, Field>) {
    expect(fields.UnitPrice.Value).toBe(CONCESSION.UnitPrice);
    expect(fields.ProductPriceID.Value).toBe(CONCESSION.ProductPriceID);
    expect(fields.PriceOverridden.Value).toBe(true);
    expect(fields.PriceOverrideReason.Value).toBe(CONCESSION.PriceOverrideReason);
}

describe('typing the default amount into a saved overridden line', () => {
    // THE REVIEW'S REPRODUCTION.
    it('lands on the engine default with the flag off, not on the stored override with the flag off', () => {
        const { c } = component({ engineKnown: true });
        const { line, fields } = savedLine(CONCESSION);
        c.TypeAmount(line, { target: new Input('1200') } as unknown as Event);
        expectOnDefault(fields);
        expect(c.IsOverridden(line)).toBe(false);
    });

    it('keeps a different amount as an override and leaves the reason for the user to keep or change', () => {
        const { c } = component({ engineKnown: true });
        const { line, fields } = savedLine(CONCESSION);
        c.TypeAmount(line, { target: new Input('1150') } as unknown as Event);
        expect(fields.UnitPrice.Value).toBe(1150);
        expect(fields.PriceOverridden.Value).toBe(true);
        expect(fields.PriceOverrideReason.Value).toBe('Board rate');
        expect(c.IsOverridden(line)).toBe(true);
    });
});

describe('the Default row on a saved overridden line', () => {
    it('stamps the engine default and clears the flag and reason', () => {
        const { c } = component({ engineKnown: true });
        const { line, fields } = savedLine(CONCESSION);
        c.PickNamedPrice(line, { target: new Select(PRICE_PICK_DEFAULT) } as unknown as Event);
        expectOnDefault(fields);
        expect(c.SelectedPriceID(line)).toBe(PRICE_PICK_DEFAULT);
    });

    it('is not offered, and does nothing, while the engine default is unknown', () => {
        const { c, pricingCalls } = component({ engineKnown: false });
        const { line, fields } = savedLine(CONCESSION);
        expect(c.CanRestoreDefault(line)).toBe(false);
        c.PickNamedPrice(line, { target: new Select(PRICE_PICK_DEFAULT) } as unknown as Event);
        expectUntouched(fields);
        expect(c.IsOverridden(line)).toBe(true);
        expect(pricingCalls.count).toBe(0);
    });

    it('is offered once the engine default is known', () => {
        const { c } = component({ engineKnown: true });
        expect(c.CanRestoreDefault(savedLine(CONCESSION).line)).toBe(true);
    });
});

describe('the Use Default Price button on a saved overridden line', () => {
    it('stamps the engine default and closes the editor', () => {
        const { c } = component({ engineKnown: true });
        const { line, fields } = savedLine(CONCESSION);
        c.ResetOverride(line);
        expectOnDefault(fields);
        expect(c.IsOverrideEditorOpen(line)).toBe(false);
    });

    it('leaves the line and the editor alone while the engine default is unknown', () => {
        const { c } = component({ engineKnown: false });
        const { line, fields } = savedLine(CONCESSION);
        c.ResetOverride(line);
        expectUntouched(fields);
        expect(c.IsOverrideEditorOpen(line)).toBe(true);
    });
});

describe('a named rule equal to the default on a saved overridden line', () => {
    it('is treated as a return to the default, not a fresh override', () => {
        const applicable = [{ ID: BASE, Name: 'Base list price', UnitPrice: 1200 }];
        const { c } = component({ engineKnown: true, applicable });
        const { line, fields } = savedLine(CONCESSION);
        c.PickNamedPrice(line, { target: new Select(BASE) } as unknown as Event);
        expectOnDefault(fields);
    });
});

describe('an unsaved line', () => {
    it('can always be put back on the default: its baseline is unpriced and the engine fills it at save', () => {
        const { c } = component({ engineKnown: false });
        const line = { ID: 'L1', IsSaved: false } as unknown as mjBizAppsOrdersOrderLineEntity;
        expect(c.CanRestoreDefault(line)).toBe(true);
    });
});
