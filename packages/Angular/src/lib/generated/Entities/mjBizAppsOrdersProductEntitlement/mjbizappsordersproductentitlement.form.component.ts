import { Component } from '@angular/core';
import { mjBizAppsOrdersProductEntitlementEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Entitlements') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductentitlement-form',
    templateUrl: './mjbizappsordersproductentitlement.form.component.html'
})
export class mjBizAppsOrdersProductEntitlementFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductEntitlementEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entitlementConfiguration', sectionName: 'Entitlement Configuration', isExpanded: true },
            { sectionKey: 'entitlementDetails', sectionName: 'Entitlement Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersEntitlementGrants', sectionName: 'Entitlement Grants', isExpanded: false }
        ]);
    }
}

