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
            { sectionKey: 'orderDetails', sectionName: 'Order Details', isExpanded: true },
            { sectionKey: 'customerInformation', sectionName: 'Customer Information', isExpanded: true },
            { sectionKey: 'billingAndShipping', sectionName: 'Billing and Shipping', isExpanded: true },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: true },
            { sectionKey: 'workflowAndTracking', sectionName: 'Workflow and Tracking', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersStoredValueTransactions', sectionName: 'Stored Value Transactions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustments', sectionName: 'Order Adjustments', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderHeaders', sectionName: 'Order Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderCharges', sectionName: 'Order Charges', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentDetails', sectionName: 'Payment Details', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Events', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentIntents', sectionName: 'Payment Intents', isExpanded: false }
        ]);
    }
}

