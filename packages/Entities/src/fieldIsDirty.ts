/**
 * Boolean form of `GetFieldByName(name)?.Dirty === true`.
 *
 * MJ core is adding `BaseEntity.FieldIsDirty` (PR 4219). Until that ships in the
 * published `@memberjunction/core` this package pins, callers here and in Angular
 * use this helper. When the method is present it is used; otherwise we read
 * `GetFieldByName`. Unknown names are not dirty.
 */
export function FieldIsDirty(
    entity:
        | {
              FieldIsDirty?: (fieldName: string, ...more: string[]) => boolean;
              GetFieldByName?: (name: string) => { Dirty?: boolean } | null;
          }
        | null
        | undefined,
    fieldName: string,
    ...more: string[]
): boolean {
    if (!entity) return false;
    if (typeof entity.FieldIsDirty === 'function') {
        return entity.FieldIsDirty(fieldName, ...more);
    }
    const names = more.length === 0 ? [fieldName] : [fieldName, ...more];
    return names.some((name) => entity.GetFieldByName?.(name)?.Dirty === true);
}
