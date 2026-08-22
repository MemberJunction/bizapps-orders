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
            { sectionKey: 'orderIdentification', sectionName: 'Order Identification', isExpanded: true },
            { sectionKey: 'customerInformation', sectionName: 'Customer Information', isExpanded: true },
            { sectionKey: 'billingAndShipping', sectionName: 'Billing and Shipping', isExpanded: true },
            { sectionKey: 'financialSummary', sectionName: 'Financial Summary', isExpanded: true },
            { sectionKey: 'accountingAndAudit', sectionName: 'Accounting and Audit', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentDetails', sectionName: 'Payment Details', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderHeaders', sectionName: 'Order Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersStoredValueTransactions', sectionName: 'Stored Value Transactions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustments', sectionName: 'Order Adjustments', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Events', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentIntents', sectionName: 'Payment Intents', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderCharges', sectionName: 'Order Charges', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersCheckoutSessions', sectionName: 'Checkout Sessions', isExpanded: false }
        ]);
    }
}

