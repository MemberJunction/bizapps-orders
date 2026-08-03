import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Lines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderline-form',
    templateUrl: './mjbizappsordersorderline.form.component.html'
})
export class mjBizAppsOrdersOrderLineFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderLineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'lineDetails', sectionName: 'Line Details', isExpanded: true },
            { sectionKey: 'pricingAndFinancials', sectionName: 'Pricing and Financials', isExpanded: true },
            { sectionKey: 'shippingDetails', sectionName: 'Shipping Details', isExpanded: true },
            { sectionKey: 'subscriptionAndService', sectionName: 'Subscription and Service', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersEntitlementGrants', sectionName: 'Entitlement Grants', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustments', sectionName: 'Order Adjustments', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionTerms', sectionName: 'Subscription Terms', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLinesParentOrderLineID', sectionName: 'Order Lines (Parent Order Line)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLinesReversesOrderLineID', sectionName: 'Order Lines (Reverses Order Line)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLineDimensions', sectionName: 'Order Line Dimensions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLinePriceComponents', sectionName: 'Order Line Price Components', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderChargeAllocations', sectionName: 'Order Charge Allocations', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersStoredValueAccounts', sectionName: 'Stored Value Accounts', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustmentAllocations', sectionName: 'Order Adjustment Allocations', isExpanded: false }
        ]);
    }
}

