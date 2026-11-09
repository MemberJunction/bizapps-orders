import { describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { ProductPriceEntity, mjBizAppsOrdersProductPriceEntity } from '@mj-biz-apps/orders-entities';
import { ProductPriceEntityServer } from '../ProductPriceEntityServer';

const ENTITY_KEY = 'MJ_BizApps_Orders: Product Prices';

/**
 * Registered on the server, `ProductPriceEntityServer` replaces `ProductPriceEntity` for every
 * product price rule created there. It must extend `ProductPriceEntity` (rather than the generated
 * `mjBizAppsOrdersProductPriceEntity` directly) so the server keeps `ProductPriceEntity.Validate`'s
 * synchronous rule checks (e.g. ProductID vs ProductCategoryIDXOR, Recurring cadence requirement)
 * alongside `ProductPriceEntityServer.ValidateAsync`'s priority-collision check, and so
 * `ClassFactory` sees a single linear inheritance chain with no unrelated-class collision.
 */
describe('ProductPriceEntityServer', () => {
    it('extends ProductPriceEntity -> mjBizAppsOrdersProductPriceEntity in a single linear chain', () => {
        expect(ProductPriceEntityServer.prototype).toBeInstanceOf(ProductPriceEntity);
        expect(ProductPriceEntityServer.prototype).toBeInstanceOf(mjBizAppsOrdersProductPriceEntity);
    });

    it('is the winning registration for MJ_BizApps_Orders: Product Prices with no sibling collisions', () => {
        const factory = MJGlobal.Instance.ClassFactory;
        const registration = factory.GetRegistration(BaseEntity, ENTITY_KEY);
        expect(registration?.SubClass).toBe(ProductPriceEntityServer);

        const all = factory.GetAllRegistrations(BaseEntity, ENTITY_KEY);
        expect(all.length).toBeGreaterThanOrEqual(2);
        for (const reg of all) {
            const isLinear =
                reg.SubClass === ProductPriceEntityServer ||
                ProductPriceEntityServer.prototype instanceof reg.SubClass;
            expect(
                isLinear,
                `Expected ${reg.SubClass.name} to be an ancestor of ProductPriceEntityServer`
            ).toBe(true);
        }
    });

    it('emits zero ClassFactory.Register unrelated-class warnings when registered after ProductPriceEntity', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const factory = MJGlobal.Instance.ClassFactory;
            factory.Register(BaseEntity, ProductPriceEntity, ENTITY_KEY);
            factory.Register(BaseEntity, ProductPriceEntityServer, ENTITY_KEY);

            const collisionWarnings = warnSpy.mock.calls
                .map(args => String(args[0] ?? ''))
                .filter(msg => msg.includes('ClassFactory.Register') && msg.includes('unrelated class'));
            expect(collisionWarnings).toEqual([]);
        } finally {
            warnSpy.mockRestore();
        }
    });
});
