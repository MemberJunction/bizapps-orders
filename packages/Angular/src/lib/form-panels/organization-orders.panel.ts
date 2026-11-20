import { Component, ViewChild } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, ExplorerEntityDataGridComponent } from '@memberjunction/ng-base-forms';
import type { AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import type { mjBizAppsCommonOrganizationEntity } from '@mj-biz-apps/common-entities';
import { MJO_ENTITIES } from '../data/entity-names';
import { MJO_ORDER_HEADER_GRID_STATE } from '../data/orders-grid-state';

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

    /**
     * Give the related grid the app's Order Headers column state, so Balance renders as currency
     * like Total instead of falling back to the grid's field-name heuristic (#798).
     * `mj-explorer-entity-data-grid` has no `[GridState]` input, so the state goes to the grid it
     * wraps. Deferred a microtask: this setter runs inside change detection.
     */
    @ViewChild(ExplorerEntityDataGridComponent)
    public set OrdersGrid(grid: ExplorerEntityDataGridComponent | undefined) {
        if (!grid) return;
        queueMicrotask(() => {
            if (grid.innerGrid && grid.innerGrid.GridState !== MJO_ORDER_HEADER_GRID_STATE) {
                grid.innerGrid.GridState = MJO_ORDER_HEADER_GRID_STATE;
            }
        });
    }

    public OnDataLoad(event: AfterDataLoadEventArgs): void {
        this.FormComponent.SetSectionRowCount(SECTION_KEY, event.totalRowCount);
    }
}
