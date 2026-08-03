import { Component } from '@angular/core';
import { mjBizAppsOrdersPriceListAssignmentEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Price List Assignments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspricelistassignment-form',
    templateUrl: './mjbizappsorderspricelistassignment.form.component.html'
})
export class mjBizAppsOrdersPriceListAssignmentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPriceListAssignmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

