import { Component } from '@angular/core';
import { mjBizAppsOrdersPriceListEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Price Lists') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspricelist-form',
    templateUrl: './mjbizappsorderspricelist.form.component.html'
})
export class mjBizAppsOrdersPriceListFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPriceListEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'priceListDetails', sectionName: 'Price List Details', isExpanded: true },
            { sectionKey: 'validityAndStatus', sectionName: 'Validity and Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductPrices', sectionName: 'Product Prices', isExpanded: false }
        ]);
    }
}

