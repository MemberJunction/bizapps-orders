import { Component } from '@angular/core';
import { mjBizAppsOrdersProductOptionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Options') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductoption-form',
    templateUrl: './mjbizappsordersproductoption.form.component.html'
})
export class mjBizAppsOrdersProductOptionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductOptionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'optionConfiguration', sectionName: 'Option Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductOptionValues', sectionName: 'Product Option Values', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductVariantValues', sectionName: 'Product Variant Values', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductOptionAssignments', sectionName: 'Product Option Assignments', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductSuccessorOptionValues', sectionName: 'Product Successor Option Values', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLineChoices', sectionName: 'Order Line Choices', isExpanded: false }
        ]);
    }
}

