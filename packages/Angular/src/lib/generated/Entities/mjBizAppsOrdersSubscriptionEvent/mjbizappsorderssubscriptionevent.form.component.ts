import { Component } from '@angular/core';
import { mjBizAppsOrdersSubscriptionEventEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Subscription Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssubscriptionevent-form',
    templateUrl: './mjbizappsorderssubscriptionevent.form.component.html'
})
export class mjBizAppsOrdersSubscriptionEventFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSubscriptionEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventContext', sectionName: 'Event Context', isExpanded: true },
            { sectionKey: 'eventDetails', sectionName: 'Event Details', isExpanded: true },
            { sectionKey: 'relatedEntities', sectionName: 'Related Entities', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

