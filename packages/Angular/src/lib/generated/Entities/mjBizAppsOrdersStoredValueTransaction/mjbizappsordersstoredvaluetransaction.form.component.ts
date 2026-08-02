import { Component } from '@angular/core';
import { mjBizAppsOrdersStoredValueTransactionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Stored Value Transactions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersstoredvaluetransaction-form',
    templateUrl: './mjbizappsordersstoredvaluetransaction.form.component.html'
})
export class mjBizAppsOrdersStoredValueTransactionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersStoredValueTransactionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'transactionDetails', sectionName: 'Transaction Details', isExpanded: true },
            { sectionKey: 'financialLedger', sectionName: 'Financial Ledger', isExpanded: true },
            { sectionKey: 'relatedEntities', sectionName: 'Related Entities', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

