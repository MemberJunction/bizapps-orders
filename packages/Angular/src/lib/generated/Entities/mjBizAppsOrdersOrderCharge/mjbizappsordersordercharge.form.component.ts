import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderChargeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Charges') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersordercharge-form',
    templateUrl: './mjbizappsordersordercharge.form.component.html'
})
export class mjBizAppsOrdersOrderChargeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderChargeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'orderAssociation', sectionName: 'Order Association', isExpanded: true },
            { sectionKey: 'chargeConfiguration', sectionName: 'Charge Configuration', isExpanded: true },
            { sectionKey: 'pricingAndCalculation', sectionName: 'Pricing and Calculation', isExpanded: true },
            { sectionKey: 'taxDetails', sectionName: 'Tax Details', isExpanded: true },
            { sectionKey: 'overrideDetails', sectionName: 'Override Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderChargeAllocations', sectionName: 'Order Charge Allocations', isExpanded: false }
        ]);
    }
}

