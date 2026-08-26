/**
 * @fileoverview Entitlement Grant Claim Driver
 *
 * Implements the BaseIdentityClaimDriver interface for BizApps Orders entitlement grants.
 * When an external user redeems an invitation or magic link claim, this driver attaches the
 * EntitlementGrant to their authenticated Person record and activates the grant.
 *
 * @module @mj-biz-apps/orders-core-entities-server/EntitlementGrantClaimDriver
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata, UserInfo, IRunViewProvider, IMetadataProvider } from '@memberjunction/core';
import {
    BaseIdentityClaimDriver,
    type ClaimContext,
    type ClaimRedeemContext,
    type ClaimResult,
} from '@memberjunction/core-entities';
import { mjBizAppsOrdersEntitlementGrantEntity } from '@mj-biz-apps/orders-entities';
import { resolvePersonID } from './claimDriverHelpers.js';
import { ReadGrantProvisioning, WriteGrantProvisioning } from './entitlementProvisioningAdapter.js';
import { PushProvisioningForGrant } from './EntitlementProvisioningService.js';

const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';

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

        const personID = await resolvePersonID(User, Claim.ProviderToUse);
        const beneficiaryChanged =
            !!personID && (!grant.BeneficiaryPersonID || grant.BeneficiaryPersonID !== personID);
        if (beneficiaryChanged && personID) {
            grant.BeneficiaryPersonID = personID;
        }

        grant.Status = 'Active';
        grant.ProvisionedAt = new Date();

        // A claim redemption is the moment the grant's REAL beneficiary becomes known. If the
        // downstream target was already told about a placeholder beneficiary, the obligation is
        // re-opened so the push re-provisions with the right person (drivers are idempotent by
        // ExternalRef — see EntitlementProvisioningDriver.ts).
        if (beneficiaryChanged && ReadGrantProvisioning(grant).ProvisioningStatus === 'Provisioned') {
            WriteGrantProvisioning(grant, { ProvisioningStatus: 'Pending', ProvisionAttempts: 0, LastProvisionError: null });
        }

        const saved = await grant.Save();
        if (!saved) {
            return {
                Success: false,
                ErrorMessage: `Failed to activate EntitlementGrant: ${grant.LatestResult?.Message ?? 'Unknown save error'}`
            };
        }

        // Fire-and-forget: push any outstanding obligation now that the beneficiary is settled.
        // A failure is logged inside the service and left for the reconcile sweep. The grant's own
        // provider is the metadata provider here — same house idiom as OrderEntityServer.
        const pushProvider = grant.ProviderToUse as unknown as IMetadataProvider;
        void PushProvisioningForGrant(grant.ID, pushProvider, User).catch((err) => {
            LogError(
                `[EntitlementGrantClaimDriver] Provisioning push after claim ${Claim.ID} failed for grant ${grant.ID}: ` +
                    `${err instanceof Error ? err.message : String(err)} — the reconcile sweep will retry.`,
            );
        });

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
     *
     * `CK_EntitlementGrant_Revocation` (and the generated `ValidateRevokedAtBasedOnStatus`
     * rule) require `RevokedAt` whenever Status is 'Revoked' — a revocation without the
     * timestamp fails validation and the grant silently stays Active. Stamp both, and
     * surface a failed save instead of swallowing it.
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
                grant.RevokedAt = new Date();
                grant.RevocationReason = 'Identity claim revoked';
                const saved = await grant.Save();
                if (!saved) {
                    LogError(`[EntitlementGrantClaimDriver] OnRevoke failed to save grant ${grant.ID}: ${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[EntitlementGrantClaimDriver] OnRevoke error for claim ${Claim.ID}: ${msg}`);
        }
    }

    /**
     * Hook called when an entitlement claim expires. (`RevokedAt` must NOT be set here — the
     * validation rule requires it to be null for any non-Revoked status.)
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
                const saved = await grant.Save();
                if (!saved) {
                    LogError(`[EntitlementGrantClaimDriver] OnExpire failed to save grant ${grant.ID}: ${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[EntitlementGrantClaimDriver] OnExpire error for claim ${Claim.ID}: ${msg}`);
        }
    }
}

/**
 * Registration helper to ensure class factory decorator executes.
 */
export function LoadEntitlementGrantClaimDriver(): void {
    // Explicit trigger for bundler tree-shaking preservation
}
