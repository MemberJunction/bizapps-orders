import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsCommonOrganizationEntity } from '@mj-biz-apps/common-entities';

/**
 * Overview section contribution for Organization forms.
 * Registers under shared contributionKey 'overview' with priority 20 (Orders wins/composes),
 * wrapped in <mj-collapsible-panel SectionKey="overview"> for standard left-nav rail integration.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Organizations:overview',
    priority: 20,
    metadata: {
        entity: 'MJ_BizApps_Common: Organizations',
        slot: 'before-fields',
        sortKey: 90,
        contributionKey: 'overview',
        inclusion: 'Primary',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-organization-orders-overview-panel',
    template: `
        @if (Record && Record.IsSaved) {
            <mj-collapsible-panel
                SectionKey="overview"
                SectionName="Overview"
                Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent"
                [FormContext]="FormContext"
                [DefaultExpanded]="true">
                <mjo-party-orders-overview
                    Mode="organization"
                    [PartyID]="Record.ID"
                    [FormComponent]="FormComponent"
                    [Provider]="FormComponent.ProviderToUse"
                    [RunQueryProvider]="FormComponent.RunQueryToUse">
                </mjo-party-orders-overview>
            </mj-collapsible-panel>
        }
    `,
})
export class OrganizationOrdersOverviewPanel extends BaseFormPanel<mjBizAppsCommonOrganizationEntity> {}
