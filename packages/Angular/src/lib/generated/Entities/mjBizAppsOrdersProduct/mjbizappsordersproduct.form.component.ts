import { Component } from '@angular/core';
import { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Products') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproduct-form',
    templateUrl: './mjbizappsordersproduct.form.component.html'
})
export class mjBizAppsOrdersProductFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersProducts', sectionName: 'Products', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductBundleItemsBundleProductID', sectionName: 'Product Bundle Items (Bundle Product ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductBundleItemsComponentProductID', sectionName: 'Product Bundle Items (Component Product ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductPerformanceObligations', sectionName: 'Product Performance Obligations', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductEntitlements', sectionName: 'Product Entitlements', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersEventProducts', sectionName: 'Event Products', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLinesProductID', sectionName: 'Order Lines (Product ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLinesSourceBundleProductID', sectionName: 'Order Lines (Source Bundle Product ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductPrices', sectionName: 'Product Prices', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionPlans', sectionName: 'Subscription Plans', isExpanded: false }
        ]);
    }
}

