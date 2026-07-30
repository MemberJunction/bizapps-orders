import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderChargeAllocationEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Charge Allocations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderchargeallocation-form',
    templateUrl: './mjbizappsordersorderchargeallocation.form.component.html'
})
export class mjBizAppsOrdersOrderChargeAllocationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderChargeAllocationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'chargeAllocation', sectionName: 'Charge Allocation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

