import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import type { mjBizAppsCommonOrganizationEntity } from '@mj-biz-apps/common-entities';
import { MJO_ENTITIES } from '../data/entity-names';

const JOIN_FIELDS = ['BillToOrganizationID', 'ShipToOrganizationID'] as const;
const SECTION_KEY = 'orders';

/**
 * One Orders grid on an Organization: Bill-To OR Ship-To.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Organizations:related:OrderHeaders',
    priority: 10,
    metadata: {
        entity: 'MJ_BizApps_Common: Organizations',
        slot: 'after-related',
        sortKey: 70,
        relatedEntity: MJO_ENTITIES.OrderHeader,
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-organization-orders-panel',
    template: `
        <mj-collapsible-panel
            SectionKey="orders"
            SectionName="Orders"
            Icon="fa-solid fa-cart-shopping"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="false">
            @if (Record.IsSaved) {
                <mj-explorer-entity-data-grid
                    [Params]="FormComponent.BuildRelationshipViewParamsForJoinFields(OrderEntity, JoinFields)"
                    [NewRecordValues]="FormComponent.NewRecordValuesForJoinFields(OrderEntity, JoinFields)"
                    [AllowLoad]="FormComponent.IsSectionExpanded(SectionKey)"
                    [ShowToolbar]="true"
                    (Navigate)="FormComponent.OnFormNavigate($event)"
                    (AfterDataLoad)="OnDataLoad($event)">
                </mj-explorer-entity-data-grid>
            }
        </mj-collapsible-panel>
    `,
})
export class OrdersOrganizationOrdersPanel extends BaseFormPanel<mjBizAppsCommonOrganizationEntity> {
    public readonly OrderEntity = MJO_ENTITIES.OrderHeader;
    public readonly JoinFields = JOIN_FIELDS;
    public readonly SectionKey = SECTION_KEY;

    public OnDataLoad(event: AfterDataLoadEventArgs): void {
        this.FormComponent.SetSectionRowCount(SECTION_KEY, event.totalRowCount);
    }
}
