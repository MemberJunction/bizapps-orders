import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentTypeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymenttype-form',
    templateUrl: './mjbizappsorderspaymenttype.form.component.html'
})
export class mjBizAppsOrdersPaymentTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'paymentTypeConfiguration', sectionName: 'Payment Type Configuration', isExpanded: true },
            { sectionKey: 'processingRules', sectionName: 'Processing Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentDetails', sectionName: 'Payment Details', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentHeaders', sectionName: 'Payment Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderHeaders', sectionName: 'Order Headers', isExpanded: false }
        ]);
    }
}

