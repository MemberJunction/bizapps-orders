import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderLinePriceComponentEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Line Price Components') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderlinepricecomponent-form',
    templateUrl: './mjbizappsordersorderlinepricecomponent.form.component.html'
})
export class mjBizAppsOrdersOrderLinePriceComponentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderLinePriceComponentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

