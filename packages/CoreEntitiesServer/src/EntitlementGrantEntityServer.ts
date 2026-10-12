/**
 * @fileoverview Entitlement Grants, server side: every grant created, and every Status change, is
 * recorded as a `GrantStatusChanged` outbound event (#293).
 *
 * WHY HERE, not in each writer. Grants are written by the entitlement engine at booking, by the
 * payment-gated access pass, by returns and cancellations, by approved access overrides, and by a
 * person in Explorer. A hook in each would be a hook someone forgets; the entity's own Save sees
 * all of them.
 *
 * THE SAVE AND THE EVENT COMMIT TOGETHER. Both run inside one transaction, nested in the caller's
 * when there is one (booking), opened here when there is not. A grant change without its event
 * would leave a downstream copy of access wrong with nothing to correct it; an event without the
 * change would revoke access nobody revoked.
 */
import { BaseEntity, DatabaseProviderBase, EntitySaveOptions, IMetadataProvider, IRunViewProvider, LogError, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersEntitlementGrantEntity } from '@mj-biz-apps/orders-entities';
import { HasOutboundConsumers, RecordOutboundEvent } from './OutboundEvents.js';
import { RequireUUID } from './sql-guards.js';

const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';

@RegisterClass(BaseEntity, ENTITLEMENT_GRANT_ENTITY)
export class EntitlementGrantEntityServer extends mjBizAppsOrdersEntitlementGrantEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNew = !this.IsSaved;
        const fromStatus = isNew ? null : ((this.GetFieldByName('Status')?.OldValue as string | null) ?? null);
        // Nothing to tell, or nobody to tell it to: an ordinary save, as before this hook existed.
        if ((!isNew && fromStatus === this.Status) || !HasOutboundConsumers('GrantStatusChanged')) {
            return super.Save(options);
        }

        const db = this.ProviderToUse as unknown as DatabaseProviderBase;
        await db.BeginTransaction();
        try {
            if (!(await super.Save(options))) {
                await db.RollbackTransaction();
                return false;
            }
            await RecordOutboundEvent(
                {
                    EventType: 'GrantStatusChanged',
                    OrderHeaderID: await this.orderHeaderID(),
                    EntitlementGrantID: this.ID,
                    Payload: await this.eventPayload(fromStatus),
                },
                this.ProviderToUse as unknown as IMetadataProvider,
                this.ContextCurrentUser,
                options
            );
            await db.CommitTransaction();
            return true;
        } catch (err) {
            try {
                await db.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`[EntitlementGrantEntityServer] rollback failed: ${rollbackErr}`);
            }
            // Thrown, not returned false: inside a booking the caller must roll the whole confirm
            // back, and every grant writer already treats a throw from here as fatal.
            throw err;
        }
    }

    private async orderHeaderID(): Promise<string | null> {
        if (!this.OrderLineID) return null;
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ OrderHeaderID: string }>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `ID = '${RequireUUID(this.OrderLineID, 'OrderLineID')}'`,
                Fields: ['OrderHeaderID'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser
        );
        return res?.Results?.[0]?.OrderHeaderID ?? null;
    }

    private async eventPayload(fromStatus: string | null): Promise<Record<string, unknown>> {
        let code: string | null = null;
        if (this.ProductEntitlementID) {
            const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
            const res = await rv.RunView<{ Code: string }>(
                {
                    EntityName: PRODUCT_ENTITLEMENT_ENTITY,
                    ExtraFilter: `ID = '${RequireUUID(this.ProductEntitlementID, 'ProductEntitlementID')}'`,
                    Fields: ['Code'],
                    ResultType: 'simple',
                },
                this.ContextCurrentUser
            );
            code = res?.Results?.[0]?.Code ?? null;
        }
        const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
        return {
            GrantID: this.ID,
            Code: code,
            FromStatus: fromStatus,
            ToStatus: this.Status,
            SuspensionReason: this.SuspensionReason ?? null,
            OrderLineID: this.OrderLineID ?? null,
            SubscriptionID: this.SubscriptionID ?? null,
            SubscriptionTermID: this.SubscriptionTermID ?? null,
            BeneficiaryPersonID: this.BeneficiaryPersonID ?? null,
            BeneficiaryOrganizationID: this.BeneficiaryOrganizationID ?? null,
            ValidFrom: iso(this.ValidFrom),
            ValidTo: iso(this.ValidTo),
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadEntitlementGrantEntityServer(): void {
    void EntitlementGrantEntityServer;
}
