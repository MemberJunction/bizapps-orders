import { Component, OnChanges, SimpleChanges } from '@angular/core';
import { CompositeKey, Metadata, RunView, type RunViewParams } from '@memberjunction/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { inject } from '@angular/core';
import type { FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { DispatchFormNavigation } from '../form-navigation-helper';
import {
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersSubscriptionFormComponent } from '../../generated/Entities/mjBizAppsOrdersSubscription/mjbizappsorderssubscription.form.component';

export type SubscriptionFormPane = 'terms' | 'revRec' | 'stakeholders' | 'renewal' | 'entitlements' | 'details' | 'events' | 'systemMetadata';

const ACTIVE_PANE_SETTING = 'mj.orders.subscriptionForm.activePane';

/**
 * Custom Subscription form component with Responsive Left Navigation Workspace.
 *
 * Replaces standard stacked accordion forms with a streamlined left nav layout:
 * 1. Subscription Hero Header: Number, Status, Auto-Renew, Coverage window, Product, Stakeholders.
 * 2. Left Navigation Workspace Rail: Instant switching between Terms, Deferred Revenue Waterfall,
 *    Stakeholders, Renewal Rules, Entitlement Grants, Details, and Events.
 * 3. Interactive Term Deck: Color-coded cards for each term cycle with direct drill-downs.
 * 4. Multi-Term Deferred Revenue Waterfall: ASC 606 forward schedule with year dividers.
 */
@Component({
    standalone: false,
    selector: 'bizapps-subscription-form',
    templateUrl: './subscription-form.component.html',
    styleUrls: ['./subscription-form.component.css'],
})
export class BizAppsSubscriptionFormComponent extends mjBizAppsOrdersSubscriptionFormComponent implements OnChanges {
    public declare record: mjBizAppsOrdersSubscriptionEntity;

    public ActivePane: SubscriptionFormPane = 'terms';
    public SubscriptionTerms: mjBizAppsOrdersSubscriptionTermEntity[] = [];
    public SubscriptionTermLookup: { [termId: string]: { TermNumber: number; Label: string } } = {};
    public TermsViewMode: 'cards' | 'grid' = 'cards';

    public RevRecJournalEntries: mjBizAppsAccountingJournalEntryEntity[] = [];
    public RevRecLoading = false;
    public ActiveAccountingView: 'waterfall' | 'grid' = 'waterfall';
    public SubscriptionTermIDs: string[] = [];

    private _lastLoadedRecordId: string | null = null;

    protected navigationService = inject(NavigationService, { optional: true });

    override OnFormNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        DispatchFormNavigation(event, this.navigationService);
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'mJBizAppsOrdersSubscriptionTerms', sectionName: 'Terms', isExpanded: true },
            { sectionKey: 'stakeholders', sectionName: 'Stakeholders & Benefit Assignment', isExpanded: true },
            { sectionKey: 'renewalAndLifecycle', sectionName: 'Renewal & Lifecycle Settings', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersEntitlementGrants', sectionName: 'Granted Entitlements', isExpanded: true },
            { sectionKey: 'accountingAndJournalEntries', sectionName: 'Deferred Revenue & Rev-Rec Schedule', isExpanded: true },
            { sectionKey: 'subscriptionDetails', sectionName: 'Subscription Details & Entity Links', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Events Log', isExpanded: false },
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

    public SelectPane(pane: SubscriptionFormPane): void {
        this.ActivePane = pane;
        UserInfoEngine.Instance.SetSettingDebounced(ACTIVE_PANE_SETTING, pane);
    }

    private isValidPane(val: string): val is SubscriptionFormPane {
        return ['terms', 'revRec', 'stakeholders', 'renewal', 'entitlements', 'details', 'events', 'systemMetadata'].includes(val);
    }

    /**
     * Loads full coverage terms and revenue recognition Journal Entries.
     */
    public async LoadRevRecJournalEntries(): Promise<void> {
        if (!this.record?.ID) return;
        this.RevRecLoading = true;
        try {
            const rv = new RunView();
            const md = new Metadata();

            // 1. Fetch child SubscriptionTerm records
            const termsRes = await rv.RunView<mjBizAppsOrdersSubscriptionTermEntity>({
                EntityName: 'MJ_BizApps_Orders: Subscription Terms',
                ExtraFilter: `SubscriptionID = '${this.record.ID}'`,
                OrderBy: 'TermNumber ASC',
                ResultType: 'entity_object',
                MaxRows: 200,
            }, md.CurrentUser);

            const terms = (termsRes.Success && termsRes.Results) ? termsRes.Results : [];
            this.SubscriptionTerms = terms;
            this.SetSectionRowCount('mJBizAppsOrdersSubscriptionTerms', terms.length);

            const termIds = terms.map(t => t.ID);
            this.SubscriptionTermIDs = termIds;

            // Build term lookup for color-coding in waterfall
            const lookup: { [termId: string]: { TermNumber: number; Label: string } } = {};
            terms.forEach((t, idx) => {
                const termNum = t.TermNumber ?? (idx + 1);
                lookup[t.ID.toLowerCase()] = { TermNumber: termNum, Label: `Term ${termNum}` };
                lookup[t.ID.toUpperCase()] = { TermNumber: termNum, Label: `Term ${termNum}` };
            });
            this.SubscriptionTermLookup = lookup;

            const targetIds = [...termIds];
            if (this.record.OrderLineID) {
                targetIds.push(this.record.OrderLineID);
            }
            targetIds.push(this.record.ID);

            const quotedTargets = targetIds.map(id => `'${id}'`).join(',');
            const res = await rv.RunView<mjBizAppsAccountingJournalEntryEntity>(
                {
                    EntityName: 'MJ_BizApps_Accounting: Journal Entries',
                    ExtraFilter: `LinkedRecordID IN (${quotedTargets})`,
                    OrderBy: 'EffectiveDate ASC',
                    MaxRows: 500,
                    ResultType: 'entity_object',
                    IncludeRelatedRecords: ['Lines'],
                },
                md.CurrentUser,
            );

            if (res.Success && res.Results) {
                // Eagerly load lines for each JournalEntry so amounts & GL accounts are known
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

                // Filter for revenue recognition schedule entries (anchored to subscription terms)
                const recognitionEntries = res.Results.filter((je) => {
                    const desc = (je.Description || '').toLowerCase();
                    const typeStr = (je.EntryType || '').toLowerCase();
                    const isTerm = termIds.some((tid) => tid.toLowerCase() === String(je.LinkedRecordID).toLowerCase());
                    return isTerm || desc.includes('recognize') || typeStr.includes('recognition');
                });

                this.RevRecJournalEntries = recognitionEntries.length > 0 ? recognitionEntries : res.Results;
            }
        } finally {
            this.RevRecLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * FontAwesome icon representing recurring subscription service.
     */
    public get SubscriptionAvatarIcon(): string {
        return 'fa-solid fa-arrows-rotate';
    }

    /**
     * Returns the status chip CSS class reflecting subscription state.
     */
    public get StatusBadgeClass(): string {
        const status: mjBizAppsOrdersSubscriptionEntity['Status'] | undefined = this.record?.Status;
        switch (status) {
            case 'Active':
                return 'mjo-status-chip mjo-status-chip--active';
            case 'Trialing':
                return 'mjo-status-chip mjo-status-chip--info';
            case 'Paused':
                return 'mjo-status-chip mjo-status-chip--warning';
            case 'Canceled':
            case 'Migrated':
                return 'mjo-status-chip mjo-status-chip--inactive';
            default:
                return 'mjo-status-chip';
        }
    }

    /**
     * Returns term status badge class.
     */
    public GetTermStatusClass(status: string | null | undefined): string {
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
     * Returns color class for term index.
     */
    public GetTermBadgeClass(index: number): string {
        const mod = (index % 5) + 1;
        return `mjo-term-color--t${mod}`;
    }

    /**
     * Formats the active coverage date range.
     */
    public get FormattedCoverageWindow(): string {
        if (!this.record?.StartDate && !this.record?.EndDate) return '—';
        const startStr = this.record.StartDate ? new Date(this.record.StartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const endStr = this.record.EndDate ? new Date(this.record.EndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Indefinite';
        return `${startStr} – ${endStr}`;
    }

    public FormatDateRange(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
        if (!start && !end) return '—';
        const startStr = start ? new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const endStr = end ? new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Open-ended';
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
     * Resolves the primary holder organization or individual.
     */
    public get HolderDisplayName(): string {
        return this.record?.HolderOrganization || this.record?.HolderOrganizationID || '—';
    }

    /**
     * Resolves the beneficiary individual or group.
     */
    public get BeneficiaryDisplayName(): string {
        return this.record?.BeneficiaryPerson || this.record?.BeneficiaryPersonID || '—';
    }

    /**
     * Auto-renew pill class.
     */
    public get AutoRenewBadgeClass(): string {
        return this.record?.AutoRenew
            ? 'mjo-renew-chip mjo-renew-chip--on'
            : 'mjo-renew-chip mjo-renew-chip--off';
    }

    /**
     * View parameters for the linked Journal Entries grid.
     * Links by child SubscriptionTerm IDs, originating OrderLineID, or Subscription ID.
     */
    public get SubscriptionJournalEntryParams(): RunViewParams | null {
        if (!this.record?.IsSaved || !this.record?.ID) return null;
        const targetIds = [...this.SubscriptionTermIDs];
        if (this.record.OrderLineID) {
            targetIds.push(this.record.OrderLineID);
        }
        targetIds.push(this.record.ID);
        const quotedTargets = targetIds.map(id => `'${id}'`).join(',');
        return {
            EntityName: 'MJ_BizApps_Accounting: Journal Entries',
            ExtraFilter: `LinkedRecordID IN (${quotedTargets})`,
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

    public OnOpenTerm(term: mjBizAppsOrdersSubscriptionTermEntity): void {
        const pk = new CompositeKey();
        pk.LoadFromSingleKeyValuePair('ID', term.ID);
        this.OnFormNavigate({
            Kind: 'record',
            EntityName: 'MJ_BizApps_Orders: Subscription Terms',
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
export function LoadSubscriptionFormComponent(): void {
    // Anchors BizAppsSubscriptionFormComponent in bundlers
}
