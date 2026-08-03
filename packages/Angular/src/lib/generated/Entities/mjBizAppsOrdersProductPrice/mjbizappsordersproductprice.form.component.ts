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
            { sectionKey: 'pricingConfiguration', sectionName: 'Pricing Configuration', isExpanded: true },
            { sectionKey: 'quantityAndValidity', sectionName: 'Quantity and Validity', isExpanded: true },
            { sectionKey: 'recurrenceAndTiming', sectionName: 'Recurrence and Timing', isExpanded: true },
            { sectionKey: 'ruleManagement', sectionName: 'Rule Management', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPriceTiers', sectionName: 'Price Tiers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false }
        ]);
    }
}

