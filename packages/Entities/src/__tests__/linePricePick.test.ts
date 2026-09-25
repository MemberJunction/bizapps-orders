import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '../generated/entity_subclasses.js';
import type { ApplicablePrice } from '../pricing/PriceResolver.js';
import {
    CanRestoreLineDefault,
    IsLinePriceOverridden,
    LineNeedsOverrideReason,
    LinePriceOverrideReason,
    NamedPricesBesideDefault,
    PinLineToAmount,
    PinLineToNamedPrice,
    PRICE_PICK_CUSTOM,
    PRICE_PICK_DEFAULT,
    RestoreLineDefault,
    SetLinePriceOverrideReason,
} from '../pricing/linePricePick.js';

/**
 * The rules behind every order-line price picker (golive #194, #253, #270), without a screen.
 *
 * Real field semantics are modelled (Value / OldValue / Dirty / RestoreOldValue) because what a pick
 * writes, and whether a no-op leaves the field clean, is the point of most of these.
 */

const BASE = 'a1b2c3d4-0000-4000-8000-000000000001';
const MEMBER = 'a1b2c3d4-0000-4000-8000-000000000002';
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
    UnitPrice: number | null;
    ProductPriceID: string | null;
    PriceOverridden: boolean;
    PriceOverrideReason: string | null;
}

const UNPRICED: Stored = { UnitPrice: null, ProductPriceID: null, PriceOverridden: false, PriceOverrideReason: null };
/** $1,100 against a $1,200 default, flagged, with a reason. */
const CONCESSION: Stored = { UnitPrice: 1100, ProductPriceID: null, PriceOverridden: true, PriceOverrideReason: 'Board rate' };

function lineOf(stored: Stored, isSaved: boolean) {
    const fields: Record<string, Field> = {
        UnitPrice: new Field(stored.UnitPrice),
        ProductPriceID: new Field(stored.ProductPriceID),
        PriceOverridden: new Field(stored.PriceOverridden),
        PriceOverrideReason: new Field(stored.PriceOverrideReason),
    };
    const line = {
        IsSaved: isSaved,
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

function price(ID: string, Name: string, UnitPrice: number): ApplicablePrice {
    return { ID, Name, UnitPrice, ExtendedAmount: UnitPrice, PriceListID: null, InheritedFrom: 'product', InheritedFromCategoryID: null };
}

describe('the picker sentinels', () => {
    // golive #253 item 1: an empty-string value is what a select falls back to.
    it('are real values, distinct from each other', () => {
        expect(PRICE_PICK_DEFAULT).not.toBe('');
        expect(PRICE_PICK_DEFAULT).not.toBe(PRICE_PICK_CUSTOM);
    });
});

describe('IsLinePriceOverridden', () => {
    it('trusts the stored flag', () => {
        expect(IsLinePriceOverridden(lineOf(CONCESSION, true).line, engine)).toBe(true);
    });

    it('is off for a clean line', () => {
        expect(IsLinePriceOverridden(lineOf(UNPRICED, false).line, engine)).toBe(false);
    });

    it('is off for a dirty price that equals the engine default', () => {
        const { line, fields } = lineOf(UNPRICED, false);
        fields.UnitPrice.Value = 1200;
        fields.ProductPriceID.Value = BASE;
        expect(IsLinePriceOverridden(line, engine)).toBe(false);
    });

    it('is on for the same amount from a different rule — the audit trail changed', () => {
        const { line, fields } = lineOf(UNPRICED, false);
        fields.UnitPrice.Value = 1200;
        fields.ProductPriceID.Value = MEMBER;
        expect(IsLinePriceOverridden(line, engine)).toBe(true);
    });

    it('treats a dirty price as an override when no default is known to compare against', () => {
        const { line, fields } = lineOf(UNPRICED, false);
        fields.UnitPrice.Value = 1100;
        expect(IsLinePriceOverridden(line, null)).toBe(true);
    });
});

describe('NamedPricesBesideDefault', () => {
    const applicable = [price(BASE, 'Base list price', 1200), price(MEMBER, 'Member', 950)];

    // golive #253 item 3: Default IS the base rule; listing it again is the ambiguity.
    it('omits the rule the engine already chose', () => {
        expect(NamedPricesBesideDefault(applicable, engine).map((p) => p.ID)).toEqual([MEMBER]);
    });

    it('matches the chosen rule whatever the id casing', () => {
        const upper = { ...engine, ProductPriceID: BASE.toUpperCase() };
        expect(NamedPricesBesideDefault(applicable, upper).map((p) => p.ID)).toEqual([MEMBER]);
    });

    it('offers every rule when the engine default is not known', () => {
        expect(NamedPricesBesideDefault(applicable, undefined).map((p) => p.ID)).toEqual([BASE, MEMBER]);
    });
});

describe('restoring the default', () => {
    it('is always possible on an unsaved line, and puts it back to unpriced', () => {
        const { line, fields } = lineOf(UNPRICED, false);
        PinLineToAmount(line, 900, 1200, null);
        expect(CanRestoreLineDefault(line, null)).toBe(true);
        expect(RestoreLineDefault(line, null)).toBe(true);
        expect(fields.UnitPrice.Value).toBeNull();
        expect(fields.UnitPrice.Dirty).toBe(false);
        expect(fields.PriceOverridden.Value).toBe(false);
    });

    // golive #253, the review's hole: undoing a saved override keeps the concession and drops its flag.
    it('stamps the engine default on a saved overridden line and clears the flag and reason', () => {
        const { line, fields } = lineOf(CONCESSION, true);
        expect(RestoreLineDefault(line, engine)).toBe(true);
        expect(fields.UnitPrice.Value).toBe(1200);
        expect(fields.ProductPriceID.Value).toBe(BASE);
        expect(fields.PriceOverridden.Value).toBe(false);
        expect(fields.PriceOverrideReason.Value).toBeNull();
    });

    it('leaves a saved line alone while its default is unknown', () => {
        const { line, fields } = lineOf(CONCESSION, true);
        expect(CanRestoreLineDefault(line, undefined)).toBe(false);
        expect(RestoreLineDefault(line, undefined)).toBe(false);
        expect(fields.UnitPrice.Value).toBe(1100);
        expect(fields.PriceOverridden.Value).toBe(true);
        expect(fields.PriceOverrideReason.Value).toBe('Board rate');
    });
});

describe('PinLineToNamedPrice', () => {
    it('pins a rule other than the default and flags the line', () => {
        const { line, fields } = lineOf(UNPRICED, false);
        expect(PinLineToNamedPrice(line, price(MEMBER, 'Member', 950), engine)).toBe('pinned');
        expect(fields.UnitPrice.Value).toBe(950);
        expect(fields.ProductPriceID.Value).toBe(MEMBER);
        expect(fields.PriceOverridden.Value).toBe(true);
        expect(LineNeedsOverrideReason(line, engine)).toBe(true);
    });

    // golive #253 item 2: a named rule that IS the default restates the rules.
    it('restores rather than pins when the rule is the default', () => {
        const { line, fields } = lineOf(CONCESSION, true);
        expect(PinLineToNamedPrice(line, price(BASE, 'Base list price', 1200), engine)).toBe('restored');
        expect(fields.PriceOverridden.Value).toBe(false);
        expect(fields.PriceOverrideReason.Value).toBeNull();
    });
});

describe('PinLineToAmount', () => {
    it('pins a typed amount with no rule named', () => {
        const { line, fields } = lineOf(UNPRICED, false);
        expect(PinLineToAmount(line, 6000, 1200, engine)).toBe('pinned');
        expect(fields.UnitPrice.Value).toBe(6000);
        expect(fields.ProductPriceID.Value).toBeNull();
        expect(fields.PriceOverridden.Value).toBe(true);
    });

    it('typing the default back in on a saved line lands on the engine default, flag off', () => {
        const { line, fields } = lineOf(CONCESSION, true);
        expect(PinLineToAmount(line, 1200, 1200, engine)).toBe('restored');
        expect(fields.UnitPrice.Value).toBe(1200);
        expect(fields.ProductPriceID.Value).toBe(BASE);
        expect(fields.PriceOverridden.Value).toBe(false);
    });

    it('changes nothing when the default amount is typed on a saved line whose rule is unknown', () => {
        const { line, fields } = lineOf(CONCESSION, true);
        expect(PinLineToAmount(line, 1200, 1200, undefined)).toBeNull();
        expect(fields.UnitPrice.Value).toBe(1100);
        expect(fields.PriceOverridden.Value).toBe(true);
    });

    it('keeps the reason when a different amount replaces an override', () => {
        const { line, fields } = lineOf(CONCESSION, true);
        PinLineToAmount(line, 1150, 1200, engine);
        expect(fields.UnitPrice.Value).toBe(1150);
        expect(fields.PriceOverrideReason.Value).toBe('Board rate');
    });
});

describe('the override reason', () => {
    it('is stored trimmed, and whitespace is stored as none', () => {
        const { line, fields } = lineOf(UNPRICED, false);
        PinLineToAmount(line, 900, 1200, engine);
        SetLinePriceOverrideReason(line, '  Board-approved rate ');
        expect(LinePriceOverrideReason(line)).toBe('Board-approved rate');
        expect(LineNeedsOverrideReason(line, engine)).toBe(false);
        SetLinePriceOverrideReason(line, '   ');
        expect(fields.PriceOverrideReason.Value).toBeNull();
        expect(LineNeedsOverrideReason(line, engine)).toBe(true);
    });

    it('is not asked of a line on its default price', () => {
        expect(LineNeedsOverrideReason(lineOf(UNPRICED, false).line, engine)).toBe(false);
    });
});
