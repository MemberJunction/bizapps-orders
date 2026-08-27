import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderCompanyPolicyEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Company Policies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersordercompanypolicy-form',
    templateUrl: './mjbizappsordersordercompanypolicy.form.component.html'
})
export class mjBizAppsOrdersOrderCompanyPolicyFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderCompanyPolicyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pricingPolicies', sectionName: 'Pricing Policies', isExpanded: true },
            { sectionKey: 'defaultSettings', sectionName: 'Default Settings', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

