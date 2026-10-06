import { CompositeKey } from '@memberjunction/core';

/** The parts of an IsA parent record this check reads. `BaseEntity` satisfies it. */
export interface IsAKeyedRecord {
    PrimaryKey: CompositeKey;
    LeafEntity: { PrimaryKey: CompositeKey } | null;
}

/**
 * The key to reload a just-created IsA parent under, or null when its own key is already right.
 *
 * On MJ 6.1.x, saving a NEW Product that carries an Event Products extension writes both rows under a
 * key the server mints, because the GraphQL create does not send the browser's key. The leaf's own key
 * field is re-hydrated from the save response and holds the written key. The Product the form holds
 * keeps the browser's key in `ID`, `Get('ID')` and `PrimaryKey`, so every price row, GL link and reload
 * the form starts from it names a Product that does not exist. Reloading the Product under the leaf's
 * key replaces it. Once MJ sends the key on create, the two keys agree and this returns null.
 */
export function WrittenKeyToReload(record: IsAKeyedRecord): CompositeKey | null {
    const leaf = record.LeafEntity;
    if (!leaf || leaf === record) {
        return null;
    }
    const written = leaf.PrimaryKey;
    if (!written?.HasValue || written.Equals(record.PrimaryKey)) {
        return null;
    }
    return written;
}
