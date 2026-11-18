import { Component } from '@angular/core';
import { mjBizAppsOrdersProductOptionAssignmentValueEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Option Assignment Values') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductoptionassignmentvalue-form',
    templateUrl: './mjbizappsordersproductoptionassignmentvalue.form.component.html'
})
export class mjBizAppsOrdersProductOptionAssignmentValueFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductOptionAssignmentValueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'optionAssignment', sectionName: 'Option Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

