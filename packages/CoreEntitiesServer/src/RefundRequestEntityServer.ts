/**
 * RefundRequest server subclass — how a refund request may be written (bc-aidp-next-golive#355).
 *
 * The migration's trigger keeps the request and the decision from being rewritten and limits the
 * status moves. What it cannot see is authorization and the approval task, so those live here:
 *
 *   · A new request is written Requested, by the user named as its requester, who holds the finance
 *     reversal authorization (`MJ.BizApps.Orders.Order.Reverse`).
 *   · Approved or Rejected is written by the user named as the decider, and only once the approval
 *     task has closed the matching way (Completed for Approved, Cancelled for Rejected). Editing the
 *     row directly therefore cannot stand in for the approval. The decider must be one of the task's
 *     assignees and not the requester (`RefundDecisionRefusalFor`).
 *   · Withdrawn from Requested needs the approval task closed, or no task at all; from Approved, the
 *     requester's own save.
 *   · Issued needs a refund payment that reverses the request's payment, saved by the requester.
 *
 * `RefundRequest.ts` is the path that satisfies these; this class is what stops any other.
 */
import { BaseEntity, BaseEntityResult, EntitySaveOptions, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { REFUND_REQUEST_ENTITY, mjBizAppsOrdersRefundRequestEntity, type mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import type { mjBizAppsTasksTaskEntity } from '@mj-biz-apps/tasks-entities';
import { RefundDecisionRefusalFor } from './RefundRequest.js';
import { ReversalGate } from './ReversalAuthority.js';

@RegisterClass(BaseEntity, REFUND_REQUEST_ENTITY)
export class RefundRequestEntityServer extends mjBizAppsOrdersRefundRequestEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const problem = await this.refusal();
        if (problem) {
            this.RegisterResultHistoryEntry(this.buildRejection(problem));
            return false;
        }
        if (this.Status === 'Withdrawn' && !this.DecidedAt) this.DecidedAt = new Date();
        return super.Save(options);
    }

    private async refusal(): Promise<string | null> {
        const user = this.ContextCurrentUser;
        if (!user) return 'A refund request can only be written by a known user.';

        if (!this.IsSaved) {
            if (this.Status !== 'Requested') return 'A new refund request must start Requested.';
            if (!UUIDsEqual(this.RequestedByUserID, user.ID)) return 'A refund request is made in the name of the user saving it.';
            return ReversalGate('Requesting a refund', this.metadata, user);
        }

        const from = this.GetFieldByName('Status')?.OldValue as string | undefined;
        if (from === this.Status) return null;

        switch (this.Status) {
            case 'Approved':
            case 'Rejected': {
                if (!UUIDsEqual(this.DecidedByUserID, user.ID)) return 'A refund request decision is recorded in the name of the user making it.';
                const expected = this.Status === 'Approved' ? 'Completed' : 'Cancelled';
                const taskStatus = await this.approvalTaskStatus();
                if (taskStatus !== expected) return `A refund request is ${this.Status} only through its approval task, which is ${taskStatus ?? 'missing'}.`;
                return RefundDecisionRefusalFor(this, user.ID, this.metadata, user);
            }
            case 'Withdrawn': {
                if (from === 'Approved') {
                    return UUIDsEqual(this.RequestedByUserID, user.ID) ? null : 'Only the person who requested a refund may withdraw it once approved.';
                }
                if (!this.ApprovalTaskID) return null;
                const taskStatus = await this.approvalTaskStatus();
                return taskStatus === 'Completed' || taskStatus === 'Cancelled' ? null : 'A refund request is Withdrawn only once its approval task has closed.';
            }
            case 'Issued':
                return this.issuedRefusal();
            default:
                return null;
        }
    }

    private async issuedRefusal(): Promise<string | null> {
        if (!UUIDsEqual(this.RequestedByUserID, this.ContextCurrentUser?.ID)) return 'An approved refund is issued by the person who requested it.';
        if (!this.RefundPaymentHeaderID) return 'An issued refund request names the refund payment it became.';
        const refund = await this.metadata.GetEntityObject<mjBizAppsOrdersPaymentHeaderEntity>('MJ_BizApps_Orders: Payment Headers', this.ContextCurrentUser);
        if (!(await refund.Load(this.RefundPaymentHeaderID))) return 'The refund payment named on the request was not found.';
        return UUIDsEqual(refund.ReversesPaymentHeaderID, this.PaymentHeaderID)
            ? null
            : "The refund payment named on the request does not reverse the request's payment.";
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
export function LoadRefundRequestEntityServer(): void {
    // intentionally empty
}
