import { Component } from '@angular/core';
import { mjBizAppsOrdersOutboundDeliveryEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Outbound Deliveries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersoutbounddelivery-form',
    templateUrl: './mjbizappsordersoutbounddelivery.form.component.html'
})
export class mjBizAppsOrdersOutboundDeliveryFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOutboundDeliveryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'delivery', sectionName: 'Delivery', isExpanded: true },
            { sectionKey: 'attempts', sectionName: 'Attempts', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

