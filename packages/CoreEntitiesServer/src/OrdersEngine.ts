/**
 * OrdersEngine — the server-side convenience wrapper over the browser-safe `OrdersEngineBase`
 * (AIEngineBase/AIEngine pattern; F0 engine split, 2026-07-15).
 *
 * ALL catalog caching (types/categories/products), GL-account resolution, and `buildDraftsForOrder`
 * now live in `OrdersEngineBase` (`@mj-biz-apps/orders-engine-base`) — isomorphic, so the browser
 * uses the same implementation. This wrapper does NOT duplicate the cache; it delegates to the
 * single `OrdersEngineBase.Instance`, and exists as the server call surface + the home for any
 * future server-only additions (mirrors accounting's `AccountingEngine` over `AccountingEngineBase`).
 *
 * The base carries `@RegisterForStartup`, so the server configures the catalog cache at boot.
 *
 * CONNECTS TO:
 *   BASE:   OrdersEngineBase (@mj-biz-apps/orders-engine-base) — caches + resolution + draft assembly
 *   CALLER: orderBooking.queueOrderBooking · OrderEntityServer (direct-save confirm path)
 */
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { OrdersEngineBase, type OrderDraftBuildResult } from '@mj-biz-apps/orders-engine-base';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';

export class OrdersEngine extends BaseSingleton<OrdersEngine> {
  public static get Instance(): OrdersEngine {
    return super.getInstance<OrdersEngine>();
  }

  /** The browser-safe catalog engine this server wrapper delegates to. */
  public get Base(): OrdersEngineBase {
    return OrdersEngineBase.Instance;
  }

  /** Ensure the base catalog + accounting caches are loaded (no-op when already configured). */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    await this.Base.Config(forceRefresh, contextUser, provider);
  }

  /** Resolve + assemble an order's balanced per-company booking drafts (delegates to the base). */
  public buildDraftsForOrder(
    order: mjBizAppsOrdersOrderEntity,
    lines: mjBizAppsOrdersOrderLineEntity[]
  ): OrderDraftBuildResult {
    return this.Base.buildDraftsForOrder(order, lines);
  }
}
