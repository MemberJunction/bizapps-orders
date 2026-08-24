/**
 * @fileoverview Guest Order Claim Driver
 *
 * Implements the BaseIdentityClaimDriver interface for BizApps Orders guest orders.
 * When a guest redeems an order claim token, this driver links the OrderHeader (and any
 * associated EntitlementGrants) to the authenticated user's Person record.
 *
 * @module @mj-biz-apps/orders-core-entities-server/GuestOrderClaimDriver
 */

import { RegisterClass, EscapeSQLString } from '@memberjunction/global';
import { Metadata, RunView, UserInfo, IRunViewProvider } from '@memberjunction/core';
import {
    BaseIdentityClaimDriver,
    type ClaimContext,
    type ClaimRedeemContext,
    type ClaimResult,
} from '@memberjunction/core-entities';
import {
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersEntitlementGrantEntity,
} from '@mj-biz-apps/orders-entities';
import { resolvePersonID } from './claimDriverHelpers.js';

const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';

/**
 * Pluggable driver for GuestOrder identity claims.
 */
@RegisterClass(BaseIdentityClaimDriver, 'GuestOrderClaimDriver')
export class GuestOrderClaimDriver extends BaseIdentityClaimDriver {
    /**
     * Hook called after a guest order claim is created.
     */
    public async OnCreate(context: ClaimContext): Promise<void> {
        // Claim registered in pending state
    }

    /**
     * Hook called when a guest order claim is redeemed by an authenticated user.
     */
    public async OnClaim(context: ClaimRedeemContext): Promise<ClaimResult> {
        const { Claim, User } = context;
        const provider = Claim.ProviderToUse;

        let orderID = Claim.RecordID;
        if (!orderID && Claim.PayloadJSON) {
            try {
                const payload = JSON.parse(Claim.PayloadJSON) as Record<string, unknown>;
                if (typeof payload.OrderID === 'string') {
                    orderID = payload.OrderID;
                } else if (typeof payload.orderId === 'string') {
                    orderID = payload.orderId;
                }
            } catch {
                // Ignore payload parse errors
            }
        }

        if (!orderID) {
            return {
                Success: false,
                ErrorMessage: 'Claim does not reference an OrderHeader RecordID'
            };
        }

        const md = new Metadata();
        const order = await md.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(
            ORDER_HEADER_ENTITY,
            User
        );

        const loaded = await order.Load(orderID);
        if (!loaded) {
            return {
                Success: false,
                ErrorMessage: `Order with ID ${orderID} not found`
            };
        }

        const personID = await resolvePersonID(User, provider);
        if (!personID) {
            return {
                Success: false,
                ErrorMessage: `Could not resolve Person record for redeeming user ${User?.Email || 'unknown'}`
            };
        }

        // Link Order Header parties to the redeeming person if unset or different
        let orderModified = false;
        if (!order.BillToPersonID || order.BillToPersonID !== personID) {
            order.BillToPersonID = personID;
            orderModified = true;
        }
        if (!order.ShipToPersonID || order.ShipToPersonID !== personID) {
            order.ShipToPersonID = personID;
            orderModified = true;
        }

        if (orderModified) {
            const saved = await order.Save();
            if (!saved) {
                return {
                    Success: false,
                    ErrorMessage: `Failed to update Order with redeeming PersonID: ${order.LatestResult?.Message ?? 'Unknown save error'}`
                };
            }
        }

        // Cascade to any EntitlementGrants hanging off this order's lines
        const updatedGrants: string[] = [];
        try {
            const runViewProvider = (provider && 'RunView' in provider) ? (provider as unknown as IRunViewProvider) : null;
            const rv = new RunView(runViewProvider);
            const escapedOrderID = EscapeSQLString(orderID);
            const grantResult = await rv.RunView<{ ID: string; Status: string }>({
                EntityName: ENTITLEMENT_GRANT_ENTITY,
                ExtraFilter: `OrderLineID IN (SELECT ID FROM vwOrderLines WHERE OrderID = '${escapedOrderID}')`,
                ResultType: 'simple'
            }, User);

            if (grantResult.Success && grantResult.Results && grantResult.Results.length > 0) {
                for (const row of grantResult.Results) {
                    const grant = await md.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
                        ENTITLEMENT_GRANT_ENTITY,
                        User
                    );
                    if (await grant.Load(row.ID)) {
                        grant.BeneficiaryPersonID = personID;
                        if (grant.Status !== 'Active') {
                            grant.Status = 'Active';
                            grant.ProvisionedAt = new Date();
                        }
                        if (await grant.Save()) {
                            updatedGrants.push(grant.ID);
                        }
                    }
                }
            }
        } catch {
            // Entitlement grant cascade failure should not block overall order link
        }

        return {
            Success: true,
            Data: {
                OrderID: order.ID,
                OrderNumber: order.OrderNumber,
                PersonID: personID,
                CascadedGrants: updatedGrants
            }
        };
    }

    /**
     * Hook called when a guest order claim is revoked.
     */
    public async OnRevoke(context: ClaimContext): Promise<void> {
        // Safe teardown / no-op
    }

    /**
     * Hook called when a guest order claim expires.
     */
    public async OnExpire(context: ClaimContext): Promise<void> {
        // Safe teardown / no-op
    }
}

/**
 * Registration helper to ensure class factory decorator executes.
 */
export function LoadGuestOrderClaimDriver(): void {
    // Explicit trigger for bundler tree-shaking preservation
}
