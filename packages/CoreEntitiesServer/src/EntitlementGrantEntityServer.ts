/**
 * EntitlementGrantEntityServer — keeps the provisioning obligation in step with the grant's status.
 *
 * Every path that revokes a grant — a return unwinding it (`RevokeGrantsForReturn`), a claim being
 * revoked (`EntitlementGrantClaimDriver.OnRevoke`), an admin flipping Status in Explorer — goes
 * through `Save()` on this class, so THIS is the one place the downstream side of a revocation is
 * decided. No caller has to remember it, which is the same reason the booking lives in
 * `OrderEntityServer.Save` rather than in an operation.
 *
 * The rule: a grant leaving Active/Suspended for Revoked or Expired
 *   - that WAS provisioned downstream  → `ProvisioningStatus = 'RevokePending'` (attempts reset;
 *     the post-commit push or the reconcile sweep tells the downstream system, retrying until it
 *     hears back — see EntitlementProvisioningService.ts)
 *   - that NEVER reached downstream (Pending/Failed) → straight to 'Revoked': there is nothing out
 *     there to tear down, and sweeping it would provision access for a grant that is already dead.
 *
 * Expired is included deliberately: `ValidTo` is handed to the driver at provision time, but not
 * every downstream system can enforce a window itself, so expiry gets the same explicit teardown a
 * revocation does. Targets that honor ValidTo natively treat the Revoke as an idempotent no-op.
 *
 * NO I/O IN THIS OVERRIDE. It runs inside the booking transaction when a reversal books, so it
 * stamps two columns and gets out of the way — the actual downstream call is post-commit work.
 */
import { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersEntitlementGrantEntity } from '@mj-biz-apps/orders-entities';
import {
    ProvisioningTransitionOnTerminalStatus,
    ReadGrantProvisioning,
    WriteGrantProvisioning,
} from './entitlementProvisioningAdapter.js';

const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';

/** Grant statuses that end the customer's access and therefore end the downstream obligation. */
const TERMINAL_GRANT_STATUSES = new Set(['Revoked', 'Expired']);

@RegisterClass(BaseEntity, ENTITLEMENT_GRANT_ENTITY)
export class EntitlementGrantEntityServer extends mjBizAppsOrdersEntitlementGrantEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        this.syncProvisioningWithStatus();
        return super.Save(options);
    }

    private syncProvisioningWithStatus(): void {
        const statusField = this.GetFieldByName('Status');
        if (!statusField || !statusField.Dirty) return;
        if (!TERMINAL_GRANT_STATUSES.has(this.Status)) return;

        const patch = ProvisioningTransitionOnTerminalStatus(ReadGrantProvisioning(this).ProvisioningStatus);
        if (patch) WriteGrantProvisioning(this, patch);
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadEntitlementGrantEntityServer(): void {
    // intentionally empty
}
