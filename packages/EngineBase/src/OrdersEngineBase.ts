import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { mjBizAppsOrdersProductTypeEntity } from '@mj-biz-apps/orders-entities';

const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';

/**
 * Browser-safe orders engine base — the front-end reference cache for the BizApps Orders catalog. Mirrors
 * `AccountingEngineBase`: a `BaseEngine` singleton whose `Config` entries auto-subscribe to `BaseEntity`
 * save/delete/remote-invalidate events, so cached collections stay current reactively and
 * `ObserveProperty(propertyName)` emits to subscribers on any change.
 *
 * Caches **Product Types** today (a small, bounded, rarely-changing set). Product / ProductCategory are
 * deliberately left out for now (size caution — a real catalog can grow large); add them here as sizing allows.
 *
 * ⚠ This is the CLIENT/isomorphic base — distinct from the server-only `OrdersEngine`
 * (`@mj-biz-apps/orders-core-entities-server`), which depends on `@memberjunction/sqlserver-dataprovider` and
 * cannot run in the browser.
 */
export class OrdersEngineBase extends BaseEngine<OrdersEngineBase> {
  private _productTypes: mjBizAppsOrdersProductTypeEntity[] = [];

  public static get Instance(): OrdersEngineBase {
    return super.getInstance<OrdersEngineBase>();
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
