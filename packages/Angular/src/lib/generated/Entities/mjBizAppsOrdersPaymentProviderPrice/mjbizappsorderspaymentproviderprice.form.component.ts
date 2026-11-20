import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentProviderPriceEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Provider Prices') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentproviderprice-form',
    templateUrl: './mjbizappsorderspaymentproviderprice.form.component.html'
})
export class mjBizAppsOrdersPaymentProviderPriceFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentProviderPriceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'gatewayConfiguration', sectionName: 'Gateway Configuration', isExpanded: true },
            { sectionKey: 'mappingDetails', sectionName: 'Mapping Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

