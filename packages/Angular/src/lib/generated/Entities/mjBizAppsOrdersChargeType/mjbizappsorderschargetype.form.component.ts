import { Component } from '@angular/core';
import { mjBizAppsOrdersChargeTypeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Charge Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderschargetype-form',
    templateUrl: './mjbizappsorderschargetype.form.component.html'
})
export class mjBizAppsOrdersChargeTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersChargeTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'chargeConfiguration', sectionName: 'Charge Configuration', isExpanded: true },
            { sectionKey: 'calculationRules', sectionName: 'Calculation Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderCharges', sectionName: 'Order Charges', isExpanded: false }
        ]);
    }
}

