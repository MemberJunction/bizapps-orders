import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Headers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentheader-form',
    templateUrl: './mjbizappsorderspaymentheader.form.component.html'
})
export class mjBizAppsOrdersPaymentHeaderFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentHeaderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'paymentDetails', sectionName: 'Payment Details', isExpanded: true },
            { sectionKey: 'customerInformation', sectionName: 'Customer Information', isExpanded: true },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: true },
            { sectionKey: 'providerInformation', sectionName: 'Provider Information', isExpanded: true },
            { sectionKey: 'reversalDetails', sectionName: 'Reversal Details', isExpanded: true },
            { sectionKey: 'accounting', sectionName: 'Accounting', isExpanded: true },
            { sectionKey: 'notesAndMetadata', sectionName: 'Notes and Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersStoredValueTransactions', sectionName: 'Stored Value Transactions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Events', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentHeaders', sectionName: 'Payment Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Lines', isExpanded: false }
        ]);
    }
}

