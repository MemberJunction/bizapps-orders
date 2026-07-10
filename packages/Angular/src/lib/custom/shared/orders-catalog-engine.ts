import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { mjBizAppsOrdersProductTypeEntity } from '@mj-biz-apps/orders-entities';

const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';

/**
 * Front-end reference cache for the orders catalog. Caches **Product Types** — a tiny, rarely-changing value set —
 * so pages share one cache instead of each re-querying. Reactive by construction: BaseEngine auto-updates the
 * cached array on any Product Type save/create/delete (and remote-invalidate), and `ObserveProperty('_productTypes')`
 * emits to subscribers.
 *
 * ⚠ This is the CLIENT engine, deliberately separate from the server-only `OrdersEngine`
 * (`@mj-biz-apps/orders-core-entities-server`), which depends on `@memberjunction/sqlserver-dataprovider` and cannot
 * run in the browser. Product/ProductCategory are intentionally NOT cached here (size caution — a real catalog can
 * grow large); only the small, bounded Product Type list is.
 */
export class OrdersCatalogEngine extends BaseEngine<OrdersCatalogEngine> {
  private _productTypes: mjBizAppsOrdersProductTypeEntity[] = [];

  public static get Instance(): OrdersCatalogEngine {
    return super.getInstance<OrdersCatalogEngine>();
  }

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
    const params: Array<Partial<BaseEnginePropertyConfig>> = [
      { PropertyName: '_productTypes', EntityName: PRODUCT_TYPE_ENTITY },
    ];
    return await this.Load(params, provider as IMetadataProvider, forceRefresh ?? false, contextUser);
  }

  public get ProductTypes(): mjBizAppsOrdersProductTypeEntity[] {
    return this.GetConfigData<mjBizAppsOrdersProductTypeEntity>('_productTypes');
  }
}
