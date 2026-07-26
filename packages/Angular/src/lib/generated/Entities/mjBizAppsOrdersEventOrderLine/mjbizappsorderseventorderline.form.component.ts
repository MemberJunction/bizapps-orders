import { Component } from '@angular/core';
import { mjBizAppsOrdersEventOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Event Order Lines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderseventorderline-form',
    templateUrl: './mjbizappsorderseventorderline.form.component.html'
})
export class mjBizAppsOrdersEventOrderLineFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersEventOrderLineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'attendeeDetails', sectionName: 'Attendee Details', isExpanded: true },
            { sectionKey: 'orderLineDetails', sectionName: 'Order Line Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

