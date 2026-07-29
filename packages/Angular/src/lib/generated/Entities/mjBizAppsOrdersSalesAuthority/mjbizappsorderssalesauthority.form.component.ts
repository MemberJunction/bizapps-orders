import { Component } from '@angular/core';
import { mjBizAppsOrdersSalesAuthorityEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Sales Authorities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssalesauthority-form',
    templateUrl: './mjbizappsorderssalesauthority.form.component.html'
})
export class mjBizAppsOrdersSalesAuthorityFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSalesAuthorityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignment', sectionName: 'Assignment', isExpanded: true },
            { sectionKey: 'authorityLimits', sectionName: 'Authority Limits', isExpanded: true },
            { sectionKey: 'scopePermissions', sectionName: 'Scope Permissions', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustments', sectionName: 'Order Adjustments', isExpanded: false }
        ]);
    }
}

