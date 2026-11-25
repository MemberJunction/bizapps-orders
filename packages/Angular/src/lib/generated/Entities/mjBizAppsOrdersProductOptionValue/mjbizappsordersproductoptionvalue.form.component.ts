import { Component } from '@angular/core';
import { mjBizAppsOrdersProductOptionValueEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Option Values') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductoptionvalue-form',
    templateUrl: './mjbizappsordersproductoptionvalue.form.component.html'
})
export class mjBizAppsOrdersProductOptionValueFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductOptionValueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'optionValueDetails', sectionName: 'Option Value Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductVariantValues', sectionName: 'Product Variant Values', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductOptionAssignmentValues', sectionName: 'Product Option Assignment Values', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductOptionAssignments', sectionName: 'Product Option Assignments', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductSuccessorOptionValues', sectionName: 'Product Successor Option Values', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLineChoices', sectionName: 'Order Line Choices', isExpanded: false }
        ]);
    }
}

