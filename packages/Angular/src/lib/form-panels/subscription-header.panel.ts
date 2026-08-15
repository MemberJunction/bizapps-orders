import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { FormatCoverageWindow, SubscriptionStatusChipClass } from './document-form.helpers';

/**
 * Subscription identity strip. Generated field panels stay under Details.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Subscriptions:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Subscriptions',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-subscription-header-panel',
    templateUrl: './subscription-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class SubscriptionHeaderPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionEntity> {
    public get Title(): string {
        return this.Record.SubscriptionNumber || 'New subscription';
    }

    public get StatusClass(): string {
        return SubscriptionStatusChipClass(this.Record.Status);
    }

    public get AutoRenewClass(): string {
        return this.Record.AutoRenew ? 'mjo-doc-chip mjo-doc-chip--on' : 'mjo-doc-chip mjo-doc-chip--off';
    }

    public get Coverage(): string {
        return FormatCoverageWindow(this.Record.StartDate, this.Record.EndDate);
    }

    public get Holder(): string {
        return this.Record.HolderOrganization || '—';
    }

    public get Beneficiary(): string {
        return this.Record.BeneficiaryPerson || '—';
    }
}
