import { Component } from '@angular/core';
import { mjBizAppsOrdersPromotionTypeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Promotion Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspromotiontype-form',
    templateUrl: './mjbizappsorderspromotiontype.form.component.html'
})
export class mjBizAppsOrdersPromotionTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPromotionTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promotionDefinition', sectionName: 'Promotion Definition', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPromotions', sectionName: 'Promotions', isExpanded: false }
        ]);
    }
}

