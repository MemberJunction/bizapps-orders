import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderConcessionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Concessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderconcession-form',
    templateUrl: './mjbizappsordersorderconcession.form.component.html'
})
export class mjBizAppsOrdersOrderConcessionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderConcessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

