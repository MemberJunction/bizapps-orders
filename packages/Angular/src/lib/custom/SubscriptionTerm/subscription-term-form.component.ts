import { Component, OnChanges, SimpleChanges } from '@angular/core';
import { CompositeKey, Metadata, RunView, type RunViewParams } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { inject } from '@angular/core';
import type { FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { DispatchFormNavigation } from '../form-navigation-helper';
import {
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersSubscriptionTermFormComponent } from '../../generated/Entities/mjBizAppsOrdersSubscriptionTerm/mjbizappsorderssubscriptionterm.form.component';

export type SubscriptionTermPane = 'revRec' | 'timeline' | 'financial' | 'context' | 'entitlements' | 'systemMetadata';

const ACTIVE_PANE_SETTING = 'mj.orders.subscriptionTermForm.activePane';

/**
 * Custom Subscription Term form component with Responsive Left Navigation Workspace.
 *
 * Scopes the Deferred Revenue Waterfall widget specifically to this single term's
 * revenue recognition schedule entries and provides instant drill-downs.
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Subscription Terms')
@Component({
    standalone: false,
    selector: 'bizapps-subscription-term-form',
    templateUrl: './subscription-term-form.component.html',
    styleUrls: ['./subscription-term-form.component.css'],
})
export class BizAppsSubscriptionTermFormComponent extends mjBizAppsOrdersSubscriptionTermFormComponent implements OnChanges {
    public declare record: mjBizAppsOrdersSubscriptionTermEntity;

    public ActivePane: SubscriptionTermPane = 'revRec';
    public RevRecJournalEntries: mjBizAppsAccountingJournalEntryEntity[] = [];
    public RevRecLoading = false;
    public ActiveAccountingView: 'waterfall' | 'grid' = 'waterfall';

    private _lastLoadedRecordId: string | null = null;

    protected navigationService = inject(NavigationService, { optional: true });

    override OnFormNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        DispatchFormNavigation(event, this.navigationService);
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'accountingAndJournalEntries', sectionName: 'Deferred Revenue & Rev-Rec Schedule', isExpanded: true },
            { sectionKey: 'termTimeline', sectionName: 'Term Timeline & Coverage Dates', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial & Proration Details', isExpanded: true },
            { sectionKey: 'subscriptionContext', sectionName: 'Subscription & Order Context', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersEntitlementGrants', sectionName: 'Granted Entitlements', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
        ]);

        const savedPane = UserInfoEngine.Instance.GetSetting(ACTIVE_PANE_SETTING);
        if (savedPane && this.isValidPane(savedPane)) {
            this.ActivePane = savedPane;
        }

        if (this.record?.IsSaved && this.record?.ID && this.record.ID !== this._lastLoadedRecordId) {
            this._lastLoadedRecordId = this.record.ID;
            await this.LoadRevRecJournalEntries();
        }
    }

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        if (this.record?.IsSaved && this.record?.ID && this.record.ID !== this._lastLoadedRecordId) {
            this._lastLoadedRecordId = this.record.ID;
            await this.LoadRevRecJournalEntries();
        }
    }

    public SelectPane(pane: SubscriptionTermPane): void {
        this.ActivePane = pane;
        UserInfoEngine.Instance.SetSettingDebounced(ACTIVE_PANE_SETTING, pane);
    }

    private isValidPane(val: string): val is SubscriptionTermPane {
        return ['revRec', 'timeline', 'financial', 'context', 'entitlements', 'systemMetadata'].includes(val);
    }

    /**
     * Loads revenue recognition Journal Entries linked strictly to this specific term.
     */
    public async LoadRevRecJournalEntries(): Promise<void> {
        if (!this.record?.ID) return;
        this.RevRecLoading = true;
        try {
            const rv = new RunView();
            const md = new Metadata();

            const res = await rv.RunView<mjBizAppsAccountingJournalEntryEntity>(
                {
                    EntityName: 'MJ_BizApps_Accounting: Journal Entries',
                    ExtraFilter: `LinkedRecordID = '${this.record.ID}'`,
                    OrderBy: 'EffectiveDate ASC',
                    MaxRows: 200,
                    ResultType: 'entity_object',
                },
                md.CurrentUser,
            );

            if (res.Success && res.Results) {
                // Eagerly load lines for each JournalEntry
                await Promise.all(
                    res.Results.map(async (je) => {
                        try {
                            if (je.Lines && typeof je.Lines.Load === 'function') {
                                await je.Lines.Load();
                            }
                        } catch {
                            // ignore line load error
                        }
                    })
                );
                this.RevRecJournalEntries = res.Results;
            }
        } finally {
            this.RevRecLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Avatar icon representing recurring term cycle.
     */
    public get TermAvatarIcon(): string {
        return 'fa-solid fa-clock-rotate-left';
    }

    /**
     * Status badge CSS class.
     */
    public get StatusBadgeClass(): string {
        const status = this.record?.Status;
        switch (status) {
            case 'Active':
                return 'mjo-status-chip mjo-status-chip--active';
            case 'Scheduled':
                return 'mjo-status-chip mjo-status-chip--info';
            case 'Completed':
                return 'mjo-status-chip mjo-status-chip--secondary';
            case 'Canceled':
            case 'Lapsed':
                return 'mjo-status-chip mjo-status-chip--inactive';
            default:
                return 'mjo-status-chip';
        }
    }

    /**
     * Formats coverage date range.
     */
    public get FormattedCoverageWindow(): string {
        if (!this.record?.StartDate && !this.record?.EndDate) return '—';
        const startStr = this.record.StartDate ? new Date(this.record.StartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const endStr = this.record.EndDate ? new Date(this.record.EndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Indefinite';
        return `${startStr} – ${endStr}`;
    }

    public FormatMoney(amt: number | null | undefined): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amt ?? 0);
    }

    /**
     * View parameters for the linked Journal Entries grid.
     */
    public get TermJournalEntryParams(): RunViewParams | null {
        if (!this.record?.IsSaved || !this.record?.ID) return null;
        return {
            EntityName: 'MJ_BizApps_Accounting: Journal Entries',
            ExtraFilter: `LinkedRecordID = '${this.record.ID}'`,
            OrderBy: 'EffectiveDate ASC',
            ResultType: 'entity_object',
        };
    }

    public OnJournalEntrySelected(je: mjBizAppsAccountingJournalEntryEntity): void {
        const pk = new CompositeKey();
        pk.LoadFromSingleKeyValuePair('ID', je.ID);
        this.OnFormNavigate({
            Kind: 'record',
            EntityName: 'MJ_BizApps_Accounting: Journal Entries',
            PrimaryKey: pk,
        });
    }

    /**
     * Called when a child record or related widget mutates data.
     */
    public async OnWidgetDataChanged(): Promise<void> {
        if (!this.record.Dirty) {
            await this.record.InnerLoad(this.record.PrimaryKey);
            await this.LoadRevRecJournalEntries();
            this.cdr.detectChanges();
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadSubscriptionTermFormComponent(): void {
    // Anchors BizAppsSubscriptionTermFormComponent in bundlers
}
