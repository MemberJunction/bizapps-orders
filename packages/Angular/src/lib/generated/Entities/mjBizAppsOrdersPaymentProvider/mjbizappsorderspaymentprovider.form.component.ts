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
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'securityAndAccess', sectionName: 'Security and Access', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentIntents', sectionName: 'Payment Intents', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPayments', sectionName: 'Payments', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersCustomerPaymentMethods', sectionName: 'Customer Payment Methods', isExpanded: false }
        ]);
    }
}

