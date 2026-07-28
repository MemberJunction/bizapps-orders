import { Component } from '@angular/core';
import { mjBizAppsOrdersStoredValueAccountEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Stored Value Accounts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersstoredvalueaccount-form',
    templateUrl: './mjbizappsordersstoredvalueaccount.form.component.html'
})
export class mjBizAppsOrdersStoredValueAccountFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersStoredValueAccountEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'instrumentDetails', sectionName: 'Instrument Details', isExpanded: true },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: true },
            { sectionKey: 'beneficiary', sectionName: 'Beneficiary', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentDetails', sectionName: 'Payment Details', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersStoredValueTransactions', sectionName: 'Stored Value Transactions', isExpanded: false }
        ]);
    }
}

