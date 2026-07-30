import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentLineEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Lines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentline-form',
    templateUrl: './mjbizappsorderspaymentline.form.component.html'
})
export class mjBizAppsOrdersPaymentLineFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentLineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'paymentAllocation', sectionName: 'Payment Allocation', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: true },
            { sectionKey: 'userTracking', sectionName: 'User Tracking', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

