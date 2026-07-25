import { Component } from '@angular/core';
import { mjBizAppsOrdersProductTypeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproducttype-form',
    templateUrl: './mjbizappsordersproducttype.form.component.html'
})
export class mjBizAppsOrdersProductTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productTypeDetails', sectionName: 'Product Type Details', isExpanded: true },
            { sectionKey: 'operationalBehavior', sectionName: 'Operational Behavior', isExpanded: true },
            { sectionKey: 'financialConfiguration', sectionName: 'Financial Configuration', isExpanded: true },
            { sectionKey: 'systemConfiguration', sectionName: 'System Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProducts', sectionName: 'Products', isExpanded: false }
        ]);
    }
}

