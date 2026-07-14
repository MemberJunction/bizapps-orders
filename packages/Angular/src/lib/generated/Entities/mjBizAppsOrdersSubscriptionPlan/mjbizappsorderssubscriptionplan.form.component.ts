import { Component } from '@angular/core';
import { mjBizAppsOrdersSubscriptionPlanEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Subscription Plans') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssubscriptionplan-form',
    templateUrl: './mjbizappsorderssubscriptionplan.form.component.html'
})
export class mjBizAppsOrdersSubscriptionPlanFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSubscriptionPlanEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false }
        ]);
    }
}

