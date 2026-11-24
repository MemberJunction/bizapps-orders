import { Component, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import {
    LoadAccessOverrideAssignees,
    OrdersRecordRefundRequestDecisionOperation,
    OrdersRefundPaymentOperation,
    OrdersRequestRefundOperation,
    OrdersWithdrawRefundRequestOperation,
    REFUND_REQUEST_ENTITY,
    RefundRequestDecisionRefusal,
    ToISODate,
    UserCanReverse,
    type AccessOverrideAssignee,
    type mjBizAppsOrdersPaymentHeaderEntity,
    type mjBizAppsOrdersRefundRequestEntity,
} from '@mj-biz-apps/orders-entities';
import { IsPaymentReversal } from './document-form.helpers';

const SECTION_KEY = 'refundRequests';

const STATUS_CHIP: Record<string, string> = {
    Requested: 'mjo-doc-chip mjo-doc-chip--warn',
    Approved: 'mjo-doc-chip mjo-doc-chip--ok',
    Issued: 'mjo-doc-chip mjo-doc-chip--ok',
    Rejected: 'mjo-doc-chip mjo-doc-chip--error',
    Withdrawn: 'mjo-doc-chip mjo-doc-chip--muted',
};

/** "A", "A and B", "A, B and C". */
const listNames = (names: string[]): string =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const sameUser = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Refund requests on a captured payment (bc-aidp-next-golive#355): no one approves their own refund.
 *
 * Finance (`MJ.BizApps.Orders.Order.Reverse`) requests a refund with an amount and a reason. The
 * request's approval task goes to approvers other than the requester; an assignee approves or rejects
 * here or in the Tasks inbox. Once approved, the requester issues the refund here, for the approved
 * amount. Approve and Reject are offered only to a viewer the server would let decide
 * (`RefundRequestDecisionRefusal`); everyone else sees whom the request is waiting on. All writes go
 * through the Orders operations, and the server re-checks every rule.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PaymentHeaders:refundRequests',
    metadata: {
        entity: 'MJ_BizApps_Orders: Payment Headers',
        slot: 'after-related',
        sortKey: 85,
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-payment-refund-requests-panel',
    templateUrl: './payment-refund-requests.panel.html',
    styleUrls: ['./document-hero.css', './order-access-overrides.panel.css'],
})
export class PaymentRefundRequestsPanel extends BaseFormPanel<mjBizAppsOrdersPaymentHeaderEntity> implements OnInit {
    public readonly SectionKey = SECTION_KEY;

    public Loading = false;
    public Busy = false;
    public Error: string | null = null;
    public Notice: string | null = null;
    public Requests: mjBizAppsOrdersRefundRequestEntity[] = [];
    /** Whether the viewer holds the finance reversal authorization, and so may request a refund. */
    public MayRequest = false;

    public ShowRequest = false;
    public NewAmount: number | null = null;
    public NewReason = '';
    public DecisionNotes: Record<string, string> = {};
    /** The approval task assignees of each open request, keyed by task ID in lower case. */
    public Assignees = new Map<string, AccessOverrideAssignee[]>();
    /** Set when the assignees could not be read; no decision is offered then. */
    public AssigneesError: string | null = null;

    public async ngOnInit(): Promise<void> {
        const provider = this.FormComponent.ProviderToUse;
        this.MayRequest = UserCanReverse(provider.CurrentUser, provider);
        await this.load();
    }

    /** A refund is requested on a captured payment that is not itself a refund or reversal. */
    public get Refundable(): boolean {
        return this.Record.IsSaved && this.Record.Status === 'Captured' && !IsPaymentReversal(this.Record);
    }

    /** The payment has a Requested or Approved request, so another must wait. */
    public get HasOpenRequest(): boolean {
        return this.Requests.some((r) => r.Status === 'Requested' || r.Status === 'Approved');
    }

    public get CanOfferRequest(): boolean {
        return this.MayRequest && this.Refundable && !this.HasOpenRequest && !this.ShowRequest;
    }

    public ChipClass(status: string): string {
        return STATUS_CHIP[status] ?? 'mjo-doc-chip';
    }

    public Day(value: Date | string | null | undefined): string {
        return ToISODate(value) ?? '—';
    }

    public Money(value: number | null | undefined): string {
        return value == null ? '—' : Number(value).toFixed(2);
    }

    public AssigneesOf(r: mjBizAppsOrdersRefundRequestEntity): AccessOverrideAssignee[] {
        return r.ApprovalTaskID ? (this.Assignees.get(r.ApprovalTaskID.toLowerCase()) ?? []) : [];
    }

    private get me(): string {
        return this.FormComponent.ProviderToUse.CurrentUser?.ID ?? '';
    }

    public IsMine(r: mjBizAppsOrdersRefundRequestEntity): boolean {
        return sameUser(r.RequestedByUserID, this.me);
    }

    /** Approve and Reject are offered to an assignee who is not the requester; the server's own rule. */
    public CanDecide(r: mjBizAppsOrdersRefundRequestEntity): boolean {
        if (r.Status !== 'Requested' || !r.ApprovalTaskID || this.AssigneesError) return false;
        return (
            RefundRequestDecisionRefusal({
                DeciderUserID: this.me,
                RequesterUserID: r.RequestedByUserID,
                AssigneeUserIDs: this.AssigneesOf(r).flatMap((a) => (a.UserID ? [a.UserID] : [])),
            }) === null
        );
    }

    /** For a viewer who may not decide an open request: whom it is waiting on. */
    public WaitingOn(r: mjBizAppsOrdersRefundRequestEntity): string {
        if (this.AssigneesError) return this.AssigneesError;
        const names = this.AssigneesOf(r).map((a) => a.Name);
        if (!names.length) return 'Waiting on approval, but its approval task has no assignee, so no one can decide it here.';
        return `Waiting on ${listNames(names)}.${this.IsMine(r) ? ' You requested it, so you cannot approve it.' : ''}`;
    }

    public get CanSubmit(): boolean {
        return !this.Busy && this.NewAmount != null && this.NewAmount > 0 && !!this.NewReason.trim();
    }

    public async Submit(): Promise<void> {
        if (!this.CanSubmit || this.NewAmount == null) return;
        const amount = Math.round(this.NewAmount * 100) / 100;
        await this.run(async () => {
            const result = await new OrdersRequestRefundOperation().Execute({ PaymentHeaderID: this.Record.ID, Amount: amount, Reason: this.NewReason.trim() });
            if (!result.Success || !result.Output?.Success) throw new Error(result.Output?.Message ?? result.ErrorMessage ?? 'The request failed.');
            this.ShowRequest = false;
            this.NewAmount = null;
            this.NewReason = '';
            return result.Output.Message ?? null;
        });
    }

    public async Decide(r: mjBizAppsOrdersRefundRequestEntity, outcome: 'Approved' | 'Rejected'): Promise<void> {
        await this.run(async () => {
            const result = await new OrdersRecordRefundRequestDecisionOperation().Execute({
                RefundRequestID: r.ID,
                Outcome: outcome,
                Notes: this.DecisionNotes[r.ID]?.trim() || undefined,
            });
            if (!result.Success || !result.Output?.Success) throw new Error(result.Output?.Message ?? result.ErrorMessage ?? 'The decision failed.');
            return null;
        });
    }

    public async Withdraw(r: mjBizAppsOrdersRefundRequestEntity): Promise<void> {
        await this.run(async () => {
            const result = await new OrdersWithdrawRefundRequestOperation().Execute({ RefundRequestID: r.ID });
            if (!result.Success || !result.Output?.Success) throw new Error(result.Output?.Message ?? result.ErrorMessage ?? 'The withdrawal failed.');
            return null;
        });
    }

    /** The requester issues the approved refund, for the approved amount. */
    public async Issue(r: mjBizAppsOrdersRefundRequestEntity): Promise<void> {
        await this.run(async () => {
            const result = await new OrdersRefundPaymentOperation().Execute({ PaymentHeaderID: this.Record.ID, Amount: r.Amount, Reason: r.Reason });
            if (!result.Success || !result.Output?.Success) throw new Error(result.Output?.Message ?? result.ErrorMessage ?? 'The refund could not be issued.');
            return result.Output.Message ?? null;
        });
    }

    private async run(work: () => Promise<string | null>): Promise<void> {
        this.Busy = true;
        this.Error = null;
        this.Notice = null;
        try {
            this.Notice = await work();
            await this.load();
        } catch (err) {
            this.Error = err instanceof Error ? err.message : String(err);
        } finally {
            this.Busy = false;
            this.FormComponent.cdr.detectChanges();
        }
    }

    private async load(): Promise<void> {
        if (!this.Record.IsSaved) return;
        this.Loading = true;
        try {
            const provider = this.FormComponent.ProviderToUse;
            const res = await RunView.FromMetadataProvider(provider).RunView<mjBizAppsOrdersRefundRequestEntity>(
                { EntityName: REFUND_REQUEST_ENTITY, ExtraFilter: `PaymentHeaderID = '${this.Record.ID}'`, OrderBy: 'RequestedAt DESC', ResultType: 'entity_object' },
                provider.CurrentUser,
            );
            if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not load refund requests.');
            this.Requests = res.Results ?? [];
            this.FormComponent.SetSectionRowCount(SECTION_KEY, this.Requests.length);
            await this.loadDeciders();
        } catch (err) {
            this.Error = err instanceof Error ? err.message : String(err);
        } finally {
            this.Loading = false;
            this.FormComponent.cdr.detectChanges();
        }
    }

    private async loadDeciders(): Promise<void> {
        const taskIDs = this.Requests.filter((r) => r.Status === 'Requested' && r.ApprovalTaskID).map((r) => r.ApprovalTaskID as string);
        this.Assignees = new Map();
        this.AssigneesError = null;
        if (!taskIDs.length) return;
        const provider = this.FormComponent.ProviderToUse;
        try {
            this.Assignees = await LoadAccessOverrideAssignees(taskIDs, provider, provider.CurrentUser);
        } catch (err) {
            this.AssigneesError = `Could not read who these requests are waiting on: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
}
