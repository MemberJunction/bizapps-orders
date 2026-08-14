import '@angular/compiler';
import { describe, expect, it, beforeEach } from 'vitest';
import {
    CachedExtensionFormConfig,
    ResetLineExtensionCache,
} from '../line-extension-cache';

describe('CachedExtensionFormConfig', () => {
    beforeEach(() => {
        ResetLineExtensionCache();
    });

    it('returns the same config object for the same entity name', () => {
        const a = CachedExtensionFormConfig('MJ_BizApps_Orders: Event Order Lines');
        const b = CachedExtensionFormConfig('mj_bizapps_orders: event order lines');
        expect(a).toBe(b);
    });

    it('embeds without toolbar or inherited parent sections', () => {
        const config = CachedExtensionFormConfig('MJ_BizApps_Orders: Event Order Lines');
        expect(config.Toolbar).toBeNull();
        expect(config.HideInheritedSections).toBe(true);
        expect(config.HiddenSectionKeys).toEqual(['systemMetadata', 'orderLines']);
        expect(config.ShowRelatedEntities).toBe(false);
        expect(config.CollapsibleSections).toBe(false);
        expect(config.StartInEditMode).toBeUndefined();
    });
});
