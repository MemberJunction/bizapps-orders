import { Component, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import {
    OrdersRecordAccessOverrideDecisionOperation,
    OrdersRequestAccessOverrideOperation,
    ToISODate,
    userRequestableAccessOverrides,
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

/**
 * Access overrides on an order (bizapps-orders#268): the record of every exception to payment-gated
 * access, a request form offering the override types the viewer is authorized to request, and
 * approve / reject on open requests. Who may approve is not settled (bizapps-orders#360), so the
 * decision buttons are not gated here. All writes go through the Orders operations; the server
 * re-checks the request authorization.
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

    /** Approve and Reject are offered on an open request with an approval task. */
    public CanDecide(o: mjBizAppsOrdersEntitlementAccessOverrideEntity): boolean {
        return o.Status === 'Requested' && !!o.ApprovalTaskID;
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
        } catch (err) {
            this.Error = err instanceof Error ? err.message : String(err);
        } finally {
            this.Loading = false;
            this.FormComponent.cdr.detectChanges();
        }
    }
}
