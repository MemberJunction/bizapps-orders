import '@memberjunction/core';

declare module '@memberjunction/core' {
    interface BaseEntity<T = unknown> {
        /**
         * Resolves the prospective IS-A subtype child entity name from registered resolvers or SubtypeSelector metadata.
         */
        ResolveSubtypeEntityName(): Promise<string | null>;

        /**
         * Ensures an IsA subtype child entity exists and is linked to this parent entity.
         * If entityName is omitted, the subtype entity is dynamically resolved via ResolveSubtypeEntityName().
         */
        EnsureISAChild(entityName?: string): Promise<BaseEntity | null>;
    }
}
