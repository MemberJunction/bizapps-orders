import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderLineProgressMeasurementEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Line Progress Measurements') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderlineprogressmeasurement-form',
    templateUrl: './mjbizappsordersorderlineprogressmeasurement.form.component.html'
})
export class mjBizAppsOrdersOrderLineProgressMeasurementFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderLineProgressMeasurementEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

