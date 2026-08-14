import { Component } from '@angular/core';
import type { RunViewParams } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {
    mjBizAppsOrdersSubscriptionEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersSubscriptionFormComponent } from '../../generated/Entities/mjBizAppsOrdersSubscription/mjbizappsorderssubscription.form.component';

/**
 * Custom Subscription form component overriding the CodeGen-generated form.
 *
 * Extends the generated form component so it wins @RegisterClass priority in
 * MemberJunction's ClassFactory.
 *
 * User-centric layout order:
 * 1. Coverage Terms & Cycles: Current and historical coverage periods, renewal cycles, and billing.
 * 2. Stakeholders & Assignment: Holder organization (payer) vs Beneficiary person (user).
 * 3. Renewal & Lifecycle Settings: Auto-renew rules, lead days, migration links, and dates.
 * 4. Granted Entitlements: Unlocked software permissions, seats, and license grants.
 * 5. Accounting & Linked Journal Entries: Revenue recognition ledger entries.
 * 6. Subscription Details & Technical Links: Product, Company, and originating Order Line ID.
 * 7. Subscription Events Log: Chronological lifecycle audit trail.
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Subscriptions')
@Component({
    standalone: false,
    selector: 'bizapps-subscription-form',
    templateUrl: './subscription-form.component.html',
    styleUrls: ['./subscription-form.component.css'],
})
export class BizAppsSubscriptionFormComponent extends mjBizAppsOrdersSubscriptionFormComponent {
    public declare record: mjBizAppsOrdersSubscriptionEntity;

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'mJBizAppsOrdersSubscriptionTerms', sectionName: 'Coverage Terms & Cycles', isExpanded: true },
            { sectionKey: 'stakeholders', sectionName: 'Stakeholders & Benefit Assignment', isExpanded: true },
            { sectionKey: 'renewalAndLifecycle', sectionName: 'Renewal & Lifecycle Settings', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersEntitlementGrants', sectionName: 'Granted Entitlements', isExpanded: true },
            { sectionKey: 'accountingAndJournalEntries', sectionName: 'Accounting & Linked Journal Entries', isExpanded: true },
            { sectionKey: 'subscriptionDetails', sectionName: 'Subscription Details & Entity Links', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Events Log', isExpanded: false },
        ]);
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
     * Formats the active coverage date range.
     */
    public get FormattedCoverageWindow(): string {
        if (!this.record?.StartDate && !this.record?.EndDate) return '—';
        const startStr = this.record.StartDate ? new Date(this.record.StartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const endStr = this.record.EndDate ? new Date(this.record.EndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Indefinite';
        return `${startStr} – ${endStr}`;
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
     * Links by the originating OrderLineID or the Subscription ID itself.
     */
    public get SubscriptionJournalEntryParams(): RunViewParams | null {
        if (!this.record?.IsSaved || !this.record?.ID) return null;
        const filters: string[] = [];
        if (this.record.OrderLineID) {
            filters.push(`LinkedRecordID = '${this.record.OrderLineID}'`);
        }
        filters.push(`LinkedRecordID = '${this.record.ID}'`);
        return {
            EntityName: 'MJ_BizApps_Accounting: Journal Entries',
            ExtraFilter: filters.join(' OR '),
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        };
    }

    /**
     * Called when a child record or related widget mutates data.
     */
    public async OnWidgetDataChanged(): Promise<void> {
        if (!this.record.Dirty) {
            await this.record.InnerLoad(this.record.PrimaryKey);
            this.cdr.detectChanges();
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadSubscriptionFormComponent(): void {
    // Anchors BizAppsSubscriptionFormComponent in bundlers
}
