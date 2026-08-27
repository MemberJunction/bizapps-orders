import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentTermsTypeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Terms Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymenttermstype-form',
    templateUrl: './mjbizappsorderspaymenttermstype.form.component.html'
})
export class mjBizAppsOrdersPaymentTermsTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentTermsTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'paymentTermsConfiguration', sectionName: 'Payment Terms Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderHeaders', sectionName: 'Order Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersCustomerPaymentTerms', sectionName: 'Customer Payment Terms', isExpanded: false }
        ]);
    }
}

