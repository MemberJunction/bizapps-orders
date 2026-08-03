import { Component } from '@angular/core';
import { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Subscriptions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssubscription-form',
    templateUrl: './mjbizappsorderssubscription.form.component.html'
})
export class mjBizAppsOrdersSubscriptionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSubscriptionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'subscriptionDetails', sectionName: 'Subscription Details', isExpanded: true },
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'productInformation', sectionName: 'Product Information', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'renewalSettings', sectionName: 'Renewal Settings', isExpanded: true },
            { sectionKey: 'billingAndProvider', sectionName: 'Billing and Provider', isExpanded: true },
            { sectionKey: 'migrationHistory', sectionName: 'Migration History', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersEntitlementGrants', sectionName: 'Entitlement Grants', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Events', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionsMigratesToSubscriptionID', sectionName: 'Subscriptions (Migrates To Subscription)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionsMigratesFromSubscriptionID', sectionName: 'Subscriptions (Migrates From Subscription)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionTerms', sectionName: 'Subscription Terms', isExpanded: false }
        ]);
    }
}

