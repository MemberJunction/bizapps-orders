/**
 * @fileoverview Guest Order Claim Driver
 *
 * Implements the BaseIdentityClaimDriver interface for BizApps Orders guest orders.
 * When a guest redeems an order claim token, this driver links the OrderHeader (and any
 * associated EntitlementGrants) to the authenticated user's Person record.
 *
 * @module @mj-biz-apps/orders-core-entities-server/GuestOrderClaimDriver
 */

import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { RequireUUID } from './sql-guards.js';
import { LogError, Metadata, RunView, UserInfo, IRunViewProvider } from '@memberjunction/core';
import {
    BaseIdentityClaimDriver,
    type ClaimContext,
    type ClaimRedeemContext,
    type ClaimResult,
} from '@memberjunction/core-entities';
import {
    IsBooked,
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersEntitlementGrantEntity,
} from '@mj-biz-apps/orders-entities';
import { resolvePersonID } from './claimDriverHelpers.js';
import { IsPaymentSuspension } from './EntitlementBehavior.js';

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

        let personID: string | null;
        try {
            personID = await resolvePersonID(User, provider);
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : String(e) };
        }
        if (!personID) {
            return {
                Success: false,
                ErrorMessage: `Could not resolve Person record for redeeming user ${User?.Email || 'unknown'}`
            };
        }

        // Link Order Header parties to the redeeming person if unset or different.
        //
        // A BOOKED ORDER KEEPS ITS BILL-TO (golive #262). Checkout resolves the payer Person and
        // stamps it as the bill-to before it confirms, so a claimed guest order already records who
        // paid, and trigger 51013 refuses re-pointing it: the sale is history. On a booked order the
        // claim fills an empty bill-to only and moves the ship-to (not frozen) on its own, so the
        // claim still succeeds and the grants below still cascade.
        const booked = IsBooked(order.Status);
        let orderModified = false;
        if (!order.BillToPersonID || (!booked && order.BillToPersonID !== personID)) {
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
            const escapedOrderID = EscapeSQLString(RequireUUID(order.ID, 'OrderHeaderID'));
            const grantResult = await rv.RunView<{ ID: string; Status: string }>({
                EntityName: ENTITLEMENT_GRANT_ENTITY,
                ExtraFilter: `OrderLineID IN (SELECT ID FROM [__mj_BizAppsOrders].[vwOrderLines] WHERE OrderHeaderID = '${escapedOrderID}')`,
                ResultType: 'simple'
            }, User);

            if (!grantResult.Success) {
                const message = `Could not read the entitlement grants of order ${order.ID}: ${grantResult.ErrorMessage ?? 'unknown error'}`;
                LogError(`[GuestOrderClaimDriver] ${message}`);
                return { Success: false, ErrorMessage: message };
            }
            if (grantResult.Results && grantResult.Results.length > 0) {
                for (const row of grantResult.Results) {
                    const grant = await md.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
                        ENTITLEMENT_GRANT_ENTITY,
                        User
                    );
                    if (await grant.Load(row.ID)) {
                        grant.BeneficiaryPersonID = personID;
                        // Claiming an order does not pay for it: a grant held for payment stays
                        // held until the payment arrives (PaymentGatedAccess).
                        if (grant.Status !== 'Active' && !IsPaymentSuspension(grant)) {
                            grant.Status = 'Active';
                            grant.SuspendedAt = null;
                            grant.SuspensionReason = null;
                            grant.ProvisionedAt = new Date();
                        }
                        if (await grant.Save()) {
                            updatedGrants.push(grant.ID);
                        }
                    }
                }
            }
        } catch (err) {
            // The order is linked; a retry re-runs the cascade (OnClaim is idempotent).
            const message = `Could not move the entitlement grants of order ${order.ID}: ${err instanceof Error ? err.message : String(err)}`;
            LogError(`[GuestOrderClaimDriver] ${message}`);
            return { Success: false, ErrorMessage: message };
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
