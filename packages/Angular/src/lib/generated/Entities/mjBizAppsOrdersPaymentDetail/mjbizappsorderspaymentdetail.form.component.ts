import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentDetailEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentdetail-form',
    templateUrl: './mjbizappsorderspaymentdetail.form.component.html'
})
export class mjBizAppsOrdersPaymentDetailFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'paymentContext', sectionName: 'Payment Context', isExpanded: true },
            { sectionKey: 'providerInformation', sectionName: 'Provider Information', isExpanded: true },
            { sectionKey: 'paymentDetails', sectionName: 'Payment Details', isExpanded: true },
            { sectionKey: 'bankDetails', sectionName: 'Bank Details', isExpanded: true },
            { sectionKey: 'transactionDetails', sectionName: 'Transaction Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersCustomerPaymentMethods', sectionName: 'Customer Payment Methods', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentHeaders', sectionName: 'Payment Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderHeaders', sectionName: 'Order Headers', isExpanded: false }
        ]);
    }
}

