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
            { sectionKey: 'orderLineRelationships', sectionName: 'Order Line Relationships', isExpanded: true },
            { sectionKey: 'orderLineDetails', sectionName: 'Order Line Details', isExpanded: true },
            { sectionKey: 'pricingAndQuantities', sectionName: 'Pricing and Quantities', isExpanded: true },
            { sectionKey: 'serviceAndFulfillment', sectionName: 'Service and Fulfillment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersStoredValueAccounts', sectionName: 'Stored Value Accounts', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersEntitlementGrants', sectionName: 'Entitlement Grants', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLineDimensions', sectionName: 'Order Line Dimensions', isExpanded: false }
        ]);
    }
}

