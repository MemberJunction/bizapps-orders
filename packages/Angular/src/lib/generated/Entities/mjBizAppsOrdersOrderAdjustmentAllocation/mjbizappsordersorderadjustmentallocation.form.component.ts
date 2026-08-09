import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderAdjustmentAllocationEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Adjustment Allocations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderadjustmentallocation-form',
    templateUrl: './mjbizappsordersorderadjustmentallocation.form.component.html'
})
export class mjBizAppsOrdersOrderAdjustmentAllocationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderAdjustmentAllocationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'adjustmentDetails', sectionName: 'Adjustment Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

