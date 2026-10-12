import { describe, expect, it } from 'vitest';
import { CompositeKey } from '@memberjunction/core';
import { WrittenKeyToReload, type IsAKeyedRecord } from '../lib/custom/Product/written-key';

// On MJ 6.1.x a new Product with an Event Products extension is written under a server-minted key.
// The leaf's own key holds it; the Product the form holds keeps the browser's unwritten key.
const WRITTEN = '7F220478-2A4B-43C0-94F7-2F88E9727D22';
const UNWRITTEN = 'c7afc84f-f956-4627-b4fd-1f84b176bffa';
const key = (id: string) => CompositeKey.FromKeyValuePair('ID', id);

function product(own: string, leaf: string | null): IsAKeyedRecord {
    const record: IsAKeyedRecord = { PrimaryKey: key(own), LeafEntity: null };
    record.LeafEntity = leaf === null ? record : { PrimaryKey: key(leaf) };
    return record;
}

describe('WrittenKeyToReload', () => {
    it('returns the leaf key when the product holds a key that was never written', () => {
        expect(WrittenKeyToReload(product(UNWRITTEN, WRITTEN))?.GetValueByFieldName('ID')).toBe(WRITTEN);
    });

    it('returns null once both keys agree, which is the state after the MJ fix', () => {
        expect(WrittenKeyToReload(product(WRITTEN, WRITTEN))).toBeNull();
    });

    it('returns null for a product with no extension, whose leaf is itself', () => {
        expect(WrittenKeyToReload(product(UNWRITTEN, null))).toBeNull();
    });

    it('returns null when the leaf carries no key, rather than reloading under nothing', () => {
        const record: IsAKeyedRecord = { PrimaryKey: key(UNWRITTEN), LeafEntity: { PrimaryKey: new CompositeKey() } };
        expect(WrittenKeyToReload(record)).toBeNull();
    });
});
