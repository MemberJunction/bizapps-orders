import { Component } from '@angular/core';
import { mjBizAppsOrdersPromotionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Promotions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspromotion-form',
    templateUrl: './mjbizappsorderspromotion.form.component.html'
})
export class mjBizAppsOrdersPromotionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPromotionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'organization', sectionName: 'Organization', isExpanded: true },
            { sectionKey: 'promotionRules', sectionName: 'Promotion Rules', isExpanded: true },
            { sectionKey: 'scheduleAndRecurrence', sectionName: 'Schedule and Recurrence', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPromotionTargets', sectionName: 'Promotion Targets', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderAdjustments', sectionName: 'Order Adjustments', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPromotionCodes', sectionName: 'Promotion Codes', isExpanded: false }
        ]);
    }
}

