import { Component } from '@angular/core';
import { mjBizAppsOrdersInstalmentLineBillingEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Instalment Line Billings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersinstalmentlinebilling-form',
    templateUrl: './mjbizappsordersinstalmentlinebilling.form.component.html'
})
export class mjBizAppsOrdersInstalmentLineBillingFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersInstalmentLineBillingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'instalment', sectionName: 'Instalment', isExpanded: true },
            { sectionKey: 'billedAmount', sectionName: 'Billed Amount', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

