import { Component } from '@angular/core';
import { mjBizAppsOrdersProductPriceEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Prices') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductprice-form',
    templateUrl: './mjbizappsordersproductprice.form.component.html'
})
export class mjBizAppsOrdersProductPriceFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductPriceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productIdentification', sectionName: 'Product Identification', isExpanded: true },
            { sectionKey: 'pricingStrategy', sectionName: 'Pricing Strategy', isExpanded: true },
            { sectionKey: 'pricingDetails', sectionName: 'Pricing Details', isExpanded: true },
            { sectionKey: 'quantityBands', sectionName: 'Quantity Bands', isExpanded: true },
            { sectionKey: 'validityAndScheduling', sectionName: 'Validity and Scheduling', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPriceTiers', sectionName: 'Price Tiers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false }
        ]);
    }
}

