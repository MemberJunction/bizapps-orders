import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderLineDimensionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Line Dimensions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderlinedimension-form',
    templateUrl: './mjbizappsordersorderlinedimension.form.component.html'
})
export class mjBizAppsOrdersOrderLineDimensionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderLineDimensionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'orderLineContext', sectionName: 'Order Line Context', isExpanded: true },
            { sectionKey: 'dimensionDefinition', sectionName: 'Dimension Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

