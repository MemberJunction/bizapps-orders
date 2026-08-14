import { Component, OnInit } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import type { MJOSummaryFigure } from '../panels/summary-strip.component';
import { LoadPartyOrderFigures } from './party-order-stats';

/**
 * Last-wins People header: Common identity + cheap order stats.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:People:header',
    priority: 10,
    metadata: {
        entity: 'MJ_BizApps_Common: People',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
        replacesSectionKey: 'personalIdentity',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-person-header-panel',
    template: `
        <bizapps-person-identity
            [Record]="Record"
            [EditMode]="EditMode"
            [FormContext]="FormContext"
            (Navigate)="FormComponent.OnFormNavigate($event)">
            @if (Figures.length > 0) {
                <mjo-summary-strip [Figures]="Figures" Note="Lifetime for this person as bill-to / beneficiary."></mjo-summary-strip>
            }
        </bizapps-person-identity>
    `,
})
export class OrdersPersonHeaderPanel extends BaseFormPanel<mjBizAppsCommonPersonEntity> implements OnInit {
    public Figures: MJOSummaryFigure[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) {
            return;
        }
        this.Figures = await LoadPartyOrderFigures(
            'person',
            this.Record.ID,
            this.FormComponent.ProviderToUse,
            this.FormComponent.RunQueryToUse,
        );
        this.FormComponent.cdr.detectChanges();
    }
}
