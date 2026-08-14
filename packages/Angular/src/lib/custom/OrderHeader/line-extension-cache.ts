/**
 * Process-wide cache for order-line extension metadata.
 *
 * EntityInfo and the form-embed config are the same for every line of a given
 * product type. Caching them avoids a metadata walk (and a second form-host
 * resolve) each time a card is added or rebound. Per-line entity *instances*
 * are not cached — those are the records being edited.
 */
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { DIALOG_FORM_CONFIG, type EntityFormConfig } from '@memberjunction/ng-base-forms';

const entityInfoByName = new Map<string, EntityInfo>();

const embedConfigByName = new Map<string, EntityFormConfig>();

function cacheKey(entityName: string): string {
    return entityName.trim().toLowerCase();
}

/** EntityInfo for an extension entity, resolved once per name. */
export function CachedExtensionEntityInfo(
    provider: IMetadataProvider,
    entityName: string,
): EntityInfo | undefined {
    const key = cacheKey(entityName);
    const hit = entityInfoByName.get(key);
    if (hit) return hit;
    const info = provider.EntityByName(entityName);
    if (info) entityInfoByName.set(key, info);
    return info;
}

/**
 * Embed config for an extension form. Section visibility is decided here at
 * runtime — never by editing the CodeGen form template. `orderLines` is the
 * key CodeGen uses for the IS-A parent field panel; `systemMetadata` is the
 * audit timestamps. `HideInheritedSections` still covers a template that
 * happens to tag the parent panel `Variant="inherited"`.
 */
export function CachedExtensionFormConfig(entityName: string): EntityFormConfig {
    const key = cacheKey(entityName);
    const hit = embedConfigByName.get(key);
    if (hit) return hit;
    const config: EntityFormConfig = {
        ...DIALOG_FORM_CONFIG,
        Toolbar: null,
        ShowRelatedEntities: false,
        HideInheritedSections: true,
        HiddenSectionKeys: ['systemMetadata', 'orderLines'],
        CollapsibleSections: false,
        EnableRecordLinks: true,
        WidthMode: 'full-width',
    };
    embedConfigByName.set(key, config);
    return config;
}

/** Test hook — clears the process cache. */
export function ResetLineExtensionCache(): void {
    entityInfoByName.clear();
    embedConfigByName.clear();
}
