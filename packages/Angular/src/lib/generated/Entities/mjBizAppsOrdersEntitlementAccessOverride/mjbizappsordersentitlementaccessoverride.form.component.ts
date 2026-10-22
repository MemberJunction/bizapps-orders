import { Component } from '@angular/core';
import { mjBizAppsOrdersEntitlementAccessOverrideEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Entitlement Access Overrides') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersentitlementaccessoverride-form',
    templateUrl: './mjbizappsordersentitlementaccessoverride.form.component.html'
})
export class mjBizAppsOrdersEntitlementAccessOverrideFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersEntitlementAccessOverrideEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'overrideDetails', sectionName: 'Override Details', isExpanded: true },
            { sectionKey: 'request', sectionName: 'Request', isExpanded: true },
            { sectionKey: 'decision', sectionName: 'Decision', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

