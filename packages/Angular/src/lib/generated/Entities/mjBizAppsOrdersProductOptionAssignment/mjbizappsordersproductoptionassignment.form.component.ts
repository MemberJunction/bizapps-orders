import { Component } from '@angular/core';
import { mjBizAppsOrdersProductOptionAssignmentEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Option Assignments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductoptionassignment-form',
    templateUrl: './mjbizappsordersproductoptionassignment.form.component.html'
})
export class mjBizAppsOrdersProductOptionAssignmentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductOptionAssignmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentScope', sectionName: 'Assignment Scope', isExpanded: true },
            { sectionKey: 'optionConfiguration', sectionName: 'Option Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductOptionAssignmentValues', sectionName: 'Product Option Assignment Values', isExpanded: false }
        ]);
    }
}

