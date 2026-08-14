import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import type { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import { MJO_ENTITIES } from '../data/entity-names';

const JOIN_FIELDS = ['BillToPersonID', 'ShipToPersonID'] as const;
const SECTION_KEY = 'orders';

/**
 * One Orders grid on a Person: Bill-To OR Ship-To. Claims every Order Headers
 * FK so the baked Bill-To / Ship-To grids do not also mount.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:People:related:OrderHeaders',
    priority: 10,
    metadata: {
        entity: 'MJ_BizApps_Common: People',
        slot: 'after-related',
        sortKey: 70,
        relatedEntity: MJO_ENTITIES.OrderHeader,
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-person-orders-panel',
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
                    [NewRecordValues]="NewValues"
                    [AllowLoad]="FormComponent.IsSectionExpanded(SectionKey)"
                    [ShowToolbar]="true"
                    (Navigate)="FormComponent.OnFormNavigate($event)"
                    (AfterDataLoad)="OnDataLoad($event)">
                </mj-explorer-entity-data-grid>
            }
        </mj-collapsible-panel>
    `,
})
export class OrdersPersonOrdersPanel extends BaseFormPanel<mjBizAppsCommonPersonEntity> {
    public readonly OrderEntity = MJO_ENTITIES.OrderHeader;
    public readonly JoinFields = JOIN_FIELDS;
    public readonly SectionKey = SECTION_KEY;

    public get NewValues(): Record<string, unknown> {
        const rel = this.FormComponent.GetEntityRelationshipByRelatedEntityName(
            this.OrderEntity,
            JOIN_FIELDS[0],
        );
        return rel ? this.FormComponent.NewRecordValuesByEntityRelationship(rel) : { BillToPersonID: this.Record.ID };
    }

    public OnDataLoad(event: AfterDataLoadEventArgs): void {
        this.FormComponent.SetSectionRowCount(SECTION_KEY, event.totalRowCount);
    }
}
