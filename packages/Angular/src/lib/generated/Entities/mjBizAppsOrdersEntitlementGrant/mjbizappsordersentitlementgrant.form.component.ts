import { Component } from '@angular/core';
import { mjBizAppsOrdersEntitlementGrantEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Entitlement Grants') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersentitlementgrant-form',
    templateUrl: './mjbizappsordersentitlementgrant.form.component.html'
})
export class mjBizAppsOrdersEntitlementGrantFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersEntitlementGrantEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entitlementDetails', sectionName: 'Entitlement Details', isExpanded: true },
            { sectionKey: 'beneficiaryInformation', sectionName: 'Beneficiary Information', isExpanded: true },
            { sectionKey: 'validityPeriod', sectionName: 'Validity Period', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

