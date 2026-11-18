/**
 * Shared Product Price subclass.
 *
 * Kept registered as the `@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Prices')`
 * subclass so callers importing `ProductPriceEntity` from `@mj-biz-apps/orders-entities`
 * resolve the shared subclass over the generated `mjBizAppsOrdersProductPriceEntity` base.
 */
import { BaseEntity } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersProductPriceEntity } from './generated/entity_subclasses';

const ENTITY = 'MJ_BizApps_Orders: Product Prices';

@RegisterClass(BaseEntity, ENTITY)
export class ProductPriceEntity extends mjBizAppsOrdersProductPriceEntity {}
