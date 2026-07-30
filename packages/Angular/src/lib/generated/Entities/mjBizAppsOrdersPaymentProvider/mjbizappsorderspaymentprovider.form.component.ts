import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentProviderEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentprovider-form',
    templateUrl: './mjbizappsorderspaymentprovider.form.component.html'
})
export class mjBizAppsOrdersPaymentProviderFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerConfiguration', sectionName: 'Provider Configuration', isExpanded: true },
            { sectionKey: 'securityAndIntegration', sectionName: 'Security and Integration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentHeaders', sectionName: 'Payment Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentDetails', sectionName: 'Payment Details', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentIntents', sectionName: 'Payment Intents', isExpanded: false }
        ]);
    }
}

