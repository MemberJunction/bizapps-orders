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
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'lifecycleSettings', sectionName: 'Lifecycle Settings', isExpanded: true },
            { sectionKey: 'financialSettings', sectionName: 'Financial Settings', isExpanded: true },
            { sectionKey: 'renewalSettings', sectionName: 'Renewal Settings', isExpanded: true },
            { sectionKey: 'cancellationSettings', sectionName: 'Cancellation Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductTypes', sectionName: 'Product Types', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProducts', sectionName: 'Products', isExpanded: false }
        ]);
    }
}

