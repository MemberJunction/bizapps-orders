/**
 * @fileoverview Entitlement Grant Claim Driver
 *
 * Implements the BaseIdentityClaimDriver interface for BizApps Orders entitlement grants.
 * When an external user redeems an invitation or magic link claim, this driver attaches the
 * EntitlementGrant to their authenticated Person record and activates the grant.
 *
 * @module @mj-biz-apps/orders-core-entities-server/EntitlementGrantClaimDriver
 */

import { BaseIdentityClaimDriver, ClaimContext, ClaimRedeemContext, ClaimResult } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { mjBizAppsOrdersEntitlementGrantEntity } from '@mj-biz-apps/orders-entities';

const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';

/**
 * Pluggable driver for EntitlementGrant identity claims.
 */
@RegisterClass(BaseIdentityClaimDriver, 'EntitlementGrantClaimDriver')
export class EntitlementGrantClaimDriver extends BaseIdentityClaimDriver {
    /**
     * Hook called after an entitlement claim is created.
     */
    public async OnCreate(context: ClaimContext): Promise<void> {
        // Claim registered in pending state
    }

    /**
     * Resolves or ensures a Person record exists for the redeeming user.
     */
    private async resolvePersonID(user: UserInfo): Promise<string | null> {
        if (!user || !user.Email) {
            return null;
        }

        const rv = new RunView();
        const escaped = user.Email.trim().toLowerCase().replace(/'/g, "''");
        const personResult = await rv.RunView<{ ID: string }>({
            EntityName: PERSON_ENTITY,
            ExtraFilter: `Email = '${escaped}'`,
            ResultType: 'simple'
        });

        if (personResult.Success && personResult.Results && personResult.Results.length > 0) {
            return personResult.Results[0].ID;
        }

        return null;
    }

    /**
     * Hook called when an entitlement claim is redeemed by an authenticated user.
     */
    public async OnClaim(context: ClaimRedeemContext): Promise<ClaimResult> {
        const { Claim, User } = context;

        let grantID = Claim.RecordID;
        if (!grantID && Claim.PayloadJSON) {
            try {
                const payload = JSON.parse(Claim.PayloadJSON) as Record<string, unknown>;
                if (typeof payload.GrantID === 'string') {
                    grantID = payload.GrantID;
                } else if (typeof payload.grantId === 'string') {
                    grantID = payload.grantId;
                }
            } catch {
                // Ignore parse errors
            }
        }

        if (!grantID) {
            return {
                Success: false,
                ErrorMessage: 'Claim does not reference an EntitlementGrant RecordID'
            };
        }

        const md = new Metadata();
        const grant = await md.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
            ENTITLEMENT_GRANT_ENTITY,
            User
        );

        const loaded = await grant.Load(grantID);
        if (!loaded) {
            return {
                Success: false,
                ErrorMessage: `EntitlementGrant with ID ${grantID} not found`
            };
        }

        const personID = await this.resolvePersonID(User);
        if (personID && (!grant.BeneficiaryPersonID || grant.BeneficiaryPersonID !== personID)) {
            grant.BeneficiaryPersonID = personID;
        }

        grant.Status = 'Active';
        grant.ProvisionedAt = new Date();

        const saved = await grant.Save();
        if (!saved) {
            return {
                Success: false,
                ErrorMessage: `Failed to activate EntitlementGrant: ${grant.LatestResult?.Message ?? 'Unknown save error'}`
            };
        }

        return {
            Success: true,
            Data: {
                GrantID: grant.ID,
                BeneficiaryPersonID: grant.BeneficiaryPersonID,
                ProductEntitlementID: grant.ProductEntitlementID,
                ProvisionedAt: grant.ProvisionedAt?.toISOString()
            }
        };
    }

    /**
     * Hook called when an entitlement claim is revoked.
     */
    public async OnRevoke(context: ClaimContext): Promise<void> {
        const { Claim, User } = context;
        if (!Claim.RecordID) return;

        try {
            const md = new Metadata();
            const grant = await md.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
                ENTITLEMENT_GRANT_ENTITY,
                User
            );
            const loaded = await grant.Load(Claim.RecordID);
            if (loaded && grant.Status === 'Active') {
                grant.Status = 'Revoked';
                await grant.Save();
            }
        } catch {
            // Ignore revoke errors on teardown
        }
    }

    /**
     * Hook called when an entitlement claim expires.
     */
    public async OnExpire(context: ClaimContext): Promise<void> {
        const { Claim, User } = context;
        if (!Claim.RecordID) return;

        try {
            const md = new Metadata();
            const grant = await md.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
                ENTITLEMENT_GRANT_ENTITY,
                User
            );
            const loaded = await grant.Load(Claim.RecordID);
            if (loaded && grant.Status === 'Active') {
                grant.Status = 'Expired';
                await grant.Save();
            }
        } catch {
            // Ignore expire errors
        }
    }
}

/**
 * Registration helper to ensure class factory decorator executes.
 */
export function LoadEntitlementGrantClaimDriver(): void {
    // Explicit trigger for bundler tree-shaking preservation
}
