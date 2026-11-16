/**
 * @fileoverview Entitlement Grants, server side: every grant created, and every change of its Status or
 * its validity dates (`ValidFrom`, `ValidTo`), is recorded as a `GrantStatusChanged` outbound event (#293).
 *
 * DATES TOO. A term extension, a term shift, or a cancel that moves the end of access changes only the
 * dates. A downstream copy of access that heard nothing would end it on the old date: the Learning Hub,
 * which follows `ValidTo` to the instant, kept a learner a month short after a Duration concession. The
 * event keeps its name (one listener today re-reads the grant on any of them); the payload says which
 * fields changed (`ChangedFields`) and what the dates were (`FromValidFrom`, `FromValidTo`).
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
        const fromValidFrom = isNew ? null : asInstant(this.GetFieldByName('ValidFrom')?.OldValue);
        const fromValidTo = isNew ? null : asInstant(this.GetFieldByName('ValidTo')?.OldValue);
        const changed = isNew ? [] : GrantChangedFields(
            { Status: fromStatus, ValidFrom: fromValidFrom, ValidTo: fromValidTo },
            { Status: this.Status, ValidFrom: asInstant(this.ValidFrom), ValidTo: asInstant(this.ValidTo) },
        );
        // Nothing to tell, or nobody to tell it to: an ordinary save, as before this hook existed.
        if ((!isNew && changed.length === 0) || !HasOutboundConsumers('GrantStatusChanged')) {
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
                    Payload: await this.eventPayload(fromStatus, isNew ? null : { ChangedFields: changed, FromValidFrom: fromValidFrom, FromValidTo: fromValidTo }),
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

    private async eventPayload(
        fromStatus: string | null,
        change: { ChangedFields: GrantChangedField[]; FromValidFrom: Date | null; FromValidTo: Date | null } | null,
    ): Promise<Record<string, unknown>> {
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
            // A new grant changed nothing: it was created. A saved one says what moved, and from what.
            ChangedFields: change ? change.ChangedFields : [],
            FromValidFrom: change ? iso(change.FromValidFrom) : null,
            FromValidTo: change ? iso(change.FromValidTo) : null,
        };
    }
}

/** A field whose change a `GrantStatusChanged` event reports. */
export type GrantChangedField = 'Status' | 'ValidFrom' | 'ValidTo';

/** A date column's value as an instant, or null. A `Date`, an ISO string or nothing. */
function asInstant(value: unknown): Date | null {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Which of a grant's reported fields differ between two states. Dates compare as instants, so a reload
 * that hands back an equal `Date` (or the same instant as a string) is no change. Pure.
 */
export function GrantChangedFields(
    before: { Status: string | null; ValidFrom: Date | null; ValidTo: Date | null },
    after: { Status: string | null; ValidFrom: Date | null; ValidTo: Date | null },
): GrantChangedField[] {
    const sameInstant = (a: Date | null, b: Date | null): boolean => (a == null ? b == null : b != null && a.getTime() === b.getTime());
    const out: GrantChangedField[] = [];
    if (before.Status !== after.Status) out.push('Status');
    if (!sameInstant(before.ValidFrom, after.ValidFrom)) out.push('ValidFrom');
    if (!sameInstant(before.ValidTo, after.ValidTo)) out.push('ValidTo');
    return out;
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadEntitlementGrantEntityServer(): void {
    void EntitlementGrantEntityServer;
}
