import { Component } from '@angular/core';
import { mjBizAppsOrdersRevenueRecognitionTypeEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Revenue Recognition Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersrevenuerecognitiontype-form',
    templateUrl: './mjbizappsordersrevenuerecognitiontype.form.component.html'
})
export class mjBizAppsOrdersRevenueRecognitionTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersRevenueRecognitionTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recognitionConfiguration', sectionName: 'Recognition Configuration', isExpanded: true },
            { sectionKey: 'recognitionLogic', sectionName: 'Recognition Logic', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProducts', sectionName: 'Products', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductTypes', sectionName: 'Product Types', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionTerms', sectionName: 'Subscription Terms', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersRevenueRecognitionSchedules', sectionName: 'Revenue Recognition Schedules', isExpanded: false }
        ]);
    }
}

