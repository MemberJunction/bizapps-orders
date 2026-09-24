import { Component } from '@angular/core';
import { mjBizAppsOrdersExternalCustomerEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: External Customers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersexternalcustomer-form',
    templateUrl: './mjbizappsordersexternalcustomer.form.component.html'
})
export class mjBizAppsOrdersExternalCustomerFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersExternalCustomerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

