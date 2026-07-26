import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Headers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderheader-form',
    templateUrl: './mjbizappsordersorderheader.form.component.html'
})
export class mjBizAppsOrdersOrderHeaderFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderHeaderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'orderInformation', sectionName: 'Order Information', isExpanded: true },
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'billingAndShipping', sectionName: 'Billing and Shipping', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: true },
            { sectionKey: 'auditAndLifecycle', sectionName: 'Audit and Lifecycle', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersStoredValueTransactions', sectionName: 'Stored Value Transactions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentIntents', sectionName: 'Payment Intents', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderHeaders', sectionName: 'Order Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Events', isExpanded: false }
        ]);
    }
}

