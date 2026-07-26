import { Component } from '@angular/core';
import { mjBizAppsOrdersEventProductEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Event Products') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderseventproduct-form',
    templateUrl: './mjbizappsorderseventproduct.form.component.html'
})
export class mjBizAppsOrdersEventProductFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersEventProductEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventScheduling', sectionName: 'Event Scheduling', isExpanded: true },
            { sectionKey: 'venueDetails', sectionName: 'Venue Details', isExpanded: true },
            { sectionKey: 'eventConfiguration', sectionName: 'Event Configuration', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'productDetails', sectionName: 'Product Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

