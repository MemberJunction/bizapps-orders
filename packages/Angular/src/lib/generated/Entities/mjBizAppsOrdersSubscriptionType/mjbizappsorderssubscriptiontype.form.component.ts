import { Component } from '@angular/core';
import { mjBizAppsOrdersSubscriptionTypeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Subscription Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssubscriptiontype-form',
    templateUrl: './mjbizappsorderssubscriptiontype.form.component.html'
})
export class mjBizAppsOrdersSubscriptionTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSubscriptionTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'lifecycleSettings', sectionName: 'Lifecycle Settings', isExpanded: true },
            { sectionKey: 'billingAndCycles', sectionName: 'Billing and Cycles', isExpanded: true },
            { sectionKey: 'renewalAndCancellation', sectionName: 'Renewal and Cancellation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProducts', sectionName: 'Products', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductTypes', sectionName: 'Product Types', isExpanded: false }
        ]);
    }
}

