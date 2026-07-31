import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderAdjustmentEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Adjustments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderadjustment-form',
    templateUrl: './mjbizappsordersorderadjustment.form.component.html'
})
export class mjBizAppsOrdersOrderAdjustmentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderAdjustmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'orderContext', sectionName: 'Order Context', isExpanded: true },
            { sectionKey: 'promotionDetails', sectionName: 'Promotion Details', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: true },
            { sectionKey: 'approvalAndAudit', sectionName: 'Approval and Audit', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustmentAllocations', sectionName: 'Order Adjustment Allocations', isExpanded: false }
        ]);
    }
}

