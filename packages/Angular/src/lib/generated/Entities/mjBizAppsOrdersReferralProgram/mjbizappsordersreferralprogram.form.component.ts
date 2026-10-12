import { Component } from '@angular/core';
import { mjBizAppsOrdersReferralProgramEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Referral Programs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersreferralprogram-form',
    templateUrl: './mjbizappsordersreferralprogram.form.component.html'
})
export class mjBizAppsOrdersReferralProgramFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersReferralProgramEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersOrderConcessions', sectionName: 'Order Concessions', isExpanded: false }
        ]);
    }
}

