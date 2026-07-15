/**
 * GrantEntitlementsOperation — issue entitlement grants for an order line (`Orders.GrantEntitlements`, F7.2).
 *
 * At booking, materialize an EntitlementGrant row from each ACTIVE ProductEntitlement the line's
 * product defines, with the beneficiary defaulted to the order's customer (BO-D34/D39). The GRANT
 * RECORDS are the v1 deliverable — provisioning/enforcement engines are later (DEFERRALS). Idempotent:
 * a line whose grants already exist is a no-op.
 *
 * Code-only Remote Operation; in-process + over GraphQL.
 *
 * CONNECTS TO:
 *   ENTITY: @mj-biz-apps/orders-entities (OrderLine / Order / Product Entitlements / Entitlement Grants)
 */
import { BaseRemotableOperation, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type {
  mjBizAppsOrdersEntitlementGrantEntity,
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';

export interface GrantEntitlementsInput {
  OrderLineID: string;
}
export interface GrantEntitlementsOutput {
  Success: boolean;
  GrantIDs?: string[];
  /** Present when nothing was granted (no entitlements, or already granted). */
  Skipped?: string;
  Errors?: string[];
}

@RegisterClass(BaseRemotableOperation, 'Orders.GrantEntitlements')
export class GrantEntitlementsOperation extends BaseRemotableOperation<GrantEntitlementsInput, GrantEntitlementsOutput> {
  public readonly OperationKey = 'Orders.GrantEntitlements';

  protected async InternalExecute(
    input: GrantEntitlementsInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<GrantEntitlementsOutput> {
    const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    if (!(await line.Load(input.OrderLineID))) return { Success: false, Errors: [`Order line ${input.OrderLineID} not found.`] };

    if (await this.hasExistingGrants(line.ID, user)) return { Success: true, Skipped: 'grants already exist for this line' };

    const entitlements = await this.activeEntitlements(line.ProductID, user);
    if (entitlements.length === 0) return { Success: true, Skipped: 'product defines no entitlements' };

    const beneficiaryOrgID = await this.orderCustomer(line.OrderID, user);
    const grantIDs: string[] = [];
    for (const ent of entitlements) {
      const id = await this.createGrant(ent.ID, ent.Quantity, line, beneficiaryOrgID, user);
      if (!id) return { Success: false, Errors: [`Failed to create an entitlement grant for line ${input.OrderLineID}.`], GrantIDs: grantIDs };
      grantIDs.push(id);
    }
    return { Success: true, GrantIDs: grantIDs };
  }

  private async hasExistingGrants(orderLineID: string, user: UserInfo): Promise<boolean> {
    const res = await new RunView().RunView<{ ID: string }>(
      { EntityName: ENTITLEMENT_GRANT_ENTITY, ExtraFilter: `OrderLineID='${orderLineID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true, MaxRows: 1 },
      user,
    );
    return (res.Results ?? []).length > 0;
  }

  private async activeEntitlements(productID: string, user: UserInfo): Promise<Array<{ ID: string; Quantity: number | null }>> {
    const res = await new RunView().RunView<{ ID: string; Quantity: number | null }>(
      { EntityName: PRODUCT_ENTITLEMENT_ENTITY, ExtraFilter: `ProductID='${productID}' AND IsActive=1`, Fields: ['ID', 'Quantity'], ResultType: 'simple', BypassCache: true },
      user,
    );
    return res.Success ? res.Results ?? [] : [];
  }

  private async orderCustomer(orderID: string, user: UserInfo): Promise<string | null> {
    const order = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    return (await order.Load(orderID)) ? order.CustomerOrganizationID : null;
  }

  private async createGrant(
    productEntitlementID: string,
    quantity: number | null,
    line: mjBizAppsOrdersOrderLineEntity,
    beneficiaryOrgID: string | null,
    user: UserInfo,
  ): Promise<string | null> {
    const grant = await new Metadata().GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(ENTITLEMENT_GRANT_ENTITY, user);
    grant.NewRecord();
    grant.ProductEntitlementID = productEntitlementID;
    grant.OrderLineID = line.ID;
    if (line.SubscriptionID) grant.SubscriptionID = line.SubscriptionID;
    if (beneficiaryOrgID) grant.BeneficiaryOrganizationID = beneficiaryOrgID;
    grant.Quantity = quantity;
    grant.Status = 'Active';
    grant.ValidFrom = line.ServicePeriodStart ?? new Date();
    if (line.ServicePeriodEnd) grant.ValidTo = line.ServicePeriodEnd;
    if (!(await grant.Save())) {
      LogError(`GrantEntitlementsOperation: grant save failed: ${grant.LatestResult?.CompleteMessage ?? 'unknown'}`);
      return null;
    }
    return grant.ID;
  }
}

/** Tree-shaking anchor — called from the server bootstrap so `@RegisterClass` is retained. */
export function LoadGrantEntitlementsOperation(): void {
  // intentionally empty
}
