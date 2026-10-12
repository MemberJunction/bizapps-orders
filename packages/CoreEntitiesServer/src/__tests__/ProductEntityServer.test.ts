import { describe, expect, it } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { ProductEntity } from '@mj-biz-apps/orders-entities';
import { ProductEntityServer } from '../SubscriptionFamilyRules';

/**
 * Registered on the server, `ProductEntityServer` replaces `ProductEntity` for every product created
 * there. It must keep `ProductEntity`'s type defaults (golive #277), or an import, integration or
 * script that sets only the product type saves with no revenue recognition type and fails.
 */
describe('ProductEntityServer', () => {
    it('extends ProductEntity, so a server-created product takes its type defaults', () => {
        expect(ProductEntityServer.prototype).toBeInstanceOf(ProductEntity);
        expect(Object.prototype.hasOwnProperty.call(ProductEntityServer.prototype, 'Save')).toBe(false);
    });

    it('is the class the server creates for a product', () => {
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, 'MJ_BizApps_Orders: Products');
        expect(registration?.SubClass).toBe(ProductEntityServer);
    });
});
