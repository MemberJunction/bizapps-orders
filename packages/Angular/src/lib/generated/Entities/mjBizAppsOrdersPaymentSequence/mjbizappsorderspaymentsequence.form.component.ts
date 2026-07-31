import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentSequenceEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Sequences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentsequence-form',
    templateUrl: './mjbizappsorderspaymentsequence.form.component.html'
})
export class mjBizAppsOrdersPaymentSequenceFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentSequenceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'paymentConfiguration', sectionName: 'Payment Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

