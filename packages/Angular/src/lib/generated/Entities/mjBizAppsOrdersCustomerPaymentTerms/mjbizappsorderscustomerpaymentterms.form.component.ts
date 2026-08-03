import { Component } from '@angular/core';
import { mjBizAppsOrdersCustomerPaymentTermsEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Customer Payment Terms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderscustomerpaymentterms-form',
    templateUrl: './mjbizappsorderscustomerpaymentterms.form.component.html'
})
export class mjBizAppsOrdersCustomerPaymentTermsFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersCustomerPaymentTermsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityRelationships', sectionName: 'Entity Relationships', isExpanded: true },
            { sectionKey: 'paymentTermsDetails', sectionName: 'Payment Terms Details', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

