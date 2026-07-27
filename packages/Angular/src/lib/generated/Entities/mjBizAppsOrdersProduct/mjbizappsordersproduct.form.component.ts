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
            { sectionKey: 'productDetails', sectionName: 'Product Details', isExpanded: true },
            { sectionKey: 'classification', sectionName: 'Classification', isExpanded: true },
            { sectionKey: 'businessContext', sectionName: 'Business Context', isExpanded: true },
            { sectionKey: 'lifecycleManagement', sectionName: 'Lifecycle Management', isExpanded: true },
            { sectionKey: 'financialConfiguration', sectionName: 'Financial Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductPrices', sectionName: 'Product Prices', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductBundleItemsComponentProductID', sectionName: 'Product Bundle Items (Component Product ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductBundleItemsBundleProductID', sectionName: 'Product Bundle Items (Bundle Product ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductPerformanceObligations', sectionName: 'Product Performance Obligations', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProducts', sectionName: 'Products', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductEntitlements', sectionName: 'Product Entitlements', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLinesProductID', sectionName: 'Order Lines (Product)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLinesSourceBundleProductID', sectionName: 'Order Lines (Source Bundle Product)', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPromotionTargets', sectionName: 'Promotion Targets', isExpanded: false }
        ]);
    }
}

