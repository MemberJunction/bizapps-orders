import { describe, it, expect } from 'vitest';
import {
    PRICE_OVERRIDE_AUTH,
    isEnginePrice,
    isNamedListPick,
    moneyEqual,
    priceOverrideCatalogInstalled,
} from '../pricing/priceOverride.js';

describe('price override helpers', () => {
    it('treats the catalog as missing when the parent authorization is not loaded', () => {
        expect(priceOverrideCatalogInstalled({ Authorizations: [] })).toBe(false);
        expect(
            priceOverrideCatalogInstalled({
                Authorizations: [{ Name: PRICE_OVERRIDE_AUTH.Parent } as never],
            }),
        ).toBe(true);
    });

    it('matches the engine on rounded money and ProductPriceID', () => {
        const engine = { UnitPrice: 10.001, ProductPriceID: 'AAA' };
        expect(isEnginePrice({ UnitPrice: 10, ProductPriceID: 'aaa' }, engine)).toBe(true);
        expect(isEnginePrice({ UnitPrice: 11, ProductPriceID: 'aaa' }, engine)).toBe(false);
        expect(isEnginePrice({ UnitPrice: 10, ProductPriceID: null }, engine)).toBe(false);
    });

    it('accepts a named list pick whose amount matches', () => {
        const applicable = [
            { ID: 'p1', UnitPrice: 175 },
            { ID: 'p2', UnitPrice: 275 },
        ];
        expect(isNamedListPick({ ProductPriceID: 'p2', UnitPrice: 275 }, applicable)).toBe(true);
        expect(isNamedListPick({ ProductPriceID: 'p2', UnitPrice: 1 }, applicable)).toBe(false);
        expect(isNamedListPick({ ProductPriceID: null, UnitPrice: 275 }, applicable)).toBe(false);
        expect(moneyEqual(1.005, 1.01)).toBe(true);
    });
});
