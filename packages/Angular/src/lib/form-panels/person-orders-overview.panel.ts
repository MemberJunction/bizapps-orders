import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';

/**
 * Overview section contribution for Person forms.
 * Registers under shared contributionKey 'overview' with priority 20 (Orders wins/composes),
 * wrapped in <mj-collapsible-panel SectionKey="overview"> for standard left-nav rail integration.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:People:overview',
    priority: 20,
    metadata: {
        entity: 'MJ_BizApps_Common: People',
        slot: 'before-fields',
        sortKey: 90,
        contributionKey: 'overview',
        inclusion: 'Primary',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-person-orders-overview-panel',
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
                    Mode="person"
                    [PartyID]="Record.ID"
                    [FormComponent]="FormComponent"
                    [Provider]="FormComponent.ProviderToUse"
                    [RunQueryProvider]="FormComponent.RunQueryToUse">
                </mjo-party-orders-overview>
            </mj-collapsible-panel>
        }
    `,
})
export class PersonOrdersOverviewPanel extends BaseFormPanel<mjBizAppsCommonPersonEntity> {}
