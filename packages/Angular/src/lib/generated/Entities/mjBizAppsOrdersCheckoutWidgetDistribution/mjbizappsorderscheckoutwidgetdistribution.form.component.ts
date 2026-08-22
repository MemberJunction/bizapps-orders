import { Component } from '@angular/core';
import { mjBizAppsOrdersCheckoutWidgetDistributionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Checkout Widget Distributions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderscheckoutwidgetdistribution-form',
    templateUrl: './mjbizappsorderscheckoutwidgetdistribution.form.component.html'
})
export class mjBizAppsOrdersCheckoutWidgetDistributionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersCheckoutWidgetDistributionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'distributionDetails', sectionName: 'Distribution Details', isExpanded: true },
            { sectionKey: 'lifecycleManagement', sectionName: 'Lifecycle Management', isExpanded: true },
            { sectionKey: 'integration', sectionName: 'Integration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersCheckoutSessions', sectionName: 'Checkout Sessions', isExpanded: false }
        ]);
    }
}

