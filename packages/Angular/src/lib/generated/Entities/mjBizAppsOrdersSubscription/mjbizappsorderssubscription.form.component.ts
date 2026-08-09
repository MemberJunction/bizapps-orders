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
            { sectionKey: 'subscriptionOverview', sectionName: 'Subscription Overview', isExpanded: true },
            { sectionKey: 'stakeholders', sectionName: 'Stakeholders', isExpanded: true },
            { sectionKey: 'lifecycleTimeline', sectionName: 'Lifecycle Timeline', isExpanded: true },
            { sectionKey: 'renewalSettings', sectionName: 'Renewal Settings', isExpanded: true },
            { sectionKey: 'billingAndMigration', sectionName: 'Billing and Migration', isExpanded: true },
            { sectionKey: 'displayLabels', sectionName: 'Display Labels', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersEntitlementGrants', sectionName: 'Entitlement Grants', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionsMigratesToSubscriptionID', sectionName: 'Subscriptions (Migrates To)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionsMigratesFromSubscriptionID', sectionName: 'Subscriptions (Migrates From)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Events', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionTerms', sectionName: 'Subscription Terms', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false }
        ]);
    }
}

