import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentProviderSyncStateEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Provider Sync States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentprovidersyncstate-form',
    templateUrl: './mjbizappsorderspaymentprovidersyncstate.form.component.html'
})
export class mjBizAppsOrdersPaymentProviderSyncStateFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentProviderSyncStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

