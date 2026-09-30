/**
 * EntitlementAccessOverride server subclass — how an override may be written (bizapps-orders#268).
 *
 * The migration's trigger keeps the request and the decision from being rewritten and limits the
 * status moves. What it cannot see is authorization and the approval task, so those live here:
 *
 *   · A new override is written Requested, by the user named as its requester, who holds the
 *     authorization for its type (`MJ.BizApps.Orders.Access.Override.WaivePaymentHold` or
 *     `.DeferCutoff`, or the parent).
 *   · Approved or Rejected is written by the user named as the decider, and only once the approval
 *     task has closed the matching way (Completed for Approved, Cancelled for Rejected). Editing the
 *     row directly therefore cannot stand in for the approval. Who may decide the task is not settled
 *     here (bizapps-orders#360).
 *   · Withdrawn needs the approval task closed (Completed or Cancelled) — the request ended without a
 *     decision that could be applied — or no task at all, so a row written without going through
 *     `Orders.RequestAccessOverride` can be closed rather than block its order.
 *   · Expired is not checked beyond the trigger's Approved -> Expired: it only takes access away, and
 *     the nightly pass decides it against its own as-of day, which need not be today.
 *
 * `ApplyAccessOverrideDecision` is the path that satisfies these; this class is what stops any other.
 */
import { BaseEntity, BaseEntityResult, EntitySaveOptions, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { mjBizAppsOrdersEntitlementAccessOverrideEntity } from '@mj-biz-apps/orders-entities';
import type { mjBizAppsTasksTaskEntity } from '@mj-biz-apps/tasks-entities';
import { ACCESS_OVERRIDE_AUTH, UserMayRequestAccessOverride } from './AccessOverride.js';
import { ACCESS_OVERRIDE_ENTITY } from './PaymentGatedAccess.js';

@RegisterClass(BaseEntity, ACCESS_OVERRIDE_ENTITY)
export class EntitlementAccessOverrideEntityServer extends mjBizAppsOrdersEntitlementAccessOverrideEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const problem = await this.refusal();
        if (problem) {
            this.RegisterResultHistoryEntry(this.buildRejection(problem));
            return false;
        }
        // Closing a request stamps when, whichever path closed it.
        if (this.Status === 'Withdrawn' && !this.DecidedAt) this.DecidedAt = new Date();
        return super.Save(options);
    }

    private async refusal(): Promise<string | null> {
        const user = this.ContextCurrentUser;
        if (!user) return 'An access override can only be written by a known user.';

        if (!this.IsSaved) {
            if (this.Status !== 'Requested') return 'A new access override must start Requested.';
            if (!UUIDsEqual(this.RequestedByUserID, user.ID)) return 'An access override is requested in the name of the user saving it.';
            if (this.OverrideType !== 'WaivePaymentHold' && this.OverrideType !== 'DeferCutoff') {
                return `OverrideType must be WaivePaymentHold or DeferCutoff; got '${this.OverrideType}'.`;
            }
            if (!UserMayRequestAccessOverride(this.OverrideType, user, this.metadata)) {
                return `Requesting a ${this.OverrideType} override requires the ${ACCESS_OVERRIDE_AUTH[this.OverrideType]} authorization.`;
            }
            return null;
        }

        const from = this.GetFieldByName('Status')?.OldValue as string | undefined;
        if (from === this.Status) return null;

        switch (this.Status) {
            case 'Approved':
            case 'Rejected': {
                if (!UUIDsEqual(this.DecidedByUserID, user.ID)) return 'An access override decision is recorded in the name of the user making it.';
                const expected = this.Status === 'Approved' ? 'Completed' : 'Cancelled';
                const taskStatus = await this.approvalTaskStatus();
                if (taskStatus !== expected) {
                    return `An access override is ${this.Status} only through its approval task, which is ${taskStatus ?? 'missing'}.`;
                }
                return null;
            }
            case 'Withdrawn': {
                if (!this.ApprovalTaskID) return null;
                const taskStatus = await this.approvalTaskStatus();
                return taskStatus === 'Completed' || taskStatus === 'Cancelled'
                    ? null
                    : 'An access override is Withdrawn only once its approval task has closed.';
            }
            default:
                return null;
        }
    }

    private get metadata(): IMetadataProvider {
        return this.ProviderToUse as unknown as IMetadataProvider;
    }

    private async approvalTaskStatus(): Promise<string | null> {
        if (!this.ApprovalTaskID) return null;
        const task = await this.metadata.GetEntityObject<mjBizAppsTasksTaskEntity>('MJ_BizApps_Tasks: Tasks', this.ContextCurrentUser);
        return (await task.Load(this.ApprovalTaskID)) ? task.Status : null;
    }

    private buildRejection(message: string): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = message;
        result.OriginalValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadEntitlementAccessOverrideEntityServer(): void {
    // intentionally empty
}
