import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentProviderTypeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Provider Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentprovidertype-form',
    templateUrl: './mjbizappsorderspaymentprovidertype.form.component.html'
})
export class mjBizAppsOrdersPaymentProviderTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentProviderTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerDetails', sectionName: 'Provider Details', isExpanded: true },
            { sectionKey: 'providerConfiguration', sectionName: 'Provider Configuration', isExpanded: true },
            { sectionKey: 'providerCapabilities', sectionName: 'Provider Capabilities', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentProviders', sectionName: 'Payment Providers', isExpanded: false }
        ]);
    }
}

