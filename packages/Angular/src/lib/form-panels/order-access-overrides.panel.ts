import { Component, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import {
    AccessOverrideDecisionRefusal,
    LoadAccessOverrideAssignees,
    OrdersRecordAccessOverrideDecisionOperation,
    OrdersRequestAccessOverrideOperation,
    ToISODate,
    userRequestableAccessOverrides,
    type AccessOverrideAssignee,
    type AccessOverrideKind,
    type mjBizAppsOrdersEntitlementAccessOverrideEntity,
    type mjBizAppsOrdersOrderHeaderEntity,
} from '@mj-biz-apps/orders-entities';

const SECTION_KEY = 'accessOverrides';
const OVERRIDE_ENTITY = 'MJ_BizApps_Orders: Entitlement Access Overrides';

export const OVERRIDE_TYPE_LABELS: Record<AccessOverrideKind, string> = {
    WaivePaymentHold: 'Waive payment hold',
    DeferCutoff: 'Defer renewal cutoff',
};

const STATUS_CHIP: Record<string, string> = {
    Requested: 'mjo-doc-chip mjo-doc-chip--warn',
    Approved: 'mjo-doc-chip mjo-doc-chip--ok',
    Rejected: 'mjo-doc-chip mjo-doc-chip--error',
    Withdrawn: 'mjo-doc-chip mjo-doc-chip--muted',
    Expired: 'mjo-doc-chip mjo-doc-chip--muted',
};

/** "A", "A and B", "A, B and C". */
const listNames = (names: string[]): string =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * Access overrides on an order (bizapps-orders#268): the record of every exception to payment-gated
 * access, a request form offering the override types the viewer is authorized to request, and
 * approve / reject on open requests.
 *
 * Approve and Reject are offered only to a viewer the server would let decide: an assignee of the
 * approval task who is not the requester, and Approve only on or before the override's last day
 * (`AccessOverrideDecisionRefusal`, bizapps-orders#360/#517). Everyone else sees whom the request is
 * waiting on. All writes go through the Orders operations, and the server re-checks every rule.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:OrderHeaders:accessOverrides',
    metadata: {
        entity: 'MJ_BizApps_Orders: Order Headers',
        slot: 'after-related',
        sortKey: 90,
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-order-access-overrides-panel',
    templateUrl: './order-access-overrides.panel.html',
    styleUrls: ['./document-hero.css', './order-access-overrides.panel.css'],
})
export class OrderAccessOverridesPanel extends BaseFormPanel<mjBizAppsOrdersOrderHeaderEntity> implements OnInit {
    public readonly SectionKey = SECTION_KEY;
    public readonly TypeLabels = OVERRIDE_TYPE_LABELS;

    public Loading = false;
    public Busy = false;
    public Error: string | null = null;
    public Overrides: mjBizAppsOrdersEntitlementAccessOverrideEntity[] = [];
    /** The override types the viewer may request. */
    public Types: AccessOverrideKind[] = [];

    public ShowRequest = false;
    public NewType: AccessOverrideKind = 'DeferCutoff';
    public NewThrough = '';
    public NewReason = '';
    public DecisionNotes: Record<string, string> = {};
    /** The approval task assignees of each open request, keyed by task ID in lower case. */
    public Assignees = new Map<string, AccessOverrideAssignee[]>();
    /** Set when the assignees could not be read; no decision is offered then. */
    public AssigneesError: string | null = null;
    /** The business day, `YYYY-MM-DD`, as the server reads it for the last-day rule. */
    public Today = '';

    public async ngOnInit(): Promise<void> {
        const provider = this.FormComponent.ProviderToUse;
        this.Types = userRequestableAccessOverrides(provider.CurrentUser, provider);
        if (this.Types.length) this.NewType = this.Types[0];
        await this.load();
    }

    public ChipClass(status: string): string {
        return STATUS_CHIP[status] ?? 'mjo-doc-chip';
    }

    public Day(value: Date | string | null | undefined): string {
        return ToISODate(value) ?? '—';
    }

    public TypeLabel(type: string): string {
        return OVERRIDE_TYPE_LABELS[type as AccessOverrideKind] ?? type;
    }

    /** The approval task's assignees, or none when the request has no task or they could not be read. */
    public AssigneesOf(o: mjBizAppsOrdersEntitlementAccessOverrideEntity): AccessOverrideAssignee[] {
        return o.ApprovalTaskID ? (this.Assignees.get(o.ApprovalTaskID.toLowerCase()) ?? []) : [];
    }

    /** Why the viewer may not record this decision, or null when they may; the server's own rule. */
    public Refusal(o: mjBizAppsOrdersEntitlementAccessOverrideEntity, approving: boolean): string | null {
        if (o.Status !== 'Requested' || !o.ApprovalTaskID) return 'The request is not open.';
        if (this.AssigneesError) return this.AssigneesError;
        return AccessOverrideDecisionRefusal({
            Approving: approving,
            DeciderUserID: this.FormComponent.ProviderToUse.CurrentUser?.ID ?? '',
            RequesterUserID: o.RequestedByUserID,
            AssigneeUserIDs: this.AssigneesOf(o).flatMap((a) => (a.UserID ? [a.UserID] : [])),
            EffectiveThrough: ToISODate(o.EffectiveThrough) ?? '',
            Today: this.Today,
        });
    }

    /** Reject is offered to an assignee who is not the requester. */
    public CanReject(o: mjBizAppsOrdersEntitlementAccessOverrideEntity): boolean {
        return this.Refusal(o, false) === null;
    }

    /** Approve is offered to the same viewer, on or before the override's last day. */
    public CanApprove(o: mjBizAppsOrdersEntitlementAccessOverrideEntity): boolean {
        return this.Refusal(o, true) === null;
    }

    /** Why a viewer who may reject may not approve (the last day has passed), or null. */
    public ApproveNote(o: mjBizAppsOrdersEntitlementAccessOverrideEntity): string | null {
        return this.CanReject(o) ? this.Refusal(o, true) : null;
    }

    /** For a viewer who may not decide an open request: whom it is waiting on. */
    public WaitingOn(o: mjBizAppsOrdersEntitlementAccessOverrideEntity): string {
        if (this.AssigneesError) return this.AssigneesError;
        const names = this.AssigneesOf(o).map((a) => a.Name);
        if (!names.length) return 'Waiting on approval, but its approval task has no assignee, so no one can decide it here.';
        const me = this.FormComponent.ProviderToUse.CurrentUser?.ID;
        const mine = !!me && o.RequestedByUserID?.toLowerCase() === me.toLowerCase();
        return `Waiting on ${listNames(names)}.${mine ? ' You requested it, so you cannot decide it.' : ''}`;
    }

    public get CanSubmit(): boolean {
        return !this.Busy && this.Types.includes(this.NewType) && !!this.NewReason.trim() && /^\d{4}-\d{2}-\d{2}$/.test(this.NewThrough);
    }

    public async Submit(): Promise<void> {
        if (!this.CanSubmit) return;
        await this.run(async () => {
            const result = await new OrdersRequestAccessOverrideOperation().Execute({
                OrderHeaderID: this.Record.ID,
                OverrideType: this.NewType,
                Reason: this.NewReason.trim(),
                EffectiveThrough: this.NewThrough,
            });
            if (!result.Success || !result.Output?.Success) throw new Error(result.Output?.Message ?? result.ErrorMessage ?? 'The request failed.');
            this.ShowRequest = false;
            this.NewReason = '';
            this.NewThrough = '';
        });
    }

    public async Decide(o: mjBizAppsOrdersEntitlementAccessOverrideEntity, outcome: 'Approved' | 'Rejected'): Promise<void> {
        await this.run(async () => {
            const result = await new OrdersRecordAccessOverrideDecisionOperation().Execute({
                AccessOverrideID: o.ID,
                Outcome: outcome,
                Notes: this.DecisionNotes[o.ID]?.trim() || undefined,
            });
            if (!result.Success || !result.Output?.Success) throw new Error(result.Output?.Message ?? result.ErrorMessage ?? 'The decision failed.');
        });
    }

    private async run(work: () => Promise<void>): Promise<void> {
        this.Busy = true;
        this.Error = null;
        try {
            await work();
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
            const res = await RunView.FromMetadataProvider(provider).RunView<mjBizAppsOrdersEntitlementAccessOverrideEntity>(
                {
                    EntityName: OVERRIDE_ENTITY,
                    ExtraFilter: `OrderHeaderID = '${this.Record.ID}'`,
                    OrderBy: 'RequestedAt DESC',
                    ResultType: 'entity_object',
                },
                provider.CurrentUser,
            );
            if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not load access overrides.');
            this.Overrides = res.Results ?? [];
            this.FormComponent.SetSectionRowCount(SECTION_KEY, this.Overrides.length);
            await this.loadDeciders();
        } catch (err) {
            this.Error = err instanceof Error ? err.message : String(err);
        } finally {
            this.Loading = false;
            this.FormComponent.cdr.detectChanges();
        }
    }

    /** The assignees of every open request, and the business day, for the decision rule. */
    private async loadDeciders(): Promise<void> {
        const taskIDs = this.Overrides.filter((o) => o.Status === 'Requested' && o.ApprovalTaskID).map((o) => o.ApprovalTaskID as string);
        this.Assignees = new Map();
        this.AssigneesError = null;
        if (!taskIDs.length) return;
        const provider = this.FormComponent.ProviderToUse;
        try {
            await BusinessTimeZoneEngine.Instance.Config(false, provider.CurrentUser, provider);
            this.Today = BusinessTimeZoneEngine.Instance.Today();
            this.Assignees = await LoadAccessOverrideAssignees(taskIDs, provider, provider.CurrentUser);
        } catch (err) {
            this.AssigneesError = `Could not read who these requests are waiting on: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
}
