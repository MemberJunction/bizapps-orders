import { Component } from '@angular/core';
import { mjBizAppsOrdersProductCategoryEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductcategory-form',
    templateUrl: './mjbizappsordersproductcategory.form.component.html'
})
export class mjBizAppsOrdersProductCategoryFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'organization', sectionName: 'Organization', isExpanded: true },
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'defaultSettings', sectionName: 'Default Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductCategories', sectionName: 'Product Categories', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPromotionTargets', sectionName: 'Promotion Targets', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProducts', sectionName: 'Products', isExpanded: false }
        ]);
    }
}

