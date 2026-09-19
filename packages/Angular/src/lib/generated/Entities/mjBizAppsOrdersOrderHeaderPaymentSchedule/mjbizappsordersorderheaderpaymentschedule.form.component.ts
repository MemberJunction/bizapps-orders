import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderHeaderPaymentScheduleEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Header Payment Schedules') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderheaderpaymentschedule-form',
    templateUrl: './mjbizappsordersorderheaderpaymentschedule.form.component.html'
})
export class mjBizAppsOrdersOrderHeaderPaymentScheduleFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderHeaderPaymentScheduleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Lines', isExpanded: false }
        ]);
    }
}

