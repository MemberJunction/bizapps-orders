import '@memberjunction/core';

declare module '@memberjunction/core' {
    interface BaseEntity<T = unknown> {
        /**
         * Ensures an IsA subtype child entity exists and is linked to this parent entity.
         * If entityName is omitted, the subtype entity is dynamically resolved via EntitySubtypeResolver.
         */
        EnsureISAChild(entityName?: string): Promise<BaseEntity | null>;
    }
}
