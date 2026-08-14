import { Component, OnInit } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsCommonOrganizationEntity } from '@mj-biz-apps/common-entities';
import type { MJOSummaryFigure } from '../panels/summary-strip.component';
import { LoadPartyOrderFigures } from './party-order-stats';

/**
 * Last-wins Organization header: Common identity + cheap order stats.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Organizations:header',
    priority: 10,
    metadata: {
        entity: 'MJ_BizApps_Common: Organizations',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
        replacesSectionKey: 'organizationIdentity',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-organization-header-panel',
    template: `
        <bizapps-organization-identity
            [Record]="Record"
            [EditMode]="EditMode"
            [FormContext]="FormContext"
            (Navigate)="FormComponent.OnFormNavigate($event)">
            @if (Figures.length > 0) {
                <mjo-summary-strip [Figures]="Figures" Note="Lifetime for this organization as bill-to / holder."></mjo-summary-strip>
            }
        </bizapps-organization-identity>
    `,
})
export class OrdersOrganizationHeaderPanel extends BaseFormPanel<mjBizAppsCommonOrganizationEntity> implements OnInit {
    public Figures: MJOSummaryFigure[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) {
            return;
        }
        this.Figures = await LoadPartyOrderFigures(
            'organization',
            this.Record.ID,
            this.FormComponent.ProviderToUse,
            this.FormComponent.RunQueryToUse,
        );
        this.FormComponent.cdr.detectChanges();
    }
}
