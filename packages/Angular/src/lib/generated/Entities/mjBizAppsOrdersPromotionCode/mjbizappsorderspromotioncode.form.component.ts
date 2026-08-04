import { Component } from '@angular/core';
import { mjBizAppsOrdersPromotionCodeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Promotion Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspromotioncode-form',
    templateUrl: './mjbizappsorderspromotioncode.form.component.html'
})
export class mjBizAppsOrdersPromotionCodeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPromotionCodeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustments', sectionName: 'Order Adjustments', isExpanded: false }
        ]);
    }
}

