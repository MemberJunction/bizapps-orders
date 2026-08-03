import { Component } from '@angular/core';
import { mjBizAppsOrdersCustomerPaymentMethodEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Customer Payment Methods') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderscustomerpaymentmethod-form',
    templateUrl: './mjbizappsorderscustomerpaymentmethod.form.component.html'
})
export class mjBizAppsOrdersCustomerPaymentMethodFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersCustomerPaymentMethodEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersPaymentDetails', sectionName: 'Payment Details', isExpanded: false }
        ]);
    }
}

