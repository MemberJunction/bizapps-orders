import { Component } from '@angular/core';
import { mjBizAppsOrdersExternalPaymentEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: External Payments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersexternalpayment-form',
    templateUrl: './mjbizappsordersexternalpayment.form.component.html'
})
export class mjBizAppsOrdersExternalPaymentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersExternalPaymentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

