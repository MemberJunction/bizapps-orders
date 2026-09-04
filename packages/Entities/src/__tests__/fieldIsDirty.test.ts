import { describe, expect, it } from 'vitest';
import { FieldIsDirty } from '../fieldIsDirty.js';

describe('FieldIsDirty', () => {
    it('is false for a missing entity or unknown field', () => {
        expect(FieldIsDirty(null, 'UnitPrice')).toBe(false);
        expect(FieldIsDirty(undefined, 'UnitPrice')).toBe(false);
        expect(FieldIsDirty({ GetFieldByName: () => null }, 'UnitPrice')).toBe(false);
    });

    it('reads GetFieldByName().Dirty when the core method is not on the entity', () => {
        const fields: Record<string, { Dirty: boolean }> = {
            UnitPrice: { Dirty: true },
            ProductPriceID: { Dirty: false },
        };
        const entity = {
            GetFieldByName: (name: string) => fields[name] ?? null,
        };
        expect(FieldIsDirty(entity, 'UnitPrice')).toBe(true);
        expect(FieldIsDirty(entity, 'ProductPriceID')).toBe(false);
        expect(FieldIsDirty(entity, 'UnitPrice', 'ProductPriceID')).toBe(true);
        expect(FieldIsDirty(entity, 'ProductPriceID', 'Quantity')).toBe(false);
    });

    it('prefers the core FieldIsDirty method when it exists', () => {
        const entity = {
            FieldIsDirty: (name: string, ...more: string[]) => name === 'UnitPrice' || more.includes('UnitPrice'),
            GetFieldByName: () => ({ Dirty: false }),
        };
        expect(FieldIsDirty(entity, 'UnitPrice')).toBe(true);
        expect(FieldIsDirty(entity, 'ProductPriceID', 'UnitPrice')).toBe(true);
        expect(FieldIsDirty(entity, 'ProductPriceID')).toBe(false);
    });
});
